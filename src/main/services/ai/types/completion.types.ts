export interface CompletionRequest {
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
  };
  options?: Record<string, any>;
}

export interface CompletionResponse {
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
}

export interface CompletionChunk {
  content: string;
  done: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, any>;
}

export interface StreamOptions {
  onChunk?: (chunk: CompletionChunk) => void;
  onComplete?: (response: CompletionResponse) => void;
  onError?: (error: Error) => void;
}

export interface CompletionOptions {
  maxRetries?: number;
  timeout?: number;
  fallbackProviders?: string[];
}

// Legacy response types for backward compatibility
export interface EnhanceModelResponseType {
  content: string;
}

export interface GenerateDashboardResponseType {
  description: string;
  query: string;
}
