import { useState, useCallback, useEffect } from 'react';
import {
  DbtRunHistoryEntry,
  DbtRunHistoryResult,
  DbtRunHistoryStatus,
} from '../../types/dbtRunHistory';

const MAX_HISTORY = 50;
const EVENT_NAME = 'dbt-run-history-changed';

function dispatchChangeEvent() {
  window.dispatchEvent(new Event(EVENT_NAME));
}

function mapDbtStatus(rawStatus: string): DbtRunHistoryStatus {
  switch (rawStatus?.toLowerCase()) {
    case 'success':
    case 'pass':
      return 'success';
    case 'error':
    case 'fail':
    case 'runtime error':
      return 'error';
    case 'warn':
      return 'warn';
    case 'skipped':
      return 'skipped';
    case 'no_matches':
      return 'no_matches';
    default:
      return 'error';
  }
}

function parseRunResults(rawJson: string) {
  try {
    const parsed = JSON.parse(rawJson);
    const results = Array.isArray(parsed.results) ? parsed.results : [];

    const mappedResults: DbtRunHistoryResult[] = results.map(
      (r: any, i: number) => ({
        id: `${parsed.metadata?.invocation_id || 'unknown'}-${i}`,
        runId: parsed.metadata?.invocation_id || 'unknown',
        uniqueId: r.unique_id,
        name: r.unique_id?.split('.').pop() || 'unknown',
        resourceType: r.unique_id?.split('.')[0] || 'unknown',
        status: mapDbtStatus(r.status),
        executionTime: r.execution_time,
        message: r.message,
        adapterResponse: r.adapter_response,
        compiledSql: r.compiled_code || r.compiled_sql,
        relationName: r.relation_name,
      }),
    );

    const summary = {
      total: results.length,
      success: results.filter((r: any) =>
        ['success', 'pass'].includes(r.status),
      ).length,
      error: results.filter((r: any) =>
        ['error', 'fail', 'runtime error'].includes(r.status),
      ).length,
      warn: results.filter((r: any) => r.status === 'warn').length,
      skipped: results.filter((r: any) => r.status === 'skipped').length,
    };

    return {
      invocationId: parsed.metadata?.invocation_id,
      elapsedTime: parsed.elapsed_time,
      results: mappedResults,
      summary,
    };
  } catch {
    return null;
  }
}

export const useDbtRunHistory = (projectId?: string) => {
  const getStorageKey = useCallback(
    (overrideProjectId?: string) => {
      const id = overrideProjectId || projectId;
      return id ? `dbt-studio:run-history:${id}` : null;
    },
    [projectId],
  );

  const list = useCallback(
    (overrideProjectId?: string): DbtRunHistoryEntry[] => {
      const key = getStorageKey(overrideProjectId);
      if (!key) return [];
      try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
      } catch {
        return [];
      }
    },
    [getStorageKey],
  );

  const [history, setHistory] = useState<DbtRunHistoryEntry[]>(list());

  useEffect(() => {
    setHistory(list());
    const handleStorage = () => setHistory(list());
    window.addEventListener(EVENT_NAME, handleStorage);
    return () => window.removeEventListener(EVENT_NAME, handleStorage);
  }, [list]);

  const saveList = useCallback(
    (newList: DbtRunHistoryEntry[], overrideProjectId?: string) => {
      const key = getStorageKey(overrideProjectId);
      if (!key) return;
      // Cap at MAX_HISTORY
      const capped = newList.slice(0, MAX_HISTORY);
      localStorage.setItem(key, JSON.stringify(capped));
      dispatchChangeEvent();
    },
    [getStorageKey],
  );

  const recordCommandStart = useCallback(
    (
      request: Omit<
        DbtRunHistoryEntry,
        'id' | 'status' | 'summary' | 'startedAt'
      >,
    ) => {
      const currentList = list(request.projectId);
      const newEntry: DbtRunHistoryEntry = {
        ...request,
        id: `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        status: 'running',
        startedAt: new Date().toISOString(),
        summary: { total: 0, success: 0, error: 0, warn: 0, skipped: 0 },
      };
      saveList([newEntry, ...currentList], request.projectId);
      return newEntry.id;
    },
    [list, saveList],
  );

  const recordCommandFinished = useCallback(
    async (id: string, projectIdForRun: string, artifactPath?: string) => {
      const currentList = list(projectIdForRun);
      const idx = currentList.findIndex((r) => r.id === id);
      if (idx === -1) return;

      const entry = { ...currentList[idx] };
      entry.status = 'success';
      entry.completedAt = new Date().toISOString();

      // Calculate basic elapsed time based on timestamps
      if (entry.startedAt) {
        entry.elapsedTime =
          (new Date(entry.completedAt).getTime() -
            new Date(entry.startedAt).getTime()) /
          1000;
      }

      if (artifactPath) {
        entry.artifactPath = artifactPath;
        try {
          // Dynamic import to avoid circular dependency at module init time
          const { getFileContent } = await import(
            '../services/projects.service'
          );
          const rawContent = await getFileContent({ path: artifactPath });
          if (rawContent) {
            const parsed = parseRunResults(rawContent);
            if (parsed) {
              entry.invocationId = parsed.invocationId || entry.invocationId;
              entry.elapsedTime = parsed.elapsedTime || entry.elapsedTime;
              entry.results = parsed.results;
              entry.summary = parsed.summary;

              // If any child failed, the parent run should probably be marked as error
              if (parsed.summary.error > 0) {
                entry.status = 'error';
              }
            }
          }
        } catch {
          // Missing or malformed artifacts should not block run history updates.
        }
      }

      const newList = [...currentList];

      // Deduplicate by invocation_id if it exists
      if (entry.invocationId) {
        const dupIdx = newList.findIndex(
          (r, i) => i !== idx && r.invocationId === entry.invocationId,
        );
        if (dupIdx !== -1) {
          newList.splice(dupIdx, 1);
          // if idx shifted because dup was before it
          if (dupIdx < idx) {
            newList[idx - 1] = entry;
          } else {
            newList[idx] = entry;
          }
        } else {
          newList[idx] = entry;
        }
      } else {
        newList[idx] = entry;
      }

      saveList(newList, projectIdForRun);
    },
    [list, saveList],
  );

  const recordCommandFailed = useCallback(
    (
      id: string,
      projectIdForRun: string,
      errorMessage?: string,
      rawOutputExcerpt?: string,
    ) => {
      const currentList = list(projectIdForRun);
      const idx = currentList.findIndex((r) => r.id === id);
      if (idx === -1) return;

      const entry = { ...currentList[idx] };
      entry.status = 'error';
      entry.completedAt = new Date().toISOString();
      entry.errorMessage = errorMessage;
      entry.rawOutputExcerpt = rawOutputExcerpt;

      if (entry.startedAt) {
        entry.elapsedTime =
          (new Date(entry.completedAt).getTime() -
            new Date(entry.startedAt).getTime()) /
          1000;
      }

      const newList = [...currentList];
      newList[idx] = entry;
      saveList(newList, projectIdForRun);
    },
    [list, saveList],
  );

  const get = useCallback(
    (id: string) => {
      return list().find((r) => r.id === id) || null;
    },
    [list],
  );

  const clear = useCallback(() => {
    const key = getStorageKey();
    if (key) {
      localStorage.removeItem(key);
      dispatchChangeEvent();
    }
  }, [getStorageKey]);

  return {
    history,
    recordCommandStart,
    recordCommandFinished,
    recordCommandFailed,
    list,
    get,
    clear,
  };
};
