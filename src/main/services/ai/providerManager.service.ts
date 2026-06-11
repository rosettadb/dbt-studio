import { generateText } from 'ai';
import MainDatabaseService from '../mainDatabase.service';
import SecureStorageService, { AIProviderType } from '../secureStorage.service';
import { AIProvider, NewAIProvider } from '../../schemas/mainDatabase.schema';
import { getVercelModel } from './agentAdapter';
import { HealthStatus } from './types/provider.types';
import { fetchAndCacheContextWindows } from './tokenEstimator';
import {
  buildOllamaHeaders,
  buildOllamaTagsUrl,
  isHostedOllamaCloudUrl,
  isRemoteOllamaUrl,
  normalizeOllamaBaseUrl,
  shouldAttachOllamaAuth,
} from './utils/ollamaProvider.utils';
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

  private static providerRequiresApiKey(
    providerType: string,
    config?: any,
  ): boolean {
    if (providerType === 'ollama') {
      return isHostedOllamaCloudUrl(config?.baseUrl);
    }

    return ['openai', 'anthropic', 'gemini'].includes(providerType);
  }

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

        const hasApiKeyUpdate =
          Object.prototype.hasOwnProperty.call(config, 'apiKey') &&
          config.apiKey !== undefined;
        const normalizedApiKey =
          typeof config.apiKey === 'string'
            ? config.apiKey.trim()
            : config.apiKey;

        if (hasApiKeyUpdate && normalizedApiKey) {
          await SecureStorageService.setAIProviderCredential(
            id,
            updates.type as any,
            normalizedApiKey,
          );

          // Remove API key from config before storing in database
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { apiKey, ...configWithoutKey } = config;

          // Always store as JSON string in database
          updates.config = JSON.stringify(configWithoutKey);
        } else {
          if (updates.type === 'ollama' && hasApiKeyUpdate) {
            await SecureStorageService.deleteAIProviderCredential(
              id,
              updates.type as AIProviderType,
            );
          }

          if (hasApiKeyUpdate) {
            // Remove an empty API key from config before storing in database
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { apiKey, ...configWithoutKey } = config;

            updates.config = JSON.stringify(configWithoutKey);
          } else {
            updates.config = JSON.stringify(config);
          }
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
      await MainDatabaseService.setActiveProvider(parseInt(id, 10));

      // Fire-and-forget: refresh context window cache for the newly active provider
      const provider = await MainDatabaseService.getProvider(parseInt(id, 10));
      if (provider) {
        const config =
          typeof provider.config === 'string'
            ? JSON.parse(provider.config)
            : provider.config || {};
        const apiKey =
          provider.type !== 'ollama' || isRemoteOllamaUrl(config.baseUrl)
            ? await SecureStorageService.getAIProviderCredential(
                provider.id!,
                provider.type as AIProviderType,
              )
            : undefined;
        fetchAndCacheContextWindows({
          providerType: provider.type as
            | 'openai'
            | 'anthropic'
            | 'gemini'
            | 'ollama',
          apiKey: apiKey ?? undefined,
        }).catch(() => {
          // silently ignored — fallback table is always available
        });
      }
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
    // eslint-disable-next-line no-console
    console.log(
      '[PROVIDER MANAGER] testTemporaryProvider called for type:',
      config.type,
    );

    try {
      const startTime = Date.now();

      // Parse the provider config
      const parsedConfig =
        typeof config.config === 'string'
          ? JSON.parse(config.config)
          : config.config || {};

      const apiKey = credentials.apiKey || parsedConfig.apiKey;

      // Test DIRECTLY without touching the database at all
      let model: any;
      let discoveredModels: any[] = [];

      if (config.type === 'ollama') {
        if (isHostedOllamaCloudUrl(parsedConfig.baseUrl) && !apiKey) {
          return {
            success: false,
            error: 'No API key provided for hosted Ollama provider',
          };
        }

        const { createOllama } = await import('ai-sdk-ollama');
        const baseURL = normalizeOllamaBaseUrl(parsedConfig.baseUrl);
        discoveredModels = await this.fetchOllamaModels(
          parsedConfig.baseUrl,
          apiKey,
        );
        const ollama = createOllama({
          baseURL,
          ...(shouldAttachOllamaAuth(baseURL, apiKey)
            ? { headers: buildOllamaHeaders(apiKey) }
            : {}),
        });
        const modelId = await this.fetchFirstOllamaModel(
          parsedConfig.baseUrl,
          apiKey,
        );
        model = ollama(modelId);
      } else {
        if (!apiKey) {
          return {
            success: false,
            error: `No API key provided for ${config.type} provider`,
          };
        }

        switch (config.type) {
          case 'openai': {
            const { createOpenAI } = await import('@ai-sdk/openai');
            const modelId = await this.fetchFirstOpenAIModel(apiKey);
            discoveredModels = await this.fetchOpenAIModels(apiKey);
            model = createOpenAI({ apiKey })(modelId);
            break;
          }
          case 'anthropic': {
            const { createAnthropic } = await import('@ai-sdk/anthropic');
            discoveredModels = await this.fetchAnthropicModels();
            model = createAnthropic({ apiKey })('claude-sonnet-4-6');
            break;
          }
          case 'gemini': {
            const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
            const modelId = await this.fetchFirstGeminiModel(apiKey);
            discoveredModels = await this.fetchGeminiModels(apiKey);
            // eslint-disable-next-line no-console
            console.log(
              '[PROVIDER MANAGER] testTemporaryProvider - Using Gemini model:',
              modelId,
            );
            model = createGoogleGenerativeAI({ apiKey })(modelId);
            break;
          }
          default:
            return {
              success: false,
              error: `Unsupported provider type: ${config.type}`,
            };
        }
      }

      await generateText({
        model,
        prompt: 'Say "test successful" if you can read this.',
      });

      const latencyMs = Date.now() - startTime;
      // eslint-disable-next-line no-console
      console.log(
        '[PROVIDER MANAGER] testTemporaryProvider - Test successful! Latency:',
        latencyMs,
        'ms',
      );

      return {
        success: true,
        message: 'Provider test successful',
        latencyMs,
        models: discoveredModels,
        modelsAvailable: discoveredModels.length,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[PROVIDER MANAGER] testTemporaryProvider - Test failed:',
        error,
      );
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private static async fetchFirstOpenAIModel(apiKey: string): Promise<string> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      const gptModels = data.data
        .filter(
          (m: any) =>
            m.id.startsWith('gpt-') ||
            m.id.startsWith('o1-') ||
            m.id.startsWith('o3-'),
        )
        .sort((a: any, b: any) => b.id.localeCompare(a.id));
      return gptModels[0]?.id || 'gpt-4o';
    } catch {
      return 'gpt-4o';
    }
  }

  private static async fetchFirstGeminiModel(apiKey: string): Promise<string> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      );
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      const models = data.models
        .filter(
          (m: any) =>
            m.supportedGenerationMethods?.includes('generateContent') &&
            m.name.includes('gemini'),
        )
        .sort((a: any, b: any) => b.name.localeCompare(a.name));
      return models[0]?.name.split('/').pop() || 'gemini-2.5-flash';
    } catch {
      return 'gemini-2.5-flash';
    }
  }

  private static async fetchFirstOllamaModel(
    baseUrl?: string,
    apiKey?: string | null,
  ): Promise<string> {
    try {
      const response = await fetch(buildOllamaTagsUrl(baseUrl), {
        headers: shouldAttachOllamaAuth(baseUrl, apiKey)
          ? buildOllamaHeaders(apiKey)
          : undefined,
      });
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      return data.models?.[0]?.name || 'llama3.2';
    } catch {
      return 'llama3.2';
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

      // Parse config
      const config =
        typeof provider.config === 'string'
          ? JSON.parse(provider.config)
          : provider.config || {};

      // Get API key from secure storage
      let apiKey: string | null = null;
      if (
        this.providerRequiresApiKey(provider.type, config) ||
        (provider.type === 'ollama' && isRemoteOllamaUrl(config.baseUrl))
      ) {
        apiKey = await SecureStorageService.getAIProviderCredential(
          provider.id!,
          provider.type as AIProviderType,
        );
      }

      if (
        provider.type === 'ollama' &&
        isHostedOllamaCloudUrl(config.baseUrl)
      ) {
        if (!apiKey) {
          return [];
        }
      }

      // Fetch models from provider APIs
      switch (provider.type) {
        case 'openai':
          return await this.fetchOpenAIModels(apiKey || undefined);
        case 'anthropic':
          return await this.fetchAnthropicModels();
        case 'gemini':
          return await this.fetchGeminiModels(apiKey || undefined);
        case 'ollama':
          return await this.fetchOllamaModels(config.baseUrl, apiKey);
        default:
          return [];
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`=== Failed to get models for provider ${providerId} ===`);
      // eslint-disable-next-line no-console
      console.error('Error details:', error);
      return [];
    }
  }

  private static async fetchOpenAIModels(apiKey?: string): Promise<any[]> {
    try {
      if (!apiKey) return [];

      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();

      // Filter for GPT models and sort by ID
      const gptModels = data.data
        .filter(
          (model: any) =>
            model.id.startsWith('gpt-') ||
            model.id.startsWith('o1-') ||
            model.id.startsWith('o3-'),
        )
        .map((model: any) => ({
          id: model.id,
          name: model.id,
          supportsStreaming: true,
        }))
        .sort((a: any, b: any) => b.id.localeCompare(a.id));

      return gptModels;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch OpenAI models:', error);
      // Return fallback models
      return [
        { id: 'gpt-4.1', name: 'GPT-4.1', supportsStreaming: true },
        { id: 'gpt-4o', name: 'GPT-4o', supportsStreaming: true },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', supportsStreaming: true },
      ];
    }
  }

  private static async fetchAnthropicModels(): Promise<any[]> {
    // Anthropic doesn't have a public models API endpoint
    // Return known models
    return [
      {
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        supportsStreaming: true,
      },
      {
        id: 'claude-4.1-sonnet-20250815',
        name: 'Claude 4.1 Sonnet',
        supportsStreaming: true,
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        supportsStreaming: true,
      },
    ];
  }

  private static async fetchGeminiModels(apiKey?: string): Promise<any[]> {
    try {
      if (!apiKey) return [];

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`);
      }

      const data = await response.json();

      // Filter for generateContent-capable models
      const geminiModels = data.models
        .filter(
          (model: any) =>
            model.supportedGenerationMethods?.includes('generateContent') &&
            model.name.includes('gemini'),
        )
        .map((model: any) => {
          // Extract model ID from name (e.g., "models/gemini-2.5-flash" -> "gemini-2.5-flash")
          const modelId = model.name.split('/').pop();
          return {
            id: modelId,
            name: model.displayName || modelId,
            description: model.description,
            supportsStreaming: true,
          };
        })
        .sort((a: any, b: any) => b.id.localeCompare(a.id));

      return geminiModels;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch Gemini models:', error);
      // Return fallback models
      return [
        {
          id: 'gemini-2.5-flash',
          name: 'Gemini 2.5 Flash',
          supportsStreaming: true,
        },
        {
          id: 'gemini-2.5-pro',
          name: 'Gemini 2.5 Pro',
          supportsStreaming: true,
        },
        {
          id: 'gemini-2.0-flash',
          name: 'Gemini 2.0 Flash',
          supportsStreaming: true,
        },
      ];
    }
  }

  private static async fetchOllamaModels(
    baseUrl?: string,
    apiKey?: string | null,
  ): Promise<any[]> {
    try {
      const response = await fetch(buildOllamaTagsUrl(baseUrl), {
        headers: shouldAttachOllamaAuth(baseUrl, apiKey)
          ? buildOllamaHeaders(apiKey)
          : undefined,
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();

      return data.models.map((model: any) => ({
        id: model.name,
        name: model.name,
        description: `Size: ${(model.size / 1024 / 1024 / 1024).toFixed(1)}GB`,
        supportsStreaming: true,
      }));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch Ollama models:', error);
      // Return fallback models
      return [
        { id: 'llama3.2', name: 'Llama 3.2', supportsStreaming: true },
        { id: 'llama2', name: 'Llama 2', supportsStreaming: true },
        { id: 'mistral', name: 'Mistral', supportsStreaming: true },
      ];
    }
  }

  static async testProvider(providerId: string): Promise<ProviderTestResult> {
    // eslint-disable-next-line no-console
    console.log('[PROVIDER MANAGER] testProvider called with ID:', providerId);

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

      // eslint-disable-next-line no-console
      console.log('[PROVIDER MANAGER] testProvider - Provider loaded:', {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        configType: typeof provider.config,
        configPreview:
          typeof provider.config === 'string'
            ? provider.config.substring(0, 100)
            : JSON.stringify(provider.config).substring(0, 100),
      });

      const providerConfig =
        typeof provider.config === 'string'
          ? JSON.parse(provider.config)
          : provider.config || {};

      // Get provider credentials from secure storage (only for providers that need API keys)
      let apiKey;

      if (
        this.providerRequiresApiKey(provider.type, providerConfig) ||
        (provider.type === 'ollama' &&
          isRemoteOllamaUrl(providerConfig.baseUrl))
      ) {
        // Get credentials from secure storage
        apiKey = await SecureStorageService.getAIProviderCredential(
          provider.id!,
          provider.type as AIProviderType,
        );

        if (!apiKey && provider.type !== 'ollama') {
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

        if (
          !apiKey &&
          this.providerRequiresApiKey(provider.type, providerConfig)
        ) {
          // eslint-disable-next-line no-console
          console.error(
            `[PROVIDER MANAGER] testProvider - No API key found for provider ${provider.type}`,
          );
          return {
            success: false,
            error: `No API key configured for ${provider.type} provider`,
          };
        }

        if (apiKey) {
          // eslint-disable-next-line no-console
          console.log(
            '[PROVIDER MANAGER] testProvider - API key found, length:',
            apiKey.length,
          );
        }
      }

      // Test the connection using AI SDK v6
      try {
        const startTime = Date.now();

        // Temporarily set as active to test
        const previousActive = await MainDatabaseService.getActiveProvider();
        // eslint-disable-next-line no-console
        console.log(
          '[PROVIDER MANAGER] testProvider - Previous active provider:',
          previousActive?.id,
        );

        await MainDatabaseService.setActiveProvider(provider.id!);
        // eslint-disable-next-line no-console
        console.log(
          '[PROVIDER MANAGER] testProvider - Set provider as active:',
          provider.id,
        );

        try {
          // Test with a simple completion
          // eslint-disable-next-line no-console
          console.log(
            '[PROVIDER MANAGER] testProvider - Getting Vercel model...',
          );
          const model = await getVercelModel();
          // eslint-disable-next-line no-console
          console.log(
            '[PROVIDER MANAGER] testProvider - Model obtained, calling generateText...',
          );

          await generateText({
            model: model as any,
            prompt: 'Say "test successful" if you can read this.',
          });

          const latencyMs = Date.now() - startTime;
          // eslint-disable-next-line no-console
          console.log(
            '[PROVIDER MANAGER] testProvider - Test successful! Latency:',
            latencyMs,
            'ms',
          );

          // Restore previous active provider
          if (previousActive) {
            await MainDatabaseService.setActiveProvider(previousActive.id!);
            // eslint-disable-next-line no-console
            console.log(
              '[PROVIDER MANAGER] testProvider - Restored previous active provider:',
              previousActive.id,
            );
          }

          return {
            success: true,
            message: 'Provider test successful',
            latencyMs,
            models: [],
            modelsAvailable: 0,
          };
        } catch (testError) {
          // eslint-disable-next-line no-console
          console.error(
            '[PROVIDER MANAGER] testProvider - generateText failed:',
            testError,
          );

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
      gemini: 'gemini-2.5-flash',
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

      const providerConfig =
        typeof provider.config === 'string'
          ? JSON.parse(provider.config)
          : provider.config || {};

      // Get provider credentials (if needed)
      let apiKey;

      if (
        this.providerRequiresApiKey(provider.type, providerConfig) ||
        (provider.type === 'ollama' &&
          isRemoteOllamaUrl(providerConfig.baseUrl))
      ) {
        apiKey = await SecureStorageService.getAIProviderCredential(
          provider.id!,
          provider.type as AIProviderType,
        );

        if (
          !apiKey &&
          this.providerRequiresApiKey(provider.type, providerConfig)
        ) {
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
}
export default AIProviderManager;
