import { useQuery, useMutation, useQueryClient } from 'react-query';
import { AnalyticsPagesService } from '../services/analyticsPages.service';
import {
  AnalyticsPage,
  NewAnalyticsPage,
  UpdateAnalyticsPage,
} from '../../types/analyticsPages';

export const ANALYTICS_PAGES_KEYS = {
  all: ['analyticsPages'] as const,
  lists: () => [...ANALYTICS_PAGES_KEYS.all, 'list'] as const,
  list: (connectionId: string) =>
    [...ANALYTICS_PAGES_KEYS.lists(), connectionId] as const,
  details: () => [...ANALYTICS_PAGES_KEYS.all, 'detail'] as const,
  detail: (connectionId: string, pageId: string) =>
    [...ANALYTICS_PAGES_KEYS.details(), connectionId, pageId] as const,
};

export const useGetAnalyticsPages = (connectionId?: string) => {
  return useQuery({
    queryKey: ANALYTICS_PAGES_KEYS.list(connectionId!),
    queryFn: () => AnalyticsPagesService.list(connectionId!),
    enabled: !!connectionId,
  });
};

export const useGetAnalyticsPage = (connectionId?: string, pageId?: string) => {
  return useQuery({
    queryKey: ANALYTICS_PAGES_KEYS.detail(connectionId!, pageId!),
    queryFn: () => AnalyticsPagesService.get(connectionId!, pageId!),
    enabled: !!connectionId && !!pageId,
  });
};

export const useCreateAnalyticsPage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      connectionId,
      data,
    }: {
      connectionId: string;
      data: NewAnalyticsPage;
    }) => AnalyticsPagesService.create(connectionId, data),
    onSuccess: (data: AnalyticsPage, variables) => {
      queryClient.invalidateQueries({
        queryKey: ANALYTICS_PAGES_KEYS.list(variables.connectionId),
      });
    },
  });
};

export const useUpdateAnalyticsPage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      connectionId,
      pageId,
      updates,
    }: {
      connectionId: string;
      pageId: string;
      updates: UpdateAnalyticsPage;
    }) => AnalyticsPagesService.update(connectionId, pageId, updates),
    onSuccess: (data: AnalyticsPage, variables) => {
      queryClient.invalidateQueries({
        queryKey: ANALYTICS_PAGES_KEYS.list(variables.connectionId),
      });
      queryClient.invalidateQueries({
        queryKey: ANALYTICS_PAGES_KEYS.detail(
          variables.connectionId,
          variables.pageId,
        ),
      });
    },
  });
};

export const useDeleteAnalyticsPage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      connectionId,
      pageId,
    }: {
      connectionId: string;
      pageId: string;
    }) => AnalyticsPagesService.delete(connectionId, pageId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ANALYTICS_PAGES_KEYS.list(variables.connectionId),
      });
    },
  });
};
