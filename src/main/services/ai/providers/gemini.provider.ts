import { GoogleGenerativeAI } from '@google/generative-ai';
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
 * Google Gemini provider implementation
 * Provides access to Google's Gemini AI models
 */
export class GeminiProvider extends BaseAIProvider {
  readonly name = 'Google Gemini';

  readonly type: AIProviderType = 'gemini';

  readonly supportedModels: string[] = []; // Dynamic models - populated during initialization

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    imageInput: true,
    maxTokens: 8192,
    contextWindow: 1000000, // 1M tokens for Gemini 1.5
  };

  private genAI?: GoogleGenerativeAI;

  private config?: AIProviderConfig;

  async initialize(config: AIProviderConfig): Promise<void> {
    try {
      this.config = config;

      // Use API key from config if provided, otherwise try to get from secure storage
      const { apiKey } = config;
      if (!apiKey) {
        // For backward compatibility, try to get from secure storage
        // Note: This requires a provider ID which we don't have during temporary testing
        // This should only be used for saved providers
        throw new Error(
          'Gemini API key not found in configuration. Please provide API key.',
        );
      }

      this.genAI = new GoogleGenerativeAI(apiKey);

      // Discover available models dynamically
      await this.discoverModels();
    } catch (error) {
      throw this.handleProviderError(error, 'initialization');
    }
  }

  async testConnection(): Promise<ProviderTestResult> {
    const startTime = Date.now();

    try {
      if (!this.genAI) {
        throw new Error('Provider not initialized. Call initialize() first.');
      }

      // Test with a simple request using the best available model
      const testModel =
        this.supportedModels.length > 0
          ? this.supportedModels[0]
          : 'gemini-1.5-flash'; // Fallback

      const model = this.genAI!.getGenerativeModel({
        model: testModel,
      });
      const result = await model.generateContent('Hello');

      if (!result.response.text()) {
        throw new Error('Empty response from Gemini API');
      }

      return {
        success: true,
        latencyMs: Date.now() - startTime,
        modelsAvailable: this.supportedModels.length,
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

      if (!this.genAI) {
        throw new Error('Gemini provider not initialized');
      }

      const model = this.genAI.getGenerativeModel({
        model: request.model || 'gemini-1.5-pro',
        generationConfig: {
          maxOutputTokens: request.maxTokens || 2048,
          temperature: request.temperature || 0.7,
        },
      });

      const result = await model.generateContent(request.prompt);
      const { response } = result;

      if (!response.text()) {
        throw new Error('Empty response from Gemini');
      }

      return {
        content: response.text(),
        usage: {
          promptTokens: 0, // Gemini doesn't provide detailed token counts
          completionTokens: 0,
          totalTokens: 0,
        },
        model: request.model || 'gemini-1.5-pro',
        providerId: this.type,
        finishReason: GeminiProvider.mapFinishReason(response),
        metadata: {
          candidates: response.candidates?.length || 1,
          safetyRatings: response.candidates?.[0]?.safetyRatings,
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

      if (!this.genAI) {
        throw new Error('Gemini provider not initialized');
      }

      const model = this.genAI.getGenerativeModel({
        model: request.model || 'gemini-1.5-pro',
        generationConfig: {
          maxOutputTokens: request.maxTokens || 2048,
          temperature: request.temperature || 0.7,
        },
      });

      // Promise-based approach that collects all chunks first
      const allChunks: CompletionChunk[] = [];
      let accumulatedText = '';

      try {
        const result = await model.generateContentStream(request.prompt);
        const chunks = result.stream;

        // Process chunks using Promise.all to avoid async iteration issues
        const streamChunks: any[] = [];

        // Collect all chunks first
        // eslint-disable-next-line no-restricted-syntax
        for await (const chunk of chunks) {
          streamChunks.push(chunk);
        }

        // Process collected chunks synchronously
        streamChunks.forEach((chunk) => {
          const chunkText = chunk.text();
          accumulatedText += chunkText;

          allChunks.push({
            content: chunkText,
            done: false,
            metadata: {
              accumulated: accumulatedText,
            },
          });
        });

        // Add final chunk
        allChunks.push({
          content: '',
          done: true,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
          metadata: {
            finalText: accumulatedText,
          },
        });

        // Yield all chunks
        const yieldChunks = allChunks.values();
        let nextChunk = yieldChunks.next();
        while (!nextChunk.done) {
          yield nextChunk.value;
          nextChunk = yieldChunks.next();
        }
      } catch (streamError) {
        throw streamError instanceof Error
          ? streamError
          : new Error(String(streamError));
      }
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
      name: GeminiProvider.getModelDisplayName(modelId),
      description: GeminiProvider.getModelDescription(modelId),
      maxTokens: GeminiProvider.getModelMaxTokens(modelId),
      costPer1kTokens: GeminiProvider.getModelCosts(modelId),
    }));
  }

  // eslint-disable-next-line class-methods-use-this
  async estimateCost(request: CompletionRequest): Promise<CostEstimate> {
    const estimatedTokens = Math.ceil(request.prompt.length / 4);
    const model = request.model || 'gemini-1.5-pro';
    const costs = GeminiProvider.getModelCosts(model);

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
      if (!this.genAI) {
        // Cannot discover models - client not initialized, using fallback models
        // Fallback to known working models
        (this.supportedModels as string[]).push(
          'gemini-1.5-pro',
          'gemini-1.5-flash',
          'gemini-1.0-pro',
        );
        return;
      }

      // Google's Generative AI SDK uses a different approach
      // We'll use known model families and try to detect available versions
      const knownModelFamilies = [
        // Gemini 2.5 models (newest)
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.5-pro-latest',
        'gemini-2.5-flash-latest',
        'gemini-2.5-pro-experimental',
        'gemini-2.5-flash-experimental',
        // Gemini 2.0 models
        'gemini-2.0-pro',
        'gemini-2.0-flash',
        'gemini-2.0-pro-latest',
        'gemini-2.0-flash-latest',
        'gemini-2.0-pro-experimental',
        'gemini-2.0-flash-experimental',
        // Gemini 1.5 models
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-1.5-pro-latest',
        'gemini-1.5-flash-latest',
        'gemini-1.5-pro-002',
        'gemini-1.5-flash-002',
        'gemini-1.5-pro-001',
        'gemini-1.5-flash-001',
        'gemini-1.5-pro-experimental',
        'gemini-1.5-flash-experimental',
        // Gemini 1.0 models
        'gemini-1.0-pro',
        'gemini-1.0-pro-latest',
        'gemini-1.0-pro-001',
        // Legacy models
        'gemini-pro', // Legacy name
        'gemini-pro-vision', // Vision model
        'gemini-flash', // Short name
      ];

      const availableModels: string[] = [];

      // Test each model to see if it's available
      await Promise.allSettled(
        knownModelFamilies.map(async (modelId) => {
          try {
            if (this.genAI) {
              this.genAI.getGenerativeModel({ model: modelId });
              // If we can create the model instance, it's likely available
              availableModels.push(modelId);
            }
          } catch (error) {
            // Model not available, skip it
          }
        }),
      );

      // Clear existing models and add discovered available models
      (this.supportedModels as string[]).length = 0;
      (this.supportedModels as string[]).push(...availableModels);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[GEMINI PROVIDER] Dynamic model discovery failed, using fallback models:',
        error,
      );

      // Fallback to known working models (including latest)
      const fallbackModels = [
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.0-pro',
        'gemini-2.0-flash',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-1.0-pro',
      ];

      (this.supportedModels as string[]).length = 0;
      (this.supportedModels as string[]).push(...fallbackModels);
    }
  }

  private static getModelDisplayName(modelId: string): string {
    const displayNames: Record<string, string> = {
      // Gemini 2.5 models
      'gemini-2.5-pro': 'Gemini 2.5 Pro',
      'gemini-2.5-flash': 'Gemini 2.5 Flash',
      'gemini-2.5-pro-latest': 'Gemini 2.5 Pro (Latest)',
      'gemini-2.5-flash-latest': 'Gemini 2.5 Flash (Latest)',
      'gemini-2.5-pro-experimental': 'Gemini 2.5 Pro (Experimental)',
      'gemini-2.5-flash-experimental': 'Gemini 2.5 Flash (Experimental)',
      // Gemini 2.0 models
      'gemini-2.0-pro': 'Gemini 2.0 Pro',
      'gemini-2.0-flash': 'Gemini 2.0 Flash',
      'gemini-2.0-pro-latest': 'Gemini 2.0 Pro (Latest)',
      'gemini-2.0-flash-latest': 'Gemini 2.0 Flash (Latest)',
      'gemini-2.0-pro-experimental': 'Gemini 2.0 Pro (Experimental)',
      'gemini-2.0-flash-experimental': 'Gemini 2.0 Flash (Experimental)',
      // Gemini 1.5 models
      'gemini-1.5-pro': 'Gemini 1.5 Pro',
      'gemini-1.5-flash': 'Gemini 1.5 Flash',
      'gemini-1.5-pro-latest': 'Gemini 1.5 Pro (Latest)',
      'gemini-1.5-flash-latest': 'Gemini 1.5 Flash (Latest)',
      'gemini-1.5-pro-002': 'Gemini 1.5 Pro (v2)',
      'gemini-1.5-flash-002': 'Gemini 1.5 Flash (v2)',
      'gemini-1.5-pro-001': 'Gemini 1.5 Pro (v1)',
      'gemini-1.5-flash-001': 'Gemini 1.5 Flash (v1)',
      'gemini-1.5-pro-experimental': 'Gemini 1.5 Pro (Experimental)',
      'gemini-1.5-flash-experimental': 'Gemini 1.5 Flash (Experimental)',
      // Gemini 1.0 models
      'gemini-1.0-pro': 'Gemini 1.0 Pro',
      'gemini-1.0-pro-latest': 'Gemini 1.0 Pro (Latest)',
      'gemini-1.0-pro-001': 'Gemini 1.0 Pro (v1)',
      // Legacy models
      'gemini-pro': 'Gemini Pro (Legacy)',
      'gemini-pro-vision': 'Gemini Pro Vision',
      'gemini-flash': 'Gemini Flash',
    };

    // For unknown models, try to create a display name using pattern matching
    if (!displayNames[modelId]) {
      if (modelId.includes('gemini-2.5-pro')) {
        return 'Gemini 2.5 Pro';
      }
      if (modelId.includes('gemini-2.5-flash')) {
        return 'Gemini 2.5 Flash';
      }
      if (modelId.includes('gemini-2.5')) {
        return 'Gemini 2.5';
      }
      if (modelId.includes('gemini-2.0-pro')) {
        return 'Gemini 2.0 Pro';
      }
      if (modelId.includes('gemini-2.0-flash')) {
        return 'Gemini 2.0 Flash';
      }
      if (modelId.includes('gemini-2.0')) {
        return 'Gemini 2.0';
      }
      if (modelId.includes('gemini-1.5-pro')) {
        return 'Gemini 1.5 Pro';
      }
      if (modelId.includes('gemini-1.5-flash')) {
        return 'Gemini 1.5 Flash';
      }
      if (modelId.includes('gemini-1.5')) {
        return 'Gemini 1.5';
      }
      if (modelId.includes('gemini-1.0-pro')) {
        return 'Gemini 1.0 Pro';
      }
      if (modelId.includes('gemini-1.0')) {
        return 'Gemini 1.0';
      }
      if (modelId.includes('gemini-pro')) {
        return 'Gemini Pro';
      }
      if (modelId.includes('gemini')) {
        return 'Gemini';
      }
      return modelId; // Fallback to raw model ID
    }

    return displayNames[modelId];
  }

  private static getModelDescription(modelId: string): string {
    const descriptions: Record<string, string> = {
      // Gemini 2.5 models
      'gemini-2.5-pro':
        'Most advanced Gemini model with superior reasoning capabilities',
      'gemini-2.5-flash':
        'Ultra-fast Gemini 2.5 model for efficient processing',
      'gemini-2.5-pro-latest':
        'Latest version of the most advanced Gemini model',
      'gemini-2.5-flash-latest':
        'Latest version of the ultra-fast Gemini model',
      'gemini-2.5-pro-experimental':
        'Experimental Gemini 2.5 Pro with cutting-edge features',
      'gemini-2.5-flash-experimental':
        'Experimental Gemini 2.5 Flash for testing new capabilities',
      // Gemini 2.0 models
      'gemini-2.0-pro': 'Next-generation Gemini model for complex reasoning',
      'gemini-2.0-flash': 'Fast and efficient Gemini 2.0 model',
      'gemini-2.0-pro-latest':
        'Latest version of the next-generation Gemini model',
      'gemini-2.0-flash-latest': 'Latest version of the fast Gemini 2.0 model',
      'gemini-2.0-pro-experimental':
        'Experimental Gemini 2.0 Pro with new features',
      'gemini-2.0-flash-experimental':
        'Experimental Gemini 2.0 Flash for testing',
      // Gemini 1.5 models
      'gemini-1.5-pro': 'Most capable model for complex reasoning tasks',
      'gemini-1.5-flash': 'Fast and efficient model for most tasks',
      'gemini-1.5-pro-latest': 'Latest version of the most capable model',
      'gemini-1.5-flash-latest':
        'Latest version of the fast and efficient model',
      'gemini-1.5-pro-002': 'Gemini 1.5 Pro version 2 with improvements',
      'gemini-1.5-flash-002': 'Gemini 1.5 Flash version 2 with enhancements',
      'gemini-1.5-pro-001': 'Original Gemini 1.5 Pro version',
      'gemini-1.5-flash-001': 'Original Gemini 1.5 Flash version',
      'gemini-1.5-pro-experimental':
        'Experimental Gemini 1.5 Pro with new features',
      'gemini-1.5-flash-experimental':
        'Experimental Gemini 1.5 Flash for testing',
      // Gemini 1.0 models
      'gemini-1.0-pro': 'Stable model for general use',
      'gemini-1.0-pro-latest': 'Latest version of the stable model',
      'gemini-1.0-pro-001': 'Original Gemini 1.0 Pro version',
      // Legacy models
      'gemini-pro': 'Legacy model for general use',
      'gemini-pro-vision': 'Multimodal model with vision capabilities',
      'gemini-flash': 'Fast processing model',
    };

    // Generate descriptions for unknown models using pattern matching
    if (!descriptions[modelId]) {
      if (modelId.includes('gemini-2.5-pro')) {
        return 'Advanced Gemini 2.5 Pro model with superior reasoning capabilities';
      }
      if (modelId.includes('gemini-2.5-flash')) {
        return 'Ultra-fast Gemini 2.5 Flash model for efficient processing';
      }
      if (modelId.includes('gemini-2.5')) {
        return 'Next-generation Gemini 2.5 model';
      }
      if (modelId.includes('gemini-2.0-pro')) {
        return 'Advanced Gemini 2.0 Pro model for complex reasoning';
      }
      if (modelId.includes('gemini-2.0-flash')) {
        return 'Fast Gemini 2.0 Flash model for efficient processing';
      }
      if (modelId.includes('gemini-2.0')) {
        return 'Next-generation Gemini 2.0 model';
      }
      if (modelId.includes('gemini-1.5-pro')) {
        return 'Advanced Gemini 1.5 Pro model for complex reasoning';
      }
      if (modelId.includes('gemini-1.5-flash')) {
        return 'Fast Gemini 1.5 Flash model for efficient processing';
      }
      if (modelId.includes('gemini-1.5')) {
        return 'Gemini 1.5 model with advanced capabilities';
      }
      if (modelId.includes('gemini-1.0-pro')) {
        return 'Stable Gemini 1.0 Pro model for general use';
      }
      if (modelId.includes('gemini-1.0')) {
        return 'Stable Gemini 1.0 model';
      }
      if (modelId.includes('gemini-pro')) {
        return 'Gemini Pro model';
      }
      if (modelId.includes('gemini')) {
        return 'Google Gemini AI model';
      }
      return 'Google Gemini AI model';
    }

    return descriptions[modelId];
  }

  private static getModelMaxTokens(modelId: string): number {
    const maxTokens: Record<string, number> = {
      // Gemini 2.5 models (estimated higher token limits)
      'gemini-2.5-pro': 16384,
      'gemini-2.5-flash': 16384,
      'gemini-2.5-pro-latest': 16384,
      'gemini-2.5-flash-latest': 16384,
      'gemini-2.5-pro-experimental': 16384,
      'gemini-2.5-flash-experimental': 16384,
      // Gemini 2.0 models (estimated)
      'gemini-2.0-pro': 12288,
      'gemini-2.0-flash': 12288,
      'gemini-2.0-pro-latest': 12288,
      'gemini-2.0-flash-latest': 12288,
      'gemini-2.0-pro-experimental': 12288,
      'gemini-2.0-flash-experimental': 12288,
      // Gemini 1.5 models
      'gemini-1.5-pro': 8192,
      'gemini-1.5-flash': 8192,
      'gemini-1.5-pro-latest': 8192,
      'gemini-1.5-flash-latest': 8192,
      'gemini-1.5-pro-002': 8192,
      'gemini-1.5-flash-002': 8192,
      'gemini-1.5-pro-001': 8192,
      'gemini-1.5-flash-001': 8192,
      'gemini-1.5-pro-experimental': 8192,
      'gemini-1.5-flash-experimental': 8192,
      // Gemini 1.0 models
      'gemini-1.0-pro': 2048,
      'gemini-1.0-pro-latest': 2048,
      'gemini-1.0-pro-001': 2048,
      // Legacy models
      'gemini-pro': 2048,
      'gemini-pro-vision': 2048,
      'gemini-flash': 8192,
    };

    // For unknown models, infer from version
    if (!maxTokens[modelId]) {
      if (modelId.includes('2.5')) return 16384;
      if (modelId.includes('2.0')) return 12288;
      if (modelId.includes('1.5')) return 8192;
      if (modelId.includes('1.0')) return 2048;
      return 8192; // Safe default for newer models
    }

    return maxTokens[modelId];
  }

  private static getModelCosts(modelId: string) {
    // Gemini pricing (as of 2024/2025)
    const costs: Record<string, { input: number; output: number }> = {
      // Gemini 2.5 models (estimated pricing)
      'gemini-2.5-pro': { input: 0.015, output: 0.045 },
      'gemini-2.5-flash': { input: 0.001, output: 0.003 },
      'gemini-2.5-pro-latest': { input: 0.015, output: 0.045 },
      'gemini-2.5-flash-latest': { input: 0.001, output: 0.003 },
      'gemini-2.5-pro-experimental': { input: 0.015, output: 0.045 },
      'gemini-2.5-flash-experimental': { input: 0.001, output: 0.003 },
      // Gemini 2.0 models (estimated pricing)
      'gemini-2.0-pro': { input: 0.01, output: 0.03 },
      'gemini-2.0-flash': { input: 0.0007, output: 0.0021 },
      'gemini-2.0-pro-latest': { input: 0.01, output: 0.03 },
      'gemini-2.0-flash-latest': { input: 0.0007, output: 0.0021 },
      'gemini-2.0-pro-experimental': { input: 0.01, output: 0.03 },
      'gemini-2.0-flash-experimental': { input: 0.0007, output: 0.0021 },
      // Gemini 1.5 models (known pricing)
      'gemini-1.5-pro': { input: 0.007, output: 0.021 },
      'gemini-1.5-flash': { input: 0.00035, output: 0.00105 },
      'gemini-1.5-pro-latest': { input: 0.007, output: 0.021 },
      'gemini-1.5-flash-latest': { input: 0.00035, output: 0.00105 },
      'gemini-1.5-pro-002': { input: 0.007, output: 0.021 },
      'gemini-1.5-flash-002': { input: 0.00035, output: 0.00105 },
      'gemini-1.5-pro-001': { input: 0.007, output: 0.021 },
      'gemini-1.5-flash-001': { input: 0.00035, output: 0.00105 },
      'gemini-1.5-pro-experimental': { input: 0.007, output: 0.021 },
      'gemini-1.5-flash-experimental': { input: 0.00035, output: 0.00105 },
      // Gemini 1.0 models
      'gemini-1.0-pro': { input: 0.0005, output: 0.0015 },
      'gemini-1.0-pro-latest': { input: 0.0005, output: 0.0015 },
      'gemini-1.0-pro-001': { input: 0.0005, output: 0.0015 },
      // Legacy models
      'gemini-pro': { input: 0.0005, output: 0.0015 }, // Legacy pricing
      'gemini-pro-vision': { input: 0.0005, output: 0.0015 }, // Vision model pricing
      'gemini-flash': { input: 0.00035, output: 0.00105 },
    };

    // For unknown models, try to infer pricing based on model family
    if (!costs[modelId]) {
      if (modelId.includes('gemini-2.5-pro')) {
        return { input: 0.015, output: 0.045 }; // Estimated 2.5 Pro pricing
      }
      if (
        modelId.includes('gemini-2.5-flash') ||
        modelId.includes('gemini-2.5')
      ) {
        return { input: 0.001, output: 0.003 }; // Estimated 2.5 Flash pricing
      }
      if (modelId.includes('gemini-2.0-pro')) {
        return { input: 0.01, output: 0.03 }; // Estimated 2.0 Pro pricing
      }
      if (
        modelId.includes('gemini-2.0-flash') ||
        modelId.includes('gemini-2.0')
      ) {
        return { input: 0.0007, output: 0.0021 }; // Estimated 2.0 Flash pricing
      }
      if (modelId.includes('gemini-1.5-pro')) {
        return { input: 0.007, output: 0.021 }; // Pro pricing
      }
      if (
        modelId.includes('gemini-1.5-flash') ||
        modelId.includes('gemini-1.5')
      ) {
        return { input: 0.00035, output: 0.00105 }; // Flash pricing
      }
      if (
        modelId.includes('gemini-1.0-pro') ||
        modelId.includes('gemini-pro')
      ) {
        return { input: 0.0005, output: 0.0015 }; // Legacy Pro pricing
      }
      // Default to Flash pricing for unknown models (more conservative)
      return { input: 0.00035, output: 0.00105 };
    }

    return costs[modelId];
  }

  private static mapFinishReason(
    response: any,
  ): CompletionResponse['finishReason'] {
    const finishReason = response.candidates?.[0]?.finishReason;

    switch (finishReason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  async generateDashboardsQuery(
    prompt: string,
  ): Promise<GenerateDashboardResponseType[]> {
    try {
      if (!this.genAI) {
        throw new Error('Gemini provider not initialized');
      }

      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-pro',
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.0,
        },
      });

      // Gemini doesn't have function calling like OpenAI/Anthropic, so we'll use structured prompt
      const structuredPrompt = `${prompt}

Please respond with a JSON array of dashboard suggestions in this exact format:
[
  {
    "description": "A human-readable dashboard description",
    "query": "A useful SQL query or dbt select statement"
  }
]

Only return the JSON array, no other text.`;

      const result = await model.generateContent(structuredPrompt);
      const { response } = result;
      const text = response.text();

      if (!text) {
        throw new Error('No response text from Gemini');
      }

      try {
        // Clean the response - remove any markdown formatting
        const cleanedText = text
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '');
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
          '[GEMINI PROVIDER] Failed to parse JSON response:',
          parseError,
        );
        // eslint-disable-next-line no-console
        console.error('[GEMINI PROVIDER] Raw response:', text);
        throw new Error(
          'Failed to parse dashboard suggestions from Gemini response',
        );
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[GEMINI PROVIDER] generateDashboardsQuery failed:', error);
      throw this.handleProviderError(error, 'dashboard generation');
    }
  }

  async enhanceModelQuery(prompt: string): Promise<EnhanceModelResponseType> {
    try {
      if (!this.genAI) {
        throw new Error('Gemini provider not initialized');
      }

      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-pro',
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.0,
        },
      });

      // Use structured prompt for consistent response
      const structuredPrompt = `${prompt}

Please respond with a JSON object in this exact format:
{
  "content": "The updated SQL with placeholders replaced appropriately"
}

Only return the JSON object, no other text.`;

      const result = await model.generateContent(structuredPrompt);
      const { response } = result;
      const text = response.text();

      if (!text) {
        throw new Error('No response text from Gemini');
      }

      try {
        // Clean the response - remove any markdown formatting
        const cleanedText = text
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '');
        const parsed = JSON.parse(cleanedText);

        // Validate the response structure
        if (parsed && typeof parsed.content === 'string') {
          return { content: parsed.content };
        }

        throw new Error('Response does not have valid content field');
      } catch (parseError) {
        // eslint-disable-next-line no-console
        console.error(
          '[GEMINI PROVIDER] Failed to parse JSON response:',
          parseError,
        );
        // eslint-disable-next-line no-console
        console.error('[GEMINI PROVIDER] Raw response:', text);
        throw new Error(
          'Failed to parse model enhancement from Gemini response',
        );
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[GEMINI PROVIDER] enhanceModelQuery failed:', error);
      throw this.handleProviderError(error, 'model enhancement');
    }
  }
}
