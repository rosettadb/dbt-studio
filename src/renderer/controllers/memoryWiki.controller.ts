import { useQuery, useMutation, useQueryClient } from 'react-query';
import AgentMemoryWikiService from '../services/memoryWiki.service';
import type {
  WikiStatus,
  AgentMemoryScope,
  AgentMemoryWikiOpenResult,
} from '../../types/backend';

export const WIKI_QUERY_KEYS = {
  all: ['memory-wiki'] as const,
  status: () => [...WIKI_QUERY_KEYS.all, 'status'] as const,
};

export const useWikiStatus = () => {
  return useQuery<WikiStatus>(WIKI_QUERY_KEYS.status(), () =>
    AgentMemoryWikiService.getStatus(),
  );
};

export const useWikiCompile = () => {
  const qc = useQueryClient();
  return useMutation(() => AgentMemoryWikiService.compilePending(), {
    onSuccess: () => qc.invalidateQueries(WIKI_QUERY_KEYS.status()),
  });
};

export const useWikiLint = () => {
  const qc = useQueryClient();
  return useMutation(
    (scope: AgentMemoryScope) => AgentMemoryWikiService.lintScope(scope),
    {
      onSuccess: () => qc.invalidateQueries(WIKI_QUERY_KEYS.status()),
    },
  );
};

export const useWikiOpenVault = () => {
  return useMutation(
    (): Promise<AgentMemoryWikiOpenResult> =>
      AgentMemoryWikiService.openVaultInObsidian(),
  );
};

export const useWikiOpenNote = () => {
  return useMutation(
    (input: {
      scopeKey?: string;
      memoryId?: number;
    }): Promise<AgentMemoryWikiOpenResult> =>
      AgentMemoryWikiService.openNoteInObsidian(input),
  );
};

export const useWikiOpenSearch = () => {
  return useMutation(
    (input: { query: string }): Promise<AgentMemoryWikiOpenResult> =>
      AgentMemoryWikiService.openSearchInObsidian(input),
  );
};
