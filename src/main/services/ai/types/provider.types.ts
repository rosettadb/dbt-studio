export type AIProviderType =
  | 'openai'
  | 'ollama'
  | 'gemini'
  | 'anthropic'
  | 'openai-compatible'
  | 'lmstudio';

export interface ProviderCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  imageInput: boolean;
  maxTokens: number;
  contextWindow: number;
}

export interface AIModel {
  id: string;
  name: string;
  description?: string;
  maxTokens: number;
  costPer1kTokens?: {
    input: number;
    output: number;
  };
  supportsStreaming: boolean;
  supportsStructuredOutput?: boolean;
  lastCheckedAt?: string;
}

export interface ProviderTestResult {
  success: boolean;
  error?: string;
  latencyMs?: number;
  modelsAvailable?: number;
  models?: AIModel[];
  message?: string;
}

export interface CostEstimate {
  estimatedTokens: number;
  estimatedCost: number;
  currency: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  responseTimeMs?: number;
  error?: string;
}

export interface AIProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: any;
}

export type ProviderStatus =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'initializing';
