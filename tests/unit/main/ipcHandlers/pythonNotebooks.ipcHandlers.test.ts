describe('pythonNotebooks.ipcHandlers', () => {
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
    const notebooks = {
      listNotebooks: jest.fn(async () => []),
      getNotebook: jest.fn(async () => null),
      createNotebook: jest.fn(async (_c: string, input: any) => ({
        id: 'nb1',
        name: input.name,
      })),
      updateNotebook: jest.fn(async () => ({ id: 'nb1' })),
      renameNotebook: jest.fn(async () => ({ id: 'nb1' })),
      duplicateNotebook: jest.fn(async () => ({ id: 'nb2' })),
      deleteNotebook: jest.fn(async () => undefined),
      exportNotebook: jest.fn(async () => '/tmp/x.ipynb'),
      selectImportFile: jest.fn(async () => '/tmp/in.ipynb'),
      importNotebook: jest.fn(async () => ({ id: 'nb3' })),
      executeCell: jest.fn(async () => ({
        cellId: 'c1',
        status: 'ok',
        execution_count: 1,
        outputs: [],
      })),
      recreateEnv: jest.fn(async () => ({ pythonVersion: '3.10.17' })),
    };
    const env = {
      getStatus: jest.fn(async () => ({ status: 'ready' })),
      listPackages: jest.fn(async () => []),
      installPackages: jest.fn(async () => 'ok'),
      uninstallPackage: jest.fn(async () => 'ok'),
    };
    const kernel = {
      start: jest.fn(async () => ({ status: 'idle' })),
      interrupt: jest.fn(async () => ({ status: 'busy' })),
      restart: jest.fn(async () => ({ status: 'idle' })),
      shutdown: jest.fn(async () => ({ status: 'stopped' })),
      getStatus: jest.fn(() => ({ status: 'stopped' })),
      shutdownAll: jest.fn(async () => undefined),
    };
    const runtimes = {
      listRuntimes: jest.fn(async () => []),
      installRuntime: jest.fn(async (version: string) => ({ version })),
    };

    jest.doMock(
      '../../../../src/main/services/pythonNotebooks.service',
      () => ({
        __esModule: true,
        default: notebooks,
      }),
    );
    jest.doMock('../../../../src/main/services/notebookEnv.service', () => ({
      __esModule: true,
      default: env,
    }));
    jest.doMock('../../../../src/main/services/notebookKernel.service', () => ({
      __esModule: true,
      default: kernel,
    }));
    jest.doMock('../../../../src/main/services/pythonRuntimes.service', () => ({
      __esModule: true,
      default: runtimes,
    }));

    const electron = await import('electron');
    const { registerPythonNotebooksHandlers } = await import(
      '../../../../src/main/ipcHandlers/pythonNotebooks.ipcHandlers'
    );
    registerPythonNotebooksHandlers();

    return { electron, notebooks, env, kernel, runtimes };
  };

  it('registers every channel from the PythonNotebookChannels union', async () => {
    const { electron } = await setup();
    const registered = (electron.ipcMain.handle as jest.Mock).mock.calls.map(
      ([channel]) => channel,
    );
    expect(registered).toEqual(
      expect.arrayContaining([
        'pythonRuntimes:list',
        'pythonRuntimes:install',
        'pythonNotebooks:list',
        'pythonNotebooks:get',
        'pythonNotebooks:create',
        'pythonNotebooks:update',
        'pythonNotebooks:rename',
        'pythonNotebooks:duplicate',
        'pythonNotebooks:delete',
        'pythonNotebooks:export',
        'pythonNotebooks:selectImportFile',
        'pythonNotebooks:import',
        'pythonNotebooks:env:status',
        'pythonNotebooks:env:recreate',
        'pythonNotebooks:env:packages:list',
        'pythonNotebooks:env:packages:install',
        'pythonNotebooks:env:packages:uninstall',
        'pythonNotebooks:kernel:start',
        'pythonNotebooks:kernel:execute',
        'pythonNotebooks:kernel:interrupt',
        'pythonNotebooks:kernel:restart',
        'pythonNotebooks:kernel:shutdown',
        'pythonNotebooks:kernel:status',
      ]),
    );
  });

  it('delegates notebook CRUD to PythonNotebooksService', async () => {
    const { electron, notebooks } = await setup();

    await getHandler(electron.ipcMain, 'pythonNotebooks:create')({}, 'conn-1', {
      name: 'My NB',
      pythonVersion: '3.10.17',
    });
    expect(notebooks.createNotebook).toHaveBeenCalledWith('conn-1', {
      name: 'My NB',
      pythonVersion: '3.10.17',
    });

    await getHandler(electron.ipcMain, 'pythonNotebooks:update')(
      {},
      'conn-1',
      'nb1',
      { cells: [] },
    );
    expect(notebooks.updateNotebook).toHaveBeenCalledWith('conn-1', 'nb1', {
      cells: [],
    });

    await getHandler(electron.ipcMain, 'pythonNotebooks:delete')(
      {},
      'conn-1',
      'nb1',
    );
    expect(notebooks.deleteNotebook).toHaveBeenCalledWith('conn-1', 'nb1');

    await getHandler(electron.ipcMain, 'pythonNotebooks:import')(
      {},
      'conn-1',
      '/tmp/in.ipynb',
      '3.12.10',
    );
    expect(notebooks.importNotebook).toHaveBeenCalledWith(
      'conn-1',
      '/tmp/in.ipynb',
      '3.12.10',
    );
  });

  it('routes cell execution through the notebook service so outputs persist', async () => {
    const { electron, notebooks, kernel } = await setup();
    const result = await getHandler(
      electron.ipcMain,
      'pythonNotebooks:kernel:execute',
    )({}, 'conn-1', 'nb1', 'c1', 'print(1)');
    expect(notebooks.executeCell).toHaveBeenCalledWith(
      'conn-1',
      'nb1',
      'c1',
      'print(1)',
    );
    expect(result.status).toBe('ok');
    expect(kernel.start).not.toHaveBeenCalled();
  });

  it('delegates kernel lifecycle and environment calls', async () => {
    const { electron, env, kernel, runtimes } = await setup();

    await getHandler(electron.ipcMain, 'pythonNotebooks:kernel:restart')(
      {},
      'nb1',
    );
    expect(kernel.restart).toHaveBeenCalledWith('nb1');

    await getHandler(electron.ipcMain, 'pythonNotebooks:kernel:interrupt')(
      {},
      'nb1',
    );
    expect(kernel.interrupt).toHaveBeenCalledWith('nb1');

    await getHandler(electron.ipcMain, 'pythonNotebooks:env:packages:install')(
      {},
      'nb1',
      ['pandas'],
    );
    expect(env.installPackages).toHaveBeenCalledWith('nb1', ['pandas']);

    await getHandler(electron.ipcMain, 'pythonRuntimes:install')({}, '3.11.12');
    expect(runtimes.installRuntime).toHaveBeenCalledWith('3.11.12');
  });

  it('shuts down all kernels on app quit', async () => {
    const { electron, kernel } = await setup();
    const quitRegistration = (electron.app.on as jest.Mock).mock.calls.find(
      ([event]) => event === 'before-quit',
    );
    expect(quitRegistration).toBeDefined();
    quitRegistration[1]();
    expect(kernel.shutdownAll).toHaveBeenCalled();
  });
});
