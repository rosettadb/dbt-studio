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
  JSONSchema,
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

  private cachedModels: AIModel[] = [];

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
      this.cachedModels = await this.discoverModels();

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

        const checkedAt = new Date().toISOString();

        const chatModels = modelsResponse.data
          .map((model) => model.id)
          .filter((id) => OpenAIProvider.isSupportedModelId(id))
          .map((id) => OpenAIProvider.buildModelMetadata(id, checkedAt))
          .sort((a, b) => a.id.localeCompare(b.id));

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
          }
          if (
            apiError.message.includes('429') ||
            apiError.message.includes('quota')
          ) {
            return {
              success: false,
              error:
                'API quota exceeded. Please check your OpenAI billing or try again later.',
              latencyMs,
            };
          }
          if (apiError.message.includes('timeout')) {
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

  async generateCompletion<T = any>(
    request: CompletionRequest<T>,
  ): Promise<CompletionResponse<T>> {
    try {
      OpenAIProvider.validateRequest(request);

      if (!this.directOpenAIClient) {
        throw new Error('OpenAI provider not initialized');
      }

      // Handle schema-based requests
      if (request.schemaConfig) {
        return this.generateSchemaCompletion<T>(request);
      }

      // Default generic completion
      return this.generateGenericCompletion<T>(request);
    } catch (error) {
      throw this.handleProviderError(error, 'completion generation');
    }
  }

  private async generateSchemaCompletion<T>(
    request: CompletionRequest<T>,
  ): Promise<CompletionResponse<T>> {
    if (!request.schemaConfig) {
      throw new Error('Schema config is required for schema completion');
    }

    const {
      schema,
      name = 'extract_data',
      description,
      strict = false,
    } = request.schemaConfig;

    try {
      // Use OpenAI's function calling for structured output
      const response = await this.directOpenAIClient!.chat.completions.create({
        model: request.model || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              description ||
              'Extract structured data from the user input according to the provided schema.',
          },
          { role: 'user', content: request.prompt },
        ],
        ...OpenAIProvider.getMaxTokenParam(request.model, request.maxTokens),
        ...OpenAIProvider.getTemperatureParam(
          request.model,
          request.temperature,
          0.1,
        ),
        tools: [
          {
            type: 'function',
            function: {
              name,
              description: description || 'Extract structured data',
              parameters: this.convertJSONSchemaToOpenAISchema(schema),
              ...(strict && { strict: true }), // OpenAI strict mode if supported
            },
          },
        ],
        tool_choice: {
          type: 'function',
          function: { name },
        },
      });

      const toolCall = response.choices[0].message.tool_calls?.[0];
      const content = response.choices[0].message.content || '';
      const { usage } = response;

      let parsedData: T | undefined;
      let schemaValidation: CompletionResponse<T>['schemaValidation'];

      if (toolCall?.function?.arguments) {
        try {
          const functionResult = JSON.parse(toolCall.function.arguments);

          // Validate the parsed result against schema
          const validation = this.validateDataAgainstSchema(
            functionResult,
            schema,
          );

          schemaValidation = {
            isValid: validation.isValid,
            errors: validation.errors,
            originalResponse: toolCall.function.arguments,
          };

          if (validation.isValid) {
            parsedData = functionResult as T;
          }
        } catch (parseError) {
          schemaValidation = {
            isValid: false,
            errors: [
              `Failed to parse function call result: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
            ],
            originalResponse: toolCall.function.arguments,
          };
        }
      } else {
        schemaValidation = {
          isValid: false,
          errors: ['No function call result received from OpenAI'],
          originalResponse: content,
        };
      }

      return {
        content: parsedData ? JSON.stringify(parsedData, null, 2) : content,
        usage: {
          promptTokens: usage?.prompt_tokens || 0,
          completionTokens: usage?.completion_tokens || 0,
          totalTokens: usage?.total_tokens || 0,
        },
        model: request.model || 'gpt-4o',
        providerId: this.type,
        finishReason: this.mapFinishReason(response.choices[0].finish_reason),
        parsedData,
        schemaValidation,
        metadata: {
          toolCalls: response.choices[0].message.tool_calls?.length || 0,
          functionName: name,
        },
      };
    } catch (error) {
      throw this.handleProviderError(error, 'schema completion');
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

      // Create the streaming request using the same format as generateGenericCompletion
      const openAIRequest: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming =
        {
          model: request.model || 'gpt-4o',
          messages: [{ role: 'user' as const, content: request.prompt }],
          stream: true,
          ...OpenAIProvider.getMaxTokenParam(request.model, request.maxTokens),
          ...OpenAIProvider.getTemperatureParam(
            request.model,
            request.temperature,
            0.7,
          ),
        };

      // Tools/functions support can be added later if needed

      // Create the streaming completion
      const stream =
        await this.directOpenAIClient.chat.completions.create(openAIRequest);

      let totalUsage: any = null;

      // Process the stream
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const finishReason = chunk.choices[0]?.finish_reason;

        // Handle content chunks
        if (delta?.content) {
          yield {
            content: delta.content,
            done: false,
            metadata: {
              model: chunk.model,
              finishReason: finishReason || undefined,
            },
          };
        }

        // Tool calls handling can be added later if needed

        // Handle usage information (usually in the last chunk)
        if (chunk.usage) {
          totalUsage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          };
        }

        // Check if this is the final chunk
        if (finishReason) {
          yield {
            content: '',
            done: true,
            usage: totalUsage,
            metadata: {
              model: chunk.model,
              finishReason,
            },
          };
          break;
        }
      }
    } catch (error) {
      throw this.handleProviderError(error, 'streaming completion');
    }
  }

  // Helper method to convert JSON Schema to OpenAI function schema format
  private convertJSONSchemaToOpenAISchema(schema: JSONSchema): any {
    // OpenAI uses a slightly different format, but it's mostly compatible
    const converted: any = {
      type: schema.type,
    };

    if (schema.properties) {
      converted.properties = {};
      // eslint-disable-next-line no-restricted-syntax
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        converted.properties[key] =
          this.convertJSONSchemaToOpenAISchema(propSchema);
      }
    }

    if (schema.items) {
      converted.items = this.convertJSONSchemaToOpenAISchema(schema.items);
    }

    if (schema.required) {
      converted.required = schema.required;
    }

    if (schema.description) {
      converted.description = schema.description;
    }

    if (schema.enum) {
      converted.enum = schema.enum;
    }

    // OpenAI-specific properties
    if (schema.additionalProperties !== undefined) {
      converted.additionalProperties = schema.additionalProperties;
    }

    // Number constraints
    if (schema.minimum !== undefined) converted.minimum = schema.minimum;
    if (schema.maximum !== undefined) converted.maximum = schema.maximum;

    // String constraints
    if (schema.pattern) converted.pattern = schema.pattern;

    // Array constraints
    if (schema.minItems !== undefined) converted.minItems = schema.minItems;
    if (schema.maxItems !== undefined) converted.maxItems = schema.maxItems;

    return converted;
  }

  // eslint-disable-next-line class-methods-use-this
  private mapFinishReason(
    reason: string | null,
  ): CompletionResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      case 'tool_calls':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }

  // Helper for backward compatibility
  private createLegacyResponse<T>(
    data: any,
    request: CompletionRequest<T>,
    type: string,
  ): CompletionResponse<T> {
    const content =
      typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return {
      content,
      usage: {
        promptTokens: Math.ceil(request.prompt.length / 4),
        completionTokens: Math.ceil(content.length / 4),
        totalTokens: Math.ceil((request.prompt.length + content.length) / 4),
      },
      model: request.model || 'gpt-4o',
      providerId: this.type,
      finishReason: 'stop',
      data, // Backward compatibility
      parsedData: data as T,
      metadata: { legacyType: type },
    };
  }

  private async generateGenericCompletion<T>(
    request: CompletionRequest<T>,
  ): Promise<CompletionResponse<T>> {
    const response = await this.directOpenAIClient!.chat.completions.create({
      model: request.model || 'gpt-4o',
      messages: [{ role: 'user', content: request.prompt }],
      ...OpenAIProvider.getMaxTokenParam(request.model, request.maxTokens),
      ...OpenAIProvider.getTemperatureParam(
        request.model,
        request.temperature,
        0.7,
      ),
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
      finishReason: this.mapFinishReason(response.choices[0].finish_reason),
    };
  }

  async getAvailableModels(): Promise<AIModel[]> {
    if (this.cachedModels.length === 0) {
      this.cachedModels = await this.discoverModels();
    }

    return [...this.cachedModels];
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

  private async discoverModels(): Promise<AIModel[]> {
    try {
      if (!this.directOpenAIClient) {
        return this.applyDiscoveredModels(OpenAIProvider.getFallbackModelIds());
      }

      const models = await this.directOpenAIClient.models.list();

      const discoveredIds = models.data
        .map((model) => model.id)
        .filter((id) => OpenAIProvider.isSupportedModelId(id));

      if (discoveredIds.length === 0) {
        return this.applyDiscoveredModels(OpenAIProvider.getFallbackModelIds());
      }

      return this.applyDiscoveredModels(discoveredIds);
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
      return this.applyDiscoveredModels(OpenAIProvider.getFallbackModelIds());
    }
  }

  private applyDiscoveredModels(modelIds: string[]): AIModel[] {
    const checkedAt = new Date().toISOString();
    const uniqueIds = Array.from(new Set(modelIds));
    const prioritized = (OpenAIProvider.getFallbackModelIds?.() ?? []).reduce<
      Record<string, number>
    >((acc, modelId, index) => {
      acc[modelId] = index;
      return acc;
    }, {});

    const models = uniqueIds
      .filter((id) => OpenAIProvider.isStreamingCapable(id))
      .map((id) => OpenAIProvider.buildModelMetadata(id, checkedAt))
      .sort((a, b) => {
        const priorityA = prioritized[a.id] ?? Number.MAX_SAFE_INTEGER;
        const priorityB = prioritized[b.id] ?? Number.MAX_SAFE_INTEGER;

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        return a.name.localeCompare(b.name);
      });

    (this.supportedModels as string[]).length = 0;
    (this.supportedModels as string[]).push(...models.map((model) => model.id));

    return models;
  }

  private static buildModelMetadata(
    modelId: string,
    checkedAt: string,
  ): AIModel {
    return {
      id: modelId,
      name: OpenAIProvider.getModelDisplayName(modelId),
      description: OpenAIProvider.getModelDescription(modelId),
      maxTokens: OpenAIProvider.getModelMaxTokens(modelId),
      costPer1kTokens: OpenAIProvider.getModelCosts(modelId),
      supportsStreaming: OpenAIProvider.isStreamingCapable(modelId),
      supportsStructuredOutput: true,
      lastCheckedAt: checkedAt,
    };
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

  private static getFallbackModelIds(): string[] {
    return [
      'gpt-5',
      'gpt-5-turbo',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4.1-nano',
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o4-mini',
      'o4-mini-high',
      'o3',
      'o3-mini',
      'o3-mini-high',
    ];
  }

  private static isSupportedModelId(modelId: string): boolean {
    const id = modelId.toLowerCase();
    if (id.includes(':') || id.includes('ft-')) {
      return false;
    }

    if (id.startsWith('gpt-') || id.startsWith('o3') || id.startsWith('o4')) {
      const excludedSubstrings = [
        'embedding',
        'instruct',
        'whisper',
        'tts',
        'dall-e',
        'moderation',
        'babbage',
        'davinci',
        'curie',
        'ada',
        'text-',
        'code-',
        'edit-',
        'if-',
        'search-',
        'similarity-',
        'audio-',
        'vision-',
      ];

      return !excludedSubstrings.some((keyword) => id.includes(keyword));
    }

    return false;
  }

  private static isStreamingCapable(modelId: string): boolean {
    const id = modelId.toLowerCase();
    if (
      id.startsWith('gpt-5') ||
      id.startsWith('gpt-4') ||
      id.startsWith('gpt-3.5')
    ) {
      return true;
    }
    if (id.startsWith('o3') || id.startsWith('o4')) {
      return true;
    }
    return ['gpt-4o', 'gpt-4o-mini'].includes(id);
  }

  private static getModelDescription(modelId: string): string {
    const descriptions: Record<string, string> = {
      'gpt-5': 'Flagship reasoning model (2025).',
      'gpt-5-turbo': 'Faster GPT-5 variant with strong multimodal performance.',
      'gpt-4.1': 'Advanced GPT-4 generation with improved reasoning.',
      'gpt-4.1-mini': 'Cost-optimized GPT-4.1 variant.',
      'gpt-4.1-nano': 'Lightweight GPT-4.1 for low-latency use cases.',
      'gpt-4o': 'Multimodal GPT-4 Omni model.',
      'gpt-4o-mini': 'Smaller GPT-4 Omni for efficiency.',
      'gpt-4-turbo': 'High throughput GPT-4 generation.',
      'gpt-4': 'Classic GPT-4 completion model.',
      'gpt-3.5-turbo': 'Affordable GPT-3.5 chat model.',
      'o4-mini':
        'OpenAI o-series reasoning model optimized for multimodal tasks.',
      'o4-mini-high': 'High capability variant of o4-mini.',
      o3: 'OpenAI o-series reasoning specialist.',
      'o3-mini': 'Smaller o-series reasoning model.',
      'o3-mini-high': 'High capability variant of o3-mini.',
    };

    return descriptions[modelId] || 'OpenAI chat/completion model';
  }

  private static getModelDisplayName(modelId: string): string {
    const displayNames: Record<string, string> = {
      'gpt-5': 'GPT-5',
      'gpt-5-turbo': 'GPT-5 Turbo',
      'gpt-4.1': 'GPT-4.1',
      'gpt-4.1-mini': 'GPT-4.1 Mini',
      'gpt-4.1-nano': 'GPT-4.1 Nano',
      'gpt-4o': 'GPT-4o',
      'gpt-4o-mini': 'GPT-4o Mini',
      'gpt-4-turbo': 'GPT-4 Turbo',
      'gpt-4': 'GPT-4',
      'gpt-3.5-turbo': 'GPT-3.5 Turbo',
      'o4-mini': 'o4 Mini',
      'o4-mini-high': 'o4 Mini High',
      o3: 'o3',
      'o3-mini': 'o3 Mini',
      'o3-mini-high': 'o3 Mini High',
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
      'gpt-5-turbo': 8192,
      'gpt-4.1': 8192,
      'gpt-4.1-mini': 16384,
      'gpt-4.1-nano': 32768,
      'gpt-4o': 4096,
      'gpt-4o-mini': 16384,
      'gpt-4-turbo': 4096,
      'gpt-4': 8192,
      'gpt-3.5-turbo': 4096,
      'o4-mini': 16384,
      'o4-mini-high': 16384,
      o3: 8192,
      'o3-mini': 8192,
      'o3-mini-high': 8192,
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
      'gpt-5-turbo': { input: 0.03, output: 0.09 },
      'gpt-4.1': { input: 0.015, output: 0.045 },
      'gpt-4.1-mini': { input: 0.006, output: 0.018 },
      'gpt-4.1-nano': { input: 0.002, output: 0.006 },
      'gpt-4o': { input: 0.005, output: 0.015 },
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
      'o4-mini': { input: 0.003, output: 0.009 },
      'o4-mini-high': { input: 0.006, output: 0.018 },
      o3: { input: 0.015, output: 0.045 },
      'o3-mini': { input: 0.004, output: 0.012 },
      'o3-mini-high': { input: 0.008, output: 0.024 },
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

  private static getMaxTokenParam(
    model: string | undefined,
    maxTokens?: number,
  ): Record<string, number> {
    const limit = maxTokens && maxTokens > 0 ? maxTokens : 4096;
    if (!model) {
      return { max_tokens: limit };
    }

    const id = model.toLowerCase();
    const modernPrefixes = ['gpt-5', 'gpt-4.1', 'o4', 'o3'];

    if (modernPrefixes.some((prefix) => id.startsWith(prefix))) {
      return { max_completion_tokens: limit };
    }

    return { max_tokens: limit };
  }

  private static getTemperatureParam(
    model: string | undefined,
    temperature: number | undefined,
    fallback: number,
  ): Record<string, number> {
    const desired =
      typeof temperature === 'number' && !Number.isNaN(temperature)
        ? temperature
        : fallback;

    if (!model) {
      return { temperature: desired };
    }

    const id = model.toLowerCase();
    const modernPrefixes = ['gpt-5', 'gpt-4.1', 'o4', 'o3'];

    if (modernPrefixes.some((prefix) => id.startsWith(prefix))) {
      if (Math.abs(desired - 1) < 1e-6) {
        return {};
      }
      return { temperature: 1 };
    }

    return { temperature: desired };
  }
}
