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

export const useAuthToken = (
  options?: UseQueryOptions<string | null, CustomError, string | null>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.AUTH_TOKEN],
    queryFn: () => rosettaCloudServices.getToken(),
    ...options,
  });
};

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
): UseMutationResult<string, CustomError, void> => {
  return useMutation({
    mutationFn: () => rosettaCloudServices.openLogin(),
    ...options,
  });
};

export const useAuthLogout = (
  options?: UseMutationOptions<void, CustomError, void>,
): UseMutationResult<void, CustomError, void> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } = options || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => rosettaCloudServices.logout(),
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
    const unsubscribeSuccess = rosettaCloudServices.subscribeToAuthSuccess(
      () => {
        // Don't store token here - it's already stored in main process
        // Just show success message
        toast.success('Cloud Dashboard login completed.');
      },
    );

    const unsubscribeError = rosettaCloudServices.subscribeToAuthError(
      (message) => {
        toast.error(message);
      },
    );

    const unsubscribeTokenUpdate = rosettaCloudServices.subscribeToTokenUpdate(
      () => {
        // Invalidate the auth token query to force a refetch
        queryClient.invalidateQueries([QUERY_KEYS.AUTH_TOKEN]);
      },
    );

    return () => {
      unsubscribeSuccess();
      unsubscribeError();
      unsubscribeTokenUpdate();
    };
  }, [queryClient]);
};
