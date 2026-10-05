import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from 'react-query';
import type { CustomError } from '../../types/backend';
import type { ChatGptAuthStatus } from '../../types/ipc';
import { QUERY_KEYS } from '../config/constants';
import { aiProvidersService } from '../services/aiProviders.service';

// AI Provider Management Controllers
// These hooks provide React Query integration for AI provider operations

export interface AIProvider {
  id?: number;
  name: string;
  type:
    | 'openai'
    | 'ollama'
    | 'gemini'
    | 'anthropic'
    | 'openai-compatible'
    | 'lmstudio'
    | 'openai-codex';
  config: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface NewAIProvider {
  name: string;
  type:
    | 'openai'
    | 'ollama'
    | 'gemini'
    | 'anthropic'
    | 'openai-compatible'
    | 'lmstudio'
    | 'openai-codex';
  config: string;
  isActive?: boolean;
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

// Get all AI providers
export const useGetAIProviders = (
  customOptions?: UseQueryOptions<AIProvider[], CustomError, AIProvider[]>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_AI_PROVIDERS],
    queryFn: async () => {
      return aiProvidersService.listProviders();
    },
    ...customOptions,
  });
};

// Get specific AI provider
export const useGetAIProvider = (
  id?: number,
  customOptions?: UseQueryOptions<
    AIProvider | null,
    CustomError,
    AIProvider | null
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_AI_PROVIDER_BY_ID, id],
    queryFn: async () => {
      return aiProvidersService.getProviderById(id!);
    },
    enabled: !!id,
    ...customOptions,
  });
};

// Get active AI provider
export const useGetActiveAIProvider = (
  customOptions?: UseQueryOptions<
    AIProvider | null,
    CustomError,
    AIProvider | null
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_ACTIVE_AI_PROVIDER],
    queryFn: async () => {
      return aiProvidersService.getActiveProvider();
    },
    ...customOptions,
  });
};

// Create AI provider
export const useCreateAIProvider = (
  customOptions?: UseMutationOptions<AIProvider, CustomError, NewAIProvider>,
): UseMutationResult<AIProvider, CustomError, NewAIProvider> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (provider: NewAIProvider) => {
      return aiProvidersService.createProvider(provider);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_AI_PROVIDERS]);
      await queryClient.invalidateQueries([QUERY_KEYS.GET_ACTIVE_AI_PROVIDER]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Update AI provider
export const useUpdateAIProvider = (
  customOptions?: UseMutationOptions<
    void,
    CustomError,
    { id: number; updates: Partial<NewAIProvider> }
  >,
): UseMutationResult<
  void,
  CustomError,
  { id: number; updates: Partial<NewAIProvider> }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }) => {
      return aiProvidersService.updateProvider(id, updates);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_AI_PROVIDERS]);
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_AI_PROVIDER_BY_ID,
        args[1].id,
      ]);
      await queryClient.invalidateQueries([QUERY_KEYS.GET_ACTIVE_AI_PROVIDER]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Delete AI provider
export const useDeleteAIProvider = (
  customOptions?: UseMutationOptions<void, CustomError, number>,
): UseMutationResult<void, CustomError, number> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      return aiProvidersService.deleteProvider(id);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_AI_PROVIDERS]);
      await queryClient.invalidateQueries([QUERY_KEYS.GET_ACTIVE_AI_PROVIDER]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Set active AI provider
export const useSetActiveAIProvider = (
  customOptions?: UseMutationOptions<void, CustomError, string>,
): UseMutationResult<void, CustomError, string> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (providerId: string) => {
      return aiProvidersService.setActiveProvider(providerId);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_AI_PROVIDERS]);
      await queryClient.invalidateQueries([QUERY_KEYS.GET_ACTIVE_AI_PROVIDER]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Deactivate all AI providers
export const useDeactivateAllAIProviders = (
  customOptions?: UseMutationOptions<void, CustomError, void>,
): UseMutationResult<void, CustomError, void> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return aiProvidersService.deactivateAllProviders();
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_AI_PROVIDERS]);
      await queryClient.invalidateQueries([QUERY_KEYS.GET_ACTIVE_AI_PROVIDER]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Test AI provider connection
export const useTestAIProvider = (
  customOptions?: UseMutationOptions<ProviderTestResult, CustomError, string>,
): UseMutationResult<ProviderTestResult, CustomError, string> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};

  return useMutation({
    mutationFn: async (providerId: string) => {
      return aiProvidersService.testProviderConnection(providerId);
    },
    onSuccess: (result: ProviderTestResult, ...args) => {
      onCustomSuccess?.(result, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Test temporary provider configuration (before saving)
export const useTestTemporaryProvider = (
  customOptions?: UseMutationOptions<
    ProviderTestResult,
    CustomError,
    { config: NewAIProvider; credentials: Record<string, any> }
  >,
): UseMutationResult<
  ProviderTestResult,
  CustomError,
  { config: NewAIProvider; credentials: Record<string, any> }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};

  return useMutation({
    mutationFn: async ({
      config,
      credentials,
    }: {
      config: NewAIProvider;
      credentials: Record<string, any>;
    }) => {
      return aiProvidersService.testTemporaryProvider(config, credentials);
    },
    onSuccess: (result: ProviderTestResult, ...args) => {
      onCustomSuccess?.(result, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Get provider models
export const useGetProviderModels = (
  providerId?: string,
  customOptions?: UseQueryOptions<AIModel[], CustomError, AIModel[]>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_AI_PROVIDER_MODELS, providerId],
    queryFn: async () => {
      return aiProvidersService.getProviderModels(providerId!);
    },
    enabled: !!providerId,
    ...customOptions,
  });
};

// Get all models from all providers
export const useGetAllProviderModels = (
  customOptions?: UseQueryOptions<
    Map<string, AIModel[]>,
    CustomError,
    Map<string, AIModel[]>
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_ALL_AI_PROVIDER_MODELS],
    queryFn: async () => {
      return aiProvidersService.getAllProviderModels();
    },
    ...customOptions,
  });
};

// ChatGPT subscription sign-in (Plan 71)

export type ChatGptSignInStatus = 'idle' | ChatGptAuthStatus;

export type ChatGptLogin = {
  loginId: string;
  email: string | null;
  planType: string | null;
};

/**
 * Owns the ChatGPT browser sign-in for the Add/Edit AI Provider dialog:
 * the lifecycle-event subscription (FE-03), the active correlation ID, and
 * the pending login. The pending login is discarded by `reset()`, which the
 * dialog calls when it closes. After Create Provider the main process has
 * already moved the credential, so discarding is a harmless no-op.
 */
export const useChatGptSignIn = () => {
  const [status, setStatus] = useState<ChatGptSignInStatus>('idle');
  const [error, setError] = useState<string | undefined>();
  const [login, setLogin] = useState<ChatGptLogin | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const loginIdRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = aiProvidersService.onChatGptAuthEvent((payload) => {
      if (payload.correlationId !== activeIdRef.current) return;
      setStatus(payload.status);
      if (payload.error) setError(payload.error);
    });
    return () => {
      unsubscribe();
      if (activeIdRef.current) {
        aiProvidersService
          .cancelChatGptAuth(activeIdRef.current)
          .catch(() => {});
        activeIdRef.current = null;
      }
    };
  }, []);

  const discardPending = useCallback(() => {
    const loginId = loginIdRef.current;
    loginIdRef.current = null;
    setLogin(null);
    if (loginId) {
      aiProvidersService.discardChatGptPendingLogin(loginId).catch(() => {});
    }
  }, []);

  const start = useCallback(async () => {
    discardPending();
    const correlationId = crypto.randomUUID();
    activeIdRef.current = correlationId;
    setError(undefined);
    setStatus('started');
    try {
      const result = await aiProvidersService.startChatGptAuth({
        correlationId,
      });
      if (activeIdRef.current !== correlationId) {
        // Cancelled or replaced while the sign-in finished: drop its tokens.
        if (result.ok) {
          aiProvidersService
            .discardChatGptPendingLogin(result.loginId)
            .catch(() => {});
        }
        return;
      }
      if (result.ok) {
        loginIdRef.current = result.loginId;
        setLogin({
          loginId: result.loginId,
          email: result.email,
          planType: result.planType,
        });
        setStatus('completed');
      } else {
        setError(result.message);
        setStatus((current) =>
          current === 'cancelled' ? 'cancelled' : 'failed',
        );
      }
    } catch (e) {
      if (activeIdRef.current !== correlationId) return;
      setError((e as Error)?.message || 'ChatGPT sign-in failed.');
      setStatus('failed');
    } finally {
      if (activeIdRef.current === correlationId) activeIdRef.current = null;
    }
  }, [discardPending]);

  const cancel = useCallback(() => {
    const correlationId = activeIdRef.current;
    activeIdRef.current = null;
    if (correlationId) {
      aiProvidersService.cancelChatGptAuth(correlationId).catch(() => {});
    }
    setStatus('cancelled');
    setError('Sign-in cancelled.');
  }, []);

  const reset = useCallback(() => {
    if (activeIdRef.current) {
      aiProvidersService.cancelChatGptAuth(activeIdRef.current).catch(() => {});
      activeIdRef.current = null;
    }
    discardPending();
    setStatus('idle');
    setError(undefined);
  }, [discardPending]);

  return { status, error, login, start, cancel, reset };
};

export const useSignOutChatGpt = (
  customOptions?: UseMutationOptions<void, CustomError, number>,
): UseMutationResult<void, CustomError, number> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (providerId: number) =>
      aiProvidersService.signOutChatGpt(providerId),
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_AI_PROVIDERS]);
      await queryClient.invalidateQueries([QUERY_KEYS.GET_ACTIVE_AI_PROVIDER]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};
