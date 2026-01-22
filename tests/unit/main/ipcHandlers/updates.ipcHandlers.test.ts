describe('updates.ipcHandlers', () => {
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

  it('registers updates channels', async () => {
    const { ipcMain } = await import('electron');

    jest.doMock('electron-updater', () => ({
      autoUpdater: {
        quitAndInstall: jest.fn(),
      },
    }));

    jest.doMock('../../../../src/main/services/update.service', () => ({
      __esModule: true,
      default: {
        checkForUpdates: jest.fn(),
        checkForSettingsUpdates: jest.fn(),
        downloadAndInstall: jest.fn(),
        rejectVersion: jest.fn(),
      },
    }));

    const registerUpdateHandlers = (await import(
      '../../../../src/main/ipcHandlers/updates.ipcHandlers'
    )).default;

    registerUpdateHandlers();

    expect(ipcMain.handle).toHaveBeenCalledWith('updates:check', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'updates:check-settings',
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'updates:reject-version',
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'updates:restart',
      expect.any(Function),
    );
  });

  it('delegates updates:reject-version to UpdateManager.rejectVersion', async () => {
    const { ipcMain } = await import('electron');

    const rejectVersion = jest.fn().mockResolvedValue(true);

    jest.doMock('electron-updater', () => ({
      autoUpdater: {
        quitAndInstall: jest.fn(),
      },
    }));

    jest.doMock('../../../../src/main/services/update.service', () => ({
      __esModule: true,
      default: {
        checkForUpdates: jest.fn(),
        checkForSettingsUpdates: jest.fn(),
        downloadAndInstall: jest.fn(),
        rejectVersion,
      },
    }));

    const registerUpdateHandlers = (await import(
      '../../../../src/main/ipcHandlers/updates.ipcHandlers'
    )).default;

    registerUpdateHandlers();

    const handler = getHandleHandler(ipcMain, 'updates:reject-version');

    await expect(handler(null, '1.2.3')).resolves.toEqual(true);
    expect(rejectVersion).toHaveBeenCalledWith('1.2.3');
  });
});
