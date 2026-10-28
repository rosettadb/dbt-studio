import { BrowserWindow, dialog } from 'electron';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { TaskManagerService } from '../services/taskManager.service';
import {
  INSTALL_CANCELLED_MESSAGE,
  MANAGED_ENVIRONMENT_INSTALL_TYPES,
  isDbtRuntimeChangeTask,
  isDbtV2SwitchSubject,
  isInstallTaskType,
} from '../../shared/installTasks';
import type { TaskRecord } from '../../types/ipc';

// Longest a queued install's pip command or download may take. Installs run
// one at a time, so one that hangs would hold up everything behind it; the
// slowest real installs take about 6 minutes, and this leaves room for a slow
// connection.
export const INSTALL_TIMEOUT_MS = 30 * 60 * 1000;

// A download for a queued install (Python, Rosetta, the runner, KiSQL), with
// the same limit in total time (axios' own `timeout` only counts time without
// data). The file is only used once it has fully arrived, so stopping it
// leaves nothing half-installed.
export const downloadForInstall = async (
  url: string,
  config: AxiosRequestConfig = {},
): Promise<AxiosResponse> => {
  const limit = new AbortController();
  const timer = setTimeout(() => limit.abort(), INSTALL_TIMEOUT_MS);
  try {
    return await axios.get(url, { ...config, signal: limit.signal });
  } catch (error) {
    if (limit.signal.aborted) {
      throw new Error(
        `Download timed out after ${INSTALL_TIMEOUT_MS / 60000} minutes: ${url}`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

// Installs share one queue so only one runs at a time: dbt, its adapters,
// Flowfile and sqlglot all live in the same managed Python environment, and
// switching Python rebuilds that environment, so overlapping installs could
// leave it half-installed. Each install shows in the task manager, waiting
// ("pending") until its turn comes.
interface QueuedInstall {
  taskId: string;
  type: string;
  subject?: string;
  // Python installs that replace or remove the managed environment go ahead
  // of everything else still waiting.
  goesFirst: boolean;
  start: () => Promise<void>;
  // The task manager's canceller: takes a queued install out, or aborts a
  // running one.
  cancel: () => void;
  // Takes the install out of the queue without running it; it settles with
  // this error.
  drop: (error: Error) => void;
}

const waitingInstalls: QueuedInstall[] = [];

let runningInstall: {
  taskId: string;
  type: string;
  // Only for installs that end their process on the signal. Stopping them
  // even mid-copy is safe when the environment they install into is about to
  // be deleted anyway.
  stopAndRestartLater?: () => void;
  stopAndCancel?: () => void;
} | null = null;

const startNextInstall = () => {
  if (runningInstall) return;
  const next = waitingInstalls.shift();
  next?.start().finally(() => {
    runningInstall = null;
    startNextInstall();
  });
};

// Where an install that goes first, or one put back after it, joins the
// queue: behind the other installs that go first.
const firstPlaceInQueue = () => {
  const index = waitingInstalls.findIndex((queued) => !queued.goesFirst);
  return index === -1 ? waitingInstalls.length : index;
};

const isManagedEnvironmentInstall = (install: { type: string } | null) =>
  !!install && MANAGED_ENVIRONMENT_INSTALL_TYPES.includes(install.type);

// Handed to each install. `signal` aborts when the user stops it; the work
// calls `markUnsafeToStop` once it starts changing files (pip printing
// "Installing collected packages"), after which it can no longer be stopped.
export interface InstallTaskControl {
  signal: AbortSignal;
  markUnsafeToStop: () => void;
}

interface InstallTaskOptions {
  subject?: string;
  // Only installs that pass the control on to their pip process can be
  // stopped once running; every install can be cancelled while queued.
  stoppable?: boolean;
  // The work ends its process when the signal aborts, so it can be stopped
  // at any point when its environment is about to be deleted anyway.
  endsOnSignal?: boolean;
  // A Python switch, which rebuilds the managed environment empty. It goes
  // ahead of everything still waiting. dbt installs are cancelled (a running
  // one is stopped): adapters need dbt Core, which the new environment no
  // longer has, so dbt Core is installed again by hand first. Other installs
  // into the environment run after it; a running one is stopped and put
  // back right after it, except Flowfile and sqlglot, which run pip through a
  // shell that can't be stopped reliably, so they finish first.
  replacesManagedEnvironment?: boolean;
  // A Python uninstall. Installs into the managed environment can't run
  // without it, so queued ones are cancelled and a running one is stopped.
  removesManagedEnvironment?: boolean;
  // Runs once this install has finished, before the next one starts.
  beforeNextInstall?: (succeeded: boolean) => Promise<void>;
}

// Most install services report failure as `{ success: false }`,
// `{ ok: false }` or `{ status: 'error' }` instead of throwing.
const getReportedError = (result: unknown): string | null => {
  if (!result || typeof result !== 'object') return null;
  const { success, ok, status, error } = result as {
    success?: boolean;
    ok?: boolean;
    status?: string;
    error?: string;
  };
  if (success === false || ok === false || status === 'error') {
    return error || 'Install failed';
  }
  return null;
};

// Takes queued installs out of the queue when `getRemovalReason` gives a
// reason; they show as failed with it.
export const removeQueuedInstalls = async (
  getRemovalReason: (install: {
    type: string;
    subject?: string;
  }) => Promise<string | null>,
): Promise<void> => {
  const checked = await Promise.all(
    waitingInstalls.map(async (queued) => ({
      queued,
      reason: await getRemovalReason(queued),
    })),
  );
  checked.forEach(({ queued, reason }) => {
    const index = waitingInstalls.indexOf(queued);
    if (!reason || index < 0) return;
    waitingInstalls.splice(index, 1);
    TaskManagerService.fail(queued.taskId, reason);
    queued.drop(new Error(reason));
  });
};

export const runInstallTask = <T>(
  type: string,
  label: string,
  work: (control: InstallTaskControl) => Promise<T>,
  options: InstallTaskOptions = {},
): Promise<T> => {
  if (options.replacesManagedEnvironment) {
    waitingInstalls
      .filter((queued) => queued.type === 'install:dbt')
      .forEach((queued) => TaskManagerService.cancel(queued.taskId));
    if (runningInstall?.type === 'install:dbt') {
      runningInstall.stopAndCancel?.();
    } else if (isManagedEnvironmentInstall(runningInstall)) {
      runningInstall?.stopAndRestartLater?.();
    }
  }
  if (options.removesManagedEnvironment) {
    waitingInstalls
      .filter(isManagedEnvironmentInstall)
      .forEach((queued) => TaskManagerService.cancel(queued.taskId));
    if (isManagedEnvironmentInstall(runningInstall)) {
      runningInstall?.stopAndCancel?.();
    }
  }

  const goesFirst = Boolean(
    options.replacesManagedEnvironment || options.removesManagedEnvironment,
  );
  const taskId = uuidv4();
  let abortController = new AbortController();
  TaskManagerService.create({
    id: taskId,
    type,
    label,
    status: 'pending',
    cancellable: true,
    subject: options.subject,
    queueFirst: goesFirst,
  });

  return new Promise<T>((resolve, reject) => {
    const queued: QueuedInstall = {
      taskId,
      type,
      subject: options.subject,
      goesFirst,
      drop: (error) => reject(error),
      cancel: () => {
        const waitingIndex = waitingInstalls.indexOf(queued);
        if (waitingIndex >= 0) {
          waitingInstalls.splice(waitingIndex, 1);
          // Cancelled while queued: nothing was downloaded or written.
          queued.drop(new Error(INSTALL_CANCELLED_MESSAGE));
        }
        abortController.abort();
      },
      start: async () => {
        let restartLater = false;
        runningInstall = {
          taskId,
          type,
          ...(options.endsOnSignal
            ? {
                stopAndRestartLater: () => {
                  restartLater = true;
                  abortController.abort();
                },
                stopAndCancel: () => {
                  TaskManagerService.registerCanceller(taskId, queued.cancel);
                  TaskManagerService.cancel(taskId);
                },
              }
            : {}),
        };
        TaskManagerService.start(taskId);
        if (!options.stoppable) {
          TaskManagerService.setCancellable(taskId, false);
        }

        let succeeded = false;
        try {
          const result = await work({
            signal: abortController.signal,
            markUnsafeToStop: () =>
              TaskManagerService.setCancellable(taskId, false),
          });
          // Stopped while running; cancel() already marked the task.
          if (abortController.signal.aborted) {
            throw new Error(INSTALL_CANCELLED_MESSAGE);
          }
          const reportedError = getReportedError(result);
          if (reportedError) {
            TaskManagerService.fail(taskId, reportedError);
          } else {
            TaskManagerService.complete(taskId);
            succeeded = true;
          }
          resolve(result);
        } catch (error) {
          if (restartLater) {
            // Stopped for a Python switch: back in the queue right after it,
            // waiting again to run in the new environment.
            abortController = new AbortController();
            const index = firstPlaceInQueue();
            const installAhead = waitingInstalls[index - 1];
            TaskManagerService.requeue(
              taskId,
              installAhead
                ? TaskManagerService.get(installAhead.taskId)?.startedAt
                : undefined,
            );
            TaskManagerService.registerCanceller(taskId, queued.cancel);
            waitingInstalls.splice(index, 0, queued);
            return;
          }
          if (!abortController.signal.aborted) {
            TaskManagerService.fail(
              taskId,
              error instanceof Error ? error.message : String(error),
            );
          }
          reject(error);
        }
        await options.beforeNextInstall?.(succeeded);
      },
    };

    TaskManagerService.registerCanceller(taskId, queued.cancel);

    if (goesFirst) {
      waitingInstalls.splice(firstPlaceInQueue(), 0, queued);
    } else {
      waitingInstalls.push(queued);
    }
    // Starts on a later tick, after the caller has the returned promise.
    Promise.resolve()
      .then(startNextInstall)
      .catch(() => undefined);
  });
};

const isActive = (task: TaskRecord) =>
  task.status === 'running' || task.status === 'pending';

const getActiveInstallTasks = () =>
  TaskManagerService.list().filter(
    (task) => isInstallTaskType(task.type) && isActive(task),
  );

export const isDbtRuntimeChanging = (): boolean =>
  getActiveInstallTasks().some(isDbtRuntimeChangeTask);

// v1 adapters require dbt-core < 2.0: one queued behind a switch to v2 would
// bring dbt-core back next to dbt-oss, so it is refused instead.
export const isDbtV2SwitchQueued = (): boolean =>
  getActiveInstallTasks().some(
    (task) => task.type === 'install:dbt' && isDbtV2SwitchSubject(task.subject),
  );

let isQuitConfirmed = false;

// Asks before quitting while installs are running or queued. Returns true when
// quitting may go ahead; "Quit anyway" cancels the queued installs, which have
// not started and so leave nothing half-done.
export const confirmQuitWithActiveInstalls = (
  window: BrowserWindow | null,
): boolean => {
  if (isQuitConfirmed) return true;
  const activeInstalls = getActiveInstallTasks();
  if (activeInstalls.length === 0) return true;

  const options = {
    type: 'warning' as const,
    buttons: ['Keep running', 'Quit anyway'],
    defaultId: 0,
    cancelId: 0,
    message:
      activeInstalls.length === 1
        ? '1 install is still running or queued.'
        : `${activeInstalls.length} installs are still running or queued.`,
    detail: 'Quitting now can leave the running one half-installed.',
  };
  const choice = window
    ? dialog.showMessageBoxSync(window, options)
    : dialog.showMessageBoxSync(options);
  if (choice !== 1) return false;

  isQuitConfirmed = true;
  activeInstalls
    .filter((task) => task.status === 'pending')
    .forEach((task) => TaskManagerService.cancel(task.id));
  return true;
};
