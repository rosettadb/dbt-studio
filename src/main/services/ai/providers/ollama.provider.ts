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

  async generateCompletion(
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    try {
      (this.constructor as typeof BaseAIProvider).validateRequest(request);

      const model = request.model || this.defaultModel;

      if (!this.isModelAvailable(model)) {
        throw new Error(
          `Model "${model}" is not available. Available models: ${this.supportedModels.join(', ')}`,
        );
      }

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
        signal: AbortSignal.timeout(60000), // 60 second timeout
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
        metadata: {
          totalDuration: data.total_duration,
          loadDuration: data.load_duration,
          promptEvalDuration: data.prompt_eval_duration,
          evalDuration: data.eval_duration,
        },
      };
    } catch (error) {
      throw this.handleProviderError(error, 'completion generation');
    }
  }

  async *streamCompletion(
    request: CompletionRequest,
  ): AsyncGenerator<CompletionChunk> {
    try {
      (this.constructor as typeof BaseAIProvider).validateRequest(request);

      const model = request.model || this.defaultModel;

      if (!this.isModelAvailable(model)) {
        throw new Error(`Model "${model}" is not available`);
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

  async generateDashboardsQuery(
    prompt: string,
  ): Promise<GenerateDashboardResponseType[]> {
    try {
      if (!this.baseUrl) {
        throw new Error('Ollama provider not configured with base URL');
      }

      // Use structured prompt for consistent response
      const structuredPrompt = `${prompt}

Please respond with a JSON array of dashboard suggestions in this exact format:
[
  {
    "description": "A human-readable dashboard description",
    "query": "A useful SQL query or dbt select statement"
  }
]

Only return the JSON array, no other text or explanation.`;

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.defaultModel,
          prompt: structuredPrompt,
          stream: false,
          options: {
            temperature: 0.0,
            num_predict: 2048,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      const text = data.response;

      if (!text) {
        throw new Error('No response text from Ollama');
      }

      try {
        // Clean the response - remove any markdown formatting and extra text
        let cleanedText = text
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();

        // Try to extract JSON array from the response
        const jsonMatch = cleanedText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const [firstMatch] = jsonMatch;
          cleanedText = firstMatch;
        }

        const parsed = JSON.parse(cleanedText);

        // Validate the response structure
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item) =>
              item &&
              typeof item.description === 'string' &&
              typeof item.query === 'string',
          );
        }

        throw new Error('Response is not an array');
      } catch (parseError) {
        // eslint-disable-next-line no-console
        console.error(
          '[OLLAMA PROVIDER] Failed to parse JSON response:',
          parseError,
        );
        // eslint-disable-next-line no-console
        console.error('[OLLAMA PROVIDER] Raw response:', text);
        throw new Error(
          'Failed to parse dashboard suggestions from Ollama response',
        );
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[OLLAMA PROVIDER] generateDashboardsQuery failed:', error);
      throw this.handleProviderError(error, 'dashboard generation');
    }
  }

  async enhanceModelQuery(prompt: string): Promise<EnhanceModelResponseType> {
    try {
      if (!this.baseUrl) {
        throw new Error('Ollama provider not configured with base URL');
      }

      // Use structured prompt for consistent response
      const structuredPrompt = `${prompt}

Please respond with a JSON object in this exact format:
{
  "content": "The updated SQL with placeholders replaced appropriately"
}

Only return the JSON object, no other text or explanation.`;

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.defaultModel,
          prompt: structuredPrompt,
          stream: false,
          options: {
            temperature: 0.0,
            num_predict: 2048,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      const text = data.response;

      if (!text) {
        throw new Error('No response text from Ollama');
      }

      try {
        // Clean the response - remove any markdown formatting and extra text
        let cleanedText = text
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();

        // Try to extract JSON object from the response
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const [firstMatch] = jsonMatch;
          cleanedText = firstMatch;
        }

        const parsed = JSON.parse(cleanedText);

        // Validate the response structure
        if (parsed && typeof parsed.content === 'string') {
          return { content: parsed.content };
        }

        throw new Error('Response does not have valid content field');
      } catch (parseError) {
        // eslint-disable-next-line no-console
        console.error(
          '[OLLAMA PROVIDER] Failed to parse JSON response:',
          parseError,
        );
        // eslint-disable-next-line no-console
        console.error('[OLLAMA PROVIDER] Raw response:', text);
        throw new Error(
          'Failed to parse model enhancement from Ollama response',
        );
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[OLLAMA PROVIDER] enhanceModelQuery failed:', error);
      throw this.handleProviderError(error, 'model enhancement');
    }
  }
}
