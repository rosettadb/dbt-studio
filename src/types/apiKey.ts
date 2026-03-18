/**
 * API Key Authentication Types
 *
 * This file contains type definitions for API key-based authentication
 * replacing the previous JWT token system.
 */

// API Key Authentication State
export type ApiKeyState = string | null;

// Authentication Event Payloads
export interface AuthSuccessPayload {
  apiKey: string;
}

export interface AuthErrorPayload {
  error: string;
}

export interface ApiKeyUpdatePayload {
  // Void type - no payload data needed for API key updates
}

// Authentication Status
export interface AuthenticationStatus {
  isAuthenticated: boolean;
  apiKey: ApiKeyState;
  isLoading: boolean;
  error?: string;
}

// API Key Service Operations
export interface ApiKeyServiceOperations {
  // Core operations
  getApiKey(): Promise<ApiKeyState>;
  storeApiKey(apiKey: string): Promise<void>;
  clearApiKey(): Promise<void>;

  // Authentication state
  isAuthenticated(): Promise<boolean>;

  // Event subscriptions
  subscribeToAuthSuccess(
    callback: (payload: AuthSuccessPayload) => void,
  ): () => void;
  subscribeToAuthError(
    callback: (payload: AuthErrorPayload) => void,
  ): () => void;
  subscribeToApiKeyUpdate(callback: () => void): () => void;
}

// React Query Hook Types
export interface UseApiKeyResult {
  data: ApiKeyState;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

export interface UseAuthLoginResult {
  mutate: () => void;
  isLoading: boolean;
  error: unknown;
}

export interface UseAuthLogoutResult {
  mutate: () => void;
  isLoading: boolean;
  error: unknown;
}

// Legacy Types (deprecated - use API key types instead)
// Note: Legacy types removed as part of JWT token to API key migration
