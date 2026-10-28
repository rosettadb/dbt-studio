import { TaskManagerService } from '../../../../src/main/services/taskManager.service';
import {
  InstallTaskControl,
  downloadForInstall,
  isDbtV2SwitchQueued,
  removeQueuedInstalls,
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

// Work that runs until released, or ends like a stopped pip when its signal
// aborts.
const blockingWork = () => {
  const calls: { release: () => void }[] = [];
  const work = jest.fn(
    ({ signal }: InstallTaskControl) =>
      new Promise<{ ok: boolean }>((resolve, reject) => {
        calls.push({ release: () => resolve({ ok: true }) });
        signal.addEventListener('abort', () =>
          reject(new Error(INSTALL_CANCELLED_MESSAGE)),
        );
      }),
  );
  return { work, release: (call = 0) => calls[call].release() };
};

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
  describe('Python switch', () => {
    const switchPython = (label = 'Installing Python 3.12.10') => {
      const python = blockingWork();
      const run = runInstallTask('install:python', label, python.work, {
        replacesManagedEnvironment: true,
      });
      return { ...python, run };
    };

    it('goes ahead of installs still waiting, which keep their order', async () => {
      const first = blockingWork();
      const firstRun = runInstallTask('install:rosetta', 'Rosetta', first.work);
      const notebookRun = runInstallTask(
        'install:notebook',
        'Notebook packages',
        () => Promise.resolve({ ok: true }),
      );
      await waitForQueue();

      const python = switchPython();
      expect(findTask('Installing Python 3.12.10')!.startedAt).toBeLessThan(
        findTask('Notebook packages')!.startedAt,
      );

      first.release();
      await firstRun;
      await waitForQueue();
      expect(findTask('Installing Python 3.12.10')?.status).toBe('running');
      expect(findTask('Notebook packages')?.status).toBe('pending');

      python.release();
      await python.run;
      await notebookRun;
      expect(findTask('Notebook packages')?.status).toBe('completed');
    });

    it('cancels queued dbt installs and stops a running one', async () => {
      const adapter = blockingWork();
      const adapterRun = runInstallTask(
        'install:dbt',
        'Installing dbt-snowflake',
        adapter.work,
        { subject: 'dbt-snowflake', endsOnSignal: true },
      );
      const queuedWork = jest.fn().mockResolvedValue({ ok: true });
      const queuedRun = runInstallTask(
        'install:dbt',
        'Installing dbt-bigquery 1.11.2',
        queuedWork,
        { subject: 'dbt-bigquery@1.11.2', endsOnSignal: true },
      );
      await waitForQueue();

      const python = switchPython();
      await expect(adapterRun).rejects.toThrow(INSTALL_CANCELLED_MESSAGE);
      await expect(queuedRun).rejects.toThrow(INSTALL_CANCELLED_MESSAGE);
      expect(findTask('Installing dbt-snowflake')?.status).toBe('cancelled');
      expect(findTask('Installing dbt-bigquery 1.11.2')?.status).toBe(
        'cancelled',
      );
      expect(queuedWork).not.toHaveBeenCalled();

      await waitForQueue();
      expect(findTask('Installing Python 3.12.10')?.status).toBe('running');
      python.release();
      await python.run;
    });

    it('stops a running pyiceberg install and restarts it right after Python', async () => {
      const pyiceberg = blockingWork();
      const pyicebergRun = runInstallTask(
        'install:pyiceberg',
        'Installing pyiceberg',
        pyiceberg.work,
        { endsOnSignal: true },
      );
      const laterRun = runInstallTask('install:runner', 'Runner', () =>
        Promise.resolve({ success: true }),
      );
      await waitForQueue();

      const python = switchPython();
      await waitForQueue();
      expect(findTask('Installing pyiceberg')?.status).toBe('pending');
      expect(findTask('Installing Python 3.12.10')?.status).toBe('running');
      // Back in line right after Python, ahead of what was already waiting.
      expect(findTask('Installing pyiceberg')!.startedAt).toBeLessThan(
        findTask('Runner')!.startedAt,
      );

      python.release();
      await python.run;
      await waitForQueue();
      expect(pyiceberg.work).toHaveBeenCalledTimes(2);
      pyiceberg.release(1);
      await expect(pyicebergRun).resolves.toEqual({ ok: true });
      expect(findTask('Installing pyiceberg')?.status).toBe('completed');
      await laterRun;
    });

    it('waits for a running sqlglot install, which pip runs through a shell', async () => {
      const sqlglot = blockingWork();
      const sqlglotRun = runInstallTask(
        'install:sqlglot',
        'Installing sqlglot',
        sqlglot.work,
      );
      await waitForQueue();

      const python = switchPython();
      await waitForQueue();
      expect(findTask('Installing sqlglot')?.status).toBe('running');
      expect(findTask('Installing Python 3.12.10')?.status).toBe('pending');

      sqlglot.release();
      await sqlglotRun;
      await waitForQueue();
      expect(findTask('Installing Python 3.12.10')?.status).toBe('running');
      python.release();
      await python.run;
    });
  });

  it('cancels queued installs into the environment on a Python uninstall', async () => {
    const first = blockingWork();
    const firstRun = runInstallTask('install:rosetta', 'Rosetta', first.work);
    const flowfileRun = runInstallTask('install:flowfile', 'Flowfile', () =>
      Promise.resolve({ success: true }),
    );
    await waitForQueue();

    const uninstall = blockingWork();
    const uninstallRun = runInstallTask(
      'install:python',
      'Uninstalling Python',
      uninstall.work,
      { removesManagedEnvironment: true },
    );
    await expect(flowfileRun).rejects.toThrow(INSTALL_CANCELLED_MESSAGE);
    expect(findTask('Flowfile')?.status).toBe('cancelled');

    first.release();
    await firstRun;
    await waitForQueue();
    uninstall.release();
    await uninstallRun;
  });

  it('takes queued installs out with the reason it is given', async () => {
    const first = blockingWork();
    const firstRun = runInstallTask('install:rosetta', 'Rosetta', first.work);
    const keptRun = runInstallTask('install:runner', 'Runner', () =>
      Promise.resolve({ success: true }),
    );
    const removedRun = runInstallTask('install:flowfile', 'Flowfile', () =>
      Promise.resolve({ success: true }),
    );
    await waitForQueue();

    await removeQueuedInstalls(async (install) =>
      install.type === 'install:flowfile' ? 'Python install failed.' : null,
    );
    await expect(removedRun).rejects.toThrow('Python install failed.');
    expect(findTask('Flowfile')?.status).toBe('error');
    expect(findTask('Flowfile')?.error).toBe('Python install failed.');

    first.release();
    await firstRun;
    await keptRun;
    expect(findTask('Runner')?.status).toBe('completed');
  });
});

describe('downloadForInstall', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('gives a queued install download 30 minutes in total, then says it timed out', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    const download = downloadForInstall('https://example.test/python.tar.gz', {
      responseType: 'arraybuffer',
      adapter: (config) =>
        new Promise((_resolve, reject) => {
          signal = config.signal as AbortSignal;
          signal.addEventListener('abort', () => reject(new Error('canceled')));
        }),
    });
    const outcome = download.catch((error: Error) => error);

    await jest.advanceTimersByTimeAsync(29 * 60 * 1000);
    expect(signal?.aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(60 * 1000);
    expect(((await outcome) as Error).message).toBe(
      'Download timed out after 30 minutes: https://example.test/python.tar.gz',
    );
  });

  it('passes other download errors through unchanged', async () => {
    await expect(
      downloadForInstall('https://example.test/missing.zip', {
        adapter: () => Promise.reject(new Error('404 Not Found')),
      }),
    ).rejects.toThrow('404 Not Found');
  });
});
