/** @jest-environment-options {"customExportConditions": ["node", "node-addons"]} */
import SecondBrainRefreshCoordinator from '../../../../../../src/main/services/ai/secondBrain/secondBrainRefreshCoordinator.service';
import SecondBrainRefreshService from '../../../../../../src/main/services/ai/secondBrain/secondBrainRefresh.service';

const mockRefresh = jest.spyOn(SecondBrainRefreshService.prototype, 'refresh');

const completedResult = {
  status: 'completed' as const,
  dryRun: false,
  modelCalled: false,
  itemsCollected: 0,
  operationsProposed: 0,
  operationsSkipped: 0,
  operationsApplied: 0,
  operationsFailed: 0,
  failures: [],
  changedPageIds: [],
  truncated: false,
};

describe('SecondBrainRefreshCoordinator', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
  });

  const createCoordinator = () =>
    new SecondBrainRefreshCoordinator({
      isEnabled: jest.fn(async () => true),
      createService: jest.fn(async () => ({}) as any),
      createOperationId: () => 'operation-1',
    });

  it('treats cancellation with no active operation as an idempotent no-op', () => {
    const coordinator = createCoordinator();

    expect(coordinator.cancel(17, 'operation-1')).toEqual({
      cancelled: false,
    });
  });

  it('reports the kind, start time and latest progress of the running build', async () => {
    let reportProgress: (stage: 'collecting') => void = () => {};
    let resolveRefresh: (result: typeof completedResult) => void = () => {};
    mockRefresh.mockImplementation(async (options: any) => {
      reportProgress = (stage) =>
        options.onProgress({ stage, completed: 1, message: 'Collecting.' });
      return new Promise<typeof completedResult>((resolve) => {
        resolveRefresh = resolve;
      });
    });
    const coordinator = createCoordinator();
    const emitProgress = jest.fn();
    const owner = {
      ownerId: 17,
      isDestroyed: () => false,
      onDestroyed: () => () => undefined,
      emitProgress,
    };

    const runPromise = coordinator.run(owner, { initialize: true });
    await Promise.resolve();
    await Promise.resolve();
    reportProgress('collecting');

    const status = coordinator.getStatus();
    expect(status.activeOperationKind).toBe('init');
    expect(Number.isFinite(Date.parse(status.activeOperationStartedAt!))).toBe(
      true,
    );
    expect(status.activeProgress).toMatchObject({
      operationId: 'operation-1',
      stage: 'collecting',
      cancellable: true,
    });
    expect(emitProgress).toHaveBeenCalledWith(status.activeProgress);

    resolveRefresh(completedResult);
    await runPromise;
    expect(coordinator.getStatus().activeProgress).toBeUndefined();
  });

  it('preserves operation and owner checks while an operation is active', async () => {
    let resolveRefresh: (result: typeof completedResult) => void = () => {};
    mockRefresh.mockImplementation(
      () =>
        new Promise<typeof completedResult>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const coordinator = createCoordinator();
    const owner = {
      ownerId: 17,
      isDestroyed: () => false,
      onDestroyed: () => () => undefined,
      emitProgress: jest.fn(),
    };

    const runPromise = coordinator.run(owner, {});
    await Promise.resolve();
    await Promise.resolve();

    expect(coordinator.getStatus()).toEqual({
      busy: true,
      activeOperationId: 'operation-1',
      activeOperationKind: 'apply',
      activeOperationStartedAt: expect.any(String),
      activeProgress: undefined,
    });
    expect(() => coordinator.cancel(18, 'operation-1')).toThrow(
      'Active Wiki Memory operation not found.',
    );
    expect(() => coordinator.cancel(17, 'operation-2')).toThrow(
      'Active Wiki Memory operation not found.',
    );
    expect(coordinator.cancel(17, 'operation-1')).toEqual({ cancelled: true });

    const abortSignal = mockRefresh.mock.calls[0][0].abortSignal as AbortSignal;
    expect(abortSignal.aborted).toBe(true);

    resolveRefresh(completedResult);
    await runPromise;
    expect(coordinator.getStatus()).toEqual({
      busy: false,
      activeOperationId: undefined,
    });
  });
});
