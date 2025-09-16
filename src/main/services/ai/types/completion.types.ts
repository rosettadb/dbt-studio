// types/completion.types.ts

// JSON Schema definition for structured responses
export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  description?: string;
  enum?: any[];
  additionalProperties?: boolean | JSONSchema;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

// Schema configuration for providers
export interface SchemaConfig<T = any> {
  schema: JSONSchema;
  name?: string;
  description?: string;
  strict?: boolean; // For providers that support strict mode (like OpenAI)
}

// Enhanced CompletionRequest with generic typing
export interface CompletionRequest<T = any> {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  type?: 'chat' | 'enhance-model' | 'generate-dashboard' | 'generic';
  context?: {
    projectId?: number;
    conversationId?: number;
    files?: string[];
    schema?: any[];
    tokenCount?: number;
    budget?: any;
  };
  options?: Record<string, any>;
  // NEW: Schema support for structured responses
  schemaConfig?: SchemaConfig<T>;
}

// Enhanced CompletionResponse with generic typing
export interface CompletionResponse<T = any> {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  providerId: string;
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls';
  metadata?: Record<string, any>;
  data?: any; // For backward compatibility with existing response formats
  // NEW: Typed parsed data from schema
  parsedData?: T;
  schemaValidation?: {
    isValid: boolean;
    errors?: string[];
    originalResponse?: string; // Raw response before parsing
  };
}

// Enhanced CompletionChunk with generic typing
export interface CompletionChunk<T = any> {
  content: string;
  done: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, any>;
  // NEW: Partial parsed data for streaming
  parsedData?: Partial<T>;
}

// Enhanced StreamOptions with generic typing
export interface StreamOptions<T = any> {
  onChunk?: (chunk: CompletionChunk<T>) => void;
  onComplete?: (response: CompletionResponse<T>) => void;
  onError?: (error: Error) => void;
}

export interface CompletionOptions {
  maxRetries?: number;
  timeout?: number;
  fallbackProviders?: string[];
}

// Helper types for strongly typed requests
export interface TypedCompletionRequest<T>
  extends Omit<CompletionRequest<T>, 'schemaConfig'> {
  schemaConfig: SchemaConfig<T>;
}

// Utility type for inferring return type from schema config
export type InferSchemaType<S extends SchemaConfig> =
  S extends SchemaConfig<infer T> ? T : unknown;

// Legacy response types for backward compatibility
export interface EnhanceModelResponseType {
  content: string;
}

export interface GenerateDashboardResponseType {
  description: string;
  query: string;
}

// Utility types for common schema patterns
export type StringSchema = JSONSchema & { type: 'string' };
export type NumberSchema = JSONSchema & { type: 'number' };
export type BooleanSchema = JSONSchema & { type: 'boolean' };
export type ArraySchema<T = any> = JSONSchema & {
  type: 'array';
  items: JSONSchema;
};
export type ObjectSchema<T = any> = JSONSchema & {
  type: 'object';
  properties: Record<string, JSONSchema>;
};

// Helper function types for schema creation
export interface SchemaBuilder {
  string(options?: Partial<StringSchema>): StringSchema;
  number(options?: Partial<NumberSchema>): NumberSchema;
  boolean(options?: Partial<BooleanSchema>): BooleanSchema;
  array(items: JSONSchema, options?: Partial<ArraySchema>): ArraySchema;
  object(
    properties: Record<string, JSONSchema>,
    options?: Partial<ObjectSchema>,
  ): ObjectSchema;
}
