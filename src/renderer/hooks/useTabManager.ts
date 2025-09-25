import React from 'react';
import { projectsServices } from '../services';
import { getLanguageFromExtension } from '../components/editor/helpers';
import { getNonEditableFileMessage, isEditableFile } from '../helpers/utils';
import type {
  EditorTabId,
  EditorTabState,
  TabContentUpdateOptions,
} from '../components/editor/types';

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
}

const useTabManager = (projectId?: string): UseTabManagerReturn => {
  const [tabs, setTabs] = React.useState<EditorTabState[]>([]);
  const [activeTabId, setActiveTabId] = React.useState<EditorTabId | null>(
    null,
  );
  const tabsRef = React.useRef<EditorTabState[]>(tabs);
  const previousProjectIdRef = React.useRef<string | undefined>(projectId);

  React.useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  React.useEffect(() => {
    if (previousProjectIdRef.current !== projectId) {
      previousProjectIdRef.current = projectId;
      setTabs([]);
      setActiveTabId(null);
    }
  }, [projectId]);

  const switchTab = React.useCallback((tabId: EditorTabId) => {
    setActiveTabId(tabId);
  }, []);

  const closeTab = React.useCallback(
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

  const closeTabByPath = React.useCallback(
    (path: string) => {
      const targetTab = tabsRef.current.find((tab) => tab.path === path);
      if (targetTab) {
        closeTab(targetTab.id);
      }
    },
    [closeTab],
  );

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
  }, []);

  const openTab = React.useCallback(
    async (
      path: string,
      options?: OpenTabOptions,
    ): Promise<EditorTabId | null> => {
      if (!path) {
        return null;
      }

      const existing = tabsRef.current.find((tab) => tab.path === path);
      if (existing) {
        setActiveTabId(existing.id);
        return existing.id;
      }

      const id = ensureUniqueId(path, tabsRef.current);
      const isEditable = isEditableFile(path);
      const initialContent =
        options?.content ?? (isEditable ? '' : getNonEditableFileMessage(path));

      const newTab: EditorTabState = {
        id,
        path,
        title: options?.title ?? deriveTitleFromPath(path),
        content: initialContent,
        isModified: false,
        language: getLanguageFromExtension(path),
        isLoading: isEditable,
        error: undefined,
        viewState: null,
        isReadOnly: options?.isReadOnly ?? !isEditable,
      };

      setTabs((current) => [...current, newTab]);
      setActiveTabId(id);

      if (!isEditable) {
        return id;
      }

      try {
        const data = await projectsServices.getFileContent({ path });
        setTabs((current) =>
          current.map((tab) =>
            tab.id === id
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
            tab.id === id
              ? {
                  ...tab,
                  isLoading: false,
                  error: message,
                }
              : tab,
          ),
        );
      }

      return id;
    },
    [],
  );

  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId),
    [tabs, activeTabId],
  );

  return {
    tabs,
    activeTabId,
    activeTab,
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
  };
};

export default useTabManager;
