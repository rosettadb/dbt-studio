import MainDatabaseService from '../mainDatabase.service';
import SecureStorageService, { AIProviderType } from '../secureStorage.service';
import { AIProvider, NewAIProvider } from '../../schemas/mainDatabase.schema';
import { OpenAIProvider } from './providers/openai.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { BaseAIProvider } from './providers/base.provider';
import { AIProviderConfig, HealthStatus } from './types/provider.types';
import {
  CompletionChunk,
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

  // Helper method to create provider instance
  private static createProviderInstance(
    type: string,
    config: AIProviderConfig,
  ): BaseAIProvider | null {
    switch (type) {
      case 'openai':
        return new OpenAIProvider();
      case 'ollama':
        return new OllamaProvider();
      case 'gemini':
        return new GeminiProvider();
      case 'anthropic':
        return new AnthropicProvider();
      default:
        // eslint-disable-next-line no-console
        console.error(
          `Unknown provider type: ${type}, ${JSON.stringify(config)}`,
        );
        return null;
    }
  }

  /**
   * Returns an initialized active provider instance and a selected model compatible with it.
   * This is useful for services that need to directly call provider methods (e.g., streaming).
   */
  static async getInitializedActiveProviderAndModel(
    requestedModel?: string,
  ): Promise<{
    providerInstance: BaseAIProvider;
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

    // Credentials (if needed)
    let apiKey: string | undefined;
    const providersNeedingApiKey = ['openai', 'anthropic', 'gemini'];
    if (providersNeedingApiKey.includes(activeProvider.type)) {
      apiKey = (await SecureStorageService.getAIProviderCredential(
        activeProvider.id!,
        activeProvider.type as AIProviderType,
      )) as any;
      if (!apiKey) {
        throw new Error(
          `No API key configured for ${activeProvider.type} provider. Please configure credentials in settings.`,
        );
      }
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
    let selectedModel = requestedModel;
    if (
      !selectedModel ||
      !this.isModelValidForProvider(selectedModel, activeProvider.type)
    ) {
      selectedModel = this.getDefaultModelForProvider(
        activeProvider.type,
        config,
      );
    }

    // Create and initialize instance
    const providerInstance = this.createProviderInstance(
      activeProvider.type,
      config,
    );
    if (!providerInstance) {
      throw new Error(`Unsupported provider type: ${activeProvider.type}`);
    }

    await providerInstance.initialize({ ...config, apiKey });

    return {
      providerInstance,
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

      // Create provider config object
      const providerConfig: AIProviderConfig = {
        ...parsedConfig,
        apiKey: credentials.apiKey,
      };

      // Create provider instance
      const provider = this.createProviderInstance(config.type, providerConfig);
      if (!provider) {
        // eslint-disable-next-line no-console
        console.error(
          `Failed to create provider instance for type: ${config.type}`,
        );
        return {
          success: false,
          error: `Unsupported provider type: ${config.type}`,
        };
      }

      await provider.initialize(providerConfig);
      const testResult = await provider.testConnection();

      // Get available models if test was successful
      if (testResult.success) {
        try {
          const models = await provider.getAvailableModels();
          testResult.models = models;
          testResult.modelsAvailable = models.length;
        } catch (modelError) {
          testResult.models = [];
          testResult.modelsAvailable = 0;
        }
      }

      return testResult;
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

      // Parse the provider config
      const configString =
        typeof provider.config === 'string'
          ? provider.config
          : JSON.stringify(provider.config || {});
      const parsedConfig = JSON.parse(configString);

      // Get credentials from secure storage
      let apiKey: string | null = null;
      if (['openai', 'anthropic', 'gemini'].includes(provider.type)) {
        apiKey = await SecureStorageService.getAIProviderCredential(
          provider.id!,
          provider.type as AIProviderType,
        );
      }

      // Create provider config object
      const providerConfig: AIProviderConfig = {
        ...parsedConfig,
        apiKey,
      };

      // Create provider instance
      const providerInstance = this.createProviderInstance(
        provider.type,
        providerConfig,
      );
      if (!providerInstance) {
        // eslint-disable-next-line no-console
        console.error(
          `Failed to create provider instance for type: ${provider.type}`,
        );
        return [];
      }

      // Initialize the provider
      await providerInstance.initialize(providerConfig);

      // Get available models
      const models = await providerInstance.getAvailableModels();

      return models;
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
        // Get credentials from secure storage (now returns null on error instead of throwing)
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
          // eslint-disable-next-line no-console
          console.error(`[PROVIDER MANAGER] testProvider - Debug info:`, {
            providerId: provider.id,
            providerType: provider.type,
            expectedSecureStorageKey: `${provider.type}-${provider.id}-api-key`,
          });
          return {
            success: false,
            error: `No API key configured for ${provider.type} provider`,
          };
        }
      } else {
        // Provider doesn't require API key (like Ollama local)
      }

      // Parse provider config
      let config;
      try {
        config =
          typeof provider.config === 'string'
            ? JSON.parse(provider.config)
            : provider.config;
      } catch (configError) {
        // eslint-disable-next-line no-console
        console.error(
          `[PROVIDER MANAGER] testProvider - Failed to parse config:`,
          configError,
        );
        return {
          success: false,
          error: `Invalid provider configuration: ${configError instanceof Error ? configError.message : 'Unknown error'}`,
        };
      }

      // Create provider instance
      const providerInstance = this.createProviderInstance(
        provider.type,
        config,
      );
      if (!providerInstance) {
        // eslint-disable-next-line no-console
        console.error(
          `[PROVIDER MANAGER] testProvider - Failed to create provider instance for type: ${provider.type}`,
        );
        return {
          success: false,
          error: `Unsupported provider type: ${provider.type}`,
        };
      }

      // Initialize provider with combined config and credentials
      try {
        const providerConfig: AIProviderConfig = {
          ...config,
          apiKey,
        };

        await providerInstance.initialize(providerConfig);
      } catch (initError) {
        // eslint-disable-next-line no-console
        console.error(
          `[PROVIDER MANAGER] testProvider - Failed to initialize provider:`,
          initError,
        );
        return {
          success: false,
          error: `Failed to initialize provider: ${initError instanceof Error ? initError.message : 'Unknown error'}`,
        };
      }

      // Test the connection
      try {
        const startTime = Date.now();

        const testResult = await providerInstance.testConnection();
        const latencyMs = Date.now() - startTime;

        return {
          success: testResult.success,
          error: testResult.error,
          message: testResult.message || 'Provider test successful',
          latencyMs,
          models: testResult.models,
          modelsAvailable: testResult.models?.length || 0,
        };
      } catch (testError) {
        // eslint-disable-next-line no-console
        console.error(
          `[PROVIDER MANAGER] testProvider - Connection test failed:`,
          testError,
        );
        return {
          success: false,
          error: `Connection test failed: ${testError instanceof Error ? testError.message : 'Unknown error'}`,
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
      // Get the active provider
      const activeProvider = await MainDatabaseService.getActiveProvider();
      if (!activeProvider) {
        console.error(
          '[PROVIDER MANAGER] generateCompletion - No active provider found',
        );
        throw new Error(
          'No active AI provider configured. Please configure and activate a provider in settings.',
        );
      }

      // Get provider credentials (if needed)
      let apiKey;
      const providersNeedingApiKey = ['openai', 'anthropic', 'gemini'];

      if (providersNeedingApiKey.includes(activeProvider.type)) {
        apiKey = await SecureStorageService.getAIProviderCredential(
          activeProvider.id!,
          activeProvider.type as AIProviderType,
        );

        if (!apiKey) {
          console.error(
            '[PROVIDER MANAGER] generateCompletion - No API key found for provider',
          );
          throw new Error(
            `No API key configured for ${activeProvider.type} provider. Please configure credentials in settings.`,
          );
        }
      }

      // Parse provider config
      let config;
      try {
        config =
          typeof activeProvider.config === 'string'
            ? JSON.parse(activeProvider.config)
            : activeProvider.config || {};
      } catch (configError) {
        console.error(
          '[PROVIDER MANAGER] generateCompletion - Failed to parse provider config:',
          configError,
        );
        throw new Error(
          'Invalid provider configuration. Please reconfigure the provider in settings.',
        );
      }

      // Select appropriate model for the provider if not specified or if wrong provider model
      let selectedModel = request.model;

      // If no model specified or if the model doesn't match the provider, use provider's default
      if (
        !selectedModel ||
        !this.isModelValidForProvider(selectedModel, activeProvider.type)
      ) {
        selectedModel = this.getDefaultModelForProvider(
          activeProvider.type,
          config,
        );
      }

      // Create and initialize provider instance
      const providerInstance = this.createProviderInstance(
        activeProvider.type,
        config,
      );
      if (!providerInstance) {
        console.error(
          '[PROVIDER MANAGER] generateCompletion - Failed to create provider instance',
        );
        throw new Error(`Unsupported provider type: ${activeProvider.type}`);
      }

      // Initialize provider with config and credentials
      const providerConfig: AIProviderConfig = {
        ...config,
        apiKey,
      };

      try {
        await providerInstance.initialize(providerConfig);
      } catch (initError) {
        console.error(
          '[PROVIDER MANAGER] generateCompletion - Failed to initialize provider:',
          initError,
        );
        throw new Error(
          `Failed to initialize ${activeProvider.type} provider: ${initError instanceof Error ? initError.message : 'Unknown error'}`,
        );
      }

      // Update request with correct model
      const updatedRequest: CompletionRequest<T> = {
        ...request,
        model: selectedModel,
      };

      // Generate completion - Pure delegation to provider
      try {
        if (request.schemaConfig) {
          console.log(
            '[PROVIDER MANAGER] Using schema configuration:',
            request.schemaConfig.name || 'unnamed',
          );
        } else {
          console.log('[PROVIDER MANAGER] Using generic completion');
        }

        const response =
          await providerInstance.generateCompletion<T>(updatedRequest);

        // Log schema validation results if present
        if (response.schemaValidation) {
          if (response.schemaValidation.isValid) {
            console.log('[PROVIDER MANAGER] Schema validation passed');
          } else {
            console.warn(
              '[PROVIDER MANAGER] Schema validation failed:',
              response.schemaValidation.errors,
            );
          }
        }

        return response;
      } catch (completionError) {
        console.error(
          '[PROVIDER MANAGER] generateCompletion - Failed to generate completion:',
          completionError,
        );

        // Provide user-friendly error messages
        if (completionError instanceof Error) {
          if (
            completionError.message.includes('401') ||
            completionError.message.includes('Unauthorized')
          ) {
            throw new Error(
              `Authentication failed with ${activeProvider.type}. Please check your API key in settings.`,
            );
          } else if (
            completionError.message.includes('429') ||
            completionError.message.includes('quota')
          ) {
            throw new Error(
              `API quota exceeded for ${activeProvider.type}. Please check your billing or try again later.`,
            );
          } else if (completionError.message.includes('timeout')) {
            throw new Error(
              `Request timeout with ${activeProvider.type}. Please try again.`,
            );
          }
        }

        throw new Error(
          `Failed to generate completion with ${activeProvider.type}: ${completionError instanceof Error ? completionError.message : 'Unknown error'}`,
        );
      }
    } catch (error) {
      console.error(
        '[PROVIDER MANAGER] generateCompletion - Unexpected error:',
        error,
      );
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

  /**
   * Enhanced streaming with generic support
   */
  static async *streamCompletion<T = any>(
    request: CompletionRequest<T>,
  ): AsyncGenerator<CompletionChunk<T>> {
    const { providerInstance } =
      await this.getInitializedActiveProviderAndModel(request.model);

    yield* providerInstance.streamCompletion<T>(request);
  }

  // Helper method to check if a model is valid for a provider
  private static isModelValidForProvider(
    model: string,
    providerType: string,
  ): boolean {
    const providerModels: Record<string, string[]> = {
      openai: ['gpt-4o', 'gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo'],
      anthropic: [
        'claude-3-5-sonnet-20241022',
        'claude-3-haiku-20240307',
        'claude-3-sonnet-20240229',
      ],
      // Only include models that actually work with the APIs
      gemini: ['gemini-1.5-pro', 'gemini-1.5-flash'],
      ollama: [], // Ollama can use any model that's locally available
    };

    // For Ollama, we can't validate ahead of time, so assume it's valid
    if (providerType === 'ollama') {
      return true;
    }

    const validModels = providerModels[providerType] || [];
    return validModels.includes(model);
  }

  // Helper method to get default model for a provider
  private static getDefaultModelForProvider(
    providerType: string,
    config: any,
  ): string {
    // First priority: Use the model from provider config if it's valid
    if (
      config.model &&
      this.isModelValidForProvider(config.model, providerType)
    ) {
      return config.model;
    }

    // Second priority: Use system default models only as fallback
    const defaultModels: Record<string, string> = {
      openai: 'gpt-4o',
      anthropic: 'claude-3-5-sonnet-20241022',
      gemini: 'gemini-1.5-flash', // Use Flash model - has higher free tier limits
      ollama: 'llama2', // Default fallback for Ollama
    };

    const defaultModel = defaultModels[providerType] || 'gpt-4o';

    // Log when we're using fallback (either invalid config model or no model configured)
    if (
      config.model &&
      !this.isModelValidForProvider(config.model, providerType)
    ) {
      // eslint-disable-next-line no-console
      console.log(
        `[PROVIDER MANAGER] Invalid model "${config.model}" for ${providerType}, falling back to default: ${defaultModel}`,
      );
    }

    return defaultModel;
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

      // Parse provider config
      let config;
      try {
        config =
          typeof provider.config === 'string'
            ? JSON.parse(provider.config)
            : provider.config || {};
      } catch (configError) {
        return {
          status: 'unhealthy',
          lastCheck: new Date(),
          error: 'Invalid provider configuration',
        };
      }

      // Create provider instance
      const providerInstance = this.createProviderInstance(
        provider.type,
        config,
      );
      if (!providerInstance) {
        return {
          status: 'unhealthy',
          lastCheck: new Date(),
          error: `Unsupported provider type: ${provider.type}`,
        };
      }

      // Initialize provider with combined config and credentials
      try {
        const providerConfig: AIProviderConfig = {
          ...config,
          apiKey,
        };
        await providerInstance.initialize(providerConfig);
      } catch (initError) {
        return {
          status: 'unhealthy',
          lastCheck: new Date(),
          error: `Failed to initialize provider: ${initError instanceof Error ? initError.message : 'Unknown error'}`,
        };
      }

      // Perform a quick health check
      try {
        const startTime = Date.now();
        const testResult = await providerInstance.testConnection();
        const responseTimeMs = Date.now() - startTime;

        if (testResult.success) {
          return {
            status: 'healthy',
            lastCheck: new Date(),
            responseTimeMs,
          };
        }

        return {
          status: 'degraded',
          lastCheck: new Date(),
          responseTimeMs,
          error: testResult.error || 'Connection test failed',
        };
      } catch (testError) {
        return {
          status: 'unhealthy',
          lastCheck: new Date(),
          error: `Health check failed: ${testError instanceof Error ? testError.message : 'Unknown error'}`,
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
