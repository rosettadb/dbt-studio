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
import { CloudLogEntry, CloudPipelineData } from '../../types/cloudAction';
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
      toast.success('Cloud run started successfully');
      // GET_SELECTED_PROJECT invalidation refreshes the project row from
      // database.json — that's where pipelineRuns now lives, so the
      // CI/CD view picks up the freshly-recorded actionId.
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
    queryKey: [QUERY_KEYS.CLOUD_SECRETS, projectId],
    queryFn: () => rosettaCloudServices.getSecrets(projectId!),
    ...options,
    enabled: !!projectId && (options?.enabled ?? true),
  });
};

export const useDeleteSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      secretId,
    }: {
      projectId: string;
      secretId: string;
    }) => rosettaCloudServices.deleteSecret(projectId, secretId),
    onSuccess: () => {
      queryClient.invalidateQueries([QUERY_KEYS.CLOUD_SECRETS]);
    },
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

/**
 * Returns the cloud action id for a given pipeline file on a given project.
 * Reads from `project.pipelineRuns` if present (the locally-recorded mapping
 * from any run triggered through this app); otherwise queries the cloud for a
 * matching action and the main process persists what it finds.
 *
 * `recordedActionId` is the locally-cached value (caller passes it from
 * `project.pipelineRuns?.[pipelineFile]`). When set, no cloud call happens.
 */
export const usePipelineActionId = (
  projectId: string | null | undefined,
  pipelineFile: string | null | undefined,
  recordedActionId: string | null | undefined,
): string | null => {
  const queryClient = useQueryClient();
  const enabled = !recordedActionId && !!projectId && !!pipelineFile;

  const { data: discovered } = useQuery({
    queryKey: ['pipelineActionFallback', projectId, pipelineFile],
    queryFn: () =>
      rosettaCloudServices.findActionForPipeline(projectId!, pipelineFile!),
    enabled,
    // Each call re-queries the cloud — the discovered id may be different
    // after a new run. staleTime: 0 keeps the hook responsive to changes.
    staleTime: 0,
    onSuccess: (id) => {
      if (id) {
        // The main process already wrote the id into pipelineRuns; refresh the
        // selected project so the recorded path takes over on next render.
        queryClient.invalidateQueries([QUERY_KEYS.GET_SELECTED_PROJECT]);
      }
    },
  });

  return recordedActionId ?? discovered ?? null;
};

export const useCloudActionStatus = (
  actionId?: string | null,
  options?: UseQueryOptions<
    CloudPipelineData | null,
    CustomError,
    CloudPipelineData | null
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.CLOUD_ACTION_STATUS, actionId],
    queryFn: () =>
      actionId
        ? rosettaCloudServices.getActionStatus(actionId)
        : Promise.resolve(null),
    enabled: !!actionId,
    // Keep polling while at least one step is still pending/running. Stop once
    // every step has settled into a terminal state.
    refetchInterval: (data) => {
      if (!data?.steps?.length) return 3000;
      const stillActive = data.steps.some(
        (s) =>
          s.status === 'running' ||
          s.status === 'pending' ||
          s.status === 'not_started',
      );
      return stillActive ? 3000 : false;
    },
    ...options,
  });
};

const isActionFinishedFromStatus = (
  status: CloudPipelineData | null | undefined,
): boolean => {
  if (!status?.steps?.length) return false;
  return status.steps.every(
    (s) =>
      s.status === 'success' ||
      s.status === 'failed' ||
      s.status === 'skipped' ||
      s.status === 'cancelled',
  );
};

/**
 * Public log hook for the CI/CD view. Polls the same `/logs` endpoint the
 * cloud dashboard itself uses to display logs (rather than the SSE stream
 * endpoint, which nothing else in the product exercises) every 3s while the
 * action is still running, and stops once every step has settled into a
 * terminal state.
 */
export const useCloudActionLogs = (actionId?: string | null) => {
  const { data: status } = useCloudActionStatus(actionId ?? null);
  const isFinished = isActionFinishedFromStatus(status);

  const { data, error } = useQuery({
    queryKey: ['cloudActionLogs', actionId],
    queryFn: () =>
      actionId
        ? rosettaCloudServices.getActionLogs(actionId)
        : Promise.resolve([] as CloudLogEntry[]),
    enabled: !!actionId,
    refetchInterval: isFinished ? false : 3000,
  });

  return {
    logs: data ?? [],
    error: error
      ? ((error as CustomError)?.message ?? 'Failed to fetch logs')
      : null,
    mode: isFinished ? ('static' as const) : ('stream' as const),
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
