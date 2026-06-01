import { ipcMain } from 'electron';
import MainDatabaseService from '../services/mainDatabase.service';
import SecureStorageService from '../services/secureStorage.service';
import ProjectsService from '../services/projects.service';
import ConnectorsService from '../services/connectors.service';
import AgentService, {
  loadAISettings,
  saveAISettings,
  getAISettingsFilePath,
} from '../services/agent.service';
import {
  AIProvider,
  ChatConversation,
  ChatMessage,
  NewAIProvider,
  NewAIUsageLog,
  NewChatConversation,
  NewPromptTemplate,
  PromptTemplate,
} from '../schemas/mainDatabase.schema';
import ProviderManager from '../services/ai/providerManager.service';
import {
  CompletionResponse,
  TypedCompletionRequest,
} from '../services/ai/types/completion.types';

// Remove previously registered handlers to avoid duplicates during hot reloads
const aiHandlerChannels: string[] = [
  'ai:provider:list',
  'ai:provider:get',
  'ai:provider:save',
  'ai:provider:update',
  'ai:provider:delete',
  'ai:provider:get-credential',
  'ai:provider:get-active',
  'ai:provider:set-active',
  'ai:provider:deactivate-all',
  'chat:conversation:list',
  'chat:conversation:get',
  'chat:conversation:create',
  'chat:conversation:update',
  'chat:conversation:delete',
  'chat:conversation:get-latest-compaction-summary',
  'chat:message:list',
  'chat:message:send',
  'chat:message:update',
  'chat:message:delete',
  'ai:template:list',
  'ai:template:save',
  'ai:template:update',
  'ai:template:delete',
  'ai:usage:log',
  'ai:usage:stats',
  'ai:provider:test',
  'ai:get-database-info',
  'ai:provider:test-connection',
  'ai:provider:test-temp-connection',
  'ai:provider:get-models',
  'ai:provider:get-all-models',
  'ai:completion:generate',
  // Enhanced chat/context
  'chat:conversation:get-with-context',
  'chat:message:get-with-context',
  'chat:message:regenerate',
  'agent:run',
  'agent:cancel',
  'agent:tools:list',
  'agent:terminal-resolve',
  'chat:context:add-items',
  'chat:context:get-items',
  'chat:context:resolve-file',
  'chat:context:resolve-selected-file',
  'chat:context:get-file-metadata',
  'chat:context:resolve-folder',
  'chat:context:search-codebase',
  'chat:context:resolve-url',
  'chat:tool:add-calls',
  'chat:tool:get-calls',
  'chat:tool:update-call',
  'chat:tool:execute',
  'chat:tool:cancel',
  'chat:session:set-metadata',
  'chat:session:get-metadata',
  'chat:session:delete-metadata',
  'chat:conversation:cleanup-orphaned',
];

const removeAIHandlers = () => {
  aiHandlerChannels.forEach((ch) => ipcMain.removeHandler(ch));
};

let aiHandlersRegistered = false;

const registerAIHandlers = () => {
  if (aiHandlersRegistered) {
    return;
  }
  removeAIHandlers();
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
    async (
      _,
      filter?: {
        projectId?: number;
        screenKey?: any;
        connectionId?: string | null;
      },
    ): Promise<ChatConversation[]> => {
      return MainDatabaseService.getConversations(filter ?? {});
    },
  );

  ipcMain.handle('chat:conversation:get', async (_, id: number) => {
    return MainDatabaseService.getConversation(id);
  });

  ipcMain.handle(
    'chat:conversation:create',
    async (
      _,
      {
        title,
        projectId,
        providerId,
        screenKey,
        connectionId,
      }: {
        title: string;
        projectId?: number;
        providerId?: number;
        screenKey?: any;
        connectionId?: string;
      },
    ): Promise<ChatConversation> => {
      return MainDatabaseService.createConversation(
        title,
        projectId,
        providerId,
        screenKey,
        connectionId,
      );
    },
  );

  ipcMain.handle(
    'chat:conversation:update',
    async (
      _,
      {
        id,
        updates,
      }: {
        id: number;
        updates: Partial<NewChatConversation>;
      },
    ): Promise<void> => {
      await MainDatabaseService.updateConversation(id, updates);
    },
  );

  ipcMain.handle(
    'chat:conversation:delete',
    async (_event, id: number): Promise<void> => {
      return MainDatabaseService.deleteConversation(id);
    },
  );

  ipcMain.handle(
    'chat:conversation:get-latest-compaction-summary',
    async (_event, id: number) => {
      return MainDatabaseService.getLatestCompactionSummary(id);
    },
  );

  ipcMain.handle(
    'chat:conversation:cleanup-orphaned',
    async (): Promise<{ deletedCount: number }> => {
      try {
        const projects = await ProjectsService.loadProjects();
        const connections = await ConnectorsService.loadConnections(true);

        const validProjectIds = projects
          .map((p) => parseInt(p.id, 10))
          .filter((id) => !Number.isNaN(id));

        const validConnectionIds = connections.map((c) => c.id);

        const deletedCount =
          await MainDatabaseService.deleteOrphanedConversations(
            validProjectIds,
            validConnectionIds,
          );

        return { deletedCount };
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[AI IPC] Orphan cleanup error:', error);
        throw error;
      }
    },
  );

  // Chat Message Handlers
  ipcMain.handle(
    'chat:message:list',
    async (
      _,
      payload:
        | {
            conversationId?: number;
            sessionId?: number;
            limit?: number;
            offset?: number;
          }
        | number,
      maybeLimit?: number,
      maybeOffset?: number,
    ): Promise<ChatMessage[]> => {
      return AgentService.getMessages(payload, maybeLimit, maybeOffset);
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

  ipcMain.handle(
    'ai:completion:generate',
    async <T>(
      _: any,
      request: TypedCompletionRequest<T>,
    ): Promise<CompletionResponse<T>> => {
      return ProviderManager.generateTypedCompletion<T>(request);
    },
  );

  // Continue.dev Enhanced Chat Handlers

  // Enhanced conversation handlers with context
  ipcMain.handle(
    'chat:conversation:get-with-context',
    async (_, id: number) => {
      return MainDatabaseService.getConversationWithContext(id);
    },
  );

  // Enhanced message handlers with context
  ipcMain.handle(
    'chat:message:get-with-context',
    async (_, messageId: number) => {
      return MainDatabaseService.getMessageWithContext(messageId);
    },
  );

  // Get messages with context items
  ipcMain.handle(
    'chat:message:list-with-context',
    async (
      _,
      payload:
        | {
            conversationId?: number;
            sessionId?: number;
            limit?: number;
            offset?: number;
          }
        | number,
      maybeLimit?: number,
      maybeOffset?: number,
    ) => {
      return AgentService.getMessagesWithContext(
        payload,
        maybeLimit,
        maybeOffset,
      );
    },
  );
  // Enhanced selected file context with DBT awareness
  ipcMain.handle(
    'chat:context:resolve-selected-file',
    async (
      _,
      { filePath, projectPath }: { filePath: string; projectPath?: string },
    ) => {
      return AgentService.resolveSelectedFileContext(filePath, projectPath);
    },
  );

  // Get file metadata without full content
  ipcMain.handle(
    'chat:context:get-file-metadata',
    async (_, filePath: string) => {
      return AgentService.getFileMetadata(filePath);
    },
  );

  aiHandlersRegistered = true;

  ipcMain.handle('ai-settings:load', () => loadAISettings());
  ipcMain.handle('ai-settings:save', (_e, config) => saveAISettings(config));
  ipcMain.handle('ai-settings:file-path', () => getAISettingsFilePath());
};

export default registerAIHandlers;
