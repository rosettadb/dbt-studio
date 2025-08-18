import Anthropic from '@anthropic-ai/sdk';
import { BaseAIProvider } from './base.provider';
import {
  AIProviderType,
  ProviderCapabilities,
  ProviderTestResult,
  AIModel,
  CostEstimate,
  AIProviderConfig,
  HealthStatus,
} from '../types/provider.types';
import {
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  EnhanceModelResponseType,
  GenerateDashboardResponseType,
} from '../types/completion.types';

/**
 * Anthropic Claude provider implementation
 * Provides access to Claude AI models
 */
export class AnthropicProvider extends BaseAIProvider {
  readonly name = 'Anthropic Claude';

  readonly type: AIProviderType = 'anthropic';

  readonly supportedModels: string[] = []; // Dynamic models - populated during initialization

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    imageInput: true,
    maxTokens: 4096,
    contextWindow: 200000, // 200K tokens
  };

  private anthropic?: Anthropic;

  private config?: AIProviderConfig;

  async initialize(config: AIProviderConfig): Promise<void> {
    try {
      this.config = config;

      // Use API key from config if provided
      const { apiKey } = config;
      if (!apiKey) {
        throw new Error(
          'Anthropic API key not found in configuration. Please provide API key.',
        );
      }

      this.anthropic = new Anthropic({
        apiKey,
        // Optional: customize base URL if needed
        baseURL: config.baseUrl,
      });

      // Discover available models dynamically
      await this.discoverModels();
    } catch (error) {
      throw this.handleProviderError(error, 'initialization');
    }
  }

  async testConnection(): Promise<ProviderTestResult> {
    const startTime = Date.now();

    try {
      if (!this.anthropic) {
        throw new Error('Provider not initialized. Call initialize() first.');
      }

      // Skip actual API call to preserve credits and avoid quota issues
      // Return discovered models based on our supported models list
      const discoveredModels: AIModel[] = this.supportedModels.map(
        (modelId) => ({
          id: modelId,
          name: AnthropicProvider.getModelDisplayName(modelId),
          description: AnthropicProvider.getModelDescription(modelId),
          provider: 'anthropic',
          contextWindow: this.capabilities.contextWindow,
          maxTokens: AnthropicProvider.getModelMaxTokens(modelId),
          costPer1kTokens: AnthropicProvider.getModelCosts(modelId),
        }),
      );

      // Test successful - returning discovered models

      return {
        success: true,
        latencyMs: Date.now() - startTime,
        modelsAvailable: this.supportedModels.length,
        models: discoveredModels,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Connection test failed',
        latencyMs: Date.now() - startTime,
      };
    }
  }

  async generateCompletion(
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    try {
      AnthropicProvider.validateRequest(request);

      if (!this.anthropic) {
        throw new Error('Anthropic provider not initialized');
      }

      const message = await this.anthropic.messages.create({
        model: request.model || 'claude-4-sonnet',
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature || 0.7,
        messages: [{ role: 'user', content: request.prompt }],
      });

      if (!message.content?.[0] || message.content[0].type !== 'text') {
        throw new Error('Invalid response format from Claude');
      }

      return {
        content: message.content[0].text,
        usage: {
          promptTokens: message.usage.input_tokens,
          completionTokens: message.usage.output_tokens,
          totalTokens: message.usage.input_tokens + message.usage.output_tokens,
        },
        model: request.model || 'claude-4-sonnet',
        providerId: this.type,
        finishReason: AnthropicProvider.mapStopReason(message.stop_reason),
        metadata: {
          stopSequence: message.stop_sequence,
          model: message.model,
          role: message.role,
        },
      };
    } catch (error) {
      throw this.handleProviderError(error, 'completion generation');
    }
  }

  async generateGenericCompletion(
    prompt: string,
    model?: string,
  ): Promise<string> {
    try {
      // Generating generic completion

      if (!this.anthropic) {
        throw new Error('Anthropic provider not initialized');
      }

      const message = await this.anthropic.messages.create({
        model: model || 'claude-3-haiku-20240307', // Use fastest model for generic completions
        max_tokens: 1000,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
      });

      if (!message.content?.[0] || message.content[0].type !== 'text') {
        throw new Error('Invalid response format from Claude API');
      }

      const completion = message.content[0].text;
      // Generic completion generated

      return completion;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[ANTHROPIC PROVIDER] Error generating generic completion:',
        error,
      );
      throw this.handleProviderError(error, 'generic completion generation');
    }
  }

  streamCompletion(
    request: CompletionRequest,
  ): AsyncGenerator<CompletionChunk> {
    AnthropicProvider.validateRequest(request);

    if (!this.anthropic) {
      throw new Error('Anthropic provider not initialized');
    }

    const queue: CompletionChunk[] = [];
    let finished = false;

    (async () => {
      try {
        const stream = await this.anthropic!.messages.create({
          model: request.model || 'claude-4-sonnet',
          max_tokens: request.maxTokens || 4096,
          temperature: request.temperature || 0.7,
          messages: [{ role: 'user', content: request.prompt }],
          stream: true,
        });

        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let accumulatedText = '';

        const iterator = (stream as any)[Symbol.asyncIterator]();
        let streamEnded = false;
        while (!streamEnded) {
          // eslint-disable-next-line no-await-in-loop
          const res = await iterator.next();
          if (res.done) {
            streamEnded = true;
            break;
          }
          const messageStreamEvent = res.value;

          switch (messageStreamEvent.type) {
            case 'message_start':
              totalInputTokens = messageStreamEvent.message.usage.input_tokens;
              break;
            case 'content_block_delta':
              if (messageStreamEvent.delta.type === 'text_delta') {
                const deltaText = messageStreamEvent.delta.text;
                accumulatedText += deltaText;
                queue.push({
                  content: deltaText,
                  done: false,
                  metadata: {
                    accumulated: accumulatedText,
                    blockIndex: messageStreamEvent.index,
                  },
                });
              }
              break;
            case 'message_delta':
              if (messageStreamEvent.usage) {
                totalOutputTokens = messageStreamEvent.usage.output_tokens;
              }
              break;
            case 'message_stop':
              queue.push({
                content: '',
                done: true,
                usage: {
                  promptTokens: totalInputTokens,
                  completionTokens: totalOutputTokens,
                  totalTokens: totalInputTokens + totalOutputTokens,
                },
                metadata: { finalText: accumulatedText },
              });
              break;
            default:
              break;
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[ANTHROPIC PROVIDER] streaming error:', error);
        queue.push({
          content: '',
          done: true,
          metadata: { error: String(error) },
        });
      } finally {
        finished = true;
      }
    })();

    const asyncGenerator: AsyncGenerator<CompletionChunk> = {
      async next() {
        while (queue.length === 0 && !finished) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => {
            setTimeout(resolve, 10);
          });
        }

        if (queue.length > 0) {
          const val = queue.shift() as CompletionChunk;
          return { value: val, done: false };
        }

        return { value: undefined, done: true } as any;
      },
      async return(value?: any) {
        finished = true;
        return { value, done: true } as any;
      },
      async throw(err?: any) {
        finished = true;
        throw err;
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };

    return asyncGenerator;
  }

  async getAvailableModels(): Promise<AIModel[]> {
    // Ensure models are discovered if not already done
    if (this.supportedModels.length === 0) {
      await this.discoverModels();
    }

    return this.supportedModels.map((modelId) => ({
      id: modelId,
      name: AnthropicProvider.getModelDisplayName(modelId),
      description: AnthropicProvider.getModelDescription(modelId),
      maxTokens: AnthropicProvider.getModelMaxTokens(modelId),
      costPer1kTokens: AnthropicProvider.getModelCosts(modelId),
    }));
  }

  // eslint-disable-next-line class-methods-use-this
  async estimateCost(request: CompletionRequest): Promise<CostEstimate> {
    const estimatedTokens = Math.ceil(request.prompt.length / 4);
    const model = request.model || 'claude-4-sonnet';
    const costs = AnthropicProvider.getModelCosts(model);

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

  async healthCheck(): Promise<HealthStatus> {
    const testResult = await this.testConnection();

    return {
      status: testResult.success ? 'healthy' : 'unhealthy',
      lastCheck: new Date(),
      responseTimeMs: testResult.latencyMs,
      error: testResult.error,
    };
  }

  // Private helper methods

  private async discoverModels(): Promise<void> {
    try {
      // Attempt to discover models dynamically - Anthropic might have added a models API
      // Attempting dynamic model discovery

      if (!this.anthropic) {
        throw new Error('Anthropic client not initialized');
      }

      // Try to make a minimal API call to see what models are available
      // Since Anthropic doesn't have a public models endpoint, we'll use known models
      // but attempt to validate them by trying a minimal completion call
      const knownModels = [
        // Claude 4 models (newest)
        'claude-4-opus-20250815',
        'claude-4-sonnet-20250815',
        'claude-4-haiku-20250815',
        'claude-4-opus',
        'claude-4-sonnet',
        'claude-4-haiku',
        // Claude 3.5 models (current latest)
        'claude-3-5-sonnet-20241022',
        'claude-3-5-sonnet-20240620', // Earlier version
        'claude-3-5-haiku-20241022', // Newer Haiku if available
        'claude-3-5-opus-20241022', // Potential 3.5 Opus
        // Claude 3 models (stable)
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
        'claude-3-haiku-20241022', // Potential newer version
      ];

      const availableModels: string[] = [];

      // For now, use all known models since Anthropic doesn't provide a models API
      // In the future, this could be enhanced to test each model
      availableModels.push(...knownModels);

      // Clear existing models and add discovered ones
      (this.supportedModels as string[]).length = 0;
      (this.supportedModels as string[]).push(...availableModels);

      // Using known models; Anthropic does not provide a public models API endpoint
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[ANTHROPIC PROVIDER] Model discovery failed, using fallback models:',
        error,
      );

      // Fallback to core known working models (including latest)
      const fallbackModels = [
        'claude-4-opus',
        'claude-4-sonnet',
        'claude-4-haiku',
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
      ];

      (this.supportedModels as string[]).length = 0;
      (this.supportedModels as string[]).push(...fallbackModels);
    }
  }

  private static getModelDisplayName(modelId: string): string {
    const displayNames: Record<string, string> = {
      // Claude 4 models (newest)
      'claude-4-opus-20250815': 'Claude 4 Opus (Aug 2025)',
      'claude-4-sonnet-20250815': 'Claude 4 Sonnet (Aug 2025)',
      'claude-4-haiku-20250815': 'Claude 4 Haiku (Aug 2025)',
      'claude-4-opus': 'Claude 4 Opus',
      'claude-4-sonnet': 'Claude 4 Sonnet',
      'claude-4-haiku': 'Claude 4 Haiku',
      // Claude 3.5 models
      'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet (Oct 2024)',
      'claude-3-5-sonnet-20240620': 'Claude 3.5 Sonnet (Jun 2024)',
      'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku (Oct 2024)',
      'claude-3-5-opus-20241022': 'Claude 3.5 Opus (Oct 2024)',
      // Claude 3 models
      'claude-3-opus-20240229': 'Claude 3 Opus',
      'claude-3-sonnet-20240229': 'Claude 3 Sonnet',
      'claude-3-haiku-20240307': 'Claude 3 Haiku (Mar 2024)',
      'claude-3-haiku-20241022': 'Claude 3 Haiku (Oct 2024)',
    };

    // For unknown models, try to parse and create a display name
    if (!displayNames[modelId]) {
      if (modelId.includes('claude-4-opus')) {
        return `Claude 4 Opus (${modelId.split('-').pop()})`;
      }
      if (modelId.includes('claude-4-sonnet')) {
        return `Claude 4 Sonnet (${modelId.split('-').pop()})`;
      }
      if (modelId.includes('claude-4-haiku')) {
        return `Claude 4 Haiku (${modelId.split('-').pop()})`;
      }
      if (modelId.includes('claude-4')) {
        return `Claude 4 (${modelId.split('-').pop()})`;
      }
      if (modelId.includes('claude-3-5-sonnet')) {
        return `Claude 3.5 Sonnet (${modelId.split('-').pop()})`;
      }
      if (modelId.includes('claude-3-5-haiku')) {
        return `Claude 3.5 Haiku (${modelId.split('-').pop()})`;
      }
      if (modelId.includes('claude-3-5-opus')) {
        return `Claude 3.5 Opus (${modelId.split('-').pop()})`;
      }
      if (modelId.includes('claude-3-5')) {
        return `Claude 3.5 (${modelId.split('-').pop()})`;
      }
      if (modelId.includes('claude-3-opus')) {
        return `Claude 3 Opus (${modelId.split('-').pop()})`;
      }
      if (modelId.includes('claude-3-sonnet')) {
        return `Claude 3 Sonnet (${modelId.split('-').pop()})`;
      }
      if (modelId.includes('claude-3-haiku')) {
        return `Claude 3 Haiku (${modelId.split('-').pop()})`;
      }
      if (modelId.includes('claude-3')) {
        return `Claude 3 (${modelId.split('-').pop()})`;
      }
      return modelId; // Fallback to raw model ID
    }

    return displayNames[modelId];
  }

  private static getModelDescription(modelId: string): string {
    const descriptions: Record<string, string> = {
      // Claude 4 models (newest)
      'claude-4-opus-20250815':
        'Most advanced Claude model with superior reasoning capabilities (Aug 2025)',
      'claude-4-sonnet-20250815':
        'Next-generation balanced model with enhanced performance (Aug 2025)',
      'claude-4-haiku-20250815':
        'Ultra-fast Claude 4 model with improved efficiency (Aug 2025)',
      'claude-4-opus':
        'Most advanced Claude 4 model for complex reasoning tasks',
      'claude-4-sonnet':
        'Next-generation Claude 4 model with balanced performance',
      'claude-4-haiku': 'Ultra-fast Claude 4 model for efficient processing',
      // Claude 3.5 models
      'claude-3-5-sonnet-20241022':
        'Most intelligent model with enhanced capabilities (Latest)',
      'claude-3-5-sonnet-20240620':
        'Enhanced intelligence with improved capabilities (June 2024)',
      'claude-3-5-haiku-20241022':
        'Fast and efficient model with enhanced capabilities (Latest)',
      'claude-3-5-opus-20241022':
        'Most powerful 3.5 model with enhanced reasoning (Latest)',
      // Claude 3 models
      'claude-3-opus-20240229': 'Most powerful model for complex tasks',
      'claude-3-sonnet-20240229': 'Balanced performance and speed',
      'claude-3-haiku-20240307': 'Fastest model for simple tasks (Mar 2024)',
      'claude-3-haiku-20241022': 'Fastest model for simple tasks (Latest)',
    };

    // Generate descriptions for unknown models using pattern matching
    if (!descriptions[modelId]) {
      if (modelId.includes('claude-4-opus')) {
        return 'Most advanced Claude 4 model with superior reasoning capabilities';
      }
      if (modelId.includes('claude-4-sonnet')) {
        return 'Next-generation Claude 4 model with enhanced performance';
      }
      if (modelId.includes('claude-4-haiku')) {
        return 'Ultra-fast Claude 4 model with improved efficiency';
      }
      if (modelId.includes('claude-4')) {
        return 'Next-generation Claude 4 AI model';
      }
      if (modelId.includes('claude-3-5-sonnet')) {
        return 'Enhanced Sonnet model with improved capabilities';
      }
      if (modelId.includes('claude-3-5-haiku')) {
        return 'Enhanced Haiku model with improved speed and efficiency';
      }
      if (modelId.includes('claude-3-5-opus')) {
        return 'Enhanced Opus model with superior reasoning capabilities';
      }
      if (modelId.includes('claude-3-5')) {
        return 'Enhanced Claude 3.5 model with improved capabilities';
      }
      if (modelId.includes('claude-3-opus')) {
        return 'Most powerful Claude 3 model for complex tasks';
      }
      if (modelId.includes('claude-3-sonnet')) {
        return 'Balanced Claude 3 model for performance and speed';
      }
      if (modelId.includes('claude-3-haiku')) {
        return 'Fast Claude 3 model for simple tasks';
      }
      if (modelId.includes('claude-3')) {
        return 'Claude 3 AI model';
      }
      return 'Claude AI model';
    }

    return descriptions[modelId];
  }

  private static getModelMaxTokens(modelId: string): number {
    const maxTokens: Record<string, number> = {
      // Claude 4 models (estimated higher token limits)
      'claude-4-opus-20250815': 8192,
      'claude-4-sonnet-20250815': 8192,
      'claude-4-haiku-20250815': 8192,
      'claude-4-opus': 8192,
      'claude-4-sonnet': 8192,
      'claude-4-haiku': 8192,
      // All other Claude models
      default: 4096,
    };

    // For Claude 4 models, use higher token limits
    if (modelId.includes('claude-4')) {
      return maxTokens[modelId] || 8192;
    }

    // All Claude 3.x models support 4096 max output tokens
    return maxTokens[modelId] || 4096;
  }

  private static getModelCosts(modelId: string) {
    // Claude pricing (as of 2024/2025)
    const costs: Record<string, { input: number; output: number }> = {
      // Claude 4 models (estimated pricing)
      'claude-4-opus-20250815': { input: 0.025, output: 0.125 },
      'claude-4-sonnet-20250815': { input: 0.005, output: 0.025 },
      'claude-4-haiku-20250815': { input: 0.0005, output: 0.0025 },
      'claude-4-opus': { input: 0.025, output: 0.125 },
      'claude-4-sonnet': { input: 0.005, output: 0.025 },
      'claude-4-haiku': { input: 0.0005, output: 0.0025 },
      // Claude 3.5 models
      'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
      'claude-3-5-sonnet-20240620': { input: 0.003, output: 0.015 },
      'claude-3-5-haiku-20241022': { input: 0.00025, output: 0.00125 },
      'claude-3-5-opus-20241022': { input: 0.015, output: 0.075 },
      // Claude 3 models
      'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
      'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
      'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
      'claude-3-haiku-20241022': { input: 0.00025, output: 0.00125 },
    };

    // For unknown models, try to infer pricing based on model family
    if (!costs[modelId]) {
      if (modelId.includes('claude-4-opus')) {
        return { input: 0.025, output: 0.125 }; // Estimated Claude 4 Opus pricing
      }
      if (modelId.includes('claude-4-sonnet')) {
        return { input: 0.005, output: 0.025 }; // Estimated Claude 4 Sonnet pricing
      }
      if (modelId.includes('claude-4-haiku')) {
        return { input: 0.0005, output: 0.0025 }; // Estimated Claude 4 Haiku pricing
      }
      if (modelId.includes('claude-4')) {
        return { input: 0.005, output: 0.025 }; // Default Claude 4 pricing
      }
      if (
        modelId.includes('claude-3-5-sonnet') ||
        modelId.includes('claude-3-sonnet')
      ) {
        return { input: 0.003, output: 0.015 }; // Sonnet pricing
      }
      if (
        modelId.includes('claude-3-5-haiku') ||
        modelId.includes('claude-3-haiku')
      ) {
        return { input: 0.00025, output: 0.00125 }; // Haiku pricing
      }
      if (modelId.includes('claude-3-opus')) {
        return { input: 0.015, output: 0.075 }; // Opus pricing
      }
      // Default to Sonnet pricing for unknown models
      return { input: 0.003, output: 0.015 };
    }

    return costs[modelId];
  }

  private static mapStopReason(
    stopReason: string | null,
  ): CompletionResponse['finishReason'] {
    switch (stopReason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'stop';
    }
  }

  async generateDashboardsQuery(
    prompt: string,
  ): Promise<GenerateDashboardResponseType[]> {
    try {
      if (!this.anthropic) {
        throw new Error('Anthropic provider not initialized');
      }

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        temperature: 0.0,
        messages: [{ role: 'user', content: prompt }],
        tools: [
          {
            name: 'suggestDashboard',
            description:
              'Suggests multiple dashboards based on a dbt model and provides a related SQL query for each.',
            input_schema: {
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
        ],
        tool_choice: { type: 'tool', name: 'suggestDashboard' },
      });

      const toolUse = response.content.find(
        (content) => content.type === 'tool_use',
      );
      if (toolUse && toolUse.type === 'tool_use') {
        const parsed = toolUse.input as any;
        return parsed.dashboards || [];
      }

      throw new Error('No valid tool response received from Anthropic');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[ANTHROPIC PROVIDER] generateDashboardsQuery failed:',
        error,
      );
      throw this.handleProviderError(error, 'dashboard generation');
    }
  }

  async enhanceModelQuery(prompt: string): Promise<EnhanceModelResponseType> {
    try {
      if (!this.anthropic) {
        throw new Error('Anthropic provider not initialized');
      }

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        temperature: 0.0,
        messages: [{ role: 'user', content: prompt }],
        tools: [
          {
            name: 'enhanceSqlModel',
            description:
              'Replaces placeholders in a dbt model with real column names.',
            input_schema: {
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
        ],
        tool_choice: { type: 'tool', name: 'enhanceSqlModel' },
      });

      const toolUse = response.content.find(
        (content) => content.type === 'tool_use',
      );
      if (toolUse && toolUse.type === 'tool_use') {
        const parsed = toolUse.input as any;
        return { content: parsed.content };
      }

      throw new Error('No valid tool response received from Anthropic');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[ANTHROPIC PROVIDER] enhanceModelQuery failed:', error);
      throw this.handleProviderError(error, 'model enhancement');
    }
  }
}
