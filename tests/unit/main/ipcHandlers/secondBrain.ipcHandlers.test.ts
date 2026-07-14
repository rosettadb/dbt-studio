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

  const setup = async () => {
    const service = {
      getStatus: jest.fn(async () => ({
        initialized: true,
        pageCount: 3,
        totalBytes: 1024,
        rootPath: '/private/user/second-brain',
      })),
      getRootPath: jest.fn(() => '/private/user/second-brain'),
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

    jest.doMock('../../../../src/main/services/agent.service', () => ({
      loadAISettings: jest.fn(async () => ({
        secondBrain: {
          enabled: true,
          maxPageBytes: 65536,
          maxTotalBytes: 10485760,
        },
      })),
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
      }),
    );
    jest.doMock(
      '../../../../src/main/services/ai/secondBrain/secondBrainRefresh.service',
      () => ({
        __esModule: true,
        default: jest.fn(() => ({ refresh })),
      }),
    );

    const electron = await import('electron');
    const module = await import(
      '../../../../src/main/ipcHandlers/secondBrain.ipcHandlers'
    );
    module.registerSecondBrainHandlers();
    return { electron, module, service, refresh };
  };

  it('registers the frozen channel surface only once', async () => {
    const { electron, module } = await setup();
    const registrationCount = (electron.ipcMain.handle as jest.Mock).mock.calls
      .length;

    module.registerSecondBrainHandlers();

    expect(registrationCount).toBe(14);
    expect(electron.ipcMain.handle).toHaveBeenCalledTimes(registrationCount);
    expect(electron.ipcMain.handle).toHaveBeenCalledWith(
      'second-brain:status',
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
      rootDisplayName: 'second-brain',
    });
    expect(status).not.toHaveProperty('rootPath');
  });

  it('validates page IDs and delegates page reads once', async () => {
    const { electron, service } = await setup();
    const handler = getHandler(electron.ipcMain, 'second-brain:read');

    await handler({}, { pageId: 'memory.md' });

    expect(service.readPage).toHaveBeenCalledWith('memory.md');
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
  });
});
