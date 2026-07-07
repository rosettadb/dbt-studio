import React from 'react';
import type {
  ProjectQueryBookmark,
  ProjectQueryHistoryItem,
  ProjectQueryPanelState,
  ProjectQueryPreviewPayload,
  ProjectQueryResultsTab,
} from '../components/projectQueryResults/types';

const DEFAULT_LIMIT = 500;
const HISTORY_LIMIT = 50;
const BOOKMARK_LIMIT = 50;

const trimResultForHistory = (result?: ProjectQueryPreviewPayload['result']) =>
  result
    ? {
        ...result,
        data: result.data?.slice(0, 10),
      }
    : undefined;

const getHistoryKey = (projectId: string) =>
  `dbt_studio_query_history_${projectId}`;
const getBookmarkKey = (projectId: string) =>
  `dbt_studio_bookmarks_${projectId}`;

export const useProjectQueryResultsPanel = (projectId?: string) => {
  const [state, setState] = React.useState<ProjectQueryPanelState>({
    activeTab: 'preview',
    limit: DEFAULT_LIMIT,
    isRunning: false,
    history: [],
    bookmarks: [],
  });
  const [revision, setRevision] = React.useState(0);

  // Load history and bookmarks when projectId changes
  React.useEffect(() => {
    if (!projectId) return;
    try {
      const storedHistory = localStorage.getItem(getHistoryKey(projectId));
      const storedBookmarks = localStorage.getItem(getBookmarkKey(projectId));

      const savedHistory: ProjectQueryHistoryItem[] = storedHistory
        ? JSON.parse(storedHistory)
        : [];
      const savedBookmarks: ProjectQueryBookmark[] = storedBookmarks
        ? JSON.parse(storedBookmarks)
        : [];

      setState((current) => ({
        ...current,
        history: savedHistory,
        bookmarks: savedBookmarks,
      }));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Failed to parse query state from localStorage', e);
      setState((current) => ({ ...current, history: [], bookmarks: [] }));
    }
  }, [projectId]);

  // Save history and bookmarks when they change
  React.useEffect(() => {
    if (!projectId) return;
    try {
      const historyToSave = state.history.map((item) => ({
        ...item,
        resultsPreview: undefined, // strip large data payload
      }));
      localStorage.setItem(
        getHistoryKey(projectId),
        JSON.stringify(historyToSave),
      );
      localStorage.setItem(
        getBookmarkKey(projectId),
        JSON.stringify(state.bookmarks),
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Failed to save query state to localStorage', e);
    }
  }, [state.history, state.bookmarks, projectId]);

  const setActiveTab = React.useCallback(
    (activeTab: ProjectQueryResultsTab) => {
      setState((current) => ({ ...current, activeTab }));
    },
    [],
  );

  const setLimit = React.useCallback((value: number) => {
    const next = Number.isFinite(value)
      ? Math.min(Math.max(Math.trunc(value), 1), 5000)
      : DEFAULT_LIMIT;
    setState((current) => ({ ...current, limit: next }));
  }, []);

  const startPreview = React.useCallback(
    (payload: Partial<ProjectQueryPreviewPayload> = {}) => {
      setRevision((current) => current + 1);
      setState((current) => ({
        ...current,
        activeTab: 'preview',
        isRunning: true,
        result: undefined,
        error: undefined,
        lastDurationMs: undefined,
        rawSql: payload.rawSql ?? current.rawSql,
        compiledSql: payload.compiledSql ?? current.compiledSql,
        filePath: payload.filePath ?? current.filePath,
        modelName: payload.modelName ?? current.modelName,
      }));
    },
    [],
  );

  const completePreview = React.useCallback(
    (payload: ProjectQueryPreviewPayload) => {
      setRevision((current) => current + 1);
      setState((current) => {
        const historyItem: ProjectQueryHistoryItem = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          projectId: payload.projectId,
          projectName: payload.projectName,
          filePath: payload.filePath,
          modelName: payload.modelName,
          rawSql: payload.rawSql,
          compiledSql: payload.compiledSql,
          executedAt: new Date().toISOString(),
          durationMs: payload.durationMs,
          limit: current.limit,
          resultsPreview: trimResultForHistory(payload.result),
          rowCount:
            payload.result?.rowCount ??
            payload.result?.data?.length ??
            undefined,
          status: 'success',
        };

        return {
          ...current,
          activeTab: 'preview',
          isRunning: false,
          result: payload.result,
          error: undefined,
          rawSql: payload.rawSql,
          compiledSql: payload.compiledSql,
          lastDurationMs: payload.durationMs,
          history: [historyItem, ...current.history].slice(0, HISTORY_LIMIT),
        };
      });
    },
    [],
  );

  const failPreview = React.useCallback(
    (payload: ProjectQueryPreviewPayload) => {
      setRevision((current) => current + 1);
      setState((current) => {
        const historyItem: ProjectQueryHistoryItem = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          projectId: payload.projectId,
          projectName: payload.projectName,
          filePath: payload.filePath,
          modelName: payload.modelName,
          rawSql: payload.rawSql,
          compiledSql: payload.compiledSql,
          executedAt: new Date().toISOString(),
          durationMs: payload.durationMs,
          limit: current.limit,
          status: 'error',
          errorMessage: payload.errorMessage,
        };

        return {
          ...current,
          activeTab: 'preview',
          isRunning: false,
          result: undefined,
          error: payload.errorMessage,
          rawSql: payload.rawSql,
          compiledSql: payload.compiledSql,
          lastDurationMs: payload.durationMs,
          history: [historyItem, ...current.history].slice(0, HISTORY_LIMIT),
        };
      });
    },
    [],
  );

  const clear = React.useCallback(() => {
    setState((current) => ({
      ...current,
      activeTab: 'preview',
      isRunning: false,
      result: undefined,
      error: undefined,
      rawSql: undefined,
      compiledSql: undefined,
      filePath: undefined,
      modelName: undefined,
      lastDurationMs: undefined,
    }));
  }, []);

  const addBookmark = React.useCallback(
    (bookmark: Omit<ProjectQueryBookmark, 'id' | 'createdAt'>) => {
      setState((current) => ({
        ...current,
        bookmarks: [
          {
            ...bookmark,
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            createdAt: new Date().toISOString(),
          },
          ...current.bookmarks,
        ].slice(0, BOOKMARK_LIMIT),
      }));
    },
    [],
  );

  const deleteBookmark = React.useCallback((id: string) => {
    setState((current) => ({
      ...current,
      bookmarks: current.bookmarks.filter((b) => b.id !== id),
    }));
  }, []);

  return {
    state,
    revision,
    setActiveTab,
    setLimit,
    startPreview,
    completePreview,
    failPreview,
    clear,
    addBookmark,
    deleteBookmark,
  };
};

export default useProjectQueryResultsPanel;
