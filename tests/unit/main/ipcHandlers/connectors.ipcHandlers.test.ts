describe('connectors.ipcHandlers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const getHandleHandler = (ipcMain: any, channel: string) => {
    const call = (ipcMain.handle as jest.Mock).mock.calls.find(
      ([c]) => c === channel,
    );
    if (!call) {
      throw new Error(`No handler registered for channel: ${channel}`);
    }
    return call[1] as (...args: any[]) => any;
  };

  it('registers handlers and removes previous handlers for connector channels', async () => {
    const { ipcMain } = await import('electron');

    jest.doMock('../../../../src/main/services', () => ({
      ConnectorsService: {
        configureConnection: jest.fn(),
        loadConnections: jest.fn(),
        getConnectionById: jest.fn(),
        testConnection: jest.fn(),
        updateConnection: jest.fn(),
        deleteConnection: jest.fn(),
        executeSelectStatement: jest.fn(),
        cancelQuery: jest.fn(),
        setConnectionEnvVariable: jest.fn(),
        validateConnection: jest.fn(),
        saveCloudConnection: jest.fn(),
        loadCloudConnections: jest.fn(),
        getCloudConnectionById: jest.fn(),
        deleteCloudConnection: jest.fn(),
        loadRecentItems: jest.fn(),
        addRecentItem: jest.fn(),
        clearRecentItems: jest.fn(),
        removeRecentItem: jest.fn(),
      },
    }));

    const registerConnectorsHandlers = (await import(
      '../../../../src/main/ipcHandlers/connectors.ipcHandlers'
    )).default;

    registerConnectorsHandlers();

    expect(ipcMain.removeHandler).toHaveBeenCalledWith('connector:configure');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('connector:test');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('connector:validate');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('connector:getJdbcUrl');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('connector:query');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('connector:cancel-query');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('connector:list');

    expect(ipcMain.handle).toHaveBeenCalledWith(
      'connector:configure',
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith('connector:test', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'connector:validate',
      expect.any(Function),
    );
  });

  it('delegates connector:test to ConnectorsService.testConnection', async () => {
    const { ipcMain } = await import('electron');

    const testConnection = jest.fn().mockResolvedValue(true);

    jest.doMock('../../../../src/main/services', () => ({
      ConnectorsService: {
        testConnection,
        configureConnection: jest.fn(),
        loadConnections: jest.fn(),
        getConnectionById: jest.fn(),
        updateConnection: jest.fn(),
        deleteConnection: jest.fn(),
        executeSelectStatement: jest.fn(),
        cancelQuery: jest.fn(),
        setConnectionEnvVariable: jest.fn(),
        validateConnection: jest.fn(),
        saveCloudConnection: jest.fn(),
        loadCloudConnections: jest.fn(),
        getCloudConnectionById: jest.fn(),
        deleteCloudConnection: jest.fn(),
        loadRecentItems: jest.fn(),
        addRecentItem: jest.fn(),
        clearRecentItems: jest.fn(),
        removeRecentItem: jest.fn(),
      },
    }));

    const registerConnectorsHandlers = (await import(
      '../../../../src/main/ipcHandlers/connectors.ipcHandlers'
    )).default;
    registerConnectorsHandlers();

    const handler = getHandleHandler(ipcMain, 'connector:test');
    const payload = { type: 'postgres' } as any;

    await expect(handler(null, payload)).resolves.toBe(true);
    expect(testConnection).toHaveBeenCalledWith(payload);
  });

  it('connector:validate returns {valid:true} when validation succeeds', async () => {
    const { ipcMain } = await import('electron');

    const validateConnection = jest.fn();

    jest.doMock('../../../../src/main/services', () => ({
      ConnectorsService: {
        validateConnection,
        testConnection: jest.fn(),
        configureConnection: jest.fn(),
        loadConnections: jest.fn(),
        getConnectionById: jest.fn(),
        updateConnection: jest.fn(),
        deleteConnection: jest.fn(),
        executeSelectStatement: jest.fn(),
        cancelQuery: jest.fn(),
        setConnectionEnvVariable: jest.fn(),
        saveCloudConnection: jest.fn(),
        loadCloudConnections: jest.fn(),
        getCloudConnectionById: jest.fn(),
        deleteCloudConnection: jest.fn(),
        loadRecentItems: jest.fn(),
        addRecentItem: jest.fn(),
        clearRecentItems: jest.fn(),
        removeRecentItem: jest.fn(),
      },
    }));

    const registerConnectorsHandlers = (await import(
      '../../../../src/main/ipcHandlers/connectors.ipcHandlers'
    )).default;
    registerConnectorsHandlers();

    const handler = getHandleHandler(ipcMain, 'connector:validate');

    await expect(handler(null, { type: 'postgres' } as any)).resolves.toEqual({
      valid: true,
    });
    expect(validateConnection).toHaveBeenCalled();
  });

  it('connector:validate returns {valid:false,error} when validation throws', async () => {
    const { ipcMain } = await import('electron');

    const validateConnection = jest
      .fn()
      .mockImplementation(() => {
        throw new Error('Connection type is required');
      });

    jest.doMock('../../../../src/main/services', () => ({
      ConnectorsService: {
        validateConnection,
        testConnection: jest.fn(),
        configureConnection: jest.fn(),
        loadConnections: jest.fn(),
        getConnectionById: jest.fn(),
        updateConnection: jest.fn(),
        deleteConnection: jest.fn(),
        executeSelectStatement: jest.fn(),
        cancelQuery: jest.fn(),
        setConnectionEnvVariable: jest.fn(),
        saveCloudConnection: jest.fn(),
        loadCloudConnections: jest.fn(),
        getCloudConnectionById: jest.fn(),
        deleteCloudConnection: jest.fn(),
        loadRecentItems: jest.fn(),
        addRecentItem: jest.fn(),
        clearRecentItems: jest.fn(),
        removeRecentItem: jest.fn(),
      },
    }));

    const registerConnectorsHandlers = (await import(
      '../../../../src/main/ipcHandlers/connectors.ipcHandlers'
    )).default;
    registerConnectorsHandlers();

    const handler = getHandleHandler(ipcMain, 'connector:validate');

    await expect(handler(null, {} as any)).resolves.toEqual({
      valid: false,
      error: 'Connection type is required',
    });
  });
});
