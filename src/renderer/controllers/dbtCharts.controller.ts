/**
 * dbt Charts Controller
 * React Query hooks over the dbt Charts IPC service.
 */

import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import * as dbtChartsService from '../services/dbtCharts.service';
import type {
  DbtChartsCreateBoardInput,
  DbtChartsDiagnostic,
  DbtChartsInstallProgress,
  DbtChartsManifestResult,
  DbtChartsProjectState,
  DbtChartsResult,
  DbtChartsServerStatus,
  DbtChartsSetupResult,
  DbtChartsStatus,
  DbtChartsValidateInput,
} from '../../types/backend';

export const dbtChartsKeys = {
  all: ['dbtCharts'] as const,
  status: () => [...dbtChartsKeys.all, 'status'] as const,
  projectState: (projectId: string) =>
    [...dbtChartsKeys.all, 'projectState', projectId] as const,
  server: (projectId: string) =>
    [...dbtChartsKeys.all, 'server', projectId] as const,
};

export function useDbtChartsStatus() {
  return useQuery<DbtChartsStatus>({
    queryKey: dbtChartsKeys.status(),
    queryFn: () => dbtChartsService.dbtChartsGetStatus(),
    staleTime: 30_000,
  });
}

export function useDbtChartsProjectState(projectId?: string) {
  return useQuery<DbtChartsProjectState>({
    queryKey: dbtChartsKeys.projectState(projectId ?? ''),
    queryFn: () => dbtChartsService.dbtChartsGetProjectState(projectId!),
    enabled: !!projectId,
  });
}

/** Latest install / adapter-install progress event, or null when idle. */
export function useDbtChartsInstallProgress() {
  const [progress, setProgress] = useState<DbtChartsInstallProgress | null>(
    null,
  );
  useEffect(() => dbtChartsService.onDbtChartsInstallProgress(setProgress), []);
  return progress;
}

export function useInstallDbtCharts() {
  const queryClient = useQueryClient();
  return useMutation<DbtChartsResult, Error, void>({
    mutationFn: () => dbtChartsService.dbtChartsInstall(),
    onSuccess: () => {
      queryClient.invalidateQueries(dbtChartsKeys.status());
      queryClient.invalidateQueries([...dbtChartsKeys.all, 'projectState']);
    },
  });
}

export function useUninstallDbtCharts() {
  const queryClient = useQueryClient();
  return useMutation<{ ok: boolean }, Error, void>({
    mutationFn: () => dbtChartsService.dbtChartsUninstall(),
    onSuccess: () => queryClient.invalidateQueries(dbtChartsKeys.all),
  });
}

export function useSetupDbtCharts() {
  const queryClient = useQueryClient();
  return useMutation<DbtChartsSetupResult, Error, string>({
    mutationFn: (projectId) =>
      dbtChartsService.dbtChartsSetupProject(projectId),
    onSuccess: (_result, projectId) => {
      queryClient.invalidateQueries(dbtChartsKeys.projectState(projectId));
    },
  });
}

export function useCreateBoard() {
  const queryClient = useQueryClient();
  return useMutation<{ path: string }, Error, DbtChartsCreateBoardInput>({
    mutationFn: (input) => dbtChartsService.dbtChartsCreateBoard(input),
    onSuccess: (_result, { projectId }) => {
      queryClient.invalidateQueries(dbtChartsKeys.projectState(projectId));
    },
  });
}

export function useValidateBoard() {
  return useMutation<DbtChartsDiagnostic[], Error, DbtChartsValidateInput>({
    mutationFn: (input) => dbtChartsService.dbtChartsValidate(input),
  });
}

/** "Run dbt parse" button on the stale-manifest banner. */
export function useEnsureManifest() {
  const queryClient = useQueryClient();
  return useMutation<DbtChartsManifestResult, Error, string>({
    mutationFn: (projectId) =>
      dbtChartsService.dbtChartsEnsureManifest(projectId),
    onSuccess: (_result, projectId) => {
      queryClient.invalidateQueries(dbtChartsKeys.projectState(projectId));
    },
  });
}

/**
 * Per-project dct server: current status (kept live from main-process
 * events), plus start and stop. `start()` resolves to the server base URL;
 * append `boardUrlPath(boardFile)` from src/shared/dbtCharts for a board.
 */
export function useBoardServer(projectId?: string) {
  const queryClient = useQueryClient();
  const key = dbtChartsKeys.server(projectId ?? '');

  const query = useQuery<DbtChartsServerStatus>({
    queryKey: key,
    queryFn: () => dbtChartsService.dbtChartsGetServerStatus(projectId!),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (!projectId) return undefined;
    return dbtChartsService.onDbtChartsServerStatus((event) => {
      if (event.projectId !== projectId) return;
      const status: DbtChartsServerStatus = {
        state: event.state,
        url: event.url,
        error: event.error,
      };
      queryClient.setQueryData<DbtChartsServerStatus>(key, status);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, queryClient]);

  const startMutation = useMutation<{ url: string; port: number }, Error, void>(
    {
      mutationFn: () => dbtChartsService.dbtChartsStartServer(projectId!),
      onSettled: () => queryClient.invalidateQueries(key),
    },
  );
  const stopMutation = useMutation<void, Error, void>({
    mutationFn: () => dbtChartsService.dbtChartsStopServer(projectId!),
    onSettled: () => queryClient.invalidateQueries(key),
  });

  const start = useCallback(() => startMutation.mutateAsync(), [startMutation]);
  const stop = useCallback(() => stopMutation.mutateAsync(), [stopMutation]);

  return {
    status: query.data ?? ({ state: 'stopped' } as DbtChartsServerStatus),
    isLoading: query.isLoading,
    start,
    stop,
    isStarting: startMutation.isLoading,
    startError: startMutation.error,
  };
}
