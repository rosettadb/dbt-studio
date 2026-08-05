describe('settings.ipcHandlers', () => {
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

  it('registers key settings channels and removes previous handlers', async () => {
    const { ipcMain } = await import('electron');
    const resetFactorySettings = jest.fn().mockResolvedValue(undefined);

    jest.doMock('../../../../src/main/utils/setupHelpers', () => ({
      initializeDataStorage: jest.fn(),
      DB_FILE: '/tmp/db.json',
    }));

    jest.doMock('../../../../src/main/services', () => ({
      SettingsService: {
        loadSettings: jest.fn(),
        loadSettingsWithDatabaseInfo: jest.fn(),
        saveSettings: jest.fn(),
        checkCliUpdates: jest.fn(),
        getDbtExePath: jest.fn(),
        usePathJoin: jest.fn(),
        checkRosettaVersions: jest.fn(),
        installRosettaVersion: jest.fn(),
        uninstallRosetta: jest.fn(),
        resetFactorySettings,
        getFileName: jest.fn(),
        getDuckDbMetadata: jest.fn(),
        refreshDuckDbMetadata: jest.fn(),
        reinitializeDuckDb: jest.fn(),
        diagnoseDuckDb: jest.fn(),
      },
    }));

    const registerSettingsHandlers = (await import(
      '../../../../src/main/ipcHandlers/settings.ipcHandlers'
    )).default;

    registerSettingsHandlers({} as any);

    expect(ipcMain.removeHandler).toHaveBeenCalledWith('settings:load');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('settings:save');
    expect(ipcMain.handle).toHaveBeenCalledWith('settings:load', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'settings:load-with-db-info',
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith('settings:save', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'settings:duckdb:metadata',
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith('settings:restart', expect.any(Function));

    const session = { clearStorageData: jest.fn() };
    const resetHandler = getHandleHandler(ipcMain, 'settings:reset-factory');
    await resetHandler({ sender: { session } });

    expect(resetFactorySettings).toHaveBeenCalledWith(session);
  });

  it('delegates settings:load to SettingsService.loadSettings', async () => {
    const { ipcMain } = await import('electron');

    const loadSettings = jest.fn().mockResolvedValue({ theme: 'dark' });

    jest.doMock('../../../../src/main/utils/setupHelpers', () => ({
      initializeDataStorage: jest.fn(),
      DB_FILE: '/tmp/db.json',
    }));

    jest.doMock('../../../../src/main/services', () => ({
      SettingsService: {
        loadSettings,
        loadSettingsWithDatabaseInfo: jest.fn(),
        saveSettings: jest.fn(),
        checkCliUpdates: jest.fn(),
        getDbtExePath: jest.fn(),
        usePathJoin: jest.fn(),
        checkRosettaVersions: jest.fn(),
        installRosettaVersion: jest.fn(),
        uninstallRosetta: jest.fn(),
        resetFactorySettings: jest.fn(),
        getFileName: jest.fn(),
        getDuckDbMetadata: jest.fn(),
        refreshDuckDbMetadata: jest.fn(),
        reinitializeDuckDb: jest.fn(),
        diagnoseDuckDb: jest.fn(),
      },
    }));

    const registerSettingsHandlers = (await import(
      '../../../../src/main/ipcHandlers/settings.ipcHandlers'
    )).default;

    registerSettingsHandlers({} as any);

    const handler = getHandleHandler(ipcMain, 'settings:load');

    await expect(handler(null)).resolves.toEqual({ theme: 'dark' });
    expect(loadSettings).toHaveBeenCalled();
  });

  it('settings:restart relaunches and exits the app', async () => {
    const { ipcMain, app } = await import('electron');

    jest.doMock('../../../../src/main/utils/setupHelpers', () => ({
      initializeDataStorage: jest.fn(),
      DB_FILE: '/tmp/db.json',
    }));

    jest.doMock('../../../../src/main/services', () => ({
      SettingsService: {
        loadSettings: jest.fn(),
        loadSettingsWithDatabaseInfo: jest.fn(),
        saveSettings: jest.fn(),
        checkCliUpdates: jest.fn(),
        getDbtExePath: jest.fn(),
        usePathJoin: jest.fn(),
        checkRosettaVersions: jest.fn(),
        installRosettaVersion: jest.fn(),
        uninstallRosetta: jest.fn(),
        resetFactorySettings: jest.fn(),
        getFileName: jest.fn(),
        getDuckDbMetadata: jest.fn(),
        refreshDuckDbMetadata: jest.fn(),
        reinitializeDuckDb: jest.fn(),
        diagnoseDuckDb: jest.fn(),
      },
    }));

    const registerSettingsHandlers = (await import(
      '../../../../src/main/ipcHandlers/settings.ipcHandlers'
    )).default;

    registerSettingsHandlers({} as any);

    const handler = getHandleHandler(ipcMain, 'settings:restart');
    await handler(null);

    expect(app.relaunch).toHaveBeenCalled();
    expect(app.exit).toHaveBeenCalledWith(0);
  });
});
