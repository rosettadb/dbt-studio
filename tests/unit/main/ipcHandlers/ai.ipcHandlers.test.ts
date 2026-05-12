describe('ai.ipcHandlers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const setupMocksAndRegister = async (
    overrides: { getProviders?: jest.Mock } = {},
  ) => {
    // After resetModules, re-require electron to get the fresh mock instance
    const { ipcMain } = await import('electron');

    jest.doMock('../../../../src/main/services/mainDatabase.service', () => ({
      __esModule: true,
      default: {
        getProviders: overrides.getProviders ?? jest.fn().mockResolvedValue([]),
        getActiveProvider: jest.fn().mockResolvedValue(null),
        setActiveProvider: jest.fn().mockResolvedValue(undefined),
        deactivateAllProviders: jest.fn().mockResolvedValue(undefined),
        getConversations: jest.fn().mockResolvedValue([]),
        getMessages: jest.fn().mockResolvedValue([]),
        addMessageWithContext: jest.fn().mockResolvedValue({}),
        deleteConversation: jest.fn().mockResolvedValue(undefined),
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
      default: { getAIProviderCredential: jest.fn().mockResolvedValue(null) },
    }));

    jest.doMock(
      '../../../../src/main/services/ai/providerManager.service',
      () => ({
        __esModule: true,
        AIProviderManager: {
          createProvider: jest.fn(),
          updateProvider: jest.fn(),
          deleteProvider: jest.fn(),
          testProvider: jest.fn(),
          testTemporaryProvider: jest.fn(),
          getProviderModels: jest.fn().mockResolvedValue([]),
          getAllAvailableModels: jest.fn().mockResolvedValue(new Map()),
          generateTypedCompletion: jest.fn(),
        },
      }),
    );

    const registerAIHandlers = (
      await import('../../../../src/main/ipcHandlers/ai.ipcHandlers')
    ).default;

    registerAIHandlers();

    return ipcMain;
  };

  it('registers key AI/chat channels', async () => {
    const ipcMain = await setupMocksAndRegister();

    expect(ipcMain.removeHandler).toHaveBeenCalledWith('ai:provider:list');
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'ai:provider:list',
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'ai:provider:get-active',
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'chat:conversation:list',
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'chat:message:stream',
      expect.any(Function),
    );
  });

  it('delegates ai:provider:list to MainDatabaseService.getProviders', async () => {
    const getProviders = jest.fn().mockResolvedValue([{ id: 1 }]);
    const ipcMain = await setupMocksAndRegister({ getProviders });

    const call = (ipcMain.handle as jest.Mock).mock.calls.find(
      ([c]) => c === 'ai:provider:list',
    );
    expect(call).toBeDefined();
    const handler = call![1];

    await expect(handler(null)).resolves.toEqual([{ id: 1 }]);
    expect(getProviders).toHaveBeenCalled();
  });
});
