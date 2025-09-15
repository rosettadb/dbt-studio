import { OpenAI } from 'openai';
import { BaseAIProvider } from './base.provider';
import {
  AIProviderType,
  ProviderCapabilities,
  ProviderTestResult,
  AIModel,
  CostEstimate,
  AIProviderConfig,
} from '../types/provider.types';
import {
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  EnhanceModelResponseType,
  GenerateDashboardResponseType,
} from '../types/completion.types';

/**
 * OpenAI provider implementation that wraps the existing OpenAI service
 * Maintains 100% backward compatibility with existing AI features
 */
export class OpenAIProvider extends BaseAIProvider {
  readonly name = 'OpenAI';

  readonly type: AIProviderType = 'openai';

  readonly supportedModels: string[] = []; // Dynamic models - populated during initialization

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    imageInput: true,
    maxTokens: 4096,
    contextWindow: 128000,
  };

  private config?: AIProviderConfig;

  private directOpenAIClient?: OpenAI;

  async initialize(config: AIProviderConfig): Promise<void> {
    try {
      this.config = config;

      // Use API key from config if provided
      const { apiKey } = config;
      if (!apiKey) {
        throw new Error(
          'OpenAI API key not found in configuration. Please provide API key.',
        );
      }

      // Create direct OpenAI client for generic completions and testing
      this.directOpenAIClient = new OpenAI({
        apiKey,
      });

      // Discover available models dynamically
      await this.discoverModels();

      // Note: OpenAI service will be created lazily when needed for backward compatibility
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[OPENAI PROVIDER] initialize - Initialization failed:',
        error,
      );
      throw this.handleProviderError(error, 'initialization');
    }
  }

  async testConnection(): Promise<ProviderTestResult> {
    const startTime = Date.now();

    try {
      if (!this.directOpenAIClient) {
        throw new Error('Provider not initialized. Call initialize() first.');
      }

      // Actually test the API connection by making a real API call
      // Use the models endpoint which is lightweight and validates the API key
      try {
        const modelsResponse = await this.directOpenAIClient.models.list();

        // Filter for chat/completion models
        const chatModels = modelsResponse.data
          .filter((model) => {
            const id = model.id.toLowerCase();
            return (
              id.includes('gpt') &&
              !id.includes('instruct') &&
              !id.includes('embedding') &&
              !id.includes('whisper') &&
              !id.includes('tts') &&
              !id.includes('dall-e') &&
              !id.includes('moderation') &&
              !id.includes('babbage') &&
              !id.includes('davinci') &&
              !id.includes('curie') &&
              !id.includes('ada') &&
              !id.includes('text-') &&
              !id.includes('code-') &&
              !id.includes('edit-') &&
              !id.includes('if-') &&
              !id.includes('search-') &&
              !id.includes('similarity-') &&
              !id.includes('audio-') &&
              !id.includes('vision-') &&
              (id.startsWith('gpt-5') ||
                id.startsWith('gpt-4') ||
                id.startsWith('gpt-3.5') ||
                id === 'gpt-4o' ||
                id === 'gpt-4o-mini' ||
                id === 'gpt-5' ||
                id.includes('gpt-5')) &&
              !id.includes(':') &&
              !id.includes('ft-')
            );
          })
          .map((model) => ({
            id: model.id,
            name: OpenAIProvider.getModelDisplayName(model.id),
            maxTokens: OpenAIProvider.getModelMaxTokens(model.id),
            costPer1kTokens: OpenAIProvider.getModelCosts(model.id),
          }))
          .sort((a, b) => a.id.localeCompare(b.id));

        // If no chat models found, use fallback models
        const models =
          chatModels.length > 0 ? chatModels : await this.getAvailableModels();

        const latencyMs = Date.now() - startTime;
        return {
          success: true,
          latencyMs,
          modelsAvailable: models.length,
          models,
          message: `Connection successful - ${models.length} models available`,
        };
      } catch (apiError) {
        // If the API call fails, this is a real connection failure
        const latencyMs = Date.now() - startTime;

        // Handle specific OpenAI API errors
        if (apiError instanceof Error) {
          if (
            apiError.message.includes('401') ||
            apiError.message.includes('Incorrect API key')
          ) {
            return {
              success: false,
              error:
                'Invalid API key. Please check your OpenAI API key in settings.',
              latencyMs,
            };
          } else if (
            apiError.message.includes('429') ||
            apiError.message.includes('quota')
          ) {
            return {
              success: false,
              error:
                'API quota exceeded. Please check your OpenAI billing or try again later.',
              latencyMs,
            };
          } else if (apiError.message.includes('timeout')) {
            return {
              success: false,
              error:
                'Connection timeout. Please check your internet connection and try again.',
              latencyMs,
            };
          }
        }

        return {
          success: false,
          error:
            apiError instanceof Error
              ? apiError.message
              : 'API connection failed',
          latencyMs,
        };
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      // eslint-disable-next-line no-console
      console.error(
        '[OPENAI PROVIDER] testConnection - Connection test failed:',
        error,
      );

      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Connection test failed',
        latencyMs,
      };
    }
  }

  async generateCompletion(
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    try {
      OpenAIProvider.validateRequest(request);

      // For generic completions or chat, use direct OpenAI client
      return this.generateGenericCompletion(request);
    } catch (error) {
      throw this.handleProviderError(error, 'completion generation');
    }
  }

  async *streamCompletion(
    request: CompletionRequest,
  ): AsyncGenerator<CompletionChunk> {
    try {
      OpenAIProvider.validateRequest(request);

      if (!this.directOpenAIClient) {
        throw new Error('OpenAI provider not initialized');
      }

      // For now, we'll implement streaming as a single chunk
      // This can be enhanced later with actual streaming support
      const response = await this.generateCompletion({
        ...request,
        stream: false,
      });

      yield {
        content: response.content,
        done: true,
        usage: response.usage,
        metadata: response.metadata,
      };
    } catch (error) {
      throw this.handleProviderError(error, 'streaming completion');
    }
  }

  async getAvailableModels(): Promise<AIModel[]> {
    // Ensure models are discovered if not already done
    if (this.supportedModels.length === 0) {
      await this.discoverModels();
    }

    return this.supportedModels.map((modelId) => ({
      id: modelId,
      name: OpenAIProvider.getModelDisplayName(modelId),
      maxTokens: OpenAIProvider.getModelMaxTokens(modelId),
      costPer1kTokens: OpenAIProvider.getModelCosts(modelId),
    }));
  }

  // eslint-disable-next-line class-methods-use-this
  async estimateCost(request: CompletionRequest): Promise<CostEstimate> {
    const estimatedTokens = Math.ceil(request.prompt.length / 4); // Rough estimation
    const model = request.model || 'gpt-4o';
    const costs = OpenAIProvider.getModelCosts(model);

    const estimatedCost = costs
      ? (estimatedTokens / 1000) * costs.input +
        ((request.maxTokens || 100) / 1000) * costs.output
      : 0;

    return {
      estimatedTokens,
      estimatedCost,
      currency: 'USD',
    };
  }

  // Private helper methods

  private async discoverModels(): Promise<void> {
    try {
      // Clear existing models first to ensure fresh discovery
      (this.supportedModels as string[]).length = 0;

      if (!this.directOpenAIClient) {
        // Fallback to known working models including newest ones
        (this.supportedModels as string[]).push(
          'gpt-5', // Latest GPT-5 model
          'gpt-4o',
          'gpt-4o-mini',
          'gpt-4-turbo',
          'gpt-4',
          'gpt-3.5-turbo',
        );
        return;
      }

      const models = await this.directOpenAIClient.models.list();

      // Filter for chat/completion models (exclude embedding, moderation, etc.)
      // Use more restrictive filtering to get only main chat models
      const chatModels = models.data
        .filter((model) => {
          const id = model.id.toLowerCase();
          return (
            // Include only GPT models
            id.includes('gpt') &&
            // Exclude non-chat models
            !id.includes('instruct') && // Exclude instruct models
            !id.includes('embedding') && // Exclude embedding models
            !id.includes('whisper') && // Exclude audio models
            !id.includes('tts') && // Exclude text-to-speech models
            !id.includes('dall-e') && // Exclude image generation models
            !id.includes('moderation') && // Exclude moderation models
            !id.includes('babbage') && // Exclude legacy models
            !id.includes('davinci') && // Exclude legacy models
            !id.includes('curie') && // Exclude legacy models
            !id.includes('ada') && // Exclude legacy models
            !id.includes('text-') && // Exclude text completion models
            !id.includes('code-') && // Exclude code models
            !id.includes('edit-') && // Exclude edit models
            !id.includes('if-') && // Exclude instruction following models
            !id.includes('search-') && // Exclude search models
            !id.includes('similarity-') && // Exclude similarity models
            !id.includes('audio-') && // Exclude audio models
            !id.includes('vision-') && // Exclude vision models
            // More restrictive: only include main GPT chat model families
            (id.startsWith('gpt-5') || // Include GPT-5 models
              id.startsWith('gpt-4') ||
              id.startsWith('gpt-3.5') ||
              id === 'gpt-4o' ||
              id === 'gpt-4o-mini' ||
              id === 'gpt-5' ||
              id.includes('gpt-5')) && // Include any GPT-5 variants
            // Exclude fine-tuned personal models (they usually have additional suffixes)
            !id.includes(':') && // Exclude fine-tuned models with org:model format
            !id.includes('ft-') // Exclude explicitly fine-tuned models
          );
        })
        .map((model) => model.id)
        .sort(); // Sort alphabetically

      // Clear existing models and add filtered chat models
      (this.supportedModels as string[]).length = 0;
      (this.supportedModels as string[]).push(...chatModels);
    } catch (error) {
      // Check if this is an authentication error - if so, don't use fallback models
      if (
        error instanceof Error &&
        (error.message.includes('401') ||
          error.message.includes('Incorrect API key'))
      ) {
        // eslint-disable-next-line no-console
        console.error(
          '[OPENAI PROVIDER] Authentication failed during model discovery:',
          error,
        );
        throw error; // Re-throw authentication errors
      }

      // eslint-disable-next-line no-console
      console.warn(
        '[OPENAI PROVIDER] Dynamic model discovery failed, using fallback models:',
        error,
      );
      // Fallback to known working models including newest ones for non-auth errors
      const fallbackModels = [
        'gpt-5', // Latest GPT-5 model
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo',
      ];
      (this.supportedModels as string[]).length = 0;
      (this.supportedModels as string[]).push(...fallbackModels);
    }
  }

  private async generateGenericCompletion(
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    try {
      if (!this.directOpenAIClient) {
        // eslint-disable-next-line no-console
        console.error(
          '[OPENAI PROVIDER] generateGenericCompletion - directOpenAIClient is not available',
        );
        throw new Error('OpenAI client not properly initialized');
      }

      // Make a direct completion request using our own OpenAI client
      const response = await this.directOpenAIClient.chat.completions.create({
        model: request.model || 'gpt-4o',
        messages: [{ role: 'user', content: request.prompt }],
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature || 0.7,
      });

      const content = response.choices[0]?.message?.content || '';
      const { usage } = response;

      return {
        content,
        usage: {
          promptTokens: usage?.prompt_tokens || 0,
          completionTokens: usage?.completion_tokens || 0,
          totalTokens: usage?.total_tokens || 0,
        },
        model: request.model || 'gpt-4o',
        providerId: this.type,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[OPENAI PROVIDER] generateGenericCompletion - Error:',
        error,
      );
      throw new Error(
        `Failed to generate completion: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private adaptEnhanceModelResponse(
    result: EnhanceModelResponseType,
    request: CompletionRequest,
  ): CompletionResponse {
    return {
      content: result.content,
      usage: (this.constructor as typeof BaseAIProvider).createUsageStats(
        Math.ceil(request.prompt.length / 4),
        Math.ceil(result.content.length / 4),
      ),
      model: request.model || 'gpt-4o',
      providerId: this.type,
      data: result, // Maintain exact backward compatibility
    };
  }

  private adaptDashboardResponse(
    result: GenerateDashboardResponseType[],
    request: CompletionRequest,
  ): CompletionResponse {
    const content = JSON.stringify(result, null, 2);

    return {
      content,
      usage: (this.constructor as typeof BaseAIProvider).createUsageStats(
        Math.ceil(request.prompt.length / 4),
        Math.ceil(content.length / 4),
      ),
      model: request.model || 'gpt-4o',
      providerId: this.type,
      data: result, // Maintain exact backward compatibility
    };
  }

  private static getModelDisplayName(modelId: string): string {
    const displayNames: Record<string, string> = {
      'gpt-5': 'GPT-5',
      'gpt-5-turbo': 'GPT-5 Turbo',
      'gpt-4o': 'GPT-4o',
      'gpt-4o-mini': 'GPT-4o Mini',
      'gpt-4-turbo': 'GPT-4 Turbo',
      'gpt-4': 'GPT-4',
      'gpt-3.5-turbo': 'GPT-3.5 Turbo',
    };

    // For unknown models, create a display name from the model ID
    if (!displayNames[modelId]) {
      return modelId
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }

    return displayNames[modelId];
  }

  private static getModelMaxTokens(modelId: string): number {
    const maxTokens: Record<string, number> = {
      'gpt-5': 8192,
      'gpt-4o': 4096,
      'gpt-4o-mini': 16384,
      'gpt-4-turbo': 4096,
      'gpt-4': 8192,
      'gpt-3.5-turbo': 4096,
    };

    // For unknown models, try to infer from model name or use safe default
    if (!maxTokens[modelId]) {
      if (modelId.includes('mini')) return 16384;
      if (modelId.includes('turbo')) return 4096;
      if (modelId.includes('gpt-5')) return 8192;
      if (modelId.includes('gpt-4')) return 8192;
      if (modelId.includes('gpt-3.5')) return 4096;
      return 4096; // Safe default for most chat models
    }

    return maxTokens[modelId];
  }

  private static getModelCosts(modelId: string) {
    const costs: Record<string, { input: number; output: number }> = {
      'gpt-5': { input: 0.05, output: 0.15 }, // Estimated costs for GPT-5
      'gpt-4o': { input: 0.005, output: 0.015 },
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
    };

    // For unknown models, try to infer costs from model family or return undefined
    if (!costs[modelId]) {
      if (modelId.includes('mini')) return { input: 0.00015, output: 0.0006 };
      if (modelId.includes('turbo')) return { input: 0.0015, output: 0.002 };
      if (modelId.includes('gpt-5')) return { input: 0.05, output: 0.15 }; // Estimated costs
      if (modelId.includes('gpt-4')) return { input: 0.03, output: 0.06 };
      if (modelId.includes('gpt-3.5')) return { input: 0.0015, output: 0.002 };
      return undefined; // Unknown model - no cost information available
    }

    return costs[modelId];
  }

  // Backward compatibility methods - implement natively using direct OpenAI client
  async generateDashboardsQuery(
    prompt: string,
  ): Promise<GenerateDashboardResponseType[]> {
    try {
      if (!this.directOpenAIClient) {
        throw new Error('OpenAI provider not initialized');
      }

      const response = await this.directOpenAIClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.0,
        tools: [
          {
            type: 'function',
            function: {
              name: 'suggestDashboard',
              description:
                'Suggests multiple dashboards based on a dbt model and provides a related SQL query for each.',
              parameters: {
                type: 'object',
                properties: {
                  dashboards: {
                    type: 'array',
                    description: 'List of suggested dashboards',
                    items: {
                      type: 'object',
                      properties: {
                        description: {
                          type: 'string',
                          description:
                            'A human-readable dashboard description based on the dbt model',
                        },
                        query: {
                          type: 'string',
                          description:
                            'A useful SQL query or dbt select statement for that dashboard',
                        },
                      },
                      required: ['description', 'query'],
                    },
                  },
                },
                required: ['dashboards'],
              },
            },
          },
        ],
        tool_choice: {
          type: 'function',
          function: { name: 'suggestDashboard' },
        },
      });

      const toolCall = response.choices[0].message.tool_calls?.[0];
      const parsed = JSON.parse(toolCall?.function.arguments || '{}');
      return parsed.dashboards || [];
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[OPENAI PROVIDER] generateDashboardsQuery failed:', error);
      throw this.handleProviderError(error, 'dashboard generation');
    }
  }

  async enhanceModelQuery(prompt: string): Promise<EnhanceModelResponseType> {
    try {
      if (!this.directOpenAIClient) {
        throw new Error('OpenAI provider not initialized');
      }

      const response = await this.directOpenAIClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.0,
        tools: [
          {
            type: 'function',
            function: {
              name: 'enhanceSqlModel',
              description:
                'Replaces placeholders in a dbt model with real column names.',
              parameters: {
                type: 'object',
                properties: {
                  content: {
                    type: 'string',
                    description:
                      'The updated SQL with placeholders replaced appropriately',
                  },
                },
                required: ['content'],
              },
            },
          },
        ],
        tool_choice: {
          type: 'function',
          function: { name: 'enhanceSqlModel' },
        },
      });

      const toolCall = response.choices[0].message.tool_calls?.[0];
      const parsed = JSON.parse(toolCall?.function.arguments || '{}');
      return { content: parsed.content };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[OPENAI PROVIDER] enhanceModelQuery failed:', error);
      throw this.handleProviderError(error, 'model enhancement');
    }
  }
}
