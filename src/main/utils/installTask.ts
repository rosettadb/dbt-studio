import { BrowserWindow, dialog } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { TaskManagerService } from '../services/taskManager.service';
import {
  INSTALL_CANCELLED_MESSAGE,
  isDbtRuntimeChangeTask,
  isDbtV2SwitchSubject,
  isInstallTaskType,
} from '../../shared/installTasks';
import type { TaskRecord } from '../../types/ipc';

// Installs share one queue so only one runs at a time: dbt, its adapters,
// Flowfile and sqlglot all live in the same managed Python environment, and
// switching Python rebuilds that environment, so overlapping installs could
// leave it half-installed. Each install shows in the task manager, waiting
// ("pending") until its turn comes.
let installQueue: Promise<unknown> = Promise.resolve();

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

export const runInstallTask = <T>(
  type: string,
  label: string,
  work: (control: InstallTaskControl) => Promise<T>,
  options: InstallTaskOptions = {},
): Promise<T> => {
  const taskId = uuidv4();
  const abortController = new AbortController();
  TaskManagerService.create({
    id: taskId,
    type,
    label,
    status: 'pending',
    cancellable: true,
    subject: options.subject,
  });
  TaskManagerService.registerCanceller(taskId, () => abortController.abort());

  const run = installQueue.then(async () => {
    // Cancelled while queued: nothing was downloaded or written.
    if (abortController.signal.aborted) {
      throw new Error(INSTALL_CANCELLED_MESSAGE);
    }
    TaskManagerService.start(taskId);
    if (!options.stoppable) TaskManagerService.setCancellable(taskId, false);

    try {
      const result = await work({
        signal: abortController.signal,
        markUnsafeToStop: () =>
          TaskManagerService.setCancellable(taskId, false),
      });
      // Stopped while still downloading; cancel() already marked the task.
      if (abortController.signal.aborted) {
        throw new Error(INSTALL_CANCELLED_MESSAGE);
      }
      const reportedError = getReportedError(result);
      if (reportedError) {
        TaskManagerService.fail(taskId, reportedError);
      } else {
        TaskManagerService.complete(taskId);
      }
      return result;
    } catch (error) {
      if (!abortController.signal.aborted) {
        TaskManagerService.fail(
          taskId,
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    }
  });
  installQueue = run.catch(() => undefined);
  return run;
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
