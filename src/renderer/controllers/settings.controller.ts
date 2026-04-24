import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from 'react-query';
import { settingsServices } from '../services';
import {
  CliUpdateResponseType,
  CustomError,
  FileDialogProperties,
  SettingsType,
  RosettaVersionInfo,
  InstallResult,
} from '../../types/backend';
import { QUERY_KEYS } from '../config/constants';

export const useGetSettings = (
  customOptions?: UseQueryOptions<SettingsType, CustomError, SettingsType>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_SETTINGS],
    queryFn: async () => {
      const res = await settingsServices.getSettings();
      return {
        ...res,
        env: res.env,
      };
    },
    ...customOptions,
  });
};

export const useGetSettingsWithDatabaseInfo = (
  customOptions?: UseQueryOptions<SettingsType, CustomError, SettingsType>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_SETTINGS, 'with-db-info'],
    queryFn: async () => {
      return settingsServices.getSettingsWithDatabaseInfo();
    },
    ...customOptions,
  });
};

export const useCheckCliUpdates = (
  customOptions?: UseQueryOptions<
    Record<string, any>,
    CustomError,
    Record<string, any>
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.CHECK_CLI_UPDATES],
    queryFn: async () => {
      return settingsServices.checkCliUpdate();
    },
    ...customOptions,
  });
};

export const useUpdateSettings = (
  customOptions?: UseMutationOptions<void, CustomError, SettingsType>,
): UseMutationResult<void, CustomError, SettingsType> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return settingsServices.updateSettings(data);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_SETTINGS]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useFilePicker = (
  customOptions?: UseMutationOptions<
    string[],
    CustomError,
    {
      properties: FileDialogProperties[];
      defaultPath?: string;
      filters?: { name: string; extensions: string[] }[];
    }
  >,
): UseMutationResult<
  string[],
  CustomError,
  {
    properties: FileDialogProperties[];
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  return useMutation({
    mutationFn: async (data) => {
      return settingsServices.getFilePaths(data);
    },
    onSuccess: async (...args) => {
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useUpdateCli = (
  customOptions?: UseMutationOptions<
    CliUpdateResponseType,
    CustomError,
    'dbt' | 'rosetta'
  >,
): UseMutationResult<CliUpdateResponseType, CustomError, 'dbt' | 'rosetta'> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return settingsServices.updateCli(data);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_SETTINGS]);
      await queryClient.invalidateQueries([QUERY_KEYS.CHECK_CLI_UPDATES]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useResetFactorySettings = (
  customOptions?: UseMutationOptions<void, CustomError, void>,
): UseMutationResult<void, CustomError, void> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return settingsServices.resetFactorySettings();
    },
    onSuccess: async (...args) => {
      // Invalidate all queries since we're resetting everything
      await queryClient.invalidateQueries();
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Rosetta version management controllers
export const useCheckRosettaVersions = (
  customOptions?: UseMutationOptions<RosettaVersionInfo, CustomError, void>,
): UseMutationResult<RosettaVersionInfo, CustomError, void> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  return useMutation({
    mutationFn: async () => {
      return settingsServices.checkRosettaVersions();
    },
    onSuccess: (...args) => {
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useInstallRosettaVersion = (
  customOptions?: UseMutationOptions<InstallResult, CustomError, string>,
): UseMutationResult<InstallResult, CustomError, string> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (version: string) => {
      return settingsServices.installRosettaVersion(version);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_SETTINGS]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useUninstallRosetta = (
  customOptions?: UseMutationOptions<void, CustomError, void>,
): UseMutationResult<void, CustomError, void> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return settingsServices.uninstallRosetta();
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_SETTINGS]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// DuckDB hooks
export const useGetDuckDbMetadata = (
  customOptions?: UseQueryOptions<any, CustomError, any>,
) => {
  return useQuery({
    queryKey: ['duckdb-metadata'],
    queryFn: async () => {
      return settingsServices.getDuckDbMetadata();
    },
    ...customOptions,
  });
};

export const useRefreshDuckDbMetadata = (
  customOptions?: UseMutationOptions<any, CustomError, void>,
): UseMutationResult<any, CustomError, void> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return settingsServices.refreshDuckDbMetadata();
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries(['duckdb-metadata']);
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_SETTINGS,
        'with-db-info',
      ]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useReinitializeDuckDb = (
  customOptions?: UseMutationOptions<
    any,
    CustomError,
    { dropExisting?: boolean }
  >,
): UseMutationResult<any, CustomError, { dropExisting?: boolean }> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (options) => {
      return settingsServices.reinitializeDuckDb(options);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries(['duckdb-metadata']);
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_SETTINGS,
        'with-db-info',
      ]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useDiagnoseDuckDb = (
  customOptions?: UseQueryOptions<any, CustomError, any>,
) => {
  return useQuery({
    queryKey: ['duckdb-diagnostics'],
    queryFn: async () => {
      return settingsServices.diagnoseDuckDb();
    },
    ...customOptions,
    refetchInterval: 5000, // Auto-refresh every 5s when open
  });
};
