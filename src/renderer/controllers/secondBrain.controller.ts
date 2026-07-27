import React from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import * as secondBrainService from '../services/secondBrain.service';
import type {
  SecondBrainArchiveRequest,
  SecondBrainProgressEvent,
  SecondBrainRestoreRequest,
  SecondBrainWriteRequest,
} from '../../types/secondBrain';

export const SECOND_BRAIN_KEYS = {
  all: ['second-brain'] as const,
  status: ['second-brain', 'status'] as const,
  tree: ['second-brain', 'tree'] as const,
  page: (pageId: string, archived: boolean) =>
    ['second-brain', 'page', pageId, archived] as const,
  search: (query: string) => ['second-brain', 'search', query] as const,
  revisions: (pageId: string) => ['second-brain', 'revisions', pageId] as const,
  revision: (pageId: string, revisionId: string) =>
    ['second-brain', 'revision', pageId, revisionId] as const,
};

export const useSecondBrainStatus = () =>
  useQuery(SECOND_BRAIN_KEYS.status, secondBrainService.getStatus);

export const useSecondBrainTree = (enabled = true) =>
  useQuery(SECOND_BRAIN_KEYS.tree, () => secondBrainService.listPages(true), {
    enabled,
  });

export const useSecondBrainPage = (pageId?: string, archived = false) =>
  useQuery(
    SECOND_BRAIN_KEYS.page(pageId ?? '', archived),
    () => secondBrainService.readPage(pageId!, archived),
    { enabled: Boolean(pageId) },
  );

export const useSecondBrainSearch = (query: string, enabled = true) =>
  useQuery(
    SECOND_BRAIN_KEYS.search(query),
    () => secondBrainService.searchPages(query),
    { enabled: enabled && query.trim().length > 0, keepPreviousData: true },
  );

export const useSecondBrainRevisions = (pageId?: string) =>
  useQuery(
    SECOND_BRAIN_KEYS.revisions(pageId ?? ''),
    () => secondBrainService.listRevisions(pageId!),
    { enabled: Boolean(pageId) },
  );

export const useSecondBrainRevision = (pageId?: string, revisionId?: string) =>
  useQuery(
    SECOND_BRAIN_KEYS.revision(pageId ?? '', revisionId ?? ''),
    () => secondBrainService.readRevision(pageId!, revisionId!),
    { enabled: Boolean(pageId && revisionId) },
  );

const useInvalidateSecondBrain = () => {
  const queryClient = useQueryClient();
  return React.useCallback(async () => {
    await queryClient.invalidateQueries(SECOND_BRAIN_KEYS.all);
  }, [queryClient]);
};

export const useWriteSecondBrainPage = () => {
  const invalidate = useInvalidateSecondBrain();
  return useMutation(
    (input: SecondBrainWriteRequest) => secondBrainService.writePage(input),
    { onSuccess: invalidate },
  );
};

export const useArchiveSecondBrainPage = () => {
  const invalidate = useInvalidateSecondBrain();
  return useMutation(
    (input: SecondBrainArchiveRequest) => secondBrainService.archivePage(input),
    { onSuccess: invalidate },
  );
};

export const useRestoreSecondBrainPage = () => {
  const invalidate = useInvalidateSecondBrain();
  return useMutation(
    (input: SecondBrainRestoreRequest) => secondBrainService.restore(input),
    { onSuccess: invalidate },
  );
};

export const useInitializeSecondBrain = () => {
  const invalidate = useInvalidateSecondBrain();
  return useMutation(secondBrainService.initialize, { onSuccess: invalidate });
};

export const usePreviewSecondBrainRefresh = () =>
  useMutation(secondBrainService.previewRefresh);

export const useApplySecondBrainRefresh = () => {
  const invalidate = useInvalidateSecondBrain();
  return useMutation(secondBrainService.applyRefresh, {
    onSuccess: invalidate,
  });
};

export const usePauseSecondBrain = () => {
  const invalidate = useInvalidateSecondBrain();
  const queryClient = useQueryClient();
  return useMutation(secondBrainService.pause, {
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries(['ai-settings']);
    },
  });
};

export const useClearAndDisableSecondBrain = () => {
  const invalidate = useInvalidateSecondBrain();
  const queryClient = useQueryClient();
  return useMutation(secondBrainService.clearAndDisable, {
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries(['ai-settings']);
    },
  });
};

export const useCancelSecondBrainRefresh = () =>
  useMutation((operationId: string) => secondBrainService.cancel(operationId));

export const useSecondBrainProgress = () => {
  const [progress, setProgress] =
    React.useState<SecondBrainProgressEvent | null>(null);
  React.useEffect(() => secondBrainService.onProgress(setProgress), []);
  return progress;
};

export const openSecondBrainWikiFolder = secondBrainService.openWikiFolder;
export const openSecondBrainWikiTerminal = secondBrainService.openWikiTerminal;
