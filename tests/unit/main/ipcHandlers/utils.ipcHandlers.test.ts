describe('utils.ipcHandlers', () => {
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

  it('registers utils channels and removes previous handlers', async () => {
    const { ipcMain } = await import('electron');

    jest.doMock('../../../../src/main/services', () => ({
      UtilsService: {
        getFilesWithContent: jest.fn(),
      },
    }));

    const registerUtilsHandlers = (await import(
      '../../../../src/main/ipcHandlers/utils.ipcHandlers'
    )).default;

    registerUtilsHandlers();

    expect(ipcMain.removeHandler).toHaveBeenCalledWith('open:external');

    expect(ipcMain.handle).toHaveBeenCalledWith('open:external', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'utils:getFileContentList',
      expect.any(Function),
    );
  });

  it('open:external delegates to shell.openExternal for string urls', async () => {
    const { ipcMain, shell } = await import('electron');

    jest.doMock('../../../../src/main/services', () => ({
      UtilsService: {
        getFilesWithContent: jest.fn(),
      },
    }));

    const registerUtilsHandlers = (await import(
      '../../../../src/main/ipcHandlers/utils.ipcHandlers'
    )).default;

    registerUtilsHandlers();

    const handler = getHandleHandler(ipcMain, 'open:external');

    await expect(handler(null, 'https://example.com')).resolves.toBe(true);
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('delegates utils:getFileContentList to UtilsService.getFilesWithContent', async () => {
    const { ipcMain } = await import('electron');

    const getFilesWithContent = jest.fn().mockResolvedValue([{ path: 'a', content: 'x' }]);

    jest.doMock('../../../../src/main/services', () => ({
      UtilsService: {
        getFilesWithContent,
      },
    }));

    const registerUtilsHandlers = (await import(
      '../../../../src/main/ipcHandlers/utils.ipcHandlers'
    )).default;

    registerUtilsHandlers();

    const handler = getHandleHandler(ipcMain, 'utils:getFileContentList');

    await expect(handler(null, ['a'])).resolves.toEqual([{ path: 'a', content: 'x' }]);
    expect(getFilesWithContent).toHaveBeenCalledWith(['a']);
  });
});
