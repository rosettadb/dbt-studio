describe('projects.ipcHandlers', () => {
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

  it('registers key project channels', async () => {
    const { ipcMain } = await import('electron');

    jest.doMock('../../../../src/main/services', () => ({
      ProjectsService: {
        loadProjects: jest.fn(),
        getProject: jest.fn(),
        addProject: jest.fn(),
        selectProject: jest.fn(),
        addProjectFromVCS: jest.fn(),
        importProjectFromFolder: jest.fn(),
        updateProject: jest.fn(),
        deleteProject: jest.fn(),
        getProjectPath: jest.fn(),
        postRosettaDBTCopy: jest.fn(),
        extractSchema: jest.fn(),
        extractSchemaFromModelYaml: jest.fn(),
        updateQuery: jest.fn(),
        getQuery: jest.fn(),
        getDirectoryStructure: jest.fn(),
        readFileContent: jest.fn(),
        saveFileContent: jest.fn(),
        createFolder: jest.fn(),
        createFile: jest.fn(),
        copyPath: jest.fn(),
        deleteItem: jest.fn(),
        renamePath: jest.fn(),
        getSelectedProject: jest.fn(),
        zipDirectory: jest.fn(),
        chooseDir: jest.fn(),
        downloadSeed: jest.fn(),
        pushProjectToCloud: jest.fn(),
      },
    }));

    jest.doMock('../../../../src/main/services/ai/providerManager.service', () => ({
      AIProviderManager: {
        generateTypedCompletion: jest.fn(),
      },
    }));

    const registerProjectHandlers = (await import(
      '../../../../src/main/ipcHandlers/projects.ipcHandlers'
    )).default;

    registerProjectHandlers();

    expect(ipcMain.handle).toHaveBeenCalledWith('project:list', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('project:get', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('project:add', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'project:enhanceModelQuery',
      expect.any(Function),
    );
  });

  it('delegates project:list to ProjectsService.loadProjects', async () => {
    const { ipcMain } = await import('electron');

    const loadProjects = jest.fn().mockResolvedValue([{ id: '1' }]);

    jest.doMock('../../../../src/main/services', () => ({
      ProjectsService: {
        loadProjects,
        getProject: jest.fn(),
        addProject: jest.fn(),
        selectProject: jest.fn(),
        addProjectFromVCS: jest.fn(),
        importProjectFromFolder: jest.fn(),
        updateProject: jest.fn(),
        deleteProject: jest.fn(),
        getProjectPath: jest.fn(),
        postRosettaDBTCopy: jest.fn(),
        extractSchema: jest.fn(),
        extractSchemaFromModelYaml: jest.fn(),
        updateQuery: jest.fn(),
        getQuery: jest.fn(),
        getDirectoryStructure: jest.fn(),
        readFileContent: jest.fn(),
        saveFileContent: jest.fn(),
        createFolder: jest.fn(),
        createFile: jest.fn(),
        copyPath: jest.fn(),
        deleteItem: jest.fn(),
        renamePath: jest.fn(),
        getSelectedProject: jest.fn(),
        zipDirectory: jest.fn(),
        chooseDir: jest.fn(),
        downloadSeed: jest.fn(),
        pushProjectToCloud: jest.fn(),
      },
    }));

    jest.doMock('../../../../src/main/services/ai/providerManager.service', () => ({
      AIProviderManager: {
        generateTypedCompletion: jest.fn(),
      },
    }));

    const registerProjectHandlers = (await import(
      '../../../../src/main/ipcHandlers/projects.ipcHandlers'
    )).default;

    registerProjectHandlers();

    const handler = getHandleHandler(ipcMain, 'project:list');

    await expect(handler(null)).resolves.toEqual([{ id: '1' }]);
    expect(loadProjects).toHaveBeenCalled();
  });

  it('delegates project:enhanceModelQuery to AIProviderManager.generateTypedCompletion', async () => {
    const { ipcMain } = await import('electron');

    const generateTypedCompletion = jest
      .fn()
      .mockResolvedValue({ data: { fileName: 'x.sql', content: 'select 1' } });

    jest.doMock('../../../../src/main/services', () => ({
      ProjectsService: {
        loadProjects: jest.fn(),
        getProject: jest.fn(),
        addProject: jest.fn(),
        selectProject: jest.fn(),
        addProjectFromVCS: jest.fn(),
        importProjectFromFolder: jest.fn(),
        updateProject: jest.fn(),
        deleteProject: jest.fn(),
        getProjectPath: jest.fn(),
        postRosettaDBTCopy: jest.fn(),
        extractSchema: jest.fn(),
        extractSchemaFromModelYaml: jest.fn(),
        updateQuery: jest.fn(),
        getQuery: jest.fn(),
        getDirectoryStructure: jest.fn(),
        readFileContent: jest.fn(),
        saveFileContent: jest.fn(),
        createFolder: jest.fn(),
        createFile: jest.fn(),
        copyPath: jest.fn(),
        deleteItem: jest.fn(),
        renamePath: jest.fn(),
        getSelectedProject: jest.fn(),
        zipDirectory: jest.fn(),
        chooseDir: jest.fn(),
        downloadSeed: jest.fn(),
        pushProjectToCloud: jest.fn(),
      },
    }));

    jest.doMock('../../../../src/main/services/ai/providerManager.service', () => ({
      AIProviderManager: {
        generateTypedCompletion,
      },
    }));

    const registerProjectHandlers = (await import(
      '../../../../src/main/ipcHandlers/projects.ipcHandlers'
    )).default;

    registerProjectHandlers();

    const handler = getHandleHandler(ipcMain, 'project:enhanceModelQuery');

    await handler(null, 'prompt');
    expect(generateTypedCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'prompt',
        schemaConfig: expect.any(Object),
      }),
    );
  });
});
