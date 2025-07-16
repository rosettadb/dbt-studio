import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from 'react-query';
import type {
  ConnectionInput,
  Project,
  CustomError,
  BigQueryTestResponse,
  ConnectionModel,
} from '../../types/backend';
import type { ConfigureConnectionBody } from '../../types/ipc';
import { QUERY_KEYS } from '../config/constants';
import { connectorsServices } from '../services';

export const useGetConnections = (
  customOptions?: UseQueryOptions<
    ConnectionModel[],
    CustomError,
    ConnectionModel[]
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_CONNECTIONS],
    queryFn: async () => {
      return connectorsServices.listConnections();
    },
    ...customOptions,
  });
};

export const useGetConnectionById = (
  connectionId?: string,
  customOptions?: UseQueryOptions<
    ConnectionModel | undefined,
    CustomError,
    ConnectionModel | undefined
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_CONNECTION_BY_ID],
    queryFn: async () => {
      return connectorsServices.getConnectionById(connectionId!);
    },
    enabled: !!connectionId,
    ...customOptions,
  });
};

export const useConfigureConnection = (
  customOptions?: UseMutationOptions<
    Project,
    CustomError,
    ConfigureConnectionBody
  >,
): UseMutationResult<Project, CustomError, ConfigureConnectionBody> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ConfigureConnectionBody) => {
      return connectorsServices.configureConnection(data);
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

export const useTestConnection = (
  customOptions?: UseMutationOptions<
    boolean | BigQueryTestResponse,
    CustomError,
    ConnectionInput
  >,
): UseMutationResult<
  boolean | BigQueryTestResponse,
  CustomError,
  ConnectionInput
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};

  return useMutation<
    boolean | BigQueryTestResponse,
    CustomError,
    ConnectionInput
  >({
    mutationFn: async (data: ConnectionInput) => {
      return connectorsServices.testConnection(data);
    },
    onSuccess: onCustomSuccess,
    onError: onCustomError,
  });
};

export const useValidateConnection = (
  customOptions?: UseMutationOptions<
    { valid: boolean; error?: string },
    CustomError,
    ConnectionInput
  >,
): UseMutationResult<
  { valid: boolean; error?: string },
  CustomError,
  ConnectionInput
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};

  return useMutation({
    mutationFn: async (data: ConnectionInput) => {
      return connectorsServices.validateConnection(data);
    },
    onSuccess: onCustomSuccess,
    onError: onCustomError,
  });
};

export const useSetConnectionEnvVariable = (
  customOptions?: UseMutationOptions<
    void,
    CustomError,
    { key: string; value: string }
  >,
): UseMutationResult<void, CustomError, { key: string; value: string }> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }) => {
      return connectorsServices.setConnectionEnvVariable(key, value);
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
