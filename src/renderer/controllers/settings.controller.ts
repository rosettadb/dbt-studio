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
} from '../../types/backend';
import { QUERY_KEYS } from '../config/constants';

export const useGetSettings = (
  customOptions?: UseQueryOptions<SettingsType, CustomError, SettingsType>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_SETTINGS],
    queryFn: async () => {
      return settingsServices.getSettings();
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
    { properties: FileDialogProperties[]; defaultPath?: string }
  >,
): UseMutationResult<
  string[],
  CustomError,
  { properties: FileDialogProperties[]; defaultPath?: string }
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
