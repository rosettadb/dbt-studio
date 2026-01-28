describe('cli.ipcHandlers', () => {
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

  const getOnHandler = (ipcMain: any, channel: string) => {
    const call = (ipcMain.on as jest.Mock).mock.calls.find(([c]) => c === channel);
    if (!call) {
      throw new Error(`No listener registered for channel: ${channel}`);
    }
    return call[1] as (...args: any[]) => any;
  };

  it('registers CLI handlers and removes previous handlers/listeners', async () => {
    const { ipcMain } = await import('electron');

    jest.doMock('../../../../src/main/adapters', () => ({
      CliAdapter: jest.fn().mockImplementation(() => ({
        runCommand: jest.fn(),
        getProcess: jest.fn(),
        sendInput: jest.fn(),
        stopCommand: jest.fn(),
      })),
    }));

    const registerCliHandlers = (await import(
      '../../../../src/main/ipcHandlers/cli.ipcHandlers'
    )).default;

    registerCliHandlers({} as any);

    expect(ipcMain.removeHandler).toHaveBeenCalledWith('cli:run');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('cli:status');
    expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('cli:output');
    expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('cli:done');

    expect(ipcMain.handle).toHaveBeenCalledWith('cli:run', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('cli:status', expect.any(Function));
    expect(ipcMain.on).toHaveBeenCalledWith('cli:input', expect.any(Function));
    expect(ipcMain.on).toHaveBeenCalledWith('cli:stop', expect.any(Function));
  });

  it('delegates cli:status to cliAdapter.getProcess', async () => {
    const { ipcMain } = await import('electron');

    const getProcess = jest.fn().mockReturnValue({ pid: 123 });

    jest.doMock('../../../../src/main/adapters', () => ({
      CliAdapter: jest.fn().mockImplementation(() => ({
        runCommand: jest.fn(),
        getProcess,
        sendInput: jest.fn(),
        stopCommand: jest.fn(),
      })),
    }));

    const registerCliHandlers = (await import(
      '../../../../src/main/ipcHandlers/cli.ipcHandlers'
    )).default;

    registerCliHandlers({} as any);

    const handler = getHandleHandler(ipcMain, 'cli:status');

    expect(handler(null)).toBe(true);
    expect(getProcess).toHaveBeenCalled();
  });

  it('cli:input forwards input to cliAdapter.sendInput', async () => {
    const { ipcMain } = await import('electron');

    const sendInput = jest.fn();

    jest.doMock('../../../../src/main/adapters', () => ({
      CliAdapter: jest.fn().mockImplementation(() => ({
        runCommand: jest.fn(),
        getProcess: jest.fn(),
        sendInput,
        stopCommand: jest.fn(),
      })),
    }));

    const registerCliHandlers = (await import(
      '../../../../src/main/ipcHandlers/cli.ipcHandlers'
    )).default;

    registerCliHandlers({} as any);

    const onHandler = getOnHandler(ipcMain, 'cli:input');
    onHandler(null, 'hello');

    expect(sendInput).toHaveBeenCalledWith('hello');
  });
});
