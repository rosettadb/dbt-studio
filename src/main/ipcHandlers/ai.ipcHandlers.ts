import { ipcMain } from 'electron';
import MainDatabaseService from '../services/mainDatabase.service';
import ChatService from '../services/chat.service';
import SecureStorageService from '../services/secureStorage.service';
import {
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
  NewChatMessage,
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
  'chat:message:add-with-context',
  'chat:message:regenerate',
  'chat:message:stream',
  'chat:message:cancel',
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

  // Cancel an active streaming response for a conversation
  ipcMain.handle(
    'chat:message:cancel',
    async (
      _,
      { conversationId }: { conversationId: number },
    ): Promise<{ success: boolean }> => {
      ChatService.cancelAssistantStream(conversationId);
      return { success: true };
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
      {
        title,
        projectId,
        providerId,
      }: {
        title: string;
        projectId?: number;
        providerId?: number;
      },
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
    async (_, id: number): Promise<void> => {
      await MainDatabaseService.deleteConversation(id);
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
      // Support both old positional signature and new object payload
      if (typeof payload === 'number') {
        return MainDatabaseService.getMessages(
          payload,
          maybeLimit,
          maybeOffset,
        );
      }
      const { conversationId, sessionId, limit, offset } = payload || {};
      const id = conversationId ?? sessionId;
      if (typeof id !== 'number') {
        throw new Error(
          "chat:message:list requires 'conversationId' or 'sessionId' in payload",
        );
      }
      return MainDatabaseService.getMessages(id, limit, offset);
    },
  );

  ipcMain.handle(
    'chat:message:send',
    async (
      _,
      payload:
        | {
            conversationId?: number;
            sessionId?: number;
            message: Omit<NewChatMessage, 'conversationId'>;
          }
        | number,
      maybeMessage?: NewChatMessage,
    ): Promise<ChatMessage> => {
      // Support both old positional signature and new object payload
      if (typeof payload === 'number') {
        if (!maybeMessage) {
          throw new Error(
            "chat:message:send missing 'message' argument for positional signature",
          );
        }
        // For backward compatibility, accept NewChatMessage and ignore its conversationId
        const { role, content, metadata } = maybeMessage;
        return MainDatabaseService.addMessage(payload, {
          role,
          content,
          metadata,
        });
      }
      const { conversationId, sessionId, message } = payload || ({} as any);
      const id = conversationId ?? sessionId;
      if (typeof id !== 'number') {
        throw new Error(
          "chat:message:send requires 'conversationId' or 'sessionId' in payload",
        );
      }
      return MainDatabaseService.addMessage(id, message);
    },
  );

  ipcMain.handle(
    'chat:message:update',
    async (
      _,
      { id, content }: { id: number; content: string },
    ): Promise<void> => {
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
      return ChatService.getMessagesWithContext(
        payload,
        maybeLimit,
        maybeOffset,
      );
    },
  );

  ipcMain.handle(
    'chat:message:add-with-context',
    async (
      _,
      {
        conversationId,
        message,
        contextItems,
        toolCalls,
      }: {
        conversationId: number;
        message: Omit<NewChatMessage, 'conversationId'>;
        contextItems?: Omit<
          import('../schemas/mainDatabase.schema').NewContextItem,
          'messageId'
        >[];
        toolCalls?: Omit<
          import('../schemas/mainDatabase.schema').NewToolCall,
          'messageId'
        >[];
      },
    ) => {
      return MainDatabaseService.addMessageWithContext(
        conversationId,
        message,
        contextItems,
        toolCalls,
      );
    },
  );

  ipcMain.handle(
    'chat:message:regenerate',
    async (
      _,
      {
        originalMessageId,
        newContent,
        metadata,
      }: {
        originalMessageId: number;
        newContent: string;
        metadata?: any;
      },
    ) => {
      return MainDatabaseService.createMessageVariant(
        originalMessageId,
        newContent,
        metadata,
      );
    },
  );

  // Streaming message support
  ipcMain.handle(
    'chat:message:stream',
    async (
      event,
      {
        conversationId,
        content,
        contextItems,
      }: {
        conversationId: number;
        content: string;
        contextItems?: Omit<
          import('../schemas/mainDatabase.schema').NewContextItem,
          'messageId'
        >[];
      },
    ) => {
      return ChatService.streamAssistantReply(
        conversationId,
        content,
        contextItems,
        (chunk, done, usage) => {
          event.sender.send('chat:message:stream-chunk', {
            conversationId,
            chunk,
            done,
            usage,
          });
        },
      );
    },
  );

  // Context Items Management
  ipcMain.handle(
    'chat:context:add-items',
    async (
      _,
      {
        messageId,
        contextItems,
      }: {
        messageId: number;
        contextItems: Omit<
          import('../schemas/mainDatabase.schema').NewContextItem,
          'messageId'
        >[];
      },
    ) => {
      return MainDatabaseService.addContextItems(messageId, contextItems);
    },
  );

  ipcMain.handle('chat:context:get-items', async (_, messageId: number) => {
    return MainDatabaseService.getContextItems(messageId);
  });

  // Context Resolution Handlers
  ipcMain.handle('chat:context:resolve-file', async (_, filePath: string) => {
    return ChatService.resolveFileContext(filePath);
  });

  // Enhanced selected file context with DBT awareness
  ipcMain.handle(
    'chat:context:resolve-selected-file',
    async (
      _,
      { filePath, projectPath }: { filePath: string; projectPath?: string },
    ) => {
      return ChatService.resolveSelectedFileContext(filePath, projectPath);
    },
  );

  // Get file metadata without full content
  ipcMain.handle(
    'chat:context:get-file-metadata',
    async (_, filePath: string) => {
      return ChatService.getFileMetadata(filePath);
    },
  );

  ipcMain.handle(
    'chat:context:resolve-folder',
    async (_, folderPath: string) => {
      return ChatService.resolveFolderContext(folderPath);
    },
  );

  ipcMain.handle('chat:context:search-codebase', async (_, query: string) => {
    return ChatService.searchCodebase(query);
  });

  ipcMain.handle('chat:context:resolve-url', async (_, url: string) => {
    return ChatService.resolveUrl(url);
  });

  // Tool Calls Management
  ipcMain.handle(
    'chat:tool:add-calls',
    async (
      _,
      {
        messageId,
        toolCalls,
      }: {
        messageId: number;
        toolCalls: Omit<
          import('../schemas/mainDatabase.schema').NewToolCall,
          'messageId'
        >[];
      },
    ) => {
      return MainDatabaseService.addToolCalls(messageId, toolCalls);
    },
  );

  ipcMain.handle('chat:tool:get-calls', async (_, messageId: number) => {
    return MainDatabaseService.getToolCalls(messageId);
  });

  ipcMain.handle(
    'chat:tool:update-call',
    async (
      _,
      {
        id,
        updates,
      }: {
        id: number;
        updates: Partial<
          Omit<
            import('../schemas/mainDatabase.schema').NewToolCall,
            'messageId'
          >
        >;
      },
    ) => {
      return MainDatabaseService.updateToolCall(id, updates);
    },
  );

  ipcMain.handle('chat:tool:execute', async (_, toolCallId: number) => {
    return ChatService.executeToolCall(toolCallId);
  });

  ipcMain.handle('chat:tool:cancel', async (_, toolCallId: number) => {
    return ChatService.cancelToolCall(toolCallId);
  });

  // Session Metadata Management
  ipcMain.handle(
    'chat:session:set-metadata',
    async (
      _,
      {
        conversationId,
        key,
        value,
      }: {
        conversationId: number;
        key: string;
        value: string;
      },
    ) => {
      return MainDatabaseService.setSessionMetadata(conversationId, key, value);
    },
  );

  ipcMain.handle(
    'chat:session:get-metadata',
    async (
      _,
      {
        conversationId,
        key,
      }: {
        conversationId: number;
        key?: string;
      },
    ) => {
      return MainDatabaseService.getSessionMetadata(conversationId, key);
    },
  );

  ipcMain.handle(
    'chat:session:delete-metadata',
    async (
      _,
      {
        conversationId,
        key,
      }: {
        conversationId: number;
        key?: string;
      },
    ) => {
      return MainDatabaseService.deleteSessionMetadata(conversationId, key);
    },
  );
  aiHandlersRegistered = true;

  ipcMain.handle('ai-settings:load', () => loadAISettings());
  ipcMain.handle('ai-settings:save', (_e, config) => saveAISettings(config));
  ipcMain.handle('ai-settings:file-path', () => getAISettingsFilePath());
};

export default registerAIHandlers;
