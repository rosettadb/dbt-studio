describe('process.ipcHandlers', () => {
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

  it('registers process handlers and removes previous handlers/listeners', async () => {
    const { ipcMain, app } = await import('electron');

    jest.doMock('../../../../src/main/adapters', () => ({
      ProcessAdapter: jest.fn().mockImplementation(() => ({
        start: jest.fn(),
        stop: jest.fn().mockResolvedValue({ message: 'stopped' }),
        getStatus: jest.fn(),
        isRunning: jest.fn().mockReturnValue(false),
      })),
    }));

    const registerProcessHandlers = (await import(
      '../../../../src/main/ipcHandlers/process.ipcHandlers'
    )).default;

    registerProcessHandlers({} as any);

    expect(ipcMain.removeHandler).toHaveBeenCalledWith('process:start');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('process:stop');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('process:status');
    expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('process:output');

    expect(ipcMain.handle).toHaveBeenCalledWith('process:start', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('process:stop', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('process:status', expect.any(Function));

    expect(app.on).toHaveBeenCalledWith('before-quit', expect.any(Function));
    expect(app.on).toHaveBeenCalledWith('window-all-closed', expect.any(Function));
  });

  it('delegates process:status to processAdapter.getStatus', async () => {
    const { ipcMain } = await import('electron');

    const getStatus = jest.fn().mockReturnValue({ running: true });

    jest.doMock('../../../../src/main/adapters', () => ({
      ProcessAdapter: jest.fn().mockImplementation(() => ({
        start: jest.fn(),
        stop: jest.fn().mockResolvedValue({ message: 'stopped' }),
        getStatus,
        isRunning: jest.fn().mockReturnValue(false),
      })),
    }));

    const registerProcessHandlers = (await import(
      '../../../../src/main/ipcHandlers/process.ipcHandlers'
    )).default;

    registerProcessHandlers({} as any);

    const handler = getHandleHandler(ipcMain, 'process:status');

    const result = await Promise.resolve(handler(null));
    expect(result).toEqual({ running: true });
    expect(getStatus).toHaveBeenCalled();
  });
});
