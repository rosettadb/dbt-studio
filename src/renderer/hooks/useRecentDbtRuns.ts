import { useEffect, useMemo, useState } from 'react';
import { DbtRunHistoryEntry } from '../../types/dbtRunHistory';
import { parseRunHistory, runHistoryStorageKey } from './useDbtRunHistory';

const EVENT_NAME = 'dbt-run-history-changed';

type ProjectRef = { id: string; name?: string; path?: string };

export function collectRecentRuns(
  projects: ProjectRef[],
  limit: number,
  read: (key: string) => string | null,
): DbtRunHistoryEntry[] {
  const all: DbtRunHistoryEntry[] = [];
  projects.forEach((project) => {
    let raw: string | null = null;
    try {
      raw = read(runHistoryStorageKey(project.id));
    } catch {
      raw = null;
    }
    parseRunHistory(raw).forEach((entry) =>
      all.push({
        ...entry,
        projectId: entry.projectId || project.id,
        projectName: entry.projectName || project.name || '',
      }),
    );
  });
  return all
    .filter((entry) => !Number.isNaN(Date.parse(entry.startedAt)))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, limit);
}

/** Read-only view over the per-project run history kept in localStorage. */
export const useRecentDbtRuns = (projects: ProjectRef[], limit = 10) => {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(EVENT_NAME, bump);
    return () => window.removeEventListener(EVENT_NAME, bump);
  }, []);

  const key = projects.map((p) => p.id).join('|');

  return useMemo(
    () =>
      collectRecentRuns(projects, limit, (k) => window.localStorage.getItem(k)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, limit, version],
  );
};
