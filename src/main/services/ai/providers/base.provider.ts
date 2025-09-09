import {
  AIProviderType,
  ProviderCapabilities,
  ProviderTestResult,
  AIModel,
  CostEstimate,
  HealthStatus,
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
 * Abstract base class for all AI providers
 * Defines the common interface that all provider implementations must follow
 */
export abstract class BaseAIProvider {
  abstract readonly name: string;

  abstract readonly type: AIProviderType;

  abstract readonly supportedModels: string[];

  abstract readonly capabilities: ProviderCapabilities;

  // Provider lifecycle methods
  abstract initialize(config: AIProviderConfig): Promise<void>;

  abstract testConnection(): Promise<ProviderTestResult>;

  // Core AI operations
  abstract generateCompletion(
    request: CompletionRequest,
  ): Promise<CompletionResponse>;

  abstract streamCompletion(
    request: CompletionRequest,
  ): AsyncGenerator<CompletionChunk>;

  // Model and capability discovery
  abstract getAvailableModels(): Promise<AIModel[]>;

  abstract estimateCost(request: CompletionRequest): Promise<CostEstimate>;

  // Backward compatibility methods for existing AI features
  abstract generateDashboardsQuery(
    prompt: string,
  ): Promise<GenerateDashboardResponseType[]>;

  abstract enhanceModelQuery(prompt: string): Promise<EnhanceModelResponseType>;

  // Optional lifecycle methods
  async cleanup?(): Promise<void>;

  async healthCheck?(): Promise<HealthStatus>;

  // Helper methods available to all providers
  protected static validateRequest(request: CompletionRequest): void {
    if (!request.prompt || request.prompt.trim().length === 0) {
      throw new Error('Prompt cannot be empty');
    }

    if (request.maxTokens && request.maxTokens <= 0) {
      throw new Error('maxTokens must be positive');
    }

    if (
      request.temperature &&
      (request.temperature < 0 || request.temperature > 2)
    ) {
      throw new Error('temperature must be between 0 and 2');
    }
  }

  protected static createUsageStats(
    promptTokens: number,
    completionTokens: number,
  ) {
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }

  protected handleProviderError(error: any, operation: string): Error {
    const errorMessage = error?.message || 'Unknown error occurred';
    return new Error(`${this.name} ${operation} failed: ${errorMessage}`);
  }
}
