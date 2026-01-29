describe('duckLake.ipcHandlers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const getHandleHandler = (ipcMain: any, channel: string) => {
    const call = (ipcMain.handle as jest.Mock).mock.calls.find(([c]) => c === channel);
    if (!call) {
      throw new Error(`No handler registered for channel: ${channel}`);
    }
    return call[1] as (...args: any[]) => any;
  };

  it('registers key DuckLake channels', async () => {
    const { ipcMain } = await import('electron');

    jest.doMock('../../../../src/main/services/duckLake.service', () => ({
      __esModule: true,
      default: {
        listInstances: jest.fn(),
        getInstance: jest.fn(),
        createInstance: jest.fn(),
        updateInstance: jest.fn(),
        deleteInstance: jest.fn(),
        getInstanceHealth: jest.fn(),
        testCatalogConnection: jest.fn(),
        listTables: jest.fn(),
        getTable: jest.fn(),
        importTable: jest.fn(),
        deleteTable: jest.fn(),
        getTableDetails: jest.fn(),
        listSnapshots: jest.fn(),
        listInstanceSnapshots: jest.fn(),
        restoreSnapshot: jest.fn(),
        executeQuery: jest.fn(),
        startMaintenanceTask: jest.fn(),
        getMaintenanceTaskStatus: jest.fn(),
        loadDuckLakeExtension: jest.fn(),
        verifyExtension: jest.fn(),
        getStorageStats: jest.fn(),
        validateStorageConnection: jest.fn(),
      },
    }));

    const registerDuckLakeHandlers = (await import(
      '../../../../src/main/ipcHandlers/duckLake.ipcHandlers'
    )).default;

    registerDuckLakeHandlers();

    expect(ipcMain.handle).toHaveBeenCalledWith(
      'ducklake:instance:list',
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'ducklake:query:execute',
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'ducklake:extension:verify',
      expect.any(Function),
    );
  });

  it('delegates ducklake:instance:list to DuckLakeService.listInstances', async () => {
    const { ipcMain } = await import('electron');

    const listInstances = jest.fn().mockResolvedValue([{ id: 'x' }]);

    jest.doMock('../../../../src/main/services/duckLake.service', () => ({
      __esModule: true,
      default: {
        listInstances,
        getInstance: jest.fn(),
        createInstance: jest.fn(),
        updateInstance: jest.fn(),
        deleteInstance: jest.fn(),
        getInstanceHealth: jest.fn(),
        testCatalogConnection: jest.fn(),
        listTables: jest.fn(),
        getTable: jest.fn(),
        importTable: jest.fn(),
        deleteTable: jest.fn(),
        getTableDetails: jest.fn(),
        listSnapshots: jest.fn(),
        listInstanceSnapshots: jest.fn(),
        restoreSnapshot: jest.fn(),
        executeQuery: jest.fn(),
        startMaintenanceTask: jest.fn(),
        getMaintenanceTaskStatus: jest.fn(),
        loadDuckLakeExtension: jest.fn(),
        verifyExtension: jest.fn(),
        getStorageStats: jest.fn(),
        validateStorageConnection: jest.fn(),
      },
    }));

    const registerDuckLakeHandlers = (await import(
      '../../../../src/main/ipcHandlers/duckLake.ipcHandlers'
    )).default;

    registerDuckLakeHandlers();

    const handler = getHandleHandler(ipcMain, 'ducklake:instance:list');

    await expect(handler(null)).resolves.toEqual([{ id: 'x' }]);
    expect(listInstances).toHaveBeenCalled();
  });
});
