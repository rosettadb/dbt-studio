/**
 * Notebooks Controller
 * React Query hooks for notebook operations
 */

import { useQuery, useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-toastify';
import { Notebook, NotebookCell, SchemaInfo } from '../../types/notebooks';
import { notebooksService } from '../services/notebooks.service';
import { connectorsServices } from '../services';
import { DuckLakeService } from '../services/duckLake.service';

// Query keys
export const notebooksKeys = {
  all: ['notebooks'] as const,
  lists: () => [...notebooksKeys.all, 'list'] as const,
  list: (connectionId: string) =>
    [...notebooksKeys.lists(), connectionId] as const,
  details: () => [...notebooksKeys.all, 'detail'] as const,
  detail: (connectionId: string, notebookId: string) =>
    [...notebooksKeys.details(), connectionId, notebookId] as const,
  schema: (connectionId: string) =>
    [...notebooksKeys.all, 'schema', connectionId] as const,
  archived: () => [...notebooksKeys.all, 'archived'] as const,
};

// List notebooks for a connection
export function useNotebooks(connectionId: string) {
  return useQuery<Notebook[]>({
    queryKey: notebooksKeys.list(connectionId),
    queryFn: () => notebooksService.listNotebooks(connectionId),
    enabled: !!connectionId,
    staleTime: 30000,
  });
}

// Get a specific notebook
export function useNotebook(connectionId: string, notebookId: string) {
  return useQuery<Notebook | null>({
    queryKey: notebooksKeys.detail(connectionId, notebookId),
    queryFn: () => notebooksService.getNotebook(connectionId, notebookId),
    enabled: !!connectionId && !!notebookId,
    staleTime: 10000,
  });
}

// Create a new notebook
export function useCreateNotebook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      connectionId,
      name,
      description,
    }: {
      connectionId: string;
      name: string;
      description?: string;
    }) => notebooksService.createNotebook(connectionId, name, description),
    onSuccess: (notebook, { connectionId }) => {
      queryClient.invalidateQueries(notebooksKeys.list(connectionId));
      toast.success(`Notebook "${notebook.name}" created`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create notebook: ${error.message}`);
    },
  });
}

// Update a notebook
export function useUpdateNotebook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      connectionId,
      notebookId,
      name,
      cells,
    }: {
      connectionId: string;
      notebookId: string;
      name?: string;
      cells?: NotebookCell[];
    }) =>
      notebooksService.updateNotebook(connectionId, notebookId, {
        name,
        cells,
      }),
    onSuccess: (notebook, { connectionId, notebookId }) => {
      queryClient.setQueryData(
        notebooksKeys.detail(connectionId, notebookId),
        notebook,
      );
      queryClient.invalidateQueries(notebooksKeys.list(connectionId));
    },
    onError: (error: Error) => {
      toast.error(`Failed to update notebook: ${error.message}`);
    },
  });
}

// Rename a notebook
export function useRenameNotebook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      connectionId,
      notebookId,
      newName,
    }: {
      connectionId: string;
      notebookId: string;
      newName: string;
    }) => notebooksService.renameNotebook(connectionId, notebookId, newName),
    onSuccess: (notebook, { connectionId, notebookId }) => {
      queryClient.setQueryData(
        notebooksKeys.detail(connectionId, notebookId),
        notebook,
      );
      queryClient.invalidateQueries(notebooksKeys.list(connectionId));
      toast.success(`Notebook renamed to "${notebook.name}"`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to rename notebook: ${error.message}`);
    },
  });
}

// Duplicate a notebook
export function useDuplicateNotebook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      connectionId,
      notebookId,
      newName,
    }: {
      connectionId: string;
      notebookId: string;
      newName?: string;
    }) => notebooksService.duplicateNotebook(connectionId, notebookId, newName),
    onSuccess: (notebook, { connectionId }) => {
      queryClient.invalidateQueries(notebooksKeys.list(connectionId));
      toast.success(`Notebook duplicated as "${notebook.name}"`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to duplicate notebook: ${error.message}`);
    },
  });
}

// Delete a notebook
export function useDeleteNotebook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      connectionId,
      notebookId,
    }: {
      connectionId: string;
      notebookId: string;
    }) => notebooksService.deleteNotebook(connectionId, notebookId),
    onSuccess: (_, { connectionId, notebookId }) => {
      queryClient.removeQueries(notebooksKeys.detail(connectionId, notebookId));
      queryClient.invalidateQueries(notebooksKeys.list(connectionId));
      toast.success('Notebook deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete notebook: ${error.message}`);
    },
  });
}

// Run a single cell
export function useRunCell() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      connectionId,
      notebookId,
      cellId,
      sql,
    }: {
      connectionId: string;
      notebookId: string;
      cellId: string;
      sql: string;
    }) => notebooksService.runCell(connectionId, notebookId, cellId, sql),
    onSuccess: (_, { connectionId, notebookId }) => {
      queryClient.invalidateQueries(
        notebooksKeys.detail(connectionId, notebookId),
      );
    },
    onError: (error: Error) => {
      toast.error(`Cell execution failed: ${error.message}`);
    },
  });
}

// Run all cells
export function useRunAllCells() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      connectionId,
      notebookId,
    }: {
      connectionId: string;
      notebookId: string;
    }) => notebooksService.runAllCells(connectionId, notebookId),
    onSuccess: (_, { connectionId, notebookId }) => {
      queryClient.invalidateQueries(
        notebooksKeys.detail(connectionId, notebookId),
      );
      toast.success('All cells executed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to run all cells: ${error.message}`);
    },
  });
}

// Get schema for autocomplete
export function useSchema(connectionId: string) {
  return useQuery<SchemaInfo>({
    queryKey: notebooksKeys.schema(connectionId),
    queryFn: async () => {
      // Extract schema based on connection type
      if (connectionId.startsWith('ducklake-')) {
        const instanceId = connectionId.replace('ducklake-', '');
        const duckLakeSchema = await DuckLakeService.extractSchema(instanceId);

        // Convert to SchemaInfo format
        const schemaInfo: SchemaInfo = {
          schemas: duckLakeSchema.schemas.map((s) => ({
            schema_id: s.name,
            schema_name: s.name,
          })),
          tables: [],
          columns: [],
        };

        duckLakeSchema.schemas.forEach((schema) => {
          schema.tables.forEach((table) => {
            schemaInfo.tables.push({
              table_name: table.name,
              schema_name: schema.name,
              record_count: undefined,
              path: undefined,
            });

            table.columns.forEach((column) => {
              schemaInfo.columns.push({
                column_name: column.name,
                column_type: column.type,
                table_name: table.name,
                schema_name: schema.name,
                nulls_allowed: true,
              });
            });
          });
        });

        return schemaInfo;
      }

      // Regular DB connection
      const result =
        await connectorsServices.extractSchemaFromConnection(connectionId);

      const schemaInfo: SchemaInfo = {
        schemas: [],
        tables: [],
        columns: [],
      };

      if (!result.error && result.tables) {
        // Extract unique schemas
        const uniqueSchemas = new Set(result.tables.map((t) => t.schema));
        schemaInfo.schemas = Array.from(uniqueSchemas).map((s) => ({
          schema_id: s,
          schema_name: s,
        }));

        // Add tables
        result.tables.forEach((table) => {
          schemaInfo.tables.push({
            table_name: table.name,
            schema_name: table.schema,
          });

          // Add columns
          table.columns.forEach((column: any) => {
            schemaInfo.columns.push({
              column_name: column.name,
              column_type: column.type,
              table_name: table.name,
              schema_name: table.schema,
              nulls_allowed: column.nullable,
            });
          });
        });
      }

      return schemaInfo;
    },
    enabled: !!connectionId,
    staleTime: 60000,
  });
}

// Refresh schema
export function useRefreshSchema() {
  const queryClient = useQueryClient();

  return {
    refreshSchema: (connectionId: string) => {
      queryClient.invalidateQueries(notebooksKeys.schema(connectionId));
    },
  };
}

// List archived notebooks
export function useArchivedNotebooks() {
  return useQuery<Record<string, Notebook[]>>({
    queryKey: notebooksKeys.archived(),
    queryFn: () => notebooksService.listArchivedNotebooks(),
    staleTime: 30000,
  });
}

// Restore archived notebook
export function useRestoreNotebook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      archivedConnectionKey,
      notebookId,
      targetConnectionId,
    }: {
      archivedConnectionKey: string;
      notebookId: string;
      targetConnectionId: string;
    }) =>
      notebooksService.restoreArchivedNotebook(
        archivedConnectionKey,
        notebookId,
        targetConnectionId,
      ),
    onSuccess: (notebook, { targetConnectionId }) => {
      queryClient.invalidateQueries(notebooksKeys.archived());
      queryClient.invalidateQueries(notebooksKeys.list(targetConnectionId));
      toast.success(`Notebook "${notebook.name}" restored`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to restore notebook: ${error.message}`);
    },
  });
}

// Delete archived notebook
export function useDeleteArchivedNotebook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      connectionKey,
      notebookId,
    }: {
      connectionKey: string;
      notebookId: string;
    }) => notebooksService.deleteArchivedNotebook(connectionKey, notebookId),
    onSuccess: () => {
      queryClient.invalidateQueries(notebooksKeys.archived());
      toast.success('Archived notebook deleted permanently');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete archived notebook: ${error.message}`);
    },
  });
}

// Delete all archived notebooks
export function useDeleteAllArchivedNotebooks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (connectionKey?: string) =>
      notebooksService.deleteAllArchivedNotebooks(connectionKey),
    onSuccess: (_, connectionKey) => {
      queryClient.invalidateQueries(notebooksKeys.archived());
      if (connectionKey) {
        toast.success('All archived notebooks for connection deleted');
      } else {
        toast.success('All archived notebooks deleted');
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete archived notebooks: ${error.message}`);
    },
  });
}
