import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from 'react-query';
import React from 'react';
import { toast } from 'react-toastify';
import {
  CloudDeploymentPayload,
  CustomError,
  Secret,
} from '../../types/backend';
import {
  ApiKeyState,
  UseApiKeyResult,
  UseAuthLoginResult,
  UseAuthLogoutResult,
} from '../../types/apiKey';
import { rosettaCloudServices } from '../services';
import { QUERY_KEYS } from '../config/constants';

export const usePushProjectToCloud = (
  customOptions?: UseMutationOptions<
    unknown,
    CustomError,
    CloudDeploymentPayload
  >,
): UseMutationResult<unknown, CustomError, CloudDeploymentPayload> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return rosettaCloudServices.pushProjectToCloud(data);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_SELECTED_PROJECT]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useApiKey = (
  options?: UseQueryOptions<ApiKeyState, CustomError, ApiKeyState>,
): UseApiKeyResult => {
  const result = useQuery({
    queryKey: [QUERY_KEYS.API_KEY],
    queryFn: () => rosettaCloudServices.getApiKey(),
    ...options,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
};

export const useValidateApiKey = () => {
  return useMutation({
    mutationFn: (apiKey: string) => rosettaCloudServices.validateApiKey(apiKey),
    retry: false, // Don't retry validation failures
  });
};

// Legacy hook removed as part of JWT token to API key migration
// Use useApiKey() instead

export const useGetSecrets = (
  projectId?: string,
  options?: UseQueryOptions<Secret[], CustomError, Secret[]>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.CLOUD_SECRETS],
    queryFn: () => rosettaCloudServices.getSecrets(projectId ?? ''),
    ...options,
  });
};

export const useAuthLogin = (
  options?: UseMutationOptions<string, CustomError, void>,
): UseAuthLoginResult => {
  const mutation = useMutation({
    mutationFn: () => rosettaCloudServices.openLogin(),
    ...options,
  });

  return {
    mutate: mutation.mutate,
    isLoading: mutation.isLoading,
    error: mutation.error,
  };
};

export const useAuthLogout = (
  options?: UseMutationOptions<void, CustomError, void>,
): UseAuthLogoutResult => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } = options || {};
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => rosettaCloudServices.logout(),
    onSuccess: async (...args) => {
      // Invalidate both API key and profile queries
      await queryClient.invalidateQueries([QUERY_KEYS.API_KEY]);
      await queryClient.invalidateQueries([QUERY_KEYS.USER_PROFILE]);

      toast.success('Logged out successfully');
      onCustomSuccess?.(...args);
    },
    onError: (error, ...args) => {
      // eslint-disable-next-line no-console
      console.error('Logout error:', error);
      toast.error('Failed to logout');
      onCustomError?.(error as CustomError, ...args);
    },
  });

  return {
    mutate: mutation.mutate,
    isLoading: mutation.isLoading,
    error: mutation.error,
  };
};

export const useAuthSubscription = () => {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const unsubscribeSuccess = rosettaCloudServices.subscribeToAuthSuccess(
      (payload) => {
        // eslint-disable-next-line no-console
        console.log('Auth success received:', payload);
        toast.success('Cloud Dashboard login completed.');

        // Invalidate queries to refresh data
        queryClient.invalidateQueries([QUERY_KEYS.API_KEY]);
        queryClient.invalidateQueries([QUERY_KEYS.USER_PROFILE]);
      },
    );

    const unsubscribeError = rosettaCloudServices.subscribeToAuthError(
      (payload) => {
        // eslint-disable-next-line no-console
        console.error('Auth error received:', payload);
        toast.error(payload.error || 'Authentication failed');
      },
    );

    const unsubscribeApiKeyUpdate =
      rosettaCloudServices.subscribeToApiKeyUpdate(() => {
        // eslint-disable-next-line no-console
        console.log('API key updated');

        // Invalidate queries when API key is updated
        queryClient.invalidateQueries([QUERY_KEYS.API_KEY]);
        queryClient.invalidateQueries([QUERY_KEYS.USER_PROFILE]);
      });

    return () => {
      unsubscribeSuccess();
      unsubscribeError();
      unsubscribeApiKeyUpdate();
    };
  }, [queryClient]);
};
