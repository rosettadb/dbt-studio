import { useMutation, useQuery, useQueryClient } from 'react-query';
import { cloudExplorerService, connectionStorage } from '../services';
import type {
  CloudProvider,
  CloudStorageConfig,
  CloudListResult,
  CloudConnection,
  RecentItem,
} from '../../types/frontend';

// Query keys
export const cloudExplorerKeys = {
  all: ['cloudExplorer'] as const,
  connections: ['cloudExplorer', 'connections'] as const,
  connection: (id: string) => [...cloudExplorerKeys.connections, id] as const,
  recentItems: ['cloudExplorer', 'recentItems'] as const,
  buckets: (provider: CloudProvider, config: CloudStorageConfig) =>
    [...cloudExplorerKeys.all, 'buckets', provider, config] as const,
  objects: (
    provider: CloudProvider,
    config: CloudStorageConfig,
    bucketName: string,
    prefix?: string,
  ) =>
    [
      ...cloudExplorerKeys.all,
      'objects',
      provider,
      config,
      bucketName,
      prefix,
    ] as const,
  testConnection: (provider: CloudProvider, config: CloudStorageConfig) =>
    [...cloudExplorerKeys.all, 'testConnection', provider, config] as const,
};

// Hooks for listing buckets
export const useListBuckets = (
  provider: CloudProvider,
  config: CloudStorageConfig,
  enabled = true,
) => {
  return useQuery(
    cloudExplorerKeys.buckets(provider, config),
    () => cloudExplorerService.listBuckets(provider, config),
    { enabled },
  );
};

// Hooks for listing objects
export const useListObjects = (
  provider: CloudProvider,
  config: CloudStorageConfig,
  bucketName: string,
  prefix = '',
  enabled = true,
) => {
  return useQuery(
    cloudExplorerKeys.objects(provider, config, bucketName, prefix),
    () =>
      cloudExplorerService.listObjects(
        provider,
        config,
        bucketName,
        undefined,
        prefix,
      ),
    { enabled },
  );
};

// Mutation for testing connection
export const useTestCloudConnection = () => {
  return useMutation(
    ({
      provider,
      config,
    }: {
      provider: CloudProvider;
      config: CloudStorageConfig;
    }) => cloudExplorerService.testConnection(provider, config),
  );
};

// Mutation for getting download URL
export const useGetDownloadUrl = () => {
  return useMutation(
    ({
      provider,
      config,
      bucketName,
      objectName,
    }: {
      provider: CloudProvider;
      config: CloudStorageConfig;
      bucketName: string;
      objectName: string;
    }) =>
      cloudExplorerService.getDownloadUrl(
        provider,
        config,
        bucketName,
        objectName,
      ),
  );
};

// Custom hook for paginated object listing
export const usePaginatedObjects = (
  provider: CloudProvider,
  config: CloudStorageConfig,
  bucketName: string,
  prefix = '',
) => {
  const queryClient = useQueryClient();

  const mutation = useMutation(
    ({
      continuationToken,
      newPrefix,
    }: {
      continuationToken?: string;
      newPrefix?: string;
    }) =>
      cloudExplorerService.listObjects(
        provider,
        config,
        bucketName,
        continuationToken,
        newPrefix || prefix,
      ),
    {
      onSuccess: (data: CloudListResult, variables: any) => {
        // Cache the result for the specific prefix
        const cacheKey = cloudExplorerKeys.objects(
          provider,
          config,
          bucketName,
          variables.newPrefix || prefix,
        );
        queryClient.setQueryData(cacheKey, data);
      },
    },
  );

  return mutation;
};

// Utility function to invalidate all cloud explorer queries
export const useInvalidateCloudExplorer = () => {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries(cloudExplorerKeys.all);
  };
};

// Utility function to invalidate bucket queries for a specific provider
export const useInvalidateBuckets = () => {
  const queryClient = useQueryClient();

  return (provider: CloudProvider, config: CloudStorageConfig) => {
    queryClient.invalidateQueries(cloudExplorerKeys.buckets(provider, config));
  };
};

// Utility function to invalidate object queries for a specific bucket
export const useInvalidateObjects = () => {
  const queryClient = useQueryClient();

  return (
    provider: CloudProvider,
    config: CloudStorageConfig,
    bucketName: string,
    prefix?: string,
  ) => {
    queryClient.invalidateQueries(
      cloudExplorerKeys.objects(provider, config, bucketName, prefix),
    );
  };
};

// Connection management hooks
export const useConnections = () => {
  return useQuery(
    cloudExplorerKeys.connections,
    () => connectionStorage.getConnections(),
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  );
};

export const useConnection = (id: string) => {
  return useQuery(
    cloudExplorerKeys.connection(id),
    () => connectionStorage.getConnection(id),
    {
      enabled: !!id,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  );
};

export const useSaveConnection = () => {
  const queryClient = useQueryClient();

  return useMutation(
    (connection: CloudConnection) =>
      connectionStorage.saveConnection(connection),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(cloudExplorerKeys.connections);
      },
    },
  );
};

export const useDeleteConnection = () => {
  const queryClient = useQueryClient();

  return useMutation((id: string) => connectionStorage.deleteConnection(id), {
    onSuccess: () => {
      queryClient.invalidateQueries(cloudExplorerKeys.connections);
    },
  });
};

// Recent items hooks
export const useRecentItems = () => {
  return useQuery(
    cloudExplorerKeys.recentItems,
    () => connectionStorage.getRecentItems(),
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  );
};

export const useAddRecentItem = () => {
  const queryClient = useQueryClient();

  return useMutation(
    (item: Omit<RecentItem, 'accessedAt'>) =>
      connectionStorage.addRecentItem(item),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(cloudExplorerKeys.recentItems);
      },
    },
  );
};

export const useRemoveRecentItem = () => {
  const queryClient = useQueryClient();

  return useMutation((id: string) => connectionStorage.removeRecentItem(id), {
    onSuccess: () => {
      queryClient.invalidateQueries(cloudExplorerKeys.recentItems);
    },
  });
};

export const useClearRecentItems = () => {
  const queryClient = useQueryClient();

  return useMutation(() => connectionStorage.clearRecentItems(), {
    onSuccess: () => {
      queryClient.invalidateQueries(cloudExplorerKeys.recentItems);
    },
  });
};
