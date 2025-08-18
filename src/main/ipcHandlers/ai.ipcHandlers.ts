import { ipcMain } from 'electron';
import MainDatabaseService from '../services/mainDatabase.service';
import SecureStorageService from '../services/secureStorage.service';
import {
  AIProvider,
  NewAIProvider,
  ChatConversation,
  NewChatConversation,
  ChatMessage,
  NewChatMessage,
  PromptTemplate,
  NewPromptTemplate,
  NewAIUsageLog,
} from '../schemas/mainDatabase.schema';
import ProviderManager from '../services/ai/providerManager.service';

const registerAIHandlers = () => {
  ipcMain.handle('ai:provider:list', async (): Promise<AIProvider[]> => {
    return MainDatabaseService.getProviders();
  });

  ipcMain.handle(
    'ai:provider:get',
    async (_, id: number): Promise<AIProvider | null> => {
      return MainDatabaseService.getProvider(id);
    },
  );

  ipcMain.handle(
    'ai:provider:save',
    async (_, provider: NewAIProvider): Promise<AIProvider> => {
      return ProviderManager.createProvider(provider);
    },
  );

  ipcMain.handle(
    'ai:provider:update',
    async (
      _,
      { id, updates }: { id: number; updates: Partial<NewAIProvider> },
    ): Promise<void> => {
      await ProviderManager.updateProvider(id, updates);
    },
  );

  ipcMain.handle('ai:provider:delete', async (_, id: number): Promise<void> => {
    await ProviderManager.deleteProvider(id);
  });

  ipcMain.handle(
    'ai:provider:get-credential',
    async (
      _,
      {
        providerId,
        providerType,
      }: { providerId: number; providerType: string },
    ): Promise<string | null> => {
      return SecureStorageService.getAIProviderCredential(
        providerId,
        providerType as any,
      );
    },
  );

  ipcMain.handle(
    'ai:provider:get-active',
    async (): Promise<AIProvider | null> => {
      return MainDatabaseService.getActiveProvider();
    },
  );

  ipcMain.handle(
    'ai:provider:set-active',
    async (_, id: number): Promise<void> => {
      await MainDatabaseService.setActiveProvider(id);
    },
  );

  ipcMain.handle('ai:provider:deactivate-all', async (): Promise<void> => {
    await MainDatabaseService.deactivateAllProviders();
  });

  // Chat Conversation Handlers
  ipcMain.handle(
    'chat:conversation:list',
    async (_, projectId?: number): Promise<ChatConversation[]> => {
      return MainDatabaseService.getConversations(projectId);
    },
  );

  ipcMain.handle('chat:conversation:get', async (_, id: number) => {
    return MainDatabaseService.getConversation(id);
  });

  ipcMain.handle(
    'chat:conversation:create',
    async (
      _,
      title: string,
      projectId?: number,
      providerId?: number,
    ): Promise<ChatConversation> => {
      return MainDatabaseService.createConversation(
        title,
        projectId,
        providerId,
      );
    },
  );

  ipcMain.handle(
    'chat:conversation:update',
    async (
      _,
      id: number,
      updates: Partial<NewChatConversation>,
    ): Promise<void> => {
      await MainDatabaseService.updateConversation(id, updates);
    },
  );

  ipcMain.handle(
    'chat:conversation:delete',
    async (_, id: number): Promise<void> => {
      await MainDatabaseService.deleteConversation(id);
    },
  );

  // Chat Message Handlers
  ipcMain.handle(
    'chat:message:list',
    async (
      _,
      conversationId: number,
      limit?: number,
      offset?: number,
    ): Promise<ChatMessage[]> => {
      return MainDatabaseService.getMessages(conversationId, limit, offset);
    },
  );

  ipcMain.handle(
    'chat:message:send',
    async (
      _,
      conversationId: number,
      message: NewChatMessage,
    ): Promise<ChatMessage> => {
      return MainDatabaseService.addMessage(conversationId, message);
    },
  );

  ipcMain.handle(
    'chat:message:update',
    async (_, id: number, content: string): Promise<void> => {
      await MainDatabaseService.updateMessage(id, content);
    },
  );

  ipcMain.handle(
    'chat:message:delete',
    async (_, id: number): Promise<void> => {
      await MainDatabaseService.deleteMessage(id);
    },
  );

  // Template Management Handlers
  ipcMain.handle(
    'ai:template:list',
    async (
      _,
      category?: string,
      providerType?: string,
    ): Promise<PromptTemplate[]> => {
      return MainDatabaseService.getPromptTemplates(category, providerType);
    },
  );

  ipcMain.handle(
    'ai:template:save',
    async (_, template: NewPromptTemplate): Promise<PromptTemplate> => {
      return MainDatabaseService.savePromptTemplate(template);
    },
  );

  ipcMain.handle(
    'ai:template:update',
    async (
      _,
      id: number,
      updates: Partial<NewPromptTemplate>,
    ): Promise<void> => {
      await MainDatabaseService.updatePromptTemplate(id, updates);
    },
  );

  ipcMain.handle('ai:template:delete', async (_, id: number): Promise<void> => {
    await MainDatabaseService.deletePromptTemplate(id);
  });

  // Analytics and Usage Handlers
  ipcMain.handle(
    'ai:usage:log',
    async (_, usage: NewAIUsageLog): Promise<void> => {
      await MainDatabaseService.logUsage(usage);
    },
  );

  ipcMain.handle(
    'ai:usage:stats',
    async (_, timeframe: 'day' | 'week' | 'month', providerId?: number) => {
      return MainDatabaseService.getUsageStats(timeframe, providerId);
    },
  );

  // Provider testing handler (for connection validation)
  ipcMain.handle(
    'ai:provider:test',
    async (_, id: number): Promise<{ success: boolean; error?: string }> => {
      return ProviderManager.testProvider(id.toString());
    },
  );

  // Database Information
  ipcMain.handle('ai:get-database-info', async () => {
    return MainDatabaseService.getDatabaseInfo();
  });

  // Enhanced Provider Management Handlers (Phase 2)

  // Test specific provider
  ipcMain.handle(
    'ai:provider:test-connection',
    async (_, providerId: string): Promise<any> => {
      return ProviderManager.testProvider(providerId);
    },
  );

  // Test temporary provider configuration (before saving)
  ipcMain.handle(
    'ai:provider:test-temp-connection',
    async (
      _,
      {
        config,
        credentials,
      }: { config: any; credentials: Record<string, any> },
    ): Promise<any> => {
      return ProviderManager.testTemporaryProvider(config, credentials);
    },
  );

  // Get provider models
  ipcMain.handle(
    'ai:provider:get-models',
    async (_, providerId: string): Promise<any[]> => {
      return ProviderManager.getProviderModels(providerId);
    },
  );

  // Get all available models
  ipcMain.handle(
    'ai:provider:get-all-models',
    async (): Promise<Map<string, any[]>> => {
      return ProviderManager.getAllAvailableModels();
    },
  );

  // Generate completion using provider manager
  ipcMain.handle(
    'ai:completion:generate',
    async (_, request: any): Promise<any> => {
      return ProviderManager.generateCompletion(request);
    },
  );

  // Initialize provider manager on first use
  ipcMain.handle('ai:provider-manager:initialize', async (): Promise<void> => {
    await ProviderManager.initializeAllProviders();
  });

  // Get provider status
  ipcMain.handle(
    'ai:provider:get-status',
    async (
      _,
      providerId: string,
    ): Promise<import('../services/ai/types/provider.types').HealthStatus> => {
      return ProviderManager.getProviderStatus(providerId);
    },
  );

  // Get active provider info
  ipcMain.handle('ai:provider:get-active', async (): Promise<any> => {
    const activeProvider = ProviderManager.getActiveProvider();
    if (!activeProvider) {
      return null;
    }

    return {
      name: activeProvider.name,
      type: activeProvider.type,
      capabilities: activeProvider.capabilities,
      supportedModels: activeProvider.supportedModels,
    };
  });
};

export default registerAIHandlers;
