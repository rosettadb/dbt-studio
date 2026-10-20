import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useGetSelectedProject } from '../controllers';
import { useProjectQueryResultsPanel } from '../hooks/useProjectQueryResultsPanel';
import { useProjectSqlExecution } from '../hooks/useProjectSqlExecution';

type PanelApi = ReturnType<typeof useProjectQueryResultsPanel>;
type ExecuteProjectSql = ReturnType<
  typeof useProjectSqlExecution
>['executeProjectSql'];

export interface QueryResultsContextValue extends PanelApi {
  // Runs SQL against the selected project's connection and streams the
  // lifecycle (start / success / error) into the panel state.
  execute: ExecuteProjectSql;
}

export const QueryResultsContext =
  createContext<QueryResultsContextValue | null>(null);

interface QueryResultsProviderProps {
  children: ReactNode;
}

// Root-mounted store for the "Query Results" bottom panel. Publishers (editor
// code lenses, model split button, history re-runs) call `execute` or the
// start/complete/fail lifecycle directly; the panel and the terminal tab
// strip subscribe. `revision` ticks on every lifecycle event so a subscriber
// can react to "a query just ran" without owning the publisher.
export const QueryResultsProvider: React.FC<QueryResultsProviderProps> = ({
  children,
}) => {
  const { data: project } = useGetSelectedProject();
  const panel = useProjectQueryResultsPanel(project?.id);
  const { executeProjectSql } = useProjectSqlExecution({
    onStart: panel.startPreview,
    onSuccess: panel.completePreview,
    onError: panel.failPreview,
  });

  const value = useMemo<QueryResultsContextValue>(
    () => ({ ...panel, execute: executeProjectSql }),
    [panel, executeProjectSql],
  );

  return (
    <QueryResultsContext.Provider value={value}>
      {children}
    </QueryResultsContext.Provider>
  );
};

export const useQueryResults = (): QueryResultsContextValue => {
  const ctx = useContext(QueryResultsContext);
  if (!ctx) {
    throw new Error(
      'useQueryResults must be used within a QueryResultsProvider',
    );
  }
  return ctx;
};
