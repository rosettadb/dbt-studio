import { useQuery, useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-toastify';
import { DuckLakeService } from '../services/duckLake.service';
import { DuckLakeSnapshotParams } from '../../types/duckLake';
import { cloudExplorerKeys } from './cloudExplorer.controller';

// Query keys for React Query cache management
export const duckLakeKeys = {
  all: ['duckLake'] as const,
  instances: () => [...duckLakeKeys.all, 'instances'] as const,
  instance: (id: string) => [...duckLakeKeys.instances(), id] as const,
  instanceHealth: (id: string) =>
    [...duckLakeKeys.instance(id), 'health'] as const,
  tables: (instanceId: string) =>
    [...duckLakeKeys.instance(instanceId), 'tables'] as const,
  table: (instanceId: string, tableName: string) =>
    [...duckLakeKeys.tables(instanceId), tableName] as const,
  tableDetails: (instanceId: string, tableName: string) =>
    [...duckLakeKeys.table(instanceId, tableName), 'details'] as const, // Phase 8b
  snapshots: (instanceId: string, tableName: string) =>
    [...duckLakeKeys.table(instanceId, tableName), 'snapshots'] as const,
  instanceSnapshots: (instanceId: string, params?: DuckLakeSnapshotParams) =>
    [...duckLakeKeys.instance(instanceId), 'snapshots', params] as const,
  maintenanceTasks: (instanceId: string) =>
    [...duckLakeKeys.instance(instanceId), 'maintenance'] as const,
  maintenanceTask: (taskId: string) =>
    [...duckLakeKeys.all, 'maintenance', taskId] as const,
  storageStats: () => [...duckLakeKeys.all, 'storage'] as const,
};

// Instance Management Hooks

export function useDuckLakeInstances() {
  return useQuery({
    queryKey: duckLakeKeys.instances(),
    queryFn: DuckLakeService.listInstances,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
  });
}

export function useDuckLakeInstance(instanceId: string) {
  return useQuery({
    queryKey: duckLakeKeys.instance(instanceId),
    queryFn: () => DuckLakeService.getInstance(instanceId),
    enabled: !!instanceId,
    staleTime: 30000,
  });
}

export function useDuckLakeInstanceHealth(instanceId: string, enabled = true) {
  return useQuery({
    queryKey: duckLakeKeys.instanceHealth(instanceId),
    queryFn: () => DuckLakeService.getInstanceHealth(instanceId),
    enabled: enabled && !!instanceId,
    staleTime: 10000, // 10 seconds
    refetchInterval: 30000, // 30 seconds
  });
}

export function useDuckLakeTables(instanceId: string) {
  return useQuery({
    queryKey: duckLakeKeys.tables(instanceId),
    queryFn: async () => {
      // eslint-disable-next-line no-console
      console.log(
        '[useDuckLakeTables] Fetching tables for instanceId:',
        instanceId,
      );
      const result = await DuckLakeService.listTables(instanceId);
      // eslint-disable-next-line no-console
      console.log('[useDuckLakeTables] Received result:', result);
      return result;
    },
    enabled: !!instanceId,
    staleTime: 60000, // 1 minute
    onSuccess: (data) => {
      // eslint-disable-next-line no-console
      console.log('[useDuckLakeTables] onSuccess - data:', data);
    },
    onError: () => {
      // Error is already logged by the service layer
    },
  });
}

// Instance Mutations

export function useCreateDuckLakeInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: DuckLakeService.createInstance,
    onSuccess: (newInstance) => {
      // Invalidate and refetch instances list
      queryClient.invalidateQueries(duckLakeKeys.instances());

      // Add the new instance to cache
      queryClient.setQueryData(
        duckLakeKeys.instance(newInstance.id),
        newInstance,
      );

      toast.success(`Instance "${newInstance.name}" created successfully`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create instance: ${error.message}`);
    },
  });
}

export function useUpdateDuckLakeInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ instanceId, data }: { instanceId: string; data: any }) =>
      DuckLakeService.updateInstance(instanceId, data),
    onSuccess: (updatedInstance, { instanceId }) => {
      // Update the instance in cache
      queryClient.setQueryData(
        duckLakeKeys.instance(instanceId),
        updatedInstance,
      );

      // Invalidate instances list to reflect changes
      queryClient.invalidateQueries(duckLakeKeys.instances());

      // Invalidate health data as configuration might affect health
      queryClient.invalidateQueries(duckLakeKeys.instanceHealth(instanceId));

      toast.success(`Instance "${updatedInstance.name}" updated successfully`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update instance: ${error.message}`);
    },
  });
}

export function useDeleteDuckLakeInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: DuckLakeService.deleteInstance,
    onSuccess: (_, instanceId) => {
      // Remove instance from cache
      queryClient.removeQueries(duckLakeKeys.instance(instanceId));

      // Invalidate instances list
      queryClient.invalidateQueries(duckLakeKeys.instances());

      toast.success('Instance deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete instance: ${error.message}`);
    },
  });
}

export function useRefreshDuckLakeInstanceHealth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: DuckLakeService.getInstanceHealth,
    onSuccess: (healthData, instanceId) => {
      // Update health data in cache
      queryClient.setQueryData(
        duckLakeKeys.instanceHealth(instanceId),
        healthData,
      );

      toast.success('Instance health refreshed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to refresh instance health: ${error.message}`);
    },
  });
}

// Table Management Hooks

export function useDuckLakeTable(instanceId: string, tableName: string) {
  return useQuery({
    queryKey: duckLakeKeys.table(instanceId, tableName),
    queryFn: () => DuckLakeService.getTable(instanceId, tableName),
    enabled: !!instanceId && !!tableName,
    staleTime: 60000,
  });
}

export function useDuckLakeSnapshots(instanceId: string, tableName: string) {
  return useQuery({
    queryKey: duckLakeKeys.snapshots(instanceId, tableName),
    queryFn: () => DuckLakeService.listSnapshots(instanceId, tableName),
    enabled: !!instanceId && !!tableName,
    staleTime: 30000,
  });
}

export function useDuckLakeInstanceSnapshots(
  instanceId: string,
  params: DuckLakeSnapshotParams,
) {
  return useQuery({
    queryKey: duckLakeKeys.instanceSnapshots(instanceId, params),
    queryFn: () => DuckLakeService.listInstanceSnapshots(instanceId, params),
    enabled: !!instanceId,
    keepPreviousData: true,
    staleTime: 30000,
  });
}

/**
 * Get comprehensive table details from DuckLake metadata catalog (Phase 8b)
 * Fetches complete table information including schema, statistics, data files, partitions, snapshots, and tags
 */
export function useDuckLakeTableDetails(
  instanceId: string,
  tableName: string,
  enabled = true,
) {
  return useQuery({
    queryKey: duckLakeKeys.tableDetails(instanceId, tableName),
    queryFn: async () => {
      // eslint-disable-next-line no-console
      console.log('[useDuckLakeTableDetails] Fetching details for:', {
        instanceId,
        tableName,
      });
      const result = await DuckLakeService.getTableDetails(
        instanceId,
        tableName,
      );
      // eslint-disable-next-line no-console
      console.log('[useDuckLakeTableDetails] Received result:', result);
      return result;
    },
    enabled: enabled && !!instanceId && !!tableName,
    staleTime: 60000, // 1 minute
    onError: (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('[useDuckLakeTableDetails] Error:', error);
    },
  });
}

// Table Mutations

export function useImportDuckLakeTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      instanceId,
      tableName,
      sourceQuery,
    }: {
      instanceId: string;
      tableName: string;
      sourceQuery: string;
    }) => DuckLakeService.importTable(instanceId, tableName, sourceQuery),
    onSuccess: (_, { instanceId }) => {
      // Invalidate tables list to show new table
      queryClient.invalidateQueries(duckLakeKeys.tables(instanceId));

      toast.success('Table imported successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to import table: ${error.message}`);
    },
  });
}

export function useDeleteDuckLakeTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      instanceId,
      tableName,
    }: {
      instanceId: string;
      tableName: string;
    }) => DuckLakeService.deleteTable(instanceId, tableName),
    onSuccess: (_, { instanceId }) => {
      // Invalidate tables list to remove deleted table
      queryClient.invalidateQueries(duckLakeKeys.tables(instanceId));

      toast.success('Table deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete table: ${error.message}`);
    },
  });
}

// Query Execution

export function useExecuteDuckLakeQuery() {
  return useMutation({
    mutationFn: DuckLakeService.executeQuery,
    onError: (error: Error) => {
      toast.error(`Query execution failed: ${error.message}`);
    },
  });
}

// Maintenance Operations

export function useOptimizeDuckLakeInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      instanceId,
      tableName,
    }: {
      instanceId: string;
      tableName?: string;
    }) => DuckLakeService.optimizeInstance(instanceId, tableName),
    onSuccess: (task, { instanceId }) => {
      // Invalidate tables data as optimization might affect table stats
      queryClient.invalidateQueries(duckLakeKeys.tables(instanceId));

      toast.success('Optimization task started');
    },
    onError: (error: Error) => {
      toast.error(`Failed to start optimization: ${error.message}`);
    },
  });
}

export function useVacuumDuckLakeInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      instanceId,
      tableName,
    }: {
      instanceId: string;
      tableName?: string;
    }) => DuckLakeService.vacuumInstance(instanceId, tableName),
    onSuccess: (task, { instanceId }) => {
      // Invalidate tables data as vacuum might affect table stats
      queryClient.invalidateQueries(duckLakeKeys.tables(instanceId));

      toast.success('Vacuum task started');
    },
    onError: (error: Error) => {
      toast.error(`Failed to start vacuum: ${error.message}`);
    },
  });
}

export function useCheckpointDuckLakeInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: DuckLakeService.checkpointInstance,
    onSuccess: (task, instanceId) => {
      // Invalidate instance health as checkpoint affects instance state
      queryClient.invalidateQueries(duckLakeKeys.instanceHealth(instanceId));

      toast.success('Checkpoint task started');
    },
    onError: (error: Error) => {
      toast.error(`Failed to start checkpoint: ${error.message}`);
    },
  });
}

export function useDuckLakeMaintenanceTaskStatus(
  taskId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: duckLakeKeys.maintenanceTask(taskId),
    queryFn: () => DuckLakeService.getMaintenanceTaskStatus(taskId),
    enabled: enabled && !!taskId,
    staleTime: 2000, // 2 seconds for active polling
    refetchInterval: (data) => {
      // Stop polling when task is complete
      return data?.status === 'completed' || data?.status === 'failed'
        ? false
        : 2000;
    },
  });
}

// Storage Management

export function useDuckLakeStorageStats() {
  return useQuery({
    queryKey: duckLakeKeys.storageStats(),
    queryFn: DuckLakeService.getStorageStats,
    staleTime: 300000, // 5 minutes
  });
}

// Utility Hooks for Cache Management

export function useInvalidateDuckLakeCache() {
  const queryClient = useQueryClient();

  return {
    invalidateInstances: () =>
      queryClient.invalidateQueries(duckLakeKeys.instances()),
    invalidateInstance: (instanceId: string) =>
      queryClient.invalidateQueries(duckLakeKeys.instance(instanceId)),
    invalidateInstanceHealth: (instanceId: string) =>
      queryClient.invalidateQueries(duckLakeKeys.instanceHealth(instanceId)),
    invalidateTables: (instanceId: string) =>
      queryClient.invalidateQueries(duckLakeKeys.tables(instanceId)),
    invalidateAll: () => queryClient.invalidateQueries(duckLakeKeys.all),
  };
}

// Cloud Connection Management Hooks

export const cloudConnectionKeys = {
  all: ['cloudConnections'] as const,
  list: () => [...cloudConnectionKeys.all, 'list'] as const,
  connection: (id: string) => [...cloudConnectionKeys.all, id] as const,
};

export function useCloudConnections() {
  return useQuery({
    queryKey: cloudConnectionKeys.list(),
    queryFn: DuckLakeService.listCloudConnections,
    staleTime: 60000, // 1 minute
  });
}

export function useCloudConnection(id: string | undefined) {
  return useQuery({
    queryKey: cloudConnectionKeys.connection(id!),
    queryFn: () => DuckLakeService.getCloudConnection(id!),
    enabled: !!id,
    staleTime: 60000,
  });
}

export function useCreateCloudConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: DuckLakeService.createCloudConnection,
    onSuccess: (newConnection) => {
      // Invalidate connections list
      queryClient.invalidateQueries(cloudConnectionKeys.list());

      // Also invalidate Cloud Explorer connections
      queryClient.invalidateQueries(cloudExplorerKeys.connections);

      // Add to cache
      queryClient.setQueryData(
        cloudConnectionKeys.connection(newConnection.id),
        newConnection,
      );

      toast.success(`Connection "${newConnection.name}" created successfully`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create connection: ${error.message}`);
    },
  });
}

export function useTestDuckLakeConnection() {
  return useMutation({
    mutationFn: ({
      provider,
      config,
    }: {
      provider: 'aws' | 'azure' | 'gcs';
      config: any;
    }) => DuckLakeService.testCloudConnection(provider, config),
    onError: (error: Error) => {
      toast.error(`Connection test failed: ${error.message}`);
    },
  });
}
