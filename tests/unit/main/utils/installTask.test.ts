import { TaskManagerService } from '../../../../src/main/services/taskManager.service';
import {
  InstallTaskControl,
  isDbtV2SwitchQueued,
  runInstallTask,
} from '../../../../src/main/utils/installTask';
import { INSTALL_CANCELLED_MESSAGE } from '../../../../src/shared/installTasks';

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
}));

const findTask = (label: string) =>
  TaskManagerService.list().find((task) => task.label === label);

// Lets queued work start: the queue hands over on a later tick.
const waitForQueue = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe('runInstallTask', () => {
  afterEach(() => {
    TaskManagerService.list().forEach(({ id }) =>
      TaskManagerService.remove(id),
    );
  });

  it('runs installs one at a time, keeping later ones waiting', async () => {
    let finishFirst: () => void = () => {};
    const first = runInstallTask(
      'install:dbt',
      'First install',
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    const secondWork = jest.fn().mockResolvedValue({ ok: true });
    const second = runInstallTask(
      'install:python',
      'Second install',
      secondWork,
    );

    await Promise.resolve();
    expect(findTask('First install')?.status).toBe('running');
    expect(findTask('Second install')?.status).toBe('pending');
    expect(secondWork).not.toHaveBeenCalled();

    finishFirst();
    await first;
    await second;

    expect(findTask('First install')?.status).toBe('completed');
    expect(findTask('Second install')?.status).toBe('completed');
    expect(secondWork).toHaveBeenCalledTimes(1);
  });

  it('marks the task failed when the install reports an error', async () => {
    const result = await runInstallTask('install:dbt', 'Bad package', () =>
      Promise.resolve({ ok: false, error: 'pip failed' }),
    );

    expect(result).toEqual({ ok: false, error: 'pip failed' });
    expect(findTask('Bad package')?.status).toBe('error');
    expect(findTask('Bad package')?.error).toBe('pip failed');
  });

  it('marks the task failed on a thrown error and keeps the queue going', async () => {
    await expect(
      runInstallTask('install:app-update', 'Broken download', () =>
        Promise.reject(new Error('network down')),
      ),
    ).rejects.toThrow('network down');
    expect(findTask('Broken download')?.status).toBe('error');

    await runInstallTask('install:rosetta', 'Next install', () =>
      Promise.resolve({ success: true }),
    );
    expect(findTask('Next install')?.status).toBe('completed');
  });

  it('stores what the install is about on the task', async () => {
    await runInstallTask(
      'install:dbt',
      'Tagged install',
      () => Promise.resolve({ ok: true }),
      { subject: 'dbt-postgres@1.9.0' },
    );
    expect(findTask('Tagged install')?.subject).toBe('dbt-postgres@1.9.0');
  });

  it('skips an install cancelled while queued, so nothing runs', async () => {
    let finishFirst: () => void = () => {};
    const first = runInstallTask(
      'install:dbt',
      'Blocking install',
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    const queuedWork = jest.fn().mockResolvedValue({ ok: true });
    const queued = runInstallTask('install:dbt', 'Queued install', queuedWork);

    await waitForQueue();
    const queuedTask = findTask('Queued install');
    expect(queuedTask?.cancellable).toBe(true);
    expect(TaskManagerService.cancel(queuedTask!.id)).toBe(true);

    finishFirst();
    await first;
    await expect(queued).rejects.toThrow(INSTALL_CANCELLED_MESSAGE);
    expect(queuedWork).not.toHaveBeenCalled();
    expect(findTask('Queued install')?.status).toBe('cancelled');
  });

  it('cannot be cancelled once a non-stoppable install starts', async () => {
    let finish: () => void = () => {};
    const run = runInstallTask(
      'install:python',
      'Python install',
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await waitForQueue();

    const task = findTask('Python install');
    expect(task?.status).toBe('running');
    expect(task?.cancellable).toBe(false);
    expect(TaskManagerService.cancel(task!.id)).toBe(false);

    finish();
    await run;
    expect(findTask('Python install')?.status).toBe('completed');
  });

  it('lets a stoppable install stop only until it starts changing files', async () => {
    let control: InstallTaskControl | undefined;
    let finish: () => void = () => {};
    const run = runInstallTask(
      'install:dbt',
      'Adapter install',
      (installControl) => {
        control = installControl;
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
      { stoppable: true },
    );
    await waitForQueue();
    expect(findTask('Adapter install')?.cancellable).toBe(true);

    // pip printed "Installing collected packages".
    control!.markUnsafeToStop();
    const task = findTask('Adapter install');
    expect(task?.cancellable).toBe(false);
    expect(TaskManagerService.cancel(task!.id)).toBe(false);

    finish();
    await run;
    expect(findTask('Adapter install')?.status).toBe('completed');
  });

  it('marks a stoppable install cancelled when stopped while downloading', async () => {
    const run = runInstallTask(
      'install:dbt',
      'Stopped install',
      ({ signal }) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new Error(INSTALL_CANCELLED_MESSAGE)),
          );
        }),
      { stoppable: true },
    );
    await waitForQueue();

    TaskManagerService.cancel(findTask('Stopped install')!.id);
    await expect(run).rejects.toThrow(INSTALL_CANCELLED_MESSAGE);
    expect(findTask('Stopped install')?.status).toBe('cancelled');

    // The queue moves on to the next install.
    await runInstallTask('install:dbt', 'After stop', () =>
      Promise.resolve({ ok: true }),
    );
    expect(findTask('After stop')?.status).toBe('completed');
  });

  it('reports a queued switch to dbt Core v2, so adapter installs are refused', async () => {
    let finish: () => void = () => {};
    const run = runInstallTask(
      'install:dbt',
      'Switch to v2',
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      { subject: 'dbt-core@2.0.5' },
    );
    expect(isDbtV2SwitchQueued()).toBe(true);

    await waitForQueue();
    finish();
    await run;
    expect(isDbtV2SwitchQueued()).toBe(false);

    // A switch within v1 does not block adapters.
    const v1Run = runInstallTask(
      'install:dbt',
      'Switch within v1',
      () => Promise.resolve({ ok: true }),
      { subject: 'dbt-core@1.11.11' },
    );
    expect(isDbtV2SwitchQueued()).toBe(false);
    await v1Run;
  });
});
