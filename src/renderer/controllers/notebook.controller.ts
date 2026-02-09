/**
 * Notebook Controller
 * React Query hooks for notebook operations
 */

import { useMutation, useQuery, useQueryClient } from 'react-query';
import { notebookService } from '../services/notebook.service';
import {
  Notebook,
  NotebookListItem,
  CellOutput,
  CreateNotebookRequest,
  UpdateNotebookRequest,
  RunCellRequest,
  RunAllCellsRequest,
  RunAllCellsResponse,
  SchemaInfo,
} from '../../types/notebook';

// Query keys for cache management
export const notebookKeys = {
  all: ['notebooks'] as const,
  lists: () => [...notebookKeys.all, 'list'] as const,
  list: (instanceId: string) => [...notebookKeys.lists(), instanceId] as const,
  details: () => [...notebookKeys.all, 'detail'] as const,
  detail: (instanceId: string, notebookId: string) =>
    [...notebookKeys.details(), instanceId, notebookId] as const,
  sessions: () => [...notebookKeys.all, 'sessions'] as const,
  sessionCount: () => [...notebookKeys.sessions(), 'count'] as const,
  schema: (instanceId: string) =>
    [...notebookKeys.all, 'schema', instanceId] as const,
  schemaSummary: (instanceId: string) =>
    [...notebookKeys.all, 'schema', 'summary', instanceId] as const,
};

/**
 * Query: List notebooks for an instance
 */
export const useNotebooks = (instanceId: string) => {
  return useQuery<NotebookListItem[], Error>(
    notebookKeys.list(instanceId),
    () => notebookService.listNotebooks(instanceId),
    {
      staleTime: 60 * 1000, // 1 minute
      enabled: !!instanceId,
    },
  );
};

/**
 * Query: Get a single notebook
 */
export const useNotebook = (instanceId: string, notebookId: string) => {
  return useQuery<Notebook, Error>(
    notebookKeys.detail(instanceId, notebookId),
    () => notebookService.getNotebook(instanceId, notebookId),
    {
      staleTime: 30 * 1000, // 30 seconds
      enabled: !!instanceId && !!notebookId,
    },
  );
};

/**
 * Query: Get active session count
 */
export const useActiveSessionCount = () => {
  return useQuery<number, Error>(
    notebookKeys.sessionCount(),
    () => notebookService.getActiveSessionCount(),
    {
      staleTime: 10 * 1000, // 10 seconds
      refetchInterval: 30 * 1000, // Refetch every 30 seconds
    },
  );
};

/**
 * Mutation: Create a new notebook
 */
export const useCreateNotebook = () => {
  const queryClient = useQueryClient();

  return useMutation<Notebook, Error, CreateNotebookRequest>(
    (request) => notebookService.createNotebook(request),
    {
      onSuccess: (notebook) => {
        // Invalidate list cache
        queryClient.invalidateQueries(notebookKeys.list(notebook.instanceId));

        // Add to cache
        queryClient.setQueryData(
          notebookKeys.detail(notebook.instanceId, notebook.id),
          notebook,
        );
      },
    },
  );
};

/**
 * Mutation: Update a notebook
 */
export const useUpdateNotebook = () => {
  const queryClient = useQueryClient();

  return useMutation<Notebook, Error, UpdateNotebookRequest>(
    (request) => notebookService.updateNotebook(request),
    {
      onSuccess: (notebook) => {
        // Update detail cache
        queryClient.setQueryData(
          notebookKeys.detail(notebook.instanceId, notebook.id),
          notebook,
        );

        // Invalidate list cache
        queryClient.invalidateQueries(notebookKeys.list(notebook.instanceId));
      },
    },
  );
};

/**
 * Mutation: Delete a notebook
 */
export const useDeleteNotebook = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { instanceId: string; notebookId: string }>(
    ({ instanceId, notebookId }) =>
      notebookService.deleteNotebook(instanceId, notebookId),
    {
      onSuccess: (_, { instanceId, notebookId }) => {
        // Remove from cache
        queryClient.removeQueries(notebookKeys.detail(instanceId, notebookId));

        // Invalidate list cache
        queryClient.invalidateQueries(notebookKeys.list(instanceId));
      },
    },
  );
};

/**
 * Mutation: Create session
 */
export const useCreateSession = () => {
  return useMutation<string, Error, { instanceId: string; notebookId: string }>(
    ({ instanceId, notebookId }) =>
      notebookService.createSession(instanceId, notebookId),
  );
};

/**
 * Mutation: Dispose session
 */
export const useDisposeSession = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>(
    (notebookId) => notebookService.disposeSession(notebookId),
    {
      onSuccess: () => {
        // Invalidate session count
        queryClient.invalidateQueries(notebookKeys.sessionCount());
      },
    },
  );
};

/**
 * Mutation: Run a cell
 */
export const useRunCell = () => {
  const queryClient = useQueryClient();

  return useMutation<CellOutput, Error, RunCellRequest>(
    (request) => notebookService.runCell(request),
    {
      onSuccess: (output, request) => {
        // eslint-disable-next-line no-console
        console.log('[useRunCell] Cell execution success:', {
          cellId: request.cellId,
          output,
        });

        // Update notebook cache with new output
        const notebookKey = notebookKeys.detail(
          request.instanceId,
          request.notebookId,
        );

        queryClient.setQueryData<Notebook | undefined>(
          notebookKey,
          (oldNotebook) => {
            // eslint-disable-next-line no-console
            console.log(
              '[useRunCell] Updating cache, old notebook:',
              oldNotebook,
            );

            if (!oldNotebook) return undefined;

            const updatedNotebook = {
              ...oldNotebook,
              cells: oldNotebook.cells.map((cell) =>
                cell.id === request.cellId
                  ? { ...cell, output, executionTime: output.executionTime }
                  : cell,
              ),
              lastExecutedAt: new Date(),
              updatedAt: new Date(),
            };

            // eslint-disable-next-line no-console
            console.log('[useRunCell] Updated notebook:', updatedNotebook);

            return updatedNotebook;
          },
        );

        // Invalidate list to update lastExecutedAt
        queryClient.invalidateQueries(notebookKeys.list(request.instanceId));
      },
    },
  );
};

/**
 * Mutation: Run all cells
 */
export const useRunAllCells = () => {
  const queryClient = useQueryClient();

  return useMutation<RunAllCellsResponse, Error, RunAllCellsRequest>(
    (request) => notebookService.runAllCells(request),
    {
      onSuccess: (response, request) => {
        // Update notebook cache with all outputs
        const notebookKey = notebookKeys.detail(
          request.notebookId.split('/')[0],
          request.notebookId,
        );

        queryClient.setQueryData<Notebook | undefined>(
          notebookKey,
          (oldNotebook) => {
            if (!oldNotebook) return undefined;

            return {
              ...oldNotebook,
              cells: oldNotebook.cells.map((cell) => {
                const output = response.outputs.get(cell.id);
                return output
                  ? { ...cell, output, executionTime: output.executionTime }
                  : cell;
              }),
              lastExecutedAt: new Date(),
              updatedAt: new Date(),
            };
          },
        );

        // Invalidate list to update lastExecutedAt
        queryClient.invalidateQueries(
          notebookKeys.list(request.notebookId.split('/')[0]),
        );
      },
    },
  );
};

/**
 * Mutation: Interrupt execution
 */
export const useInterruptExecution = () => {
  return useMutation<void, Error, string>((notebookId) =>
    notebookService.interruptExecution(notebookId),
  );
};

/**
 * Utility: Invalidate all notebook caches
 */
export const useInvalidateNotebookCache = () => {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => queryClient.invalidateQueries(notebookKeys.all),
    invalidateList: (instanceId: string) =>
      queryClient.invalidateQueries(notebookKeys.list(instanceId)),
    invalidateDetail: (instanceId: string, notebookId: string) =>
      queryClient.invalidateQueries(
        notebookKeys.detail(instanceId, notebookId),
      ),
  };
};

/**
 * Query: Get schema metadata for autocomplete (Phase 4)
 */
export const useSchema = (instanceId: string, enabled = true) => {
  return useQuery<SchemaInfo, Error>(
    notebookKeys.schema(instanceId),
    () => notebookService.getSchema(instanceId),
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      enabled: !!instanceId && enabled,
    },
  );
};

/**
 * Query: Get schema summary statistics (Phase 4)
 */
export const useSchemaSummary = (instanceId: string, enabled = true) => {
  return useQuery<
    {
      schemaCount: number;
      tableCount: number;
      columnCount: number;
      totalRows: number;
      totalSize: number;
    },
    Error
  >(
    notebookKeys.schemaSummary(instanceId),
    () => notebookService.getSchemaSummary(instanceId),
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      enabled: !!instanceId && enabled,
    },
  );
};

/**
 * Utility: Refresh schema cache (Phase 4)
 */
export const useRefreshSchema = () => {
  const queryClient = useQueryClient();

  return {
    refreshSchema: (instanceId: string) => {
      queryClient.invalidateQueries(notebookKeys.schema(instanceId));
      queryClient.invalidateQueries(notebookKeys.schemaSummary(instanceId));
    },
  };
};
