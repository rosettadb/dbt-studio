import React from 'react';
import { projectsServices } from '../services';
import { getLanguageFromExtension } from '../components/editor/helpers';
import { getNonEditableFileMessage, isEditableFile } from '../helpers/utils';
import type {
  EditorTabId,
  EditorTabState,
  TabContentUpdateOptions,
  PendingCloseState,
} from '../../types/editor';

const STORAGE_KEY_PREFIX = 'dbt-studio:tabs:';

type PersistedTabsState = {
  tabs: EditorTabState[];
  activeTabId: EditorTabId | null;
};

const getStorageKey = (projectId?: string) =>
  projectId ? `${STORAGE_KEY_PREFIX}${projectId}` : null;

const readPersistedState = (projectId?: string): PersistedTabsState | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const key = getStorageKey(projectId);
  if (!key) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.tabs)) {
      return null;
    }

    return {
      tabs: parsed.tabs as EditorTabState[],
      activeTabId:
        typeof parsed.activeTabId === 'string' || parsed.activeTabId === null
          ? parsed.activeTabId
          : null,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to read persisted tabs state', error);
    return null;
  }
};

const persistState = (
  projectId: string,
  tabs: EditorTabState[],
  activeTabId: EditorTabId | null,
) => {
  if (typeof window === 'undefined') {
    return;
  }

  const key = getStorageKey(projectId);
  if (!key) {
    return;
  }

  if (tabs.length === 0) {
    window.localStorage.removeItem(key);
    return;
  }

  const payload: PersistedTabsState = {
    tabs,
    activeTabId,
  };

  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to persist tabs state', error);
  }
};

const clearPersistedState = (projectId: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  const key = getStorageKey(projectId);
  if (!key) {
    return;
  }

  window.localStorage.removeItem(key);
};

const deriveTitleFromPath = (path: string): string => {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length === 0) {
    return path || 'untitled';
  }
  const fileName = parts[parts.length - 1];
  return fileName || path;
};

const ensureUniqueId = (
  path: string,
  existing: EditorTabState[],
): EditorTabId => {
  const baseId = path;
  const isIdTaken = (id: string) => existing.some((tab) => tab.id === id);

  if (!isIdTaken(baseId)) {
    return baseId;
  }

  let counter = 1;
  let candidate = `${baseId}-${counter}`;
  while (isIdTaken(candidate)) {
    counter += 1;
    candidate = `${baseId}-${counter}`;
  }
  return candidate;
};

type OpenTabOptions = {
  title?: string;
  content?: string;
  isReadOnly?: boolean;
};

type UpdateTabByPathOptions = TabContentUpdateOptions & {
  markSaved?: boolean;
  error?: string;
};

export interface UseTabManagerReturn {
  tabs: EditorTabState[];
  activeTabId: EditorTabId | null;
  activeTab: EditorTabState | undefined;
  isHydrated: boolean;
  openTab: (
    path: string,
    options?: OpenTabOptions,
  ) => Promise<EditorTabId | null>;
  switchTab: (tabId: EditorTabId) => void;
  closeTab: (tabId: EditorTabId) => void;
  closeTabByPath: (path: string) => void;
  updateTabContent: (
    tabId: EditorTabId,
    content: string,
    options?: TabContentUpdateOptions,
  ) => void;
  updateTabContentByPath: (
    path: string,
    content: string,
    options?: UpdateTabByPathOptions,
  ) => void;
  markTabSaved: (tabId: EditorTabId) => void;
  markTabSavedByPath: (path: string) => void;
  setTabError: (tabId: EditorTabId, error?: string) => void;
  setTabErrorByPath: (path: string, error?: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  reset: () => void;
  getTabByPath: (path: string) => EditorTabState | undefined;
  renameTab: (oldPath: string, newPath: string) => void;
  refreshTabContentByPath: (path: string) => Promise<void>;
  // Unsaved changes dialog support
  pendingClose: PendingCloseState | null;
  onSaveAndClose: (tabId: EditorTabId) => Promise<void>;
  onDiscardAndClose: (tabId: EditorTabId) => void;
  onCancelClose: () => void;
}

const useTabManager = (projectId?: string): UseTabManagerReturn => {
  const [tabs, setTabs] = React.useState<EditorTabState[]>([]);
  const [activeTabId, setActiveTabId] = React.useState<EditorTabId | null>(
    null,
  );
  const [isHydrated, setIsHydrated] = React.useState(false);
  const [pendingClose, setPendingClose] =
    React.useState<PendingCloseState | null>(null);
  const tabsRef = React.useRef<EditorTabState[]>(tabs);

  React.useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  React.useEffect(() => {
    setIsHydrated(false);

    if (!projectId) {
      setTabs([]);
      setActiveTabId(null);
      setIsHydrated(true);
      return;
    }

    const persisted = readPersistedState(projectId);

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
      setIsHydrated(true);
      return;
    }

    setTabs([]);
    setActiveTabId(null);
    setIsHydrated(true);
  }, [projectId]);

  React.useEffect(() => {
    if (!projectId || !isHydrated) {
      return;
    }

    persistState(projectId, tabs, activeTabId);
  }, [projectId, tabs, activeTabId, isHydrated]);

  const switchTab = React.useCallback((tabId: EditorTabId) => {
    setActiveTabId(tabId);
  }, []);

  const performClose = React.useCallback(
    (tabId: EditorTabId) => {
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
    (tabId: EditorTabId) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);

      if (tab?.isModified) {
        // Show unsaved changes dialog
        setPendingClose({ tabId, tab });
        return;
      }

      // Proceed with close
      performClose(tabId);
    },
    [performClose],
  );

  const closeTabByPath = React.useCallback((path: string) => {
    const currentTabs = tabsRef.current;
    const tabsToClose = currentTabs.filter(
      (tab) =>
        tab.path === path ||
        tab.path.startsWith(`${path}/`) ||
        tab.path.startsWith(`${path}\\`),
    );

    if (tabsToClose.length === 0) {
      return;
    }

    const idsToClose = new Set(tabsToClose.map((t) => t.id));

    setTabs((current) => {
      const nextTabs = current.filter((t) => !idsToClose.has(t.id));

      return nextTabs;
    });

    setActiveTabId((currentId) => {
      if (currentId && idsToClose.has(currentId)) {
        // If the active tab was closed, try to find a neighbor in the remaining tabs.
        // Since tabs ref might not be updated yet, we derive remaining tabs from current ref.
        const remaining = tabsRef.current.filter((t) => !idsToClose.has(t.id));
        if (remaining.length === 0) {
          return null;
        }
        // Fallback to the last available tab, or similar logic to performClose
        return remaining[remaining.length - 1].id;
      }
      return currentId;
    });
  }, []);

  const updateTab = React.useCallback(
    (tabId: EditorTabId, updater: (tab: EditorTabState) => EditorTabState) => {
      setTabs((current) =>
        current.map((tab) => (tab.id === tabId ? updater(tab) : tab)),
      );
    },
    [],
  );

  const setTabError = React.useCallback(
    (tabId: EditorTabId, error?: string) => {
      updateTab(tabId, (tab) => ({ ...tab, error }));
    },
    [updateTab],
  );

  const markTabSaved = React.useCallback(
    (tabId: EditorTabId) => {
      updateTab(tabId, (tab) => ({ ...tab, isModified: false }));
    },
    [updateTab],
  );

  const markTabSavedByPath = React.useCallback(
    (path: string) => {
      const target = tabsRef.current.find((tab) => tab.path === path);
      if (target) {
        markTabSaved(target.id);
      }
    },
    [markTabSaved],
  );

  const setTabErrorByPath = React.useCallback(
    (path: string, error?: string) => {
      const target = tabsRef.current.find((tab) => tab.path === path);
      if (target) {
        setTabError(target.id, error);
      }
    },
    [setTabError],
  );

  const updateTabContent = React.useCallback(
    (
      tabId: EditorTabId,
      content: string,
      options?: TabContentUpdateOptions,
    ) => {
      updateTab(tabId, (tab) => ({
        ...tab,
        content,
        isModified: options?.markModified ?? true,
        error: undefined,
      }));
    },
    [updateTab],
  );

  const updateTabContentByPath = React.useCallback(
    (path: string, content: string, options?: UpdateTabByPathOptions) => {
      const target = tabsRef.current.find((tab) => tab.path === path);
      if (!target) {
        return;
      }
      setTabs((current) =>
        current.map((tab) => {
          if (tab.id !== target.id) {
            return tab;
          }
          return {
            ...tab,
            content,
            isModified: options?.markModified ?? false,
            error: options?.error,
          };
        }),
      );
      if (options?.markSaved) {
        markTabSaved(target.id);
      }
    },
    [markTabSaved],
  );

  const renameTab = React.useCallback((oldPath: string, newPath: string) => {
    setTabs((current) =>
      current.map((tab) => {
        if (tab.path !== oldPath) {
          return tab;
        }
        return {
          ...tab,
          path: newPath,
          title: deriveTitleFromPath(newPath),
        };
      }),
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
    if (projectId) {
      clearPersistedState(projectId);
    }
  }, [projectId]);

  const getTabByPath = React.useCallback(
    (path: string) => tabsRef.current.find((tab) => tab.path === path),
    [],
  );

  const openTab = React.useCallback(
    async (
      path: string,
      options?: OpenTabOptions,
    ): Promise<EditorTabId | null> => {
      if (!path) {
        return null;
      }

      let targetId: EditorTabId | null = null;
      let shouldLoadContent = false;
      let isEditable = false;
      let hasInitialContent = false;

      setTabs((current) => {
        const existingTab = current.find((tab) => tab.path === path);
        if (existingTab) {
          targetId = existingTab.id;
          // Update existing tab with new options
          return current.map((tab) =>
            tab.path === path
              ? {
                  ...tab,
                  isReadOnly: options?.isReadOnly ?? tab.isReadOnly,
                }
              : tab,
          );
        }

        isEditable = isEditableFile(path);
        hasInitialContent = typeof options?.content === 'string';
        const id = ensureUniqueId(path, current);
        const initialContent =
          options?.content ??
          (isEditable ? '' : getNonEditableFileMessage(path));

        const newTab: EditorTabState = {
          id,
          path,
          title: options?.title ?? deriveTitleFromPath(path),
          content: initialContent,
          isModified: false,
          language: getLanguageFromExtension(path),
          isLoading: isEditable && !hasInitialContent,
          error: undefined,
          viewState: null,
          isReadOnly: options?.isReadOnly ?? !isEditable,
        };

        targetId = id;
        shouldLoadContent = isEditable && !hasInitialContent;
        const updated = [...current, newTab];
        tabsRef.current = updated;
        return updated;
      });

      if (!targetId) {
        return null;
      }

      setActiveTabId(targetId);

      if (!shouldLoadContent || !isEditable) {
        return targetId;
      }

      try {
        const data = await projectsServices.getFileContent({ path });
        setTabs((current) =>
          current.map((tab) =>
            tab.id === targetId
              ? {
                  ...tab,
                  content: data,
                  isModified: false,
                  isLoading: false,
                  error: undefined,
                }
              : tab,
          ),
        );
      } catch (error: any) {
        const message =
          error?.message || 'Unable to load file contents. Please try again.';
        setTabs((current) =>
          current.map((tab) =>
            tab.id === targetId
              ? {
                  ...tab,
                  isLoading: false,
                  error: message,
                }
              : tab,
          ),
        );
      }

      return targetId;
    },
    [],
  );

  const refreshTabContentByPath = React.useCallback(
    async (path: string): Promise<void> => {
      const targetTab = tabsRef.current.find((tab) => tab.path === path);
      if (!targetTab || !isEditableFile(path)) {
        return;
      }

      // Set loading state
      setTabs((current) =>
        current.map((tab) =>
          tab.path === path
            ? { ...tab, isLoading: true, error: undefined }
            : tab,
        ),
      );

      try {
        // Reload file content from disk
        const data = await projectsServices.getFileContent({ path });
        setTabs((current) =>
          current.map((tab) =>
            tab.path === path
              ? {
                  ...tab,
                  content: data,
                  isModified: false,
                  isLoading: false,
                  error: undefined,
                }
              : tab,
          ),
        );
      } catch (error: any) {
        const message =
          error?.message ||
          'Unable to refresh file contents. Please try again.';
        setTabs((current) =>
          current.map((tab) =>
            tab.path === path
              ? { ...tab, isLoading: false, error: message }
              : tab,
          ),
        );
      }
    },
    [],
  );

  // Unsaved changes dialog handlers
  const onSaveAndClose = React.useCallback(
    async (tabId: EditorTabId) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab) {
        setPendingClose(null);
        return;
      }

      try {
        // Save the file
        await projectsServices.saveFileContent({
          path: tab.path,
          content: tab.content,
        });

        // Mark as saved
        markTabSaved(tabId);

        // Close the tab
        performClose(tabId);

        // Clear pending close
        setPendingClose(null);
      } catch (error: any) {
        // If save fails, keep the dialog open and show error
        setTabError(tabId, error?.message || 'Failed to save file');
      }
    },
    [performClose, markTabSaved, setTabError],
  );

  const onDiscardAndClose = React.useCallback(
    (tabId: EditorTabId) => {
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
    openTab,
    switchTab,
    closeTab,
    closeTabByPath,
    updateTabContent,
    updateTabContentByPath,
    markTabSaved,
    markTabSavedByPath,
    setTabError,
    setTabErrorByPath,
    reorderTabs,
    reset,
    getTabByPath,
    renameTab,
    refreshTabContentByPath,
    // Unsaved changes dialog support
    pendingClose,
    onSaveAndClose,
    onDiscardAndClose,
    onCancelClose,
  };
};

export default useTabManager;
