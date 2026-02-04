describe('ai.ipcHandlers', () => {
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

  it('registers key AI/chat channels and removes previous handlers', async () => {
    const { ipcMain } = await import('electron');

    jest.doMock('../../../../src/main/services/mainDatabase.service', () => ({
      __esModule: true,
      default: {
        getProviders: jest.fn(),
        getActiveProvider: jest.fn(),
        setActiveProvider: jest.fn(),
        deactivateAllProviders: jest.fn(),
      },
    }));

    jest.doMock('../../../../src/main/services/chat.service', () => ({
      __esModule: true,
      default: {
        cancelAssistantStream: jest.fn(),
        streamAssistantReply: jest.fn(),
      },
    }));

    jest.doMock('../../../../src/main/services/secureStorage.service', () => ({
      __esModule: true,
      default: {
        getAIProviderCredential: jest.fn(),
      },
    }));

    jest.doMock('../../../../src/main/services/ai/providerManager.service', () => ({
      __esModule: true,
      default: {
        createProvider: jest.fn(),
        updateProvider: jest.fn(),
        deleteProvider: jest.fn(),
        testProvider: jest.fn(),
        testTemporaryProvider: jest.fn(),
        getProviderModels: jest.fn(),
        getAllAvailableModels: jest.fn(),
        generateTypedCompletion: jest.fn(),
        initializeAllProviders: jest.fn(),
        getProviderStatus: jest.fn(),
        getActiveProviderInfo: jest.fn(),
      },
    }));

    const registerAIHandlers = (await import(
      '../../../../src/main/ipcHandlers/ai.ipcHandlers'
    )).default;

    registerAIHandlers();

    expect(ipcMain.removeHandler).toHaveBeenCalledWith('ai:provider:list');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('chat:conversation:list');

    expect(ipcMain.handle).toHaveBeenCalledWith('ai:provider:list', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('ai:provider:get-active', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('chat:conversation:list', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('chat:message:stream', expect.any(Function));
  });

  it('delegates ai:provider:list to MainDatabaseService.getProviders', async () => {
    const { ipcMain } = await import('electron');

    const getProviders = jest.fn().mockResolvedValue([{ id: 1 }]);

    jest.doMock('../../../../src/main/services/mainDatabase.service', () => ({
      __esModule: true,
      default: {
        getProviders,
        getActiveProvider: jest.fn(),
        setActiveProvider: jest.fn(),
        deactivateAllProviders: jest.fn(),
      },
    }));

    jest.doMock('../../../../src/main/services/chat.service', () => ({
      __esModule: true,
      default: {
        cancelAssistantStream: jest.fn(),
        streamAssistantReply: jest.fn(),
      },
    }));

    jest.doMock('../../../../src/main/services/secureStorage.service', () => ({
      __esModule: true,
      default: {
        getAIProviderCredential: jest.fn(),
      },
    }));

    jest.doMock('../../../../src/main/services/ai/providerManager.service', () => ({
      __esModule: true,
      default: {
        createProvider: jest.fn(),
        updateProvider: jest.fn(),
        deleteProvider: jest.fn(),
        testProvider: jest.fn(),
        testTemporaryProvider: jest.fn(),
        getProviderModels: jest.fn(),
        getAllAvailableModels: jest.fn(),
        generateTypedCompletion: jest.fn(),
        initializeAllProviders: jest.fn(),
        getProviderStatus: jest.fn(),
        getActiveProviderInfo: jest.fn(),
      },
    }));

    const registerAIHandlers = (await import(
      '../../../../src/main/ipcHandlers/ai.ipcHandlers'
    )).default;

    registerAIHandlers();

    const handler = getHandleHandler(ipcMain, 'ai:provider:list');

    await expect(handler(null)).resolves.toEqual([{ id: 1 }]);
    expect(getProviders).toHaveBeenCalled();
  });
});
