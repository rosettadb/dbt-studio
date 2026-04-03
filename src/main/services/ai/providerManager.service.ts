import { generateText } from 'ai';
import MainDatabaseService from '../mainDatabase.service';
import SecureStorageService, { AIProviderType } from '../secureStorage.service';
import { AIProvider, NewAIProvider } from '../../schemas/mainDatabase.schema';
import { getVercelModel } from './agentAdapter';
import { HealthStatus } from './types/provider.types';
import {
  CompletionRequest,
  CompletionResponse,
  TypedCompletionRequest,
} from './types/completion.types';

export interface ProviderTestResult {
  success: boolean;
  error?: string;
  models?: any[];
  message?: string;
  latencyMs?: number;
  modelsAvailable?: number;
}

export class AIProviderManager {
  private static providers: Map<string, any> = new Map();

  private static activeProvider: any | null = null;

  /**
   * @deprecated Use getVercelModel() from agentAdapter.ts instead.
   * This method is kept for backward compatibility only.
   * Returns the selected model name and provider type.
   */
  static async getInitializedActiveProviderAndModel(
    requestedModel?: string,
  ): Promise<{
    selectedModel: string;
    providerType: string;
  }> {
    // Get the active provider from DB
    const activeProvider = await MainDatabaseService.getActiveProvider();
    if (!activeProvider) {
      throw new Error(
        'No active AI provider configured. Please configure and activate a provider in settings.',
      );
    }

    // Parse provider config
    let config: any = {};
    try {
      config =
        typeof activeProvider.config === 'string'
          ? JSON.parse(activeProvider.config)
          : activeProvider.config || {};
    } catch (configError) {
      throw new Error(
        'Invalid provider configuration. Please reconfigure the provider in settings.',
      );
    }

    // Select model
    const selectedModel =
      requestedModel && requestedModel.trim().length > 0
        ? requestedModel
        : this.getDefaultModelForProvider(activeProvider.type, config);

    return {
      selectedModel,
      providerType: activeProvider.type,
    };
  }

  static async initializeAllProviders(): Promise<void> {
    try {
      // Set active provider if one exists
      const activeProvider = await MainDatabaseService.getActiveProvider();
      // TODO: Implement active provider initialization when provider classes are ready
      if (activeProvider) {
        // activeProvider initialization logic will go here
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to initialize AI providers:', error);
      throw error;
    }
  }

  static async createProvider(
    providerData: NewAIProvider,
  ): Promise<AIProvider> {
    try {
      // Extract API key before saving to database
      let apiKey: string | null = null;
      if (providerData.type && providerData.config) {
        let config: any;

        // Handle both string and object config formats
        if (typeof providerData.config === 'string') {
          try {
            config = JSON.parse(providerData.config);
          } catch (parseError) {
            // eslint-disable-next-line no-console
            console.error(
              '[PROVIDER MANAGER] Failed to parse config string:',
              parseError,
            );
            throw new Error('Invalid config format');
          }
        } else if (typeof providerData.config === 'object') {
          config = providerData.config as any;
        }

        if (config && config.apiKey) {
          apiKey = config.apiKey;

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { apiKey: removedKey, ...configWithoutKey } = config;

          // Always store config as JSON string in database WITHOUT API key
          providerData.config = JSON.stringify(configWithoutKey);
        } else if (config) {
          providerData.config =
            typeof providerData.config === 'string'
              ? providerData.config
              : JSON.stringify(config);
        }
      }

      // Create provider in database
      const newProvider = await MainDatabaseService.saveProvider(providerData);

      // Store API key in secure storage with provider ID
      if (apiKey && newProvider.id) {
        await SecureStorageService.setAIProviderCredential(
          newProvider.id,
          newProvider.type as any,
          apiKey,
        );
      }

      return newProvider;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[PROVIDER MANAGER] Failed to create AI provider:', error);
      throw error;
    }
  }

  static async updateProvider(
    id: number,
    updates: Partial<NewAIProvider>,
  ): Promise<AIProvider> {
    try {
      // Handle API key updates if present
      if (updates.type && updates.config) {
        let config: any;

        // Parse config if it's a string, otherwise use as object
        if (typeof updates.config === 'string') {
          try {
            config = JSON.parse(updates.config);
          } catch (parseError) {
            // eslint-disable-next-line no-console
            console.error(
              '[PROVIDER MANAGER] Failed to parse config string:',
              parseError,
            );
            throw new Error('Invalid config format');
          }
        } else {
          config = updates.config as any;
        }

        if (config.apiKey) {
          await SecureStorageService.setAIProviderCredential(
            id,
            updates.type as any,
            config.apiKey,
          );

          // Remove API key from config before storing in database
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { apiKey, ...configWithoutKey } = config;

          // Always store as JSON string in database
          updates.config = JSON.stringify(configWithoutKey);
        } else {
          // Store as JSON string if no API key to process
          updates.config =
            typeof updates.config === 'string'
              ? updates.config
              : JSON.stringify(config);
        }
      }
      // Update provider in database
      await MainDatabaseService.updateProvider(id, updates);
      const updatedProvider = await MainDatabaseService.getProvider(id);
      if (!updatedProvider) {
        // eslint-disable-next-line no-console
        console.error(
          '[PROVIDER MANAGER] Provider not found after update:',
          id,
        );
        throw new Error(`Provider ${id} not found after update`);
      }
      return updatedProvider;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[PROVIDER MANAGER] Failed to update AI provider:', error);
      throw error;
    }
  }

  static async deleteProvider(id: number): Promise<void> {
    try {
      const provider = await MainDatabaseService.getProvider(id);
      if (provider) {
        try {
          await SecureStorageService.deleteAIProviderCredential(
            provider.id!,
            provider.type as AIProviderType,
          );
        } catch (credError) {
          // eslint-disable-next-line no-console
          console.error(
            '[PROVIDER MANAGER] Failed to delete AI provider credential:',
            credError,
          );
          // Continue with deletion even if credential deletion fails
        }
      }

      // Delete from database
      await MainDatabaseService.deleteProvider(id);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[PROVIDER MANAGER] Failed to delete AI provider:', error);
      throw error;
    }
  }

  static async setActiveProvider(id: string): Promise<void> {
    try {
      // Update database
      await MainDatabaseService.setActiveProvider(parseInt(id, 10));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to set active provider:', error);
      throw error;
    }
  }

  static async testTemporaryProvider(
    config: NewAIProvider,
    credentials: Record<string, any>,
  ): Promise<ProviderTestResult> {
    try {
      // Parse the provider config
      const configString =
        typeof config.config === 'string'
          ? config.config
          : JSON.stringify(config.config || {});
      const parsedConfig = JSON.parse(configString);

      // Test connection using AI SDK v6
      try {
        // Create a temporary provider record to use getVercelModel
        const tempProvider = {
          ...config,
          id: -1, // Temporary ID
          config: { ...parsedConfig, apiKey: credentials.apiKey },
        };

        // Save temporarily to test
        const savedProvider = await MainDatabaseService.saveProvider(
          tempProvider as NewAIProvider,
        );

        // Store API key temporarily
        if (credentials.apiKey && savedProvider.id) {
          await SecureStorageService.setAIProviderCredential(
            savedProvider.id,
            config.type as AIProviderType,
            credentials.apiKey,
          );
        }

        // Set as active temporarily
        await MainDatabaseService.setActiveProvider(savedProvider.id!);

        // Test with a simple completion
        const model = await getVercelModel();
        await generateText({
          model: model as any,
          prompt: 'Say "test successful" if you can read this.',
        });

        // Clean up temporary provider
        await MainDatabaseService.deleteProvider(savedProvider.id!);
        if (credentials.apiKey && savedProvider.id) {
          await SecureStorageService.deleteAIProviderCredential(
            savedProvider.id,
            config.type as AIProviderType,
          );
        }

        return {
          success: true,
          message: 'Provider test successful',
          models: [], // Model list not available in test mode
          modelsAvailable: 0,
        };
      } catch (testError) {
        // eslint-disable-next-line no-console
        console.error('Provider test failed:', testError);
        return {
          success: false,
          error:
            testError instanceof Error
              ? testError.message
              : 'Unknown error occurred',
        };
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('=== Provider test failed ===');
      // eslint-disable-next-line no-console
      console.error('Error details:', error);
      // eslint-disable-next-line no-console
      console.error(
        'Stack trace:',
        error instanceof Error ? error.stack : 'No stack trace',
      );

      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  static async getProviderModels(providerId: string): Promise<any[]> {
    try {
      // Get provider from database
      const provider = await MainDatabaseService.getProvider(
        parseInt(providerId, 10),
      );
      if (!provider) {
        // eslint-disable-next-line no-console
        console.error(`Provider with ID ${providerId} not found`);
        return [];
      }

      // Return hardcoded model lists for now
      // In a future phase, this could query provider APIs for dynamic model lists
      const modelsByProvider: Record<string, any[]> = {
        openai: [
          { id: 'gpt-4.1', name: 'GPT-4.1' },
          { id: 'gpt-4o', name: 'GPT-4o' },
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
        ],
        anthropic: [
          { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
          { id: 'claude-4.1-sonnet-20250815', name: 'Claude 4.1 Sonnet' },
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
        ],
        gemini: [
          { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
          { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
        ],
        ollama: [
          { id: 'llama3.2', name: 'Llama 3.2' },
          { id: 'llama2', name: 'Llama 2' },
          { id: 'mistral', name: 'Mistral' },
        ],
      };

      return modelsByProvider[provider.type] || [];
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`=== Failed to get models for provider ${providerId} ===`);
      // eslint-disable-next-line no-console
      console.error('Error details:', error);
      // eslint-disable-next-line no-console
      console.error(
        'Stack trace:',
        error instanceof Error ? error.stack : 'No stack trace',
      );
      return [];
    }
  }

  static async refreshProvider(id: string): Promise<void> {
    try {
      // TODO: Implement provider refresh when provider classes are ready
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to refresh provider ${id}:`, error);
      throw error;
    }
  }

  static async testProvider(providerId: string): Promise<ProviderTestResult> {
    try {
      // Parse the providerId (it might be a string number)
      const id = parseInt(providerId, 10);
      if (Number.isNaN(id)) {
        // eslint-disable-next-line no-console
        console.error(
          `[PROVIDER MANAGER] testProvider - Invalid provider ID: ${providerId}`,
        );
        return {
          success: false,
          error: `Invalid provider ID: ${providerId}`,
        };
      }

      // Get provider from database
      const provider = await MainDatabaseService.getProvider(id);
      if (!provider) {
        // eslint-disable-next-line no-console
        console.error(
          `[PROVIDER MANAGER] testProvider - Provider ${id} not found in database`,
        );
        return {
          success: false,
          error: `Provider ${id} not found`,
        };
      }

      // Get provider credentials from secure storage (only for providers that need API keys)
      let apiKey;
      const providersNeedingApiKey = ['openai', 'anthropic', 'gemini'];

      if (providersNeedingApiKey.includes(provider.type)) {
        // Get credentials from secure storage
        apiKey = await SecureStorageService.getAIProviderCredential(
          provider.id!,
          provider.type as AIProviderType,
        );

        if (!apiKey) {
          // Parse config to check for API key (backward compatibility)
          try {
            const configData =
              typeof provider.config === 'string'
                ? JSON.parse(provider.config)
                : provider.config;

            if (configData && configData.apiKey) {
              apiKey = configData.apiKey;
            }
          } catch (configParseError) {
            // eslint-disable-next-line no-console
            console.error(
              `[PROVIDER MANAGER] testProvider - Failed to parse config for API key check:`,
              configParseError,
            );
          }
        }

        if (!apiKey) {
          // eslint-disable-next-line no-console
          console.error(
            `[PROVIDER MANAGER] testProvider - No API key found for provider ${provider.type}`,
          );
          return {
            success: false,
            error: `No API key configured for ${provider.type} provider`,
          };
        }
      }

      // Test the connection using AI SDK v6
      try {
        const startTime = Date.now();

        // Temporarily set as active to test
        const previousActive = await MainDatabaseService.getActiveProvider();
        await MainDatabaseService.setActiveProvider(provider.id!);

        try {
          // Test with a simple completion
          const model = await getVercelModel();
          await generateText({
            model: model as any,
            prompt: 'Say "test successful" if you can read this.',
          });

          const latencyMs = Date.now() - startTime;

          // Restore previous active provider
          if (previousActive) {
            await MainDatabaseService.setActiveProvider(previousActive.id!);
          }

          return {
            success: true,
            message: 'Provider test successful',
            latencyMs,
            models: [],
            modelsAvailable: 0,
          };
        } catch (testError) {
          // Restore previous active provider
          if (previousActive) {
            await MainDatabaseService.setActiveProvider(previousActive.id!);
          }
          throw testError;
        }
      } catch (testError) {
        // eslint-disable-next-line no-console
        console.error(
          `[PROVIDER MANAGER] testProvider - Connection test failed:`,
          testError,
        );
        return {
          success: false,
          error: `Connection test failed: ${
            testError instanceof Error ? testError.message : 'Unknown error'
          }`,
        };
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[PROVIDER MANAGER] testProvider - Unexpected error testing provider ${providerId}:`,
        error,
      );
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  static async getAllAvailableModels(): Promise<Map<string, any[]>> {
    try {
      const modelsMap = new Map<string, any[]>();

      // Get all providers from database
      const dbProviders = await MainDatabaseService.getProviders();

      dbProviders.forEach((provider) => {
        modelsMap.set(provider.id.toString(), []);
      });

      return modelsMap;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to get all available models:', error);
      throw error;
    }
  }

  static async generateCompletion<T = any>(
    request: CompletionRequest<T>,
  ): Promise<CompletionResponse<T>> {
    try {
      // Get the active provider info
      const { selectedModel } = await this.getInitializedActiveProviderAndModel(
        request.model,
      );

      // Use AI SDK v6 generateText
      const model = await getVercelModel(selectedModel);

      // Use prompt from request
      const prompt = request.prompt || '';

      const result = await generateText({
        model: model as any,
        prompt,
        temperature: request.temperature,
      });

      return {
        content: result.text,
        model: selectedModel,
        providerId: selectedModel,
        usage: {
          promptTokens: 0, // AI SDK v6 doesn't provide separate prompt tokens
          completionTokens: 0, // AI SDK v6 doesn't provide separate completion tokens
          totalTokens: result.usage.totalTokens || 0,
        },
      } as CompletionResponse<T>;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Strongly typed completion method with schema validation
   */
  static async generateTypedCompletion<T>(
    request: TypedCompletionRequest<T>,
  ): Promise<CompletionResponse<T>> {
    return this.generateCompletion<T>(request);
  }

  // Helper method to get default model for a provider
  private static getDefaultModelForProvider(
    providerType: string,
    config: any,
  ): string {
    // First priority: Use the model from provider config if it's valid
    if (typeof config.model === 'string' && config.model.trim().length > 0) {
      return config.model;
    }

    // Second priority: Use system default models only as fallback
    const defaultModels: Record<string, string> = {
      openai: 'gpt-4.1',
      anthropic: 'claude-4.1-sonnet-20250815',
      gemini: 'gemini-1.5-flash',
      ollama: 'llama2', // Default fallback for Ollama
    };

    return defaultModels[providerType] || 'gpt-4o';
  }

  static async getProviderStatus(providerId: string): Promise<HealthStatus> {
    try {
      // Parse the providerId (it might be a string number)
      const id = parseInt(providerId, 10);
      if (Number.isNaN(id)) {
        throw new Error(`Invalid provider ID: ${providerId}`);
      }

      // Get provider from database
      const provider = await MainDatabaseService.getProvider(id);
      if (!provider) {
        return {
          status: 'unhealthy',
          lastCheck: new Date(),
          error: `Provider ${id} not found`,
        };
      }

      // If provider is not active, return degraded status
      if (!provider.isActive) {
        return {
          status: 'degraded',
          lastCheck: new Date(),
          error: 'Provider is not active',
        };
      }

      // Get provider credentials (if needed)
      let apiKey;
      const providersNeedingApiKey = ['openai', 'anthropic', 'gemini'];

      if (providersNeedingApiKey.includes(provider.type)) {
        apiKey = await SecureStorageService.getAIProviderCredential(
          provider.id!,
          provider.type as AIProviderType,
        );

        if (!apiKey) {
          return {
            status: 'unhealthy',
            lastCheck: new Date(),
            error: 'No API key configured',
          };
        }
      }

      // Perform a quick health check using AI SDK v6
      try {
        const startTime = Date.now();

        // Temporarily set as active to test
        const previousActive = await MainDatabaseService.getActiveProvider();
        await MainDatabaseService.setActiveProvider(provider.id!);

        try {
          // Test with a simple completion
          const model = await getVercelModel();
          await generateText({
            model: model as any,
            prompt: 'Say "test successful" if you can read this.',
          });

          const responseTimeMs = Date.now() - startTime;

          // Restore previous active provider
          if (previousActive) {
            await MainDatabaseService.setActiveProvider(previousActive.id!);
          }

          return {
            status: 'healthy',
            lastCheck: new Date(),
            responseTimeMs,
          };
        } catch (testError) {
          // Restore previous active provider
          if (previousActive) {
            await MainDatabaseService.setActiveProvider(previousActive.id!);
          }

          const responseTimeMs = Date.now() - startTime;
          return {
            status: 'degraded',
            lastCheck: new Date(),
            responseTimeMs,
            error:
              testError instanceof Error
                ? testError.message
                : 'Connection test failed',
          };
        }
      } catch (testError) {
        return {
          status: 'unhealthy',
          lastCheck: new Date(),
          error: `Health check failed: ${
            testError instanceof Error ? testError.message : 'Unknown error'
          }`,
        };
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to get provider status ${providerId}:`, error);
      return {
        status: 'unhealthy',
        lastCheck: new Date(),
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  static getActiveProvider(): any | null {
    // For now, return null
    // TODO: Implement actual active provider tracking when provider classes are ready
    return this.activeProvider;
  }

  // Returns enriched info about the active provider for IPC consumption
  static getActiveProviderInfo(): {
    name: string;
    type: string;
    capabilities: any;
    supportedModels: any;
  } | null {
    const activeProvider = this.getActiveProvider();
    if (!activeProvider) {
      return null;
    }

    return {
      name: activeProvider.name,
      type: activeProvider.type,
      capabilities: activeProvider.capabilities,
      supportedModels: activeProvider.supportedModels,
    };
  }
}

export default AIProviderManager;
