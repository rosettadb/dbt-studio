/* eslint-disable class-methods-use-this, no-restricted-syntax, no-await-in-loop, no-plusplus */
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

interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
  details?: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: boolean;
  options: {
    temperature: number;
    num_predict: number;
    top_k?: number;
    top_p?: number;
    repeat_penalty?: number;
    stop?: string[];
  };
  format?: string;
}

interface StructuredPromptConfig {
  instruction: string;
  format: string;
  constraint: string;
}

/**
 * Ollama provider implementation for local AI models
 * Provides access to locally running Ollama server
 */
export class OllamaProvider extends BaseAIProvider {
  readonly name = 'Ollama';

  readonly type: AIProviderType = 'ollama';

  readonly supportedModels: string[] = [];

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: false,
    imageInput: false,
    maxTokens: 4096,
    contextWindow: 8192,
  };

  private static readonly DEFAULT_BASE_URL = 'http://localhost:11434';

  private static readonly DEFAULT_MODEL = 'llama2';

  private static readonly REQUEST_TIMEOUT = 60000;

  private static readonly CONNECTION_TIMEOUT = 5000;

  private static readonly MAX_RETRIES = 2;

  private static readonly RETRY_DELAY = 1000;

  private baseUrl: string = OllamaProvider.DEFAULT_BASE_URL;

  private availableModels: OllamaModel[] = [];

  private defaultModel: string = OllamaProvider.DEFAULT_MODEL;

  async initialize(config: AIProviderConfig): Promise<void> {
    try {
      this.baseUrl = config.baseUrl || OllamaProvider.DEFAULT_BASE_URL;
      this.defaultModel = config.model || OllamaProvider.DEFAULT_MODEL;
      await this.discoverModels();
    } catch (error) {
      throw this.handleProviderError(error, 'initialization');
    }
  }

  async testConnection(): Promise<ProviderTestResult> {
    const startTime = Date.now();

    try {
      const response = await this.makeRequest('/api/tags', {
        method: 'GET',
        timeout: OllamaProvider.CONNECTION_TIMEOUT,
      });

      const data = await response.json();
      const models = data.models || [];

      return {
        success: true,
        latencyMs: Date.now() - startTime,
        modelsAvailable: models.length,
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
      (this.constructor as typeof BaseAIProvider).validateRequest(request);

      const model = this.getValidatedModel(request.model);
      const ollamaRequest = this.buildGenerateRequest(model, request, false);

      const response = await this.makeRequest('/api/generate', {
        method: 'POST',
        body: JSON.stringify(ollamaRequest),
        timeout: OllamaProvider.REQUEST_TIMEOUT,
      });

      const data: OllamaResponse = await response.json();

      return this.buildCompletionResponse(data, model);
    } catch (error) {
      throw this.handleProviderError(error, 'completion generation');
    }
  }

  async *streamCompletion(
    request: CompletionRequest,
  ): AsyncGenerator<CompletionChunk> {
    try {
      (this.constructor as typeof BaseAIProvider).validateRequest(request);

      const model = this.getValidatedModel(request.model);
      const ollamaRequest = this.buildGenerateRequest(model, request, true);

      const response = await this.makeRequest('/api/generate', {
        method: 'POST',
        body: JSON.stringify(ollamaRequest),
      });

      yield* this.processStreamingResponse(response);
    } catch (error) {
      throw this.handleProviderError(error, 'streaming completion');
    }
  }

  async getAvailableModels(): Promise<AIModel[]> {
    await this.discoverModels();
    return this.availableModels.map(this.mapToAIModel.bind(this));
  }

  async estimateCost(request: CompletionRequest): Promise<CostEstimate> {
    // Ollama is free (local models)
    return {
      estimatedTokens: Math.ceil(request.prompt.length / 4),
      estimatedCost: 0,
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

  async generateDashboardsQuery(
    prompt: string,
  ): Promise<GenerateDashboardResponseType[]> {
    const config: StructuredPromptConfig = {
      instruction:
        'You are a JSON response generator for dashboard suggestions.',
      format: JSON.stringify(
        [
          {
            description: 'Dashboard showing sales performance metrics',
            query:
              'SELECT date, SUM(revenue) as total_revenue FROM sales GROUP BY date ORDER BY date',
          },
        ],
        null,
        2,
      ),
      constraint:
        'Generate 1-5 dashboard suggestions. Each must have "description" and "query" fields.',
    };

    return this.generateStructuredResponse<GenerateDashboardResponseType[]>(
      prompt,
      config,
      this.validateDashboardResponse.bind(this),
      'dashboard generation',
    );
  }

  async enhanceModelQuery(prompt: string): Promise<EnhanceModelResponseType> {
    const config: StructuredPromptConfig = {
      instruction: 'You are a SQL enhancement assistant.',
      format: JSON.stringify(
        {
          content: 'The updated SQL with placeholders replaced appropriately',
        },
        null,
        2,
      ),
      constraint:
        'Return only a JSON object with a "content" field containing the enhanced SQL.',
    };

    return this.generateStructuredResponse<EnhanceModelResponseType>(
      prompt,
      config,
      this.validateEnhanceResponse.bind(this),
      'model enhancement',
    );
  }

  // Private helper methods

  private async makeRequest(
    endpoint: string,
    options: {
      method: string;
      body?: string;
      timeout?: number;
      headers?: any;
    },
  ): Promise<Response> {
    const { timeout = OllamaProvider.REQUEST_TIMEOUT, ...fetchOptions } =
      options;

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  private async discoverModels(): Promise<void> {
    try {
      const response = await this.makeRequest('/api/tags', {
        method: 'GET',
        timeout: OllamaProvider.CONNECTION_TIMEOUT,
      });

      const data = await response.json();
      this.availableModels = data.models || [];
      this.updateSupportedModels();
    } catch (error) {
      // Silent fail - continue without models
      this.availableModels = [];
    }
  }

  private updateSupportedModels(): void {
    (this.supportedModels as string[]).length = 0;
    this.supportedModels.push(...this.availableModels.map((m) => m.name));

    // Update default model if current one is not available
    if (
      this.supportedModels.length > 0 &&
      !this.supportedModels.includes(this.defaultModel)
    ) {
      [this.defaultModel] = this.supportedModels;
    }
  }

  private getValidatedModel(requestedModel?: string): string {
    const model = requestedModel || this.defaultModel;

    if (!this.isModelAvailable(model)) {
      throw new Error(
        `Model "${model}" is not available. Available models: ${this.supportedModels.join(', ')}`,
      );
    }

    return model;
  }

  private isModelAvailable(modelName: string): boolean {
    return this.supportedModels.includes(modelName);
  }

  private buildGenerateRequest(
    model: string,
    request: CompletionRequest,
    stream: boolean,
  ): OllamaGenerateRequest {
    return {
      model,
      prompt: request.prompt,
      stream,
      options: {
        temperature: request.temperature || 0.7,
        num_predict: request.maxTokens || 1000,
      },
    };
  }

  private buildCompletionResponse(
    data: OllamaResponse,
    model: string,
  ): CompletionResponse {
    return {
      content: data.response,
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      model,
      providerId: this.type,
      metadata: {
        totalDuration: data.total_duration,
        loadDuration: data.load_duration,
        promptEvalDuration: data.prompt_eval_duration,
        evalDuration: data.eval_duration,
      },
    };
  }

  private async *processStreamingResponse(
    response: Response,
  ): AsyncGenerator<CompletionChunk> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response stream');
    }

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const data: OllamaResponse = JSON.parse(line);

            if (data.prompt_eval_count)
              totalPromptTokens = data.prompt_eval_count;
            if (data.eval_count) totalCompletionTokens = data.eval_count;

            yield {
              content: data.response || '',
              done: data.done,
              usage: data.done
                ? {
                    promptTokens: totalPromptTokens,
                    completionTokens: totalCompletionTokens,
                    totalTokens: totalPromptTokens + totalCompletionTokens,
                  }
                : undefined,
              metadata: {
                model: data.model,
                totalDuration: data.total_duration,
                evalDuration: data.eval_duration,
              },
            };

            if (data.done) break;
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private mapToAIModel(model: OllamaModel): AIModel {
    return {
      id: model.name,
      name: this.formatModelName(model.name),
      description: `${model.details?.family || 'Unknown'} model (${this.formatSize(model.size)})`,
      maxTokens: 4096, // Default, Ollama doesn't provide this info
    };
  }

  private formatModelName(name: string): string {
    const parts = name.split(':');
    const [basePart] = parts;
    const baseName = basePart.charAt(0).toUpperCase() + basePart.slice(1);
    const variant = parts[1] ? ` (${parts[1].toUpperCase()})` : '';
    return baseName + variant;
  }

  private formatSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${sizes[i]}`;
  }

  // Structured response generation with robust parsing

  private async generateStructuredResponse<T>(
    prompt: string,
    config: StructuredPromptConfig,
    validator: (data: any) => T,
    operationType: string,
    maxRetries: number = OllamaProvider.MAX_RETRIES,
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new Error('Ollama provider not configured with base URL');
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const structuredPrompt = this.buildStructuredPrompt(prompt, config);
        const response = await this.makeRequest('/api/generate', {
          method: 'POST',
          body: JSON.stringify({
            model: this.defaultModel,
            prompt: structuredPrompt,
            stream: false,
            options: {
              temperature: 0.0,
              num_predict: 2048,
              top_k: 1,
              top_p: 0.1,
              repeat_penalty: 1.0,
              stop: ['\n\n', '```', 'Explanation:', 'Note:'],
            },
          }),
        });

        const data = await response.json();
        const text = data.response?.trim();

        if (!text) {
          throw new Error('No response text from Ollama');
        }

        return this.parseAndValidateStructuredResponse(text, validator);
      } catch (error) {
        lastError = error as Error;
        console.error(
          `[OLLAMA PROVIDER] ${operationType} attempt ${attempt + 1} failed:`,
          error,
        );

        if (attempt < maxRetries) {
          await this.delay(OllamaProvider.RETRY_DELAY * (attempt + 1)); // Exponential backoff
        }
      }
    }

    throw this.handleProviderError(lastError!, operationType);
  }

  private buildStructuredPrompt(
    prompt: string,
    config: StructuredPromptConfig,
  ): string {
    return `${config.instruction}

User request: ${prompt}

CRITICAL INSTRUCTIONS:
- Respond ONLY with valid JSON
- No explanatory text before or after
- No markdown code blocks
- No comments in the JSON

Expected format:
${config.format}

${config.constraint}

Respond with valid JSON only:`;
  }

  private parseAndValidateStructuredResponse<T>(
    text: string,
    validator: (data: any) => T,
  ): T {
    console.log('Original response:', text);

    try {
      const cleanedText = this.cleanJsonResponse(text);
      console.log('Cleaned response:', cleanedText);

      const parsed = JSON.parse(cleanedText);
      return validator(parsed);
    } catch (parseError) {
      console.error('JSON parse failed, attempting recovery:', parseError);

      try {
        const recoveredText = this.recoverJsonFromText(text);
        const parsed = JSON.parse(recoveredText);
        return validator(parsed);
      } catch (recoveryError) {
        console.error('Recovery failed:', recoveryError);
        console.error('Raw response that failed:', text);
        throw new Error('Failed to parse structured response from Ollama');
      }
    }
  }

  private cleanJsonResponse(text: string): string {
    return (
      text
        // Remove markdown code blocks
        .replace(/```(?:json)?\s*/g, '')
        .replace(/```\s*$/g, '')
        // Remove common prefixes
        .replace(/^(?:Here's?|Response:|JSON:)?\s*/i, '')
        // Remove trailing explanations
        .replace(/(\]|\})\s*\n\s*[A-Z].*$/s, '$1')
        // Clean whitespace
        .trim()
    );
  }

  private recoverJsonFromText(text: string): string {
    // Try to extract JSON structures using regex
    const arrayMatch = text.match(/\[[\s\S]*?\]/);
    const objectMatch = text.match(/\{[\s\S]*?\}/);

    if (arrayMatch) return arrayMatch[0];
    if (objectMatch) return objectMatch[0];

    // Try to extract multiple objects and wrap in array
    const objectMatches = text.match(/\{[\s\S]*?\}/g);
    if (objectMatches && objectMatches.length > 0) {
      return `[${objectMatches.join(',')}]`;
    }

    throw new Error('No JSON structure found in response');
  }

  // Response validators

  private validateDashboardResponse(
    parsed: any,
  ): GenerateDashboardResponseType[] {
    if (!Array.isArray(parsed)) {
      throw new Error('Dashboard response must be an array');
    }

    const validItems = parsed
      .filter((item): item is GenerateDashboardResponseType => {
        return (
          item &&
          typeof item === 'object' &&
          typeof item.description === 'string' &&
          typeof item.query === 'string' &&
          item.description.trim().length > 0 &&
          item.query.trim().length > 0
        );
      })
      .map((item) => ({
        description: item.description.trim(),
        query: item.query.trim(),
      }));

    if (validItems.length === 0) {
      throw new Error('No valid dashboard items found in response');
    }

    return validItems;
  }

  private validateEnhanceResponse(parsed: any): EnhanceModelResponseType {
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.content !== 'string'
    ) {
      throw new Error('Enhancement response must have a valid content field');
    }

    return { content: parsed.content.trim() };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
