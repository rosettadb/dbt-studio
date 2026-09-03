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
  QueryResponseType,
} from '../../types/backend';
import type {
  ConfigureConnectionBody,
  UpdateConnectionBody,
} from '../../types/ipc';
import { QUERY_KEYS } from '../config/constants';
import { connectorsServices } from '../services';

// ---------------------------------------------------------------------------
// Backup / Restore hooks
// ---------------------------------------------------------------------------

import type {
  BackupExportResult,
  BackupImportResult,
} from '../services/connectors.service';

export const useGetConnections = (
  includeDataLake?: boolean,
  customOptions?: UseQueryOptions<
    ConnectionModel[],
    CustomError,
    ConnectionModel[]
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_CONNECTIONS, includeDataLake],
    queryFn: async () => {
      return connectorsServices.listConnections(includeDataLake);
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
    queryKey: [QUERY_KEYS.GET_CONNECTION_BY_ID, connectionId],
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
      await queryClient.invalidateQueries([QUERY_KEYS.GET_CONNECTIONS]);
      await queryClient.invalidateQueries([QUERY_KEYS.GET_PROJECTS]);
      await queryClient.invalidateQueries([QUERY_KEYS.GET_SELECTED_PROJECT]);
      queryClient.removeQueries([QUERY_KEYS.GET_PROJECT_BY_ID]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useUpdateConnection = (
  customOptions?: UseMutationOptions<void, CustomError, UpdateConnectionBody>,
): UseMutationResult<void, CustomError, UpdateConnectionBody> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateConnectionBody) => {
      return connectorsServices.updateConnection(data);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_CONNECTIONS]);
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_CONNECTION_BY_ID,
        args[1].connection.id,
      ]);
      await queryClient.invalidateQueries([QUERY_KEYS.GET_PROJECTS]);
      await queryClient.invalidateQueries([QUERY_KEYS.GET_SELECTED_PROJECT]);
      queryClient.removeQueries([QUERY_KEYS.GET_PROJECT_BY_ID]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useDeleteConnection = (
  customOptions?: UseMutationOptions<void, CustomError, string>,
): UseMutationResult<void, CustomError, string> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: string) => {
      return connectorsServices.deleteConnection(data);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_CONNECTIONS]);
      await queryClient.invalidateQueries([QUERY_KEYS.GET_PROJECTS]);
      await queryClient.invalidateQueries([QUERY_KEYS.GET_SELECTED_PROJECT]);
      queryClient.removeQueries([QUERY_KEYS.GET_PROJECT_BY_ID]);
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

export const useExecuteConnectionQuery = (
  customOptions?: UseMutationOptions<
    QueryResponseType,
    CustomError,
    { connectionId: string; query: string; queryId?: string }
  >,
): UseMutationResult<
  QueryResponseType,
  CustomError,
  { connectionId: string; query: string; queryId?: string }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};

  return useMutation({
    mutationFn: async (payload) => {
      // eslint-disable-next-line no-console
      console.log('[ConnectorsController] executeQueryForConnection', {
        connectionId: payload.connectionId,
        queryId: payload.queryId,
        queryLength: payload.query.length,
      });
      return connectorsServices.executeQueryForConnection(payload);
    },
    onSuccess: (...args) => {
      // eslint-disable-next-line no-console
      console.log('[ConnectorsController] executeQueryForConnection success', {
        rowCount: args[0]?.rowCount ?? 0,
        hasError: !!args[0]?.error,
      });
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      // eslint-disable-next-line no-console
      console.error('[ConnectorsController] executeQueryForConnection error', {
        message: (args[0] as any)?.message || 'Unknown error',
      });
      onCustomError?.(...args);
    },
  });
};

export const useUpdateConnectionQuery = (
  customOptions?: UseMutationOptions<
    void,
    CustomError,
    { connectionId: string; query: string }
  >,
): UseMutationResult<
  void,
  CustomError,
  { connectionId: string; query: string }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};

  return useMutation({
    mutationFn: async (payload) => {
      // eslint-disable-next-line no-console
      console.log('[ConnectorsController] updateConnectionQuery', {
        connectionId: payload.connectionId,
        queryLength: payload.query.length,
      });
      return connectorsServices.updateConnectionQuery(
        payload.connectionId,
        payload.query,
      );
    },
    onSuccess: (...args) => {
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      // eslint-disable-next-line no-console
      console.error('[ConnectorsController] updateConnectionQuery error', {
        message: (args[0] as any)?.message || 'Unknown error',
      });
      onCustomError?.(...args);
    },
  });
};

export const useExportBackup = (
  customOptions?: UseMutationOptions<BackupExportResult, CustomError, void>,
): UseMutationResult<BackupExportResult, CustomError, void> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};

  return useMutation({
    mutationFn: async () => connectorsServices.exportBackup(),
    onSuccess: onCustomSuccess,
    onError: onCustomError,
  });
};

export const useImportBackup = (
  customOptions?: UseMutationOptions<
    BackupImportResult,
    CustomError,
    'merge' | 'replace'
  >,
): UseMutationResult<BackupImportResult, CustomError, 'merge' | 'replace'> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mode: 'merge' | 'replace') =>
      connectorsServices.importBackup(mode),
    onSuccess: async (...args) => {
      // Refresh connections list after a successful import
      await queryClient.invalidateQueries([QUERY_KEYS.GET_CONNECTIONS]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};
