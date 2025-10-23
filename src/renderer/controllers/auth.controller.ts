import React from 'react';
import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery,
  UseQueryOptions,
  useQueryClient,
} from 'react-query';
import { toast } from 'react-toastify';
import type { CustomError } from '../../types/backend';
import { QUERY_KEYS } from '../config/constants';
import { authService } from '../services/auth.service';

export const useAuthToken = (
  options?: UseQueryOptions<string | null, CustomError, string | null>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.AUTH_TOKEN],
    queryFn: () => authService.getToken(),
    ...options,
  });
};

export const useAuthLogin = (
  options?: UseMutationOptions<string, CustomError, void>,
): UseMutationResult<string, CustomError, void> => {
  return useMutation({
    mutationFn: () => authService.openLogin(),
    ...options,
  });
};

export const useAuthLogout = (
  options?: UseMutationOptions<void, CustomError, void>,
): UseMutationResult<void, CustomError, void> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } = options || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.AUTH_TOKEN]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useAuthSubscription = () => {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const unsubscribeSuccess = authService.subscribeToAuthSuccess(() => {
      // Don't store token here - it's already stored in main process
      // Just show success message
      toast.success('Cloud Dashboard login completed.');
    });

    const unsubscribeError = authService.subscribeToAuthError((message) => {
      toast.error(message);
    });

    const unsubscribeTokenUpdate = authService.subscribeToTokenUpdate(() => {
      // Invalidate the auth token query to force a refetch
      queryClient.invalidateQueries([QUERY_KEYS.AUTH_TOKEN]);
    });

    return () => {
      unsubscribeSuccess();
      unsubscribeError();
      unsubscribeTokenUpdate();
    };
  }, [queryClient]);
};
