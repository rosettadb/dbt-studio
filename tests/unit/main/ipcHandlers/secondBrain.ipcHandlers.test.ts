/* eslint-disable class-methods-use-this */
describe('secondBrain.ipcHandlers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const getHandler = (ipcMain: any, channel: string) => {
    const registration = (ipcMain.handle as jest.Mock).mock.calls.find(
      ([registeredChannel]) => registeredChannel === channel,
    );
    if (!registration) throw new Error(`Missing handler: ${channel}`);
    return registration[1] as (...args: any[]) => any;
  };

  const setup = async (enabled = true) => {
    const service = {
      getStatus: jest.fn(async () => ({
        initialized: true,
        pageCount: 3,
        totalBytes: 1024,
        rootPath: '/private/user/second-brain',
        layoutVersion: 'okf-v0.1',
        okfVersion: '0.1',
      })),
      openWikiFolder: jest.fn(async () => undefined),
      openWikiTerminal: jest.fn(async () => undefined),
      listManagedPages: jest.fn(async () => []),
      readPage: jest.fn(async () => ({ pageId: 'memory.md' })),
      readArchivedPage: jest.fn(),
      writePage: jest.fn(),
      searchManagedPages: jest.fn(async () => []),
      archivePage: jest.fn(),
      listRevisions: jest.fn(async () => []),
      readRevision: jest.fn(),
      restoreArchivedPage: jest.fn(),
      restoreRevision: jest.fn(),
      clearAll: jest.fn(),
    };
    const refreshResult = {
      status: 'no-change' as const,
      dryRun: true,
      modelCalled: false,
      itemsCollected: 0,
      operationsProposed: 0,
      operationsApplied: 0,
      changedPageIds: [],
      truncated: false,
    };
    const refresh = jest.fn(async (options) => {
      options.onProgress({
        stage: 'comparing',
        completed: 1,
        total: 1,
        message: 'Comparing evidence.',
      });
      return refreshResult;
    });
    let resolveCancellation: (result: {
      cancelled: boolean;
    }) => void = () => {};
    const pendingCancellation = new Promise<{ cancelled: boolean }>(
      (resolve) => {
        resolveCancellation = resolve;
      },
    );
    const cancelActiveAndWait = jest
      .fn()
      .mockResolvedValueOnce({ cancelled: false })
      .mockReturnValueOnce(pendingCancellation);
    jest.doMock('../../../../src/main/services/agent.service', () => ({
      loadAISettings: jest.fn(async () => ({
        secondBrain: {
          enabled,
          initialized: true,
          maxPageBytes: 65536,
          maxTotalBytes: 10485760,
        },
      })),
      saveAISettings: jest.fn(async () => undefined),
    }));
    jest.doMock(
      '../../../../src/main/services/ai/secondBrain/secondBrain.service',
      () => ({
        __esModule: true,
        default: jest.fn(() => service),
        normalizeSecondBrainPageId: (pageId: string) => {
          if (pageId.includes('..')) {
            throw Object.assign(new Error('Invalid page ID'), {
              code: 'INVALID_PAGE_ID',
            });
          }
          return pageId;
        },
        isSecondBrainGeneratedPageId: (pageId: string) =>
          pageId.endsWith('index.md') || pageId.endsWith('log.md'),
      }),
    );
    jest.doMock(
      '../../../../src/main/services/ai/secondBrain/secondBrainRefreshCoordinator.service',
      () => ({
        __esModule: true,
        default: class {
          private readonly dependencies: any;

          constructor(dependencies: any) {
            this.dependencies = dependencies;
          }

          getStatus() {
            return { busy: false, activeOperationId: undefined };
          }

          async run(owner: any, options: any) {
            if (!(await this.dependencies.isEnabled())) {
              throw Object.assign(new Error('Wiki Memory is disabled'), {
                code: 'DISABLED',
              });
            }
            const operationId = 'operation-1';
            const handleDestroyed = () => undefined;
            const removeDestroyedListener = owner.onDestroyed(handleDestroyed);
            try {
              const result = await refresh({
                ...options,
                onProgress: (progress: any) =>
                  owner.emitProgress({
                    operationId,
                    ...progress,
                    timestamp: '2026-07-15T12:00:00.000Z',
                    cancellable: true,
                  }),
              });
              return { operationId, result };
            } finally {
              removeDestroyedListener();
            }
          }

          cancel() {
            return { cancelled: true };
          }

          async cancelActiveAndWait() {
            return cancelActiveAndWait();
          }

          reset() {}
        },
      }),
    );

    const electron = await import('electron');
    const module = await import(
      '../../../../src/main/ipcHandlers/secondBrain.ipcHandlers'
    );
    module.registerSecondBrainHandlers();
    return {
      electron,
      module,
      service,
      refresh,
      cancelActiveAndWait,
      resolveCancellation,
    };
  };

  it('registers the frozen channel surface only once', async () => {
    const { electron, module } = await setup();
    const registrationCount = (electron.ipcMain.handle as jest.Mock).mock.calls
      .length;

    module.registerSecondBrainHandlers();

    expect(registrationCount).toBe(17);
    expect(electron.ipcMain.handle).toHaveBeenCalledTimes(registrationCount);
    expect(electron.ipcMain.handle).toHaveBeenCalledWith(
      'second-brain:status',
      expect.any(Function),
    );
    expect(electron.ipcMain.handle).toHaveBeenCalledWith(
      'second-brain:open-wiki-folder',
      expect.any(Function),
    );
    expect(electron.ipcMain.handle).toHaveBeenCalledWith(
      'second-brain:open-wiki-terminal',
      expect.any(Function),
    );
    expect(electron.ipcMain.handle).not.toHaveBeenCalledWith(
      'second-brain:open-folder',
      expect.any(Function),
    );
  });

  it('returns a safe status without exposing the absolute root', async () => {
    const { electron } = await setup();
    const handler = getHandler(electron.ipcMain, 'second-brain:status');

    const status = await handler({});

    expect(status).toMatchObject({
      enabled: true,
      initialized: true,
      layoutVersion: 'okf-v0.1',
      okfVersion: '0.1',
    });
    expect(status).not.toHaveProperty('rootPath');
    expect(status).not.toHaveProperty('rootDisplayName');
  });

  it('delegates the single wiki-folder action to the backend service', async () => {
    const { electron, service } = await setup();
    const handler = getHandler(
      electron.ipcMain,
      'second-brain:open-wiki-folder',
    );

    await handler({});

    expect(service.openWikiFolder).toHaveBeenCalledTimes(1);
  });

  it('delegates terminal opening without accepting a renderer path', async () => {
    const { electron, service } = await setup();
    const handler = getHandler(
      electron.ipcMain,
      'second-brain:open-wiki-terminal',
    );

    await handler({});

    expect(service.openWikiTerminal).toHaveBeenCalledTimes(1);
  });

  it('validates page IDs and delegates page reads once', async () => {
    const { electron, service } = await setup();
    const handler = getHandler(electron.ipcMain, 'second-brain:read');

    const editable = await handler({}, { pageId: 'memory.md' });

    expect(service.readPage).toHaveBeenCalledWith('memory.md');
    expect(editable.readOnly).toBe(false);
    expect((await handler({}, { pageId: 'index.md' })).readOnly).toBe(true);
    await expect(handler({}, { pageId: '../secret.md' })).rejects.toMatchObject(
      { code: 'INVALID_PAGE_ID' },
    );
  });

  it('sends owned progress events for refresh operations', async () => {
    const { electron, refresh } = await setup();
    const handler = getHandler(electron.ipcMain, 'second-brain:update-preview');
    const sender = {
      id: 17,
      isDestroyed: () => false,
      send: jest.fn(),
      once: jest.fn(),
      removeListener: jest.fn(),
    };

    const response = await handler({ sender });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(response.result.status).toBe('no-change');
    expect(sender.send).toHaveBeenCalledWith(
      'second-brain:progress',
      expect.objectContaining({
        operationId: response.operationId,
        stage: 'comparing',
        cancellable: true,
      }),
    );
    expect(sender.once).toHaveBeenCalledWith('destroyed', expect.any(Function));
    expect(sender.removeListener).toHaveBeenCalledWith(
      'destroyed',
      expect.any(Function),
    );
  });

  it('blocks initialization and refresh while the feature is disabled', async () => {
    const { electron, refresh } = await setup(false);
    const handler = getHandler(electron.ipcMain, 'second-brain:update-apply');

    await expect(handler({ sender: { id: 1 } })).rejects.toMatchObject({
      code: 'DISABLED',
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('drains active refresh work before pausing or clearing memory', async () => {
    const { electron, service, cancelActiveAndWait, resolveCancellation } =
      await setup();
    const pause = getHandler(electron.ipcMain, 'second-brain:pause');
    const clear = getHandler(
      electron.ipcMain,
      'second-brain:clear-and-disable',
    );

    await pause({});
    expect(cancelActiveAndWait).toHaveBeenCalledTimes(1);

    const clearPromise = clear({});
    expect(cancelActiveAndWait).toHaveBeenCalledTimes(2);
    expect(service.clearAll).not.toHaveBeenCalled();

    resolveCancellation({ cancelled: true });
    await clearPromise;

    expect(service.clearAll).toHaveBeenCalledTimes(1);
  });
});
