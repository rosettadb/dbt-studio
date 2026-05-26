import { useMutation, useQuery, useQueryClient } from 'react-query';
import * as memoryService from '../services/memory.service';
import type {
  AgentMemoryDreamingReportListFilter,
  AgentMemoryDreamingRunListFilter,
  AgentMemoryListFilter,
  AgentMemoryRecoveryRequest,
  AgentMemorySearchRequest,
  AgentMemoryShortTermRecallListFilter,
  NewAgentMemoryEntry,
} from '../../types/backend';

export const MEMORY_QUERY_KEYS = {
  all: ['memory'] as const,
  stats: () => [...MEMORY_QUERY_KEYS.all, 'stats'] as const,
  health: () => [...MEMORY_QUERY_KEYS.all, 'health'] as const,
  lists: () => [...MEMORY_QUERY_KEYS.all, 'list'] as const,
  list: (filter: AgentMemoryListFilter) =>
    [...MEMORY_QUERY_KEYS.lists(), filter] as const,
  searches: () => [...MEMORY_QUERY_KEYS.all, 'search'] as const,
  search: (request: AgentMemorySearchRequest) =>
    [...MEMORY_QUERY_KEYS.searches(), request] as const,
  shortTermRecall: (filter: AgentMemoryShortTermRecallListFilter) =>
    [...MEMORY_QUERY_KEYS.all, 'short-term', filter] as const,
  dreamingRuns: (filter: AgentMemoryDreamingRunListFilter) =>
    [...MEMORY_QUERY_KEYS.all, 'dreaming', 'runs', filter] as const,
  dreamingReports: (filter: AgentMemoryDreamingReportListFilter) =>
    [...MEMORY_QUERY_KEYS.all, 'dreaming', 'reports', filter] as const,
};

export const useMemoryStats = () =>
  useQuery(MEMORY_QUERY_KEYS.stats(), memoryService.getMemoryStats);

export const useMemoryHealth = () =>
  useQuery(MEMORY_QUERY_KEYS.health(), memoryService.getMemoryHealth);

export const useRecoverMemoryHealth = () => {
  const qc = useQueryClient();
  return useMutation(
    (request: AgentMemoryRecoveryRequest) =>
      memoryService.recoverMemoryHealth(request),
    {
      onSuccess: () => qc.invalidateQueries(MEMORY_QUERY_KEYS.all),
    },
  );
};

export const useMemoryList = (filter: AgentMemoryListFilter = {}) =>
  useQuery(MEMORY_QUERY_KEYS.list(filter), () =>
    memoryService.listMemoryEntries(filter),
  );

export const useMemorySearch = (
  request: AgentMemorySearchRequest,
  options: { enabled?: boolean } = {},
) => {
  const hasQuery = request.query.trim().length > 0;
  return useQuery(
    MEMORY_QUERY_KEYS.search(request),
    () => memoryService.searchMemory(request),
    { enabled: options.enabled ?? hasQuery },
  );
};

export const useCreateMemoryEntry = () => {
  const qc = useQueryClient();
  return useMutation(memoryService.createMemoryEntry, {
    onSuccess: () => qc.invalidateQueries(MEMORY_QUERY_KEYS.all),
  });
};

export const useUpdateMemoryEntry = () => {
  const qc = useQueryClient();
  return useMutation(
    ({ id, patch }: { id: number; patch: Partial<NewAgentMemoryEntry> }) =>
      memoryService.updateMemoryEntry(id, patch),
    {
      onSuccess: () => qc.invalidateQueries(MEMORY_QUERY_KEYS.all),
    },
  );
};

export const useArchiveMemoryEntry = () => {
  const qc = useQueryClient();
  return useMutation(memoryService.archiveMemoryEntry, {
    onSuccess: () => qc.invalidateQueries(MEMORY_QUERY_KEYS.all),
  });
};

export const useDeleteMemoryEntry = () => {
  const qc = useQueryClient();
  return useMutation(memoryService.deleteMemoryEntry, {
    onSuccess: () => qc.invalidateQueries(MEMORY_QUERY_KEYS.all),
  });
};

export const useRefreshDatabaseContext = () => {
  const qc = useQueryClient();
  return useMutation(memoryService.refreshDatabaseContext, {
    onSuccess: () => qc.invalidateQueries(MEMORY_QUERY_KEYS.all),
  });
};

export const useRebuildIndex = () => {
  const qc = useQueryClient();
  return useMutation(memoryService.rebuildIndex, {
    onSuccess: () => qc.invalidateQueries(MEMORY_QUERY_KEYS.all),
  });
};

export const useRunDreaming = () => {
  const qc = useQueryClient();
  return useMutation(memoryService.runDreaming, {
    onSuccess: () => qc.invalidateQueries(MEMORY_QUERY_KEYS.all),
  });
};

export const useShortTermRecall = (
  filter: AgentMemoryShortTermRecallListFilter = {},
) =>
  useQuery(MEMORY_QUERY_KEYS.shortTermRecall(filter), () =>
    memoryService.listShortTermRecall(filter),
  );

export const useDreamingRuns = (
  filter: AgentMemoryDreamingRunListFilter = {},
) =>
  useQuery(MEMORY_QUERY_KEYS.dreamingRuns(filter), () =>
    memoryService.listDreamingRuns(filter),
  );

export const useDreamingReports = (
  filter: AgentMemoryDreamingReportListFilter = {},
) =>
  useQuery(MEMORY_QUERY_KEYS.dreamingReports(filter), () =>
    memoryService.listDreamingReports(filter),
  );
