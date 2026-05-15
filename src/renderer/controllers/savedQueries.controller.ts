import { useMutation, useQuery, useQueryClient } from 'react-query';
import { SavedQueriesService } from '../services/savedQueries.service';
import { SavedQuery } from '../../types/backend';

export const SAVED_QUERIES_KEYS = {
  all: ['savedQueries'] as const,
  lists: () => [...SAVED_QUERIES_KEYS.all, 'list'] as const,
  list: (connectionId: string) =>
    [...SAVED_QUERIES_KEYS.lists(), connectionId] as const,
};

export const useGetSavedQueries = (connectionId?: string) => {
  return useQuery({
    queryKey: SAVED_QUERIES_KEYS.list(connectionId!),
    queryFn: () => SavedQueriesService.list(connectionId!),
    enabled: !!connectionId,
  });
};

export const useCreateSavedQuery = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      connectionId,
      name,
      query,
    }: {
      connectionId: string;
      name: string;
      query: string;
    }) => SavedQueriesService.create(connectionId, name, query),
    onSuccess: (data: SavedQuery, variables: { connectionId: string }) => {
      queryClient.invalidateQueries({
        queryKey: SAVED_QUERIES_KEYS.list(variables.connectionId),
      });
    },
  });
};

export const useUpdateSavedQuery = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      connectionId,
      queryId,
      updates,
    }: {
      connectionId: string;
      queryId: string;
      updates: { name?: string; query?: string };
    }) => SavedQueriesService.update(connectionId, queryId, updates),
    onSuccess: (data: SavedQuery, variables: { connectionId: string }) => {
      queryClient.invalidateQueries({
        queryKey: SAVED_QUERIES_KEYS.list(variables.connectionId),
      });
    },
  });
};

export const useDeleteSavedQuery = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      connectionId,
      queryId,
    }: {
      connectionId: string;
      queryId: string;
    }) => SavedQueriesService.delete(connectionId, queryId),
    onSuccess: (_, variables: { connectionId: string }) => {
      queryClient.invalidateQueries({
        queryKey: SAVED_QUERIES_KEYS.list(variables.connectionId),
      });
    },
  });
};
