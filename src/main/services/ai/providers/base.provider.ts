// providers/base.provider.ts

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
  JSONSchema,
  SchemaConfig,
  TypedCompletionRequest,
} from '../types/completion.types';

/**
 * Abstract base class for all AI providers
 * Defines the common interface that all provider implementations must follow
 * Now supports generic typing for structured responses
 */
export abstract class BaseAIProvider {
  abstract readonly name: string;

  abstract readonly type: AIProviderType;

  abstract readonly supportedModels: string[];

  abstract readonly capabilities: ProviderCapabilities;

  // Provider lifecycle methods
  abstract initialize(config: AIProviderConfig): Promise<void>;

  abstract testConnection(): Promise<ProviderTestResult>;

  // Core AI operations with generic support
  abstract generateCompletion<T = any>(
    request: CompletionRequest<T>,
  ): Promise<CompletionResponse<T>>;

  abstract streamCompletion<T = any>(
    request: CompletionRequest<T>,
  ): AsyncGenerator<CompletionChunk<T>>;

  // Strongly typed method for schema-based completions
  async generateTypedCompletion<T>(
    request: TypedCompletionRequest<T>,
  ): Promise<CompletionResponse<T>> {
    return this.generateCompletion<T>(request);
  }

  // Model and capability discovery
  abstract getAvailableModels(): Promise<AIModel[]>;

  abstract estimateCost(request: CompletionRequest): Promise<CostEstimate>;

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

    // Validate schema config if provided
    if (request.schemaConfig) {
      this.validateSchemaConfig(request.schemaConfig);
    }
  }

  protected static validateSchemaConfig(schemaConfig: SchemaConfig): void {
    if (!schemaConfig.schema) {
      throw new Error('Schema config must include a schema definition');
    }

    if (!schemaConfig.schema.type) {
      throw new Error('Schema must specify a type');
    }

    // Basic schema validation
    this.validateSchema(schemaConfig.schema);
  }

  protected static validateSchema(schema: JSONSchema, path = 'schema'): void {
    const validTypes = [
      'object',
      'array',
      'string',
      'number',
      'boolean',
      'null',
    ];

    if (!validTypes.includes(schema.type)) {
      throw new Error(`Invalid schema type "${schema.type}" at ${path}`);
    }

    if (schema.type === 'object' && schema.properties) {
      // eslint-disable-next-line no-restricted-syntax
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        this.validateSchema(propSchema, `${path}.properties.${key}`);
      }
    }

    if (schema.type === 'array' && schema.items) {
      this.validateSchema(schema.items, `${path}.items`);
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

  // Schema validation helper methods
  protected validateResponseAgainstSchema<T>(
    response: string,
    schema: JSONSchema,
  ): { isValid: boolean; errors: string[]; parsedData?: T } {
    const errors: string[] = [];
    let parsedData: T | undefined;

    try {
      // Try to parse the response as JSON
      const parsed = JSON.parse(response);
      parsedData = parsed;

      // Validate against schema
      const validation = this.validateDataAgainstSchema(parsed, schema);
      errors.push(...validation.errors);

      return {
        isValid: errors.length === 0,
        errors,
        parsedData: errors.length === 0 ? parsedData : undefined,
      };
    } catch (parseError) {
      errors.push(
        `Failed to parse response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
      );
      return {
        isValid: false,
        errors,
      };
    }
  }

  protected validateDataAgainstSchema(
    data: any,
    schema: JSONSchema,
    path = '',
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    const validate = (
      value: any,
      schemaObj: JSONSchema,
      currentPath: string,
    ): void => {
      // Type validation
      if (schemaObj.type) {
        const actualType = this.getDataType(value);
        if (actualType !== schemaObj.type) {
          errors.push(
            `${currentPath || 'root'}: expected ${schemaObj.type}, got ${actualType}`,
          );
          return;
        }
      }

      // Object validation
      if (schemaObj.type === 'object') {
        if (
          typeof value !== 'object' ||
          value === null ||
          Array.isArray(value)
        ) {
          errors.push(`${currentPath || 'root'}: expected object`);
          return;
        }

        // Check required fields
        if (schemaObj.required) {
          // eslint-disable-next-line no-restricted-syntax
          for (const requiredField of schemaObj.required) {
            if (!(requiredField in value)) {
              errors.push(
                `${currentPath}.${requiredField}: required field missing`,
              );
            }
          }
        }

        // Validate properties
        if (schemaObj.properties) {
          // eslint-disable-next-line no-restricted-syntax
          for (const [key, propSchema] of Object.entries(
            schemaObj.properties,
          )) {
            if (key in value) {
              const newPath = currentPath ? `${currentPath}.${key}` : key;
              validate(value[key], propSchema, newPath);
            }
          }
        }
      }

      // Array validation
      if (schemaObj.type === 'array') {
        if (!Array.isArray(value)) {
          errors.push(`${currentPath || 'root'}: expected array`);
          return;
        }

        if (schemaObj.minItems && value.length < schemaObj.minItems) {
          errors.push(
            `${currentPath || 'root'}: array must have at least ${schemaObj.minItems} items`,
          );
        }

        if (schemaObj.maxItems && value.length > schemaObj.maxItems) {
          errors.push(
            `${currentPath || 'root'}: array must have at most ${schemaObj.maxItems} items`,
          );
        }

        // Validate items
        if (schemaObj.items) {
          value.forEach((item, index) => {
            const newPath = currentPath
              ? `${currentPath}[${index}]`
              : `[${index}]`;
            validate(item, schemaObj.items!, newPath);
          });
        }
      }

      // String validation
      if (schemaObj.type === 'string') {
        if (schemaObj.pattern) {
          const regex = new RegExp(schemaObj.pattern);
          if (!regex.test(value)) {
            errors.push(
              `${currentPath || 'root'}: string does not match pattern ${schemaObj.pattern}`,
            );
          }
        }
      }

      // Number validation
      if (schemaObj.type === 'number') {
        if (schemaObj.minimum !== undefined && value < schemaObj.minimum) {
          errors.push(
            `${currentPath || 'root'}: number must be >= ${schemaObj.minimum}`,
          );
        }

        if (schemaObj.maximum !== undefined && value > schemaObj.maximum) {
          errors.push(
            `${currentPath || 'root'}: number must be <= ${schemaObj.maximum}`,
          );
        }
      }

      // Enum validation
      if (schemaObj.enum && !schemaObj.enum.includes(value)) {
        errors.push(
          `${currentPath || 'root'}: value must be one of ${schemaObj.enum.join(', ')}`,
        );
      }
    };

    try {
      validate(data, schema, path);
      return { isValid: errors.length === 0, errors };
    } catch (error) {
      return {
        isValid: false,
        errors: [
          `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };
    }
  }

  // eslint-disable-next-line class-methods-use-this
  private getDataType(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  // Provider capability detection for schema support
  protected supportsNativeSchemas(): boolean {
    return this.capabilities.functionCalling;
  }

  protected shouldUseStructuredPrompt(): boolean {
    return !this.supportsNativeSchemas();
  }
}
