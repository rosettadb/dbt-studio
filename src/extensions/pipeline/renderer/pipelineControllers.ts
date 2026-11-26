import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery,
  useQueryClient,
} from 'react-query';
import { QUERY_KEYS } from '../../../extensionApi/studio/queryKeys';
import type { CustomError } from '../../../extensionApi/studio/types';
import type {
  PluginDefinition,
  RunnerRequirementStatus,
} from '../shared/pipelineShared';
import * as pipelineServices from './pipelineServices';

// react-query hooks over the pipeline tool's main-process handlers.

const RUNNER_PLUGINS_QUERY_KEY = 'GET_RUNNER_PLUGINS';

export const useListPipelines = (projectId?: string) => {
  return useQuery({
    queryKey: ['listPipelines', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      return pipelineServices.listPipelines(projectId!);
    },
  });
};

export const useExtractRequiredEnvVars = (
  projectId?: string,
  pipelineRelativePath?: string,
) => {
  return useQuery({
    queryKey: ['extractRequiredEnvVars', projectId, pipelineRelativePath],
    enabled: !!projectId,
    queryFn: async () => {
      return pipelineServices.extractRequiredEnvVars(
        projectId!,
        pipelineRelativePath,
      );
    },
  });
};

// The plugins of the local runner, read from its plugin manifest. The
// manifest only changes when the runner does (an app update).
export const useGetRunnerPlugins = () =>
  useQuery<PluginDefinition[], CustomError>({
    queryKey: [RUNNER_PLUGINS_QUERY_KEY],
    queryFn: () => pipelineServices.getRunnerPlugins(),
    staleTime: Infinity,
  });

export const useCheckRunnerRequirements = (
  customOptions?: UseMutationOptions<
    RunnerRequirementStatus[],
    CustomError,
    void
  >,
): UseMutationResult<RunnerRequirementStatus[], CustomError, void> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  return useMutation({
    mutationFn: async () => {
      return pipelineServices.checkRunnerRequirements();
    },
    onSuccess: (...args) => {
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// KiSQL (Kinetica CLI) controllers
export const useCheckKisqlVersion = (
  customOptions?: UseMutationOptions<
    {
      installed: boolean;
      version?: string;
      path?: string;
      latestSha?: string;
      updateAvailable?: boolean;
    },
    CustomError,
    void
  >,
): UseMutationResult<
  {
    installed: boolean;
    version?: string;
    path?: string;
    latestSha?: string;
    updateAvailable?: boolean;
  },
  CustomError,
  void
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  return useMutation({
    mutationFn: async () => pipelineServices.checkKisqlVersion(),
    onSuccess: (...args) => onCustomSuccess?.(...args),
    onError: (...args) => onCustomError?.(...args),
  });
};

export const useInstallKisql = (
  customOptions?: UseMutationOptions<
    { success: boolean; version: string; path: string; error?: string },
    CustomError,
    void
  >,
): UseMutationResult<
  { success: boolean; version: string; path: string; error?: string },
  CustomError,
  void
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => pipelineServices.installKisql(),
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_SETTINGS]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => onCustomError?.(...args),
  });
};

export const useUninstallKisql = (
  customOptions?: UseMutationOptions<void, CustomError, void>,
): UseMutationResult<void, CustomError, void> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => pipelineServices.uninstallKisql(),
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_SETTINGS]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => onCustomError?.(...args),
  });
};

export const useInstallPySpark = (
  customOptions?: UseMutationOptions<void, CustomError, void>,
): UseMutationResult<void, CustomError, void> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => pipelineServices.installPySpark(),
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_SETTINGS]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => onCustomError?.(...args),
  });
};

export const useUninstallPySpark = (
  customOptions?: UseMutationOptions<void, CustomError, void>,
): UseMutationResult<void, CustomError, void> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  return useMutation({
    mutationFn: async () => pipelineServices.uninstallPySpark(),
    onSuccess: (...args) => onCustomSuccess?.(...args),
    onError: (...args) => onCustomError?.(...args),
  });
};
