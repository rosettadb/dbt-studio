import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from 'react-query';
import type {
  ConnectionInput,
  Project,
  CustomError,
} from '../../types/backend';
import type { ConfigureConnectionBody } from '../../types/ipc';
import { QUERY_KEYS } from '../config/constants';
import { connectorsServices } from '../services';

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
  customOptions?: UseMutationOptions<boolean, CustomError, ConnectionInput>,
): UseMutationResult<boolean, CustomError, ConnectionInput> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};

  return useMutation({
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

export const useGenerateJdbcUrl = (
  customOptions?: UseMutationOptions<string, CustomError, ConnectionInput>,
): UseMutationResult<string, CustomError, ConnectionInput> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};

  return useMutation({
    mutationFn: async (data: ConnectionInput) => {
      return connectorsServices.generateJdbcUrl(data);
    },
    onSuccess: onCustomSuccess,
    onError: onCustomError,
  });
};
