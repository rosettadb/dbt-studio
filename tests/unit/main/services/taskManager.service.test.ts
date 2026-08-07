import { TaskManagerService } from '../../../../src/main/services/taskManager.service';

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
}));

describe('TaskManagerService.cancelAll', () => {
  beforeEach(() => {
    TaskManagerService.list().forEach(({ id }) =>
      TaskManagerService.remove(id),
    );
  });

  afterEach(() => {
    TaskManagerService.list().forEach(({ id }) =>
      TaskManagerService.remove(id),
    );
  });

  it('cancels registered work but preserves running tasks without cancellers', () => {
    const cancel = jest.fn();
    TaskManagerService.create({
      id: 'cancellable',
      type: 'test',
      label: 'Cancellable task',
      cancellable: true,
    });
    TaskManagerService.registerCanceller('cancellable', cancel);
    TaskManagerService.create({
      id: 'not-cancellable',
      type: 'test',
      label: 'Non-cancellable task',
    });

    expect(TaskManagerService.cancelAll()).toBe(1);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(
      TaskManagerService.list().find(({ id }) => id === 'cancellable')?.status,
    ).toBe('cancelled');
    expect(
      TaskManagerService.list().find(({ id }) => id === 'not-cancellable')
        ?.status,
    ).toBe('running');
  });
});
