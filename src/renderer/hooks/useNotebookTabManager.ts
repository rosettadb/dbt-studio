import React from 'react';
import { Notebook } from '../../types/notebooks';

const STORAGE_KEY = 'dbt-studio:notebook-tabs';

export interface NotebookTabState {
  notebookId: string;
  notebookName: string;
  connectionId: string;
  isModified: boolean;
}

type PersistedNotebookTabsState = {
  tabs: NotebookTabState[];
  activeTabId: string | null;
};

const readPersistedState = (): PersistedNotebookTabsState | null => {
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
      tabs: parsed.tabs as NotebookTabState[],
      activeTabId:
        typeof parsed.activeTabId === 'string' || parsed.activeTabId === null
          ? parsed.activeTabId
          : null,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to read persisted notebook tabs state', error);
    return null;
  }
};

const persistState = (tabs: NotebookTabState[], activeTabId: string | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (tabs.length === 0) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  const payload: PersistedNotebookTabsState = {
    tabs,
    activeTabId,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to persist notebook tabs state', error);
  }
};

const clearPersistedState = () => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
};

export interface UseNotebookTabManagerReturn {
  tabs: NotebookTabState[];
  activeTabId: string | null;
  activeTab: NotebookTabState | undefined;
  isHydrated: boolean;
  openNotebook: (notebook: Notebook, connectionId: string) => string;
  switchTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  markTabModified: (tabId: string, isModified: boolean) => void;
  updateTabName: (tabId: string, newName: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  reset: () => void;
  closeTabsByConnection: (connectionId: string) => void;
}

const useNotebookTabManager = (): UseNotebookTabManagerReturn => {
  const [tabs, setTabs] = React.useState<NotebookTabState[]>([]);
  const [activeTabId, setActiveTabId] = React.useState<string | null>(null);
  const [isHydrated, setIsHydrated] = React.useState(false);
  const tabsRef = React.useRef<NotebookTabState[]>(tabs);

  React.useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // Hydrate from localStorage on mount
  React.useEffect(() => {
    const persisted = readPersistedState();

    if (persisted) {
      setTabs(persisted.tabs);
      const hasValidActiveTab = persisted.tabs.some(
        (tab) => tab.notebookId === persisted.activeTabId,
      );
      setActiveTabId(
        hasValidActiveTab
          ? persisted.activeTabId
          : (persisted.tabs[0]?.notebookId ?? null),
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

  const switchTab = React.useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const closeTab = React.useCallback(
    (tabId: string) => {
      setTabs((current) => {
        const index = current.findIndex((tab) => tab.notebookId === tabId);
        if (index === -1) {
          return current;
        }
        const updated = [
          ...current.slice(0, index),
          ...current.slice(index + 1),
        ];
        if (activeTabId === tabId) {
          const nextTab = updated[index] || updated[index - 1];
          setActiveTabId(nextTab ? nextTab.notebookId : null);
        }
        return updated;
      });
    },
    [activeTabId],
  );

  const markTabModified = React.useCallback(
    (tabId: string, isModified: boolean) => {
      setTabs((current) =>
        current.map((tab) =>
          tab.notebookId === tabId ? { ...tab, isModified } : tab,
        ),
      );
    },
    [],
  );

  const updateTabName = React.useCallback((tabId: string, newName: string) => {
    setTabs((current) =>
      current.map((tab) =>
        tab.notebookId === tabId ? { ...tab, notebookName: newName } : tab,
      ),
    );
  }, []);

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

  const closeTabsByConnection = React.useCallback(
    (connectionId: string) => {
      setTabs((current) => {
        const updated = current.filter(
          (tab) => tab.connectionId !== connectionId,
        );
        // If active tab was closed, switch to first remaining tab
        if (
          activeTabId &&
          !updated.some((tab) => tab.notebookId === activeTabId)
        ) {
          setActiveTabId(updated[0]?.notebookId ?? null);
        }
        return updated;
      });
    },
    [activeTabId],
  );

  const openNotebook = React.useCallback(
    (notebook: Notebook, connectionId: string): string => {
      // Check if tab already exists for this notebook
      const existingTab = tabsRef.current.find(
        (tab) => tab.notebookId === notebook.id,
      );

      if (existingTab) {
        setActiveTabId(existingTab.notebookId);
        return existingTab.notebookId;
      }

      // Create new tab
      const newTab: NotebookTabState = {
        notebookId: notebook.id,
        notebookName: notebook.name,
        connectionId,
        isModified: false,
      };

      setTabs((current) => {
        const updated = [...current, newTab];
        tabsRef.current = updated;
        return updated;
      });

      setActiveTabId(notebook.id);
      return notebook.id;
    },
    [],
  );

  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.notebookId === activeTabId),
    [tabs, activeTabId],
  );

  return {
    tabs,
    activeTabId,
    activeTab,
    isHydrated,
    openNotebook,
    switchTab,
    closeTab,
    markTabModified,
    updateTabName,
    reorderTabs,
    reset,
    closeTabsByConnection,
  };
};

export default useNotebookTabManager;
