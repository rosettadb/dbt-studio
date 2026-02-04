describe('secureStorage.ipcHandlers', () => {
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

  it('registers secure storage channels', async () => {
    const { ipcMain } = await import('electron');

    jest.doMock('../../../../src/main/services/secureStorage.service', () => ({
      __esModule: true,
      default: {
        setCredential: jest.fn(),
        getCredential: jest.fn(),
        deleteCredential: jest.fn(),
      },
    }));

    const registerSecureStorageHandlers = (await import(
      '../../../../src/main/ipcHandlers/secureStorage.ipcHandlers'
    )).default;

    registerSecureStorageHandlers();

    expect(ipcMain.handle).toHaveBeenCalledWith(
      'secure-storage:set',
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'secure-storage:get',
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'secure-storage:delete',
      expect.any(Function),
    );
  });

  it('delegates secure-storage:get to SecureStorageService.getCredential', async () => {
    const { ipcMain } = await import('electron');

    const getCredential = jest.fn().mockResolvedValue('secret');

    jest.doMock('../../../../src/main/services/secureStorage.service', () => ({
      __esModule: true,
      default: {
        setCredential: jest.fn(),
        getCredential,
        deleteCredential: jest.fn(),
      },
    }));

    const registerSecureStorageHandlers = (await import(
      '../../../../src/main/ipcHandlers/secureStorage.ipcHandlers'
    )).default;

    registerSecureStorageHandlers();

    const handler = getHandleHandler(ipcMain, 'secure-storage:get');

    await expect(handler(null, { account: 'a' })).resolves.toEqual('secret');
    expect(getCredential).toHaveBeenCalledWith('a');
  });
});
