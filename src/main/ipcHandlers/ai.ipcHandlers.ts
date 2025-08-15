/* eslint-disable no-useless-catch */
// IPC Handlers for AI providers and chat functionality

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

// AI Provider Management Handlers
export const registerAIHandlers = () => {
  // Provider CRUD operations
  ipcMain.handle('ai:provider:list', async (): Promise<AIProvider[]> => {
    try {
      return await MainDatabaseService.getProviders();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to list AI providers:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'ai:provider:get',
    async (_, id: number): Promise<AIProvider | null> => {
      try {
        return await MainDatabaseService.getProvider(id);
      } catch (error) {
        throw error;
      }
    },
  );

  ipcMain.handle(
    'ai:provider:save',
    async (_, provider: NewAIProvider): Promise<AIProvider> => {
      try {
        // If this is a provider with API key, store it securely
        if (
          provider.type &&
          provider.config &&
          typeof provider.config === 'object'
        ) {
          const config = provider.config as any;
          if (config.apiKey) {
            // Store API key in keytar
            await SecureStorageService.setAIProviderCredential(
              provider.type as any,
              config.apiKey,
            );

            // Remove API key from config before storing in database
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { apiKey, ...configWithoutKey } = config;
            provider.config = configWithoutKey;
          }
        }

        return await MainDatabaseService.saveProvider(provider);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to save AI provider:', error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    'ai:provider:update',
    async (_, id: number, updates: Partial<NewAIProvider>): Promise<void> => {
      try {
        // Handle API key updates if present
        if (
          updates.type &&
          updates.config &&
          typeof updates.config === 'object'
        ) {
          const config = updates.config as any;
          if (config.apiKey) {
            // Store updated API key in keytar
            await SecureStorageService.setAIProviderCredential(
              updates.type as any,
              config.apiKey,
            );

            // Remove API key from config before storing in database
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { apiKey, ...configWithoutKey } = config;
            updates.config = configWithoutKey;
          }
        }

        await MainDatabaseService.updateProvider(id, updates);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to update AI provider:', error);
        throw error;
      }
    },
  );

  ipcMain.handle('ai:provider:delete', async (_, id: number): Promise<void> => {
    try {
      // Get provider to check type for credential cleanup
      const provider = await MainDatabaseService.getProvider(id);

      if (provider) {
        // Clean up stored credentials
        try {
          await SecureStorageService.deleteAIProviderCredential(
            provider.type as any,
          );
        } catch (credError) {
          // Continue with provider deletion even if credential cleanup fails
          // (Ignoring credential deletion errors)
        }
      }

      await MainDatabaseService.deleteProvider(id);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete AI provider:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'ai:provider:getActive',
    async (): Promise<AIProvider | null> => {
      try {
        return await MainDatabaseService.getActiveProvider();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to get active AI provider:', error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    'ai:provider:setActive',
    async (_, id: number): Promise<void> => {
      try {
        await MainDatabaseService.setActiveProvider(id);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to set active AI provider:', error);
        throw error;
      }
    },
  );

  // Chat Conversation Handlers
  ipcMain.handle(
    'chat:conversation:list',
    async (_, projectId?: number): Promise<ChatConversation[]> => {
      try {
        return await MainDatabaseService.getConversations(projectId);
      } catch (error) {
        throw error;
      }
    },
  );

  ipcMain.handle('chat:conversation:get', async (_, id: number) => {
    try {
      return await MainDatabaseService.getConversation(id);
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle(
    'chat:conversation:create',
    async (
      _,
      title: string,
      projectId?: number,
      providerId?: number,
    ): Promise<ChatConversation> => {
      try {
        return await MainDatabaseService.createConversation(
          title,
          projectId,
          providerId,
        );
      } catch (error) {
        throw error;
      }
    },
  );

  ipcMain.handle(
    'chat:conversation:update',
    async (
      _,
      id: number,
      updates: Partial<NewChatConversation>,
    ): Promise<void> => {
      try {
        await MainDatabaseService.updateConversation(id, updates);
      } catch (error) {
        throw error;
      }
    },
  );

  ipcMain.handle(
    'chat:conversation:delete',
    async (_, id: number): Promise<void> => {
      try {
        await MainDatabaseService.deleteConversation(id);
      } catch (error) {
        throw error;
      }
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
      try {
        return await MainDatabaseService.getMessages(
          conversationId,
          limit,
          offset,
        );
      } catch (error) {
        throw error;
      }
    },
  );

  ipcMain.handle(
    'chat:message:send',
    async (
      _,
      conversationId: number,
      message: NewChatMessage,
    ): Promise<ChatMessage> => {
      try {
        return await MainDatabaseService.addMessage(conversationId, message);
      } catch (error) {
        throw error;
      }
    },
  );

  ipcMain.handle(
    'chat:message:update',
    async (_, id: number, content: string): Promise<void> => {
      try {
        await MainDatabaseService.updateMessage(id, content);
      } catch (error) {
        throw error;
      }
    },
  );

  ipcMain.handle(
    'chat:message:delete',
    async (_, id: number): Promise<void> => {
      try {
        await MainDatabaseService.deleteMessage(id);
      } catch (error) {
        throw error;
      }
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
      try {
        return await MainDatabaseService.getPromptTemplates(
          category,
          providerType,
        );
      } catch (error) {
        throw error;
      }
    },
  );

  ipcMain.handle(
    'ai:template:save',
    async (_, template: NewPromptTemplate): Promise<PromptTemplate> => {
      try {
        return await MainDatabaseService.savePromptTemplate(template);
      } catch (error) {
        throw error;
      }
    },
  );

  ipcMain.handle(
    'ai:template:update',
    async (
      _,
      id: number,
      updates: Partial<NewPromptTemplate>,
    ): Promise<void> => {
      try {
        await MainDatabaseService.updatePromptTemplate(id, updates);
      } catch (error) {
        throw error;
      }
    },
  );

  ipcMain.handle('ai:template:delete', async (_, id: number): Promise<void> => {
    try {
      await MainDatabaseService.deletePromptTemplate(id);
    } catch (error) {
      throw error;
    }
  });

  // Analytics and Usage Handlers
  ipcMain.handle(
    'ai:usage:log',
    async (_, usage: NewAIUsageLog): Promise<void> => {
      try {
        await MainDatabaseService.logUsage(usage);
      } catch (error) {
        throw error;
      }
    },
  );

  ipcMain.handle(
    'ai:usage:stats',
    async (_, timeframe: 'day' | 'week' | 'month', providerId?: number) => {
      try {
        return await MainDatabaseService.getUsageStats(timeframe, providerId);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to get usage stats:', error);
        throw error;
      }
    },
  );

  // Provider testing handler (for connection validation)
  ipcMain.handle(
    'ai:provider:test',
    async (_, id: number): Promise<{ success: boolean; error?: string }> => {
      try {
        const provider = await MainDatabaseService.getProvider(id);

        if (!provider) {
          return { success: false, error: 'Provider not found' };
        }

        // For now, just check if the provider exists and has valid configuration
        // In the future, this will test actual API connections
        const hasValidConfig =
          provider.config && typeof provider.config === 'object';

        if (!hasValidConfig) {
          return { success: false, error: 'Invalid provider configuration' };
        }

        // Check if credentials exist for providers that need them
        const providersNeedingCredentials = ['openai', 'gemini', 'anthropic'];
        if (providersNeedingCredentials.includes(provider.type)) {
          try {
            const credential =
              await SecureStorageService.getAIProviderCredential(
                provider.type as any,
              );
            if (!credential) {
              return {
                success: false,
                error: 'API key not found in secure storage',
              };
            }
          } catch (credError) {
            return { success: false, error: 'Failed to retrieve API key' };
          }
        }

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  );

  // Database Information
  ipcMain.handle('ai:get-database-info', async () => {
    try {
      return await MainDatabaseService.getDatabaseInfo();
    } catch (error) {
      throw error;
    }
  });
};
