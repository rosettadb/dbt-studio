import React from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  ensureChartsServer,
  getChartsServerStatus,
  getProjectChartsState,
  installDbtCharts,
  runChartsDbtParse,
  subscribeToChartsInstallLine,
  subscribeToChartsServerStatus,
  validateChartsFile,
} from '../services/dbtCharts.service';
import type {
  ChartsServerStatus,
  ChartsValidationResult,
} from '../../shared/dbtCharts';

// IPC errors arrive as "Error invoking remote method 'x': Error: message".
export const chartsErrorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']+': (?:\w*Error: )?/,
    '',
  );

export const DBT_CHARTS_KEYS = {
  all: ['dbtCharts'] as const,
  project: (projectPath: string) =>
    [...DBT_CHARTS_KEYS.all, 'project', projectPath] as const,
};

/** Install, adapter support and manifest state for one project. */
export const useProjectChartsState = (projectPath?: string) =>
  useQuery({
    queryKey: DBT_CHARTS_KEYS.project(projectPath ?? ''),
    queryFn: () => getProjectChartsState(projectPath!),
    enabled: !!projectPath,
    staleTime: 30_000,
  });

export const useInstallDbtCharts = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectPath?: string) => installDbtCharts(projectPath),
    onSettled: () => {
      queryClient.invalidateQueries(DBT_CHARTS_KEYS.all);
    },
  });
};

export const useRunChartsDbtParse = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectPath: string) => runChartsDbtParse(projectPath),
    onSettled: (_result, _error, projectPath) => {
      queryClient.invalidateQueries(DBT_CHARTS_KEYS.project(projectPath));
    },
  });
};

/** The last line pip printed while dbt Charts installs. */
export const useChartsInstallLine = (): string | null => {
  const [line, setLine] = React.useState<string | null>(null);
  React.useEffect(
    () => subscribeToChartsInstallLine((event) => setLine(event.line)),
    [],
  );
  return line;
};

/**
 * Keeps the project's `dct serve` running while `enabled`, and follows its
 * status events. `retry` starts it again after a crash.
 */
export const useChartsServer = (projectPath: string, enabled: boolean) => {
  const [status, setStatus] = React.useState<ChartsServerStatus>({
    projectPath,
    state: 'stopped',
  });
  const [startError, setStartError] = React.useState<string | null>(null);

  const start = React.useCallback(async () => {
    setStartError(null);
    try {
      const next = await ensureChartsServer(projectPath);
      setStatus(next);
    } catch (error) {
      setStartError(chartsErrorMessage(error));
    }
  }, [projectPath]);

  React.useEffect(
    () =>
      subscribeToChartsServerStatus((next) => {
        if (next.projectPath === projectPath) setStatus(next);
      }),
    [projectPath],
  );

  React.useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    getChartsServerStatus(projectPath)
      .then((current) => {
        if (cancelled) return undefined;
        setStatus(current);
        // A crash, or a stop from the CHARTS SERVER tab, stays until the
        // user retries or starts it; anything else starts it.
        if (
          current.state === 'crashed' ||
          current.state === 'parse-failed' ||
          (current.state === 'stopped' && current.userStopped)
        ) {
          return undefined;
        }
        return start();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, projectPath, start]);

  return { status, startError, retry: start };
};

/**
 * Validates one board file. `validate()` returns the result of the latest
 * call only; older responses are dropped.
 */
export const useChartsValidation = (projectPath: string, filePath: string) => {
  const [result, setResult] = React.useState<ChartsValidationResult | null>(
    null,
  );
  const [checking, setChecking] = React.useState(false);
  const requestId = React.useRef(0);

  React.useEffect(() => {
    setResult(null);
  }, [filePath]);

  const validate = React.useCallback(async () => {
    requestId.current += 1;
    const id = requestId.current;
    setChecking(true);
    try {
      const next = await validateChartsFile(projectPath, filePath);
      if (id === requestId.current) setResult(next);
      return next;
    } catch (error) {
      const failed: ChartsValidationResult = {
        diagnostics: [
          {
            severity: 'error',
            message: chartsErrorMessage(error),
            line: 1,
          },
        ],
        errorCount: 1,
        warningCount: 0,
        failed: true,
      };
      if (id === requestId.current) setResult(failed);
      return failed;
    } finally {
      if (id === requestId.current) setChecking(false);
    }
  }, [projectPath, filePath]);

  return { result, checking, validate };
};
