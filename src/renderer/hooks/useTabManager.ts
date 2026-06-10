import React from 'react';
import { projectsServices } from '../services';
import {
  MD_PREVIEW_PREFIX,
  isVirtualPreviewPath,
} from '../components/editor/previewConstants';
import { getLanguageFromExtension } from '../components/editor/helpers';
import { getNonEditableFileMessage, isEditableFile } from '../helpers/utils';
import { disposeModelForPath, renameModel } from '../lib/monaco/modelStore';
import { clearViewState } from '../lib/monaco/viewStateStore';
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

  // Never persist virtual preview tabs — they are ephemeral
  const persistableTabs = tabs.filter((t) => !isVirtualPreviewPath(t.path));

  if (persistableTabs.length === 0) {
    window.localStorage.removeItem(key);
    return;
  }

  // If the active tab was a preview tab, persist the first real tab as active
  const persistableActiveId = persistableTabs.some((t) => t.id === activeTabId)
    ? activeTabId
    : (persistableTabs[0]?.id ?? null);

  const payload: PersistedTabsState = {
    tabs: persistableTabs,
    activeTabId: persistableActiveId,
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

export const deriveTitleFromPath = (path: string): string => {
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
      // Migrate older persisted tabs that predate savedContent: if the tab
      // was unmodified, its on-disk baseline equals its current content.
      const migrated = persisted.tabs.map((tab) =>
        tab.savedContent === undefined && !tab.isModified
          ? { ...tab, savedContent: tab.content }
          : tab,
      );
      setTabs(migrated);
      const hasValidActiveTab = migrated.some(
        (tab) => tab.id === persisted.activeTabId,
      );
      setActiveTabId(
        hasValidActiveTab ? persisted.activeTabId : (migrated[0]?.id ?? null),
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
        const closing = current[index];
        const updated = [
          ...current.slice(0, index),
          ...current.slice(index + 1),
        ];
        if (activeTabId === tabId) {
          const nextTab = updated[index] || updated[index - 1];
          setActiveTabId(nextTab ? nextTab.id : null);
        }
        disposeModelForPath(projectId, closing.path);
        clearViewState(closing.id);
        return updated;
      });
    },
    [activeTabId, projectId],
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

  const closeTabByPath = React.useCallback(
    (path: string) => {
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

      setTabs((current) => current.filter((t) => !idsToClose.has(t.id)));

      setActiveTabId((currentId) => {
        if (currentId && idsToClose.has(currentId)) {
          const remaining = tabsRef.current.filter(
            (t) => !idsToClose.has(t.id),
          );
          if (remaining.length === 0) return null;
          return remaining[remaining.length - 1].id;
        }
        return currentId;
      });

      tabsToClose.forEach((tab) => {
        disposeModelForPath(projectId, tab.path);
        clearViewState(tab.id);
      });
    },
    [projectId],
  );

  const updateTab = React.useCallback(
    (tabId: EditorTabId, updater: (tab: EditorTabState) => EditorTabState) => {
      setTabs((current) => {
        let sourceTabModified: EditorTabState | undefined;
        const newTabs = current.map((tab) => {
          if (tab.id === tabId) {
            const updated = updater(tab);
            sourceTabModified = updated;
            return updated;
          }
          return tab;
        });

        if (sourceTabModified) {
          const st = sourceTabModified;
          let hasPreviews = false;
          const finalTabs = newTabs.map((tab) => {
            if (tab.path === `${MD_PREVIEW_PREFIX}${st.path}`) {
              hasPreviews = true;
              return { ...tab, content: st.content };
            }
            return tab;
          });
          return hasPreviews ? finalTabs : newTabs;
        }
        return newTabs;
      });
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
      updateTab(tabId, (tab) => ({
        ...tab,
        isModified: false,
        savedContent: tab.content,
      }));
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
      updateTab(tabId, (tab) => {
        const explicit = options?.markModified;
        let isModified: boolean;
        if (typeof explicit === 'boolean') {
          isModified = explicit;
        } else if (tab.savedContent === undefined) {
          // No baseline yet — assume edits are real changes.
          isModified = true;
        } else {
          isModified = content !== tab.savedContent;
        }
        return {
          ...tab,
          content,
          isModified,
          error: undefined,
        };
      });
    },
    [updateTab],
  );

  const updateTabContentByPath = React.useCallback(
    (path: string, content: string, options?: UpdateTabByPathOptions) => {
      const target = tabsRef.current.find((tab) => tab.path === path);
      if (!target) {
        return;
      }
      setTabs((current) => {
        const newTabs = current.map((tab) => {
          if (tab.id !== target.id) {
            return tab;
          }
          const isModified = options?.markModified ?? false;
          return {
            ...tab,
            content,
            isModified,
            // When the caller asserts the tab is unmodified, the new content
            // is the disk baseline. When marking modified, leave the previous
            // baseline in place so undo can still detect the saved state.
            savedContent: isModified ? tab.savedContent : content,
            error: options?.error,
          };
        });

        let hasPreviews = false;
        const finalTabs = newTabs.map((tab) => {
          if (tab.path === `${MD_PREVIEW_PREFIX}${target.path}`) {
            hasPreviews = true;
            return { ...tab, content };
          }
          return tab;
        });
        return hasPreviews ? finalTabs : newTabs;
      });
      if (options?.markSaved) {
        markTabSaved(target.id);
      }
    },
    [markTabSaved],
  );

  const renameTab = React.useCallback(
    (oldPath: string, newPath: string) => {
      const renames: { from: string; to: string; language: string }[] = [];
      setTabs((current) =>
        current.map((tab) => {
          if (tab.path === oldPath) {
            renames.push({
              from: tab.path,
              to: newPath,
              language: getLanguageFromExtension(newPath),
            });
            return {
              ...tab,
              path: newPath,
              title: deriveTitleFromPath(newPath),
            };
          }

          const isChild =
            tab.path.startsWith(`${oldPath}/`) ||
            tab.path.startsWith(`${oldPath}\\`);

          if (isChild) {
            const updatedPath = tab.path.replace(oldPath, newPath);
            renames.push({
              from: tab.path,
              to: updatedPath,
              language: getLanguageFromExtension(updatedPath),
            });
            return {
              ...tab,
              path: updatedPath,
              title: deriveTitleFromPath(updatedPath),
            };
          }

          return tab;
        }),
      );
      // Models are URI-keyed; mirror the path change so undo history and
      // the editor's bound model survive the rename.
      renames.forEach(({ from, to, language }) => {
        renameModel(projectId, from, to, language);
      });
    },
    [projectId],
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
    tabsRef.current.forEach((tab) => {
      disposeModelForPath(projectId, tab.path);
      clearViewState(tab.id);
    });
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

      let shouldLoadContent = false;
      let isEditable = false;
      let hasInitialContent = false;

      // Virtual preview tabs are never loaded from disk
      const isVirtualPreview = isVirtualPreviewPath(path);
      isEditable = !isVirtualPreview && isEditableFile(path);
      hasInitialContent = typeof options?.content === 'string';

      // Read current tabs synchronously from ref to avoid React 18 batching issues
      // (setTabs callback may be deferred when called from outside React event handlers)
      const currentTabs = tabsRef.current;
      const existingTab = currentTabs.find((tab) => tab.path === path);

      let targetId: EditorTabId;

      if (existingTab) {
        targetId = existingTab.id;
        // Update existing tab options if needed
        setTabs((current) =>
          current.map((tab) =>
            tab.path === path
              ? { ...tab, isReadOnly: options?.isReadOnly ?? tab.isReadOnly }
              : tab,
          ),
        );
      } else {
        // Generate ID before setTabs so we have it synchronously
        targetId = ensureUniqueId(path, currentTabs);

        const initialContent =
          options?.content ??
          (isEditable ? '' : getNonEditableFileMessage(path));

        const newTab: EditorTabState = {
          id: targetId,
          path,
          title: options?.title ?? deriveTitleFromPath(path),
          content: initialContent,
          // If we're about to fetch from disk, leave savedContent undefined
          // until the load completes; otherwise the initial content IS the
          // baseline.
          savedContent:
            isEditable && !hasInitialContent ? undefined : initialContent,
          isModified: false,
          language: getLanguageFromExtension(path),
          isLoading: isEditable && !hasInitialContent,
          error: undefined,
          viewState: null,
          isReadOnly: options?.isReadOnly ?? !isEditable,
        };

        shouldLoadContent = isEditable && !hasInitialContent;

        setTabs((current) => {
          // Double-check: another call may have added this tab concurrently
          if (current.find((t) => t.id === targetId)) return current;
          const updated = [...current, newTab];
          tabsRef.current = updated;
          return updated;
        });
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
                  savedContent: data,
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
      if (!targetTab || !isEditableFile(path) || isVirtualPreviewPath(path)) {
        return;
      }

      // Refresh is a silent background re-read: the tab already shows its
      // previous content, so we deliberately do NOT flip isLoading. Toggling
      // it would flash the tab's loading dot on every tab switch (see the
      // auto-refresh-on-focus effect in screens/projectDetails) for the few
      // milliseconds the disk read takes.
      try {
        const data = await projectsServices.getFileContent({ path });
        setTabs((current) =>
          current.map((tab) =>
            tab.path === path
              ? {
                  ...tab,
                  content: data,
                  savedContent: data,
                  isModified: false,
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
            tab.path === path ? { ...tab, error: message } : tab,
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
