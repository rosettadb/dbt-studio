# React Query Architecture Documentation

## Overview
This document details the React Query implementation patterns used throughout the DBT Studio Electron application. The app uses React Query v3 for server state management with a well-structured controller layer.

## Core Architecture

### Query Client Configuration
```typescript
// src/renderer/context/QueryClientContext.tsx
const client = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});
```

### Controller Layer Structure
All controllers follow consistent patterns and are located in `src/renderer/controllers/`:

- `projects.controller.ts` - Project CRUD operations
- `connectors.controller.ts` - Database connection management
- `cloudExplorer.controller.ts` - Cloud storage operations
- `git.controller.ts` - Version control operations
- `settings.controller.ts` - Application configuration
- `update.controller.ts` - Application updates

## Query Key Management

### Structured Query Keys
Controllers use consistent query key patterns for efficient cache management:

```typescript
// Simple keys for global data
export const QUERY_KEYS = {
  GET_PROJECTS: 'GET_PROJECTS',
  GET_SELECTED_PROJECT: 'GET_SELECTED_PROJECT',
  GET_SETTINGS: 'GET_SETTINGS',
};

// Hierarchical keys for complex data relationships
export const cloudExplorerKeys = {
  all: ['cloudExplorer'] as const,
  connections: ['cloudExplorer', 'connections'] as const,
  connection: (id: string) => [...cloudExplorerKeys.connections, id] as const,
  buckets: (provider: CloudProvider, config: CloudStorageConfig) =>
    [...cloudExplorerKeys.all, 'buckets', provider, config] as const,
  objects: (provider: CloudProvider, config: CloudStorageConfig, bucketName: string, prefix?: string) =>
    [...cloudExplorerKeys.all, 'objects', provider, config, bucketName, prefix] as const,
};
```

### Benefits of Structured Keys
- **Selective Invalidation**: Invalidate specific data subsets
- **Cache Hierarchy**: Natural parent-child relationships
- **Type Safety**: TypeScript const assertions ensure key consistency
- **Performance**: Avoid unnecessary re-fetches

## Mutation Patterns

### Standard Mutation Template
All mutations follow this consistent pattern:

```typescript
export const useAddProject = (
  customOptions?: UseMutationOptions<Project, CustomError, { name: string }>
): UseMutationResult<Project, CustomError, { name: string }> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } = customOptions || {};
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data) => {
      return projectsServices.addProject(data);
    },
    onSuccess: async (...args) => {
      // Cache invalidation
      await queryClient.invalidateQueries([QUERY_KEYS.GET_PROJECTS]);
      // Call custom success handler
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};
```

### Cache Invalidation Strategies
1. **Immediate Invalidation**: For data that changes frequently
2. **Selective Invalidation**: Target specific query subsets
3. **Manual Cache Updates**: For optimistic updates
4. **Query Removal**: Clean up unused cache entries

```typescript
// Examples from the codebase
onSuccess: async (...args) => {
  // Invalidate all projects
  await queryClient.invalidateQueries([QUERY_KEYS.GET_PROJECTS]);
  // Remove specific project cache
  queryClient.removeQueries([QUERY_KEYS.GET_PROJECT_BY_ID, args[1].id]);
  // Invalidate hierarchical keys
  queryClient.invalidateQueries(cloudExplorerKeys.connections);
}
```

## Hook Patterns

### Query Hooks
```typescript
export const useGetProjects = (
  customOptions?: UseQueryOptions<Project[], CustomError, Project[]>
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_PROJECTS],
    queryFn: async () => projectsServices.getProjects(),
    ...customOptions,
  });
};
```

### Conditional Queries
```typescript
export const useConnection = (id: string) => {
  return useQuery(
    cloudExplorerKeys.connection(id),
    () => connectionStorage.getConnection(id),
    {
      enabled: !!id, // Only run when ID exists
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );
};
```

### Mutation Hooks with Custom Options
```typescript
export const useConfigureConnection = (
  customOptions?: UseMutationOptions<Project, CustomError, ConfigureConnectionBody>
): UseMutationResult<Project, CustomError, ConfigureConnectionBody> => {
  // Implementation allows component-specific success/error handling
  // while maintaining consistent cache management
};
```

## Service Integration

### IPC Service Pattern
Controllers wrap service calls that communicate with the Electron main process:

```typescript
// Service layer (src/renderer/services/)
class ProjectsService {
  static async getProjects(): Promise<Project[]> {
    return client.get('projects:getProjects');
  }
  
  static async addProject(data: { name: string }): Promise<Project> {
    return client.post('projects:addProject', data);
  }
}

// Controller layer wraps with React Query
export const useGetProjects = () => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_PROJECTS],
    queryFn: () => projectsServices.getProjects(),
  });
};
```

## Error Handling

### Consistent Error Types
```typescript
export type CustomError = {
  message: string;
  code?: string;
  details?: any;
};
```

### Error Handling in Components
```typescript
const { data: projects, error, isLoading } = useGetProjects();
const { mutate: addProject } = useAddProject({
  onSuccess: (project) => {
    toast.success(`Project ${project.name} created successfully`);
  },
  onError: (error) => {
    toast.error(`Failed to create project: ${error.message}`);
  },
});
```

## Performance Optimizations

### Stale Time Configuration
```typescript
return useQuery(
  cloudExplorerKeys.connections,
  () => connectionStorage.getConnections(),
  {
    staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
  }
);
```

### Background Updates
React Query automatically refetches stale data in the background, keeping the UI responsive while ensuring data freshness.

### Cache Optimization
- Use structured query keys for efficient invalidation
- Remove unused queries to prevent memory leaks
- Configure appropriate stale times based on data volatility

## Real-world Examples

### Cloud Explorer Implementation
The Cloud Explorer demonstrates advanced React Query patterns:

```typescript
// Hierarchical data structure
const { data: buckets } = useListBuckets(provider, config);
const { data: objects } = useListObjects(provider, config, bucketName);

// Mutation with cache updates
const { mutate: previewData } = usePreviewData();
const { mutate: saveConnection } = useSaveConnection({
  onSuccess: () => {
    queryClient.invalidateQueries(cloudExplorerKeys.connections);
  },
});
```

### Git Operations
Git controllers show mutation chaining and status updates:

```typescript
const { mutate: commit } = useGitCommit({
  onSuccess: async (...args) => {
    await queryClient.invalidateQueries([QUERY_KEYS.GIT_STATUSES, args[1].path]);
    await queryClient.invalidateQueries([QUERY_KEYS.GIT_REMOTES, args[1].path]);
  },
});
```

## Best Practices

### Do's
1. **Consistent Patterns**: Follow established controller patterns
2. **Type Safety**: Use TypeScript for all query/mutation definitions
3. **Error Handling**: Always provide proper error handling
4. **Cache Management**: Invalidate related queries after mutations
5. **Custom Options**: Support component-specific behavior via customOptions

### Don'ts
1. **Direct Cache Manipulation**: Avoid bypassing React Query patterns
2. **Inconsistent Keys**: Don't use ad-hoc query key structures
3. **Missing Invalidation**: Always invalidate affected cache entries
4. **Blocking Mutations**: Don't make mutations depend on each other unnecessarily

## Testing Considerations

### Mock Query Client
```typescript
// Test setup
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});
```

### Component Testing
Test components with React Query by providing proper query client context and mocking the underlying services.

This architecture provides a robust, type-safe, and performant state management solution that scales well with the application's complexity.
