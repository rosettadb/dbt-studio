import React from 'react';
import { v4 as uuidV4 } from 'uuid';
import type {
  SqlTabId,
  SqlTabState,
  SqlPendingCloseState,
} from '../../types/editor';
import {
  getConnectionQuery,
  updateConnectionQuery,
} from '../services/connectors.service';

const STORAGE_KEY = 'dbt-studio:sql-tabs';

type PersistedSqlTabsState = {
  tabs: SqlTabState[];
  activeTabId: SqlTabId | null;
};

const readPersistedState = (): PersistedSqlTabsState | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.tabs)) {
      return null;
    }

    return {
      tabs: parsed.tabs as SqlTabState[],
      activeTabId:
        typeof parsed.activeTabId === 'string' || parsed.activeTabId === null
          ? parsed.activeTabId
          : null,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to read persisted SQL tabs state', error);
    return null;
  }
};

const persistState = (tabs: SqlTabState[], activeTabId: SqlTabId | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (tabs.length === 0) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  // Don't persist results (they can be large)
  const tabsWithoutResults = tabs.map((tab) => ({
    ...tab,
    results: undefined,
    isLoading: false,
    error: undefined,
  }));

  const payload: PersistedSqlTabsState = {
    tabs: tabsWithoutResults,
    activeTabId,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to persist SQL tabs state', error);
  }
};

const clearPersistedState = () => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
};

export interface UseSqlTabManagerReturn {
  tabs: SqlTabState[];
  activeTabId: SqlTabId | null;
  activeTab: SqlTabState | undefined;
  isHydrated: boolean;
  openConnectionTab: (connection: {
    id: string;
    name: string;
    type: string;
  }) => Promise<SqlTabId>;
  switchTab: (tabId: SqlTabId) => void;
  closeTab: (tabId: SqlTabId) => void;
  updateTabQuery: (tabId: SqlTabId, query: string) => void;
  updateTabResults: (tabId: SqlTabId, results: any) => void;
  setTabLoading: (tabId: SqlTabId, isLoading: boolean) => void;
  setTabError: (tabId: SqlTabId, error?: string) => void;
  markTabSaved: (tabId: SqlTabId) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  reset: () => void;
  getTabByConnectionId: (connectionId: string) => SqlTabState | undefined;
  // Unsaved changes dialog support
  pendingClose: SqlPendingCloseState | null;
  onSaveAndClose: (tabId: SqlTabId) => Promise<void>;
  onDiscardAndClose: (tabId: SqlTabId) => void;
  onCancelClose: () => void;
}

const useSqlTabManager = (): UseSqlTabManagerReturn => {
  const [tabs, setTabs] = React.useState<SqlTabState[]>([]);
  const [activeTabId, setActiveTabId] = React.useState<SqlTabId | null>(null);
  const [isHydrated, setIsHydrated] = React.useState(false);
  const [pendingClose, setPendingClose] =
    React.useState<SqlPendingCloseState | null>(null);
  const tabsRef = React.useRef<SqlTabState[]>(tabs);

  React.useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // Hydrate from localStorage on mount
  React.useEffect(() => {
    const persisted = readPersistedState();

    if (persisted) {
      setTabs(persisted.tabs);
      const hasValidActiveTab = persisted.tabs.some(
        (tab) => tab.id === persisted.activeTabId,
      );
      setActiveTabId(
        hasValidActiveTab
          ? persisted.activeTabId
          : (persisted.tabs[0]?.id ?? null),
      );
    }

    setIsHydrated(true);
  }, []);

  // Persist on changes
  React.useEffect(() => {
    if (!isHydrated) {
      return;
    }
    persistState(tabs, activeTabId);
  }, [tabs, activeTabId, isHydrated]);

  const switchTab = React.useCallback((tabId: SqlTabId) => {
    setActiveTabId(tabId);
  }, []);

  const performClose = React.useCallback(
    (tabId: SqlTabId) => {
      setTabs((current) => {
        const index = current.findIndex((tab) => tab.id === tabId);
        if (index === -1) {
          return current;
        }
        const updated = [
          ...current.slice(0, index),
          ...current.slice(index + 1),
        ];
        if (activeTabId === tabId) {
          const nextTab = updated[index] || updated[index - 1];
          setActiveTabId(nextTab ? nextTab.id : null);
        }
        return updated;
      });
    },
    [activeTabId],
  );

  const closeTab = React.useCallback(
    (tabId: SqlTabId) => {
      performClose(tabId);
    },
    [performClose],
  );

  const updateTab = React.useCallback(
    (tabId: SqlTabId, updater: (tab: SqlTabState) => SqlTabState) => {
      setTabs((current) =>
        current.map((tab) => (tab.id === tabId ? updater(tab) : tab)),
      );
    },
    [],
  );

  const updateTabQuery = React.useCallback(
    (tabId: SqlTabId, query: string) => {
      updateTab(tabId, (tab) => ({
        ...tab,
        query,
        isModified: true,
      }));
    },
    [updateTab],
  );

  const updateTabResults = React.useCallback(
    (tabId: SqlTabId, results: any) => {
      updateTab(tabId, (tab) => ({
        ...tab,
        results,
        isLoading: false,
        error: undefined,
      }));
    },
    [updateTab],
  );

  const setTabLoading = React.useCallback(
    (tabId: SqlTabId, isLoading: boolean) => {
      updateTab(tabId, (tab) => ({
        ...tab,
        isLoading,
        error: isLoading ? undefined : tab.error,
      }));
    },
    [updateTab],
  );

  const setTabError = React.useCallback(
    (tabId: SqlTabId, error?: string) => {
      updateTab(tabId, (tab) => ({
        ...tab,
        error,
        isLoading: false,
      }));
    },
    [updateTab],
  );

  const markTabSaved = React.useCallback(
    (tabId: SqlTabId) => {
      updateTab(tabId, (tab) => ({ ...tab, isModified: false }));
    },
    [updateTab],
  );

  const reorderTabs = React.useCallback(
    (fromIndex: number, toIndex: number) => {
      setTabs((current) => {
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= current.length ||
          toIndex >= current.length
        ) {
          return current;
        }
        const updated = [...current];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);
        return updated;
      });
    },
    [],
  );

  const reset = React.useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
    clearPersistedState();
  }, []);

  const getTabByConnectionId = React.useCallback(
    (connectionId: string) =>
      tabsRef.current.find((tab) => tab.connectionId === connectionId),
    [],
  );

  const openConnectionTab = React.useCallback(
    async (connection: {
      id: string;
      name: string;
      type: string;
    }): Promise<SqlTabId> => {
      // Check if tab already exists for this connection
      const existingTab = tabsRef.current.find(
        (tab) => tab.connectionId === connection.id,
      );

      if (existingTab) {
        setActiveTabId(existingTab.id);
        return existingTab.id;
      }

      // Create new tab
      const id = uuidV4();
      let savedQuery = '';

      // Try to load saved query for this connection
      try {
        savedQuery = await getConnectionQuery(connection.id);
      } catch {
        // Ignore errors loading saved query
      }

      const newTab: SqlTabState = {
        id,
        connectionId: connection.id,
        connectionName: connection.name,
        connectionType: connection.type,
        query: savedQuery,
        isModified: false,
        isLoading: false,
      };

      setTabs((current) => {
        const updated = [...current, newTab];
        tabsRef.current = updated;
        return updated;
      });

      setActiveTabId(id);
      return id;
    },
    [],
  );

  // Unsaved changes dialog handlers
  const onSaveAndClose = React.useCallback(
    async (tabId: SqlTabId) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab) {
        setPendingClose(null);
        return;
      }

      try {
        // Save the query
        await updateConnectionQuery(tab.connectionId, tab.query);

        // Mark as saved
        markTabSaved(tabId);

        // Close the tab
        performClose(tabId);

        // Clear pending close
        setPendingClose(null);
      } catch (error: any) {
        // If save fails, keep the dialog open and show error
        setTabError(tabId, error?.message || 'Failed to save query');
      }
    },
    [performClose, markTabSaved, setTabError],
  );

  const onDiscardAndClose = React.useCallback(
    (tabId: SqlTabId) => {
      performClose(tabId);
      setPendingClose(null);
    },
    [performClose],
  );

  const onCancelClose = React.useCallback(() => {
    setPendingClose(null);
  }, []);

  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId),
    [tabs, activeTabId],
  );

  return {
    tabs,
    activeTabId,
    activeTab,
    isHydrated,
    openConnectionTab,
    switchTab,
    closeTab,
    updateTabQuery,
    updateTabResults,
    setTabLoading,
    setTabError,
    markTabSaved,
    reorderTabs,
    reset,
    getTabByConnectionId,
    pendingClose,
    onSaveAndClose,
    onDiscardAndClose,
    onCancelClose,
  };
};

export default useSqlTabManager;
