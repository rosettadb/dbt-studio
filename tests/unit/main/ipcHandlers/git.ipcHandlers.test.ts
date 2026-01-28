describe('git.ipcHandlers', () => {
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

  it('registers Git channels and removes previous handlers', async () => {
    const { ipcMain } = await import('electron');

    jest.doMock('../../../../src/main/services', () => ({
      GitService: jest.fn().mockImplementation(() => ({
        initRepo: jest.fn(),
        cloneRepo: jest.fn(),
        listBranches: jest.fn(),
        checkoutBranch: jest.fn(),
        addRemote: jest.fn(),
        isRepoInitialized: jest.fn(),
        getRemotes: jest.fn(),
        add: jest.fn(),
        unstage: jest.fn(),
        stageAll: jest.fn(),
        unstageAll: jest.fn(),
        discardChanges: jest.fn(),
        commit: jest.fn(),
        pull: jest.fn(),
        push: jest.fn(),
        getDiffForFile: jest.fn(),
        getFileStatusList: jest.fn(),
        getFileStatus: jest.fn(),
        getAheadBehindCount: jest.fn(),
        createBranch: jest.fn(),
        deleteBranch: jest.fn(),
        renameBranch: jest.fn(),
      })),
    }));

    const registerGitHandlers = (await import(
      '../../../../src/main/ipcHandlers/git.ipcHandlers'
    )).default;

    registerGitHandlers();

    expect(ipcMain.removeHandler).toHaveBeenCalledWith('git:init');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('git:push');

    expect(ipcMain.handle).toHaveBeenCalledWith('git:init', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('git:clone', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'git:fileStatusList',
      expect.any(Function),
    );
  });

  it('delegates git:init to gitService.initRepo', async () => {
    const { ipcMain } = await import('electron');

    const initRepo = jest.fn().mockResolvedValue({ ok: true });

    jest.doMock('../../../../src/main/services', () => ({
      GitService: jest.fn().mockImplementation(() => ({
        initRepo,
        cloneRepo: jest.fn(),
        listBranches: jest.fn(),
        checkoutBranch: jest.fn(),
        addRemote: jest.fn(),
        isRepoInitialized: jest.fn(),
        getRemotes: jest.fn(),
        add: jest.fn(),
        unstage: jest.fn(),
        stageAll: jest.fn(),
        unstageAll: jest.fn(),
        discardChanges: jest.fn(),
        commit: jest.fn(),
        pull: jest.fn(),
        push: jest.fn(),
        getDiffForFile: jest.fn(),
        getFileStatusList: jest.fn(),
        getFileStatus: jest.fn(),
        getAheadBehindCount: jest.fn(),
        createBranch: jest.fn(),
        deleteBranch: jest.fn(),
        renameBranch: jest.fn(),
      })),
    }));

    const registerGitHandlers = (await import(
      '../../../../src/main/ipcHandlers/git.ipcHandlers'
    )).default;

    registerGitHandlers();

    const handler = getHandleHandler(ipcMain, 'git:init');

    await expect(handler(null, '/tmp/repo')).resolves.toEqual({ ok: true });
    expect(initRepo).toHaveBeenCalledWith('/tmp/repo');
  });
});
