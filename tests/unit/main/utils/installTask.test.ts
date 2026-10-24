import { TaskManagerService } from '../../../../src/main/services/taskManager.service';
import { runInstallTask } from '../../../../src/main/utils/installTask';

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
}));

const findTask = (label: string) =>
  TaskManagerService.list().find((task) => task.label === label);

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
});
