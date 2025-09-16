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
  JSONSchema,
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

  private baseUrl: string = 'http://localhost:11434';

  private availableModels: OllamaModel[] = [];

  private defaultModel: string = 'llama2';

  async initialize(config: AIProviderConfig): Promise<void> {
    try {
      this.baseUrl = config.baseUrl || 'http://localhost:11434';
      this.defaultModel = config.model || 'llama2';

      // Discover available models
      await this.discoverModels();
    } catch (error) {
      throw this.handleProviderError(error, 'initialization');
    }
  }

  async testConnection(): Promise<ProviderTestResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

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

  async generateCompletion<T = any>(
    request: CompletionRequest<T>,
  ): Promise<CompletionResponse<T>> {
    try {
      (this.constructor as typeof BaseAIProvider).validateRequest(request);

      const model = request.model || this.defaultModel;

      if (!this.isModelAvailable(model)) {
        throw new Error(
          `Model "${model}" is not available. Available models: ${this.supportedModels.join(', ')}`,
        );
      }

      if (request.schemaConfig) {
        return this.generateSchemaCompletion<T>(request);
      }

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

    const { schema, description } = request.schemaConfig;
    const model = request.model || this.defaultModel;

    try {
      const structuredPrompt = this.createSchemaPrompt(
        request.prompt,
        schema,
        description,
      );

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: structuredPrompt,
          stream: false,
          options: {
            temperature: request.temperature || 0.1,
            num_predict: request.maxTokens || 1000,
          },
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: OllamaResponse = await response.json();
      const text = data.response;

      if (!text) {
        throw new Error('No response text from Ollama');
      }

      let parsedData: T | undefined;
      let schemaValidation: CompletionResponse<T>['schemaValidation'];
      let cleanedContent = text;

      try {
        const extractedJson = this.extractJsonFromText(text);

        if (extractedJson) {
          cleanedContent = extractedJson;
          JSON.parse(cleanedContent);

          // Fix: Use the protected method from BaseAIProvider instead of calling directly
          const validationResult = this.validateResponseAgainstSchema<T>(
            cleanedContent,
            schema,
          );

          schemaValidation = {
            isValid: validationResult.isValid,
            errors: validationResult.errors,
            originalResponse: text,
          };

          if (validationResult.isValid && validationResult.parsedData) {
            parsedData = validationResult.parsedData;
          }
        } else {
          // Try to parse the entire response as JSON (fallback)
          const trimmedText = text.trim();
          const validationResult = this.validateResponseAgainstSchema<T>(
            trimmedText,
            schema,
          );

          schemaValidation = {
            isValid: validationResult.isValid,
            errors: validationResult.errors,
            originalResponse: text,
          };

          if (validationResult.isValid && validationResult.parsedData) {
            parsedData = validationResult.parsedData;
            cleanedContent = JSON.stringify(parsedData, null, 2);
          }
        }
      } catch (parseError) {
        schemaValidation = {
          isValid: false,
          errors: [
            `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
          ],
          originalResponse: text,
        };
      }

      return {
        content: parsedData ? JSON.stringify(parsedData, null, 2) : text,
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
        model,
        providerId: this.type,
        finishReason: 'stop',
        parsedData,
        schemaValidation,
        metadata: {
          totalDuration: data.total_duration,
          loadDuration: data.load_duration,
          promptEvalDuration: data.prompt_eval_duration,
          evalDuration: data.eval_duration,
          schemaUsed: true,
        },
      };
    } catch (error) {
      console.error('[OLLAMA PROVIDER] Schema completion failed:', error);
      throw this.handleProviderError(error, 'schema completion');
    }
  }

  private async generateGenericCompletion<T>(
    request: CompletionRequest<T>,
  ): Promise<CompletionResponse<T>> {
    const model = request.model || this.defaultModel;

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: request.prompt,
        stream: false,
        options: {
          temperature: request.temperature || 0.7,
          num_predict: request.maxTokens || 1000,
        },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: OllamaResponse = await response.json();

    return {
      content: data.response,
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      model,
      providerId: this.type,
      finishReason: 'stop',
      metadata: {
        totalDuration: data.total_duration,
        loadDuration: data.load_duration,
        promptEvalDuration: data.prompt_eval_duration,
        evalDuration: data.eval_duration,
      },
    };
  }

  // Keep the original streaming implementation - no changes needed
  async *streamCompletion(
    request: CompletionRequest,
  ): AsyncGenerator<CompletionChunk> {
    try {
      (this.constructor as typeof BaseAIProvider).validateRequest(request);

      const model = request.model || this.defaultModel;

      if (!this.isModelAvailable(model)) {
        throw new Error(`Model "${model}" is not available`);
      }

      // For schema-based requests, fall back to non-streaming
      if (request.schemaConfig) {
        const response = await this.generateCompletion(request);
        yield {
          content: response.content,
          done: true,
          usage: response.usage,
          metadata: response.metadata,
          parsedData: response.parsedData,
        };
        return;
      }

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: request.prompt,
          stream: true,
          options: {
            temperature: request.temperature || 0.7,
            num_predict: request.maxTokens || 1000,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response stream');
      }

      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;

      try {
        // eslint-disable-next-line no-await-in-loop
        while (true) {
          // eslint-disable-next-line no-await-in-loop
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split('\n').filter((line) => line.trim());

          // eslint-disable-next-line no-restricted-syntax
          for (const line of lines) {
            try {
              const data: OllamaResponse = JSON.parse(line);

              if (data.prompt_eval_count) {
                totalPromptTokens = data.prompt_eval_count;
              }
              if (data.eval_count) {
                totalCompletionTokens = data.eval_count;
              }

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

              if (data.done) {
                break;
              }
            } catch (parseError) {
              // Skip malformed JSON lines - no console logging
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      throw this.handleProviderError(error, 'streaming completion');
    }
  }

  async getAvailableModels(): Promise<AIModel[]> {
    await this.discoverModels();

    return this.availableModels.map((model) => ({
      id: model.name,
      name: this.formatModelName(model.name),
      description: `${model.details?.family || 'Unknown'} model (${this.formatSize(model.size)})`,
      maxTokens: 4096, // Default, Ollama doesn't provide this info
      // Ollama models are free (running locally)
    }));
  }

  // eslint-disable-next-line class-methods-use-this
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

  // Private helper methods

  private async discoverModels(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: HTTP ${response.status}`);
      }

      const data = await response.json();
      this.availableModels = data.models || [];

      // Update supported models list
      (this.supportedModels as string[]).length = 0;
      this.supportedModels.push(...this.availableModels.map((m) => m.name));

      // Set default model if none available
      if (
        this.supportedModels.length > 0 &&
        !this.supportedModels.includes(this.defaultModel)
      ) {
        const [firstModel] = this.supportedModels;
        this.defaultModel = firstModel;
      }
    } catch (error) {
      // Failed to discover models - continue without logging
      this.availableModels = [];
    }
  }

  private isModelAvailable(modelName: string): boolean {
    return this.supportedModels.includes(modelName);
  }

  // eslint-disable-next-line class-methods-use-this
  private formatModelName(name: string): string {
    // Convert "llama2:7b" to "Llama 2 (7B)"
    const parts = name.split(':');
    const [basePart] = parts;
    const baseName = basePart.charAt(0).toUpperCase() + basePart.slice(1);
    const variant = parts[1] ? ` (${parts[1].toUpperCase()})` : '';
    return baseName + variant;
  }

  // eslint-disable-next-line class-methods-use-this
  private formatSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${sizes[i]}`;
  }

  private createSchemaPrompt(
    prompt: string,
    schema: JSONSchema,
    description?: string,
  ): string {
    const schemaString = JSON.stringify(schema, null, 2);

    return `${description ? `Task: ${description}\n\n` : ''}${prompt}

You must respond with a valid JSON object that strictly follows this schema:

${schemaString}

Critical Requirements:
- Your response MUST be valid JSON
- Follow the exact schema structure provided above
- Include all required fields as specified in the schema
- Use the correct data types for each field
- Do not include any text before or after the JSON object
- The JSON should be properly formatted and parseable

Response (JSON only):`;
  }

  private extractJsonFromText(text: string): string | null {
    const strategies = [
      /(\{(?:[^{}]|{[^{}]*})*\})/g,
      /(\[(?:[^\[\]]|\[[^\[\]]*\])*\])/g,
      /\{[\s\S]*\}/,
      /\[[\s\S]*\]/,
      /```(?:json)?\s*([\s\S]*?)\s*```/i,
      /(?:Response|JSON|Output|Result):\s*(\{[\s\S]*\})/i,
      /(?:Response|JSON|Output|Result):\s*(\[[\s\S]*\])/i,
    ];

    for (const regex of strategies) {
      const matches = text.match(regex);
      if (matches) {
        for (const match of matches) {
          try {
            let cleaned = match
              .replace(/```json|```|Response:|JSON:|Output:|Result:/gi, '')
              .trim();
            cleaned = cleaned.replace(/^[^{\[]*/, '').replace(/[^}\]]*$/, '');
            JSON.parse(cleaned);
            return cleaned;
          } catch {
            /* empty */
          }
        }
      }
    }

    return null;
  }
}
