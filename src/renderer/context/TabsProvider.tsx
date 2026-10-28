import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { toast } from 'react-toastify';
import { useGetConnectionById, useGetSelectedProject } from '../controllers';
import useTabManager, {
  UseTabManagerReturn,
  deriveTitleFromPath,
} from '../hooks/useTabManager';
import { useRefreshProjectFiles } from '../hooks/useRefreshProjectFiles';
import { projectsServices } from '../services';
import { subscribeToToolResult } from '../services/agentEvents.service';
import {
  getPreviewSourcePath,
  isVirtualPreviewPath,
  toPreviewPath,
} from '../components/editor/previewConstants';
import {
  getSuccessfulPipelineMutation,
  resolveProjectFileMutationPath,
  resolveProjectMutationPath,
} from '../components/chat/pipelineToolResults';
import type { EditorTabId } from '../../types/editor';

export interface RevealPosition {
  path: string;
  line: number;
  column: number;
  length: number;
}

export interface TabsContextValue extends UseTabManagerReturn {
  projectId?: string;
  // Path of the file the workspace is "on": the active tab, resolved to its
  // source file when the active tab is a virtual preview.
  activeFilePath?: string;
  // Opens (or focuses) a file. An already-open, unmodified tab is re-read
  // from disk so external writes (agent, git discard) show up immediately.
  openFile: (path: string) => Promise<EditorTabId | null>;
  // Opens a file and, once its tab is active, scrolls the editor to a
  // position (used by "find in files").
  openFileAt: (position: RevealPosition) => Promise<void>;
  revealPosition: RevealPosition | null;
  clearRevealPosition: () => void;
  // Opens or closes the read-only preview tab for a markdown/html source.
  togglePreview: (sourcePath: string, content: string) => Promise<void>;
  saveAll: () => Promise<void>;
  saveTab: (tabId: EditorTabId) => Promise<void>;
  closeAll: () => void;
}

export const TabsContext = createContext<TabsContextValue | null>(null);

interface TabsProviderProps {
  children: ReactNode;
}

// Root-mounted store for the project workspace's editor tabs. It is the only
// owner of file content in the renderer: file views render a tab, the
// sidebar/chat/agent open and refresh tabs through this API, and nobody keeps
// a parallel copy of a file's text.
const notifyModifiedTabsKept = (count: number) => {
  if (count > 0) {
    toast.info(
      `${count} modified tab${count > 1 ? 's are' : ' is'} still open. Save or discard changes before closing.`,
    );
  }
};

export const TabsProvider: React.FC<TabsProviderProps> = ({ children }) => {
  const { data: project } = useGetSelectedProject();
  const { data: connection } = useGetConnectionById(project?.connectionId);
  const refreshProjectFiles = useRefreshProjectFiles();
  const manager = useTabManager(project?.id);
  const {
    tabs,
    activeTab,
    activeTabId,
    isHydrated,
    openTab,
    switchTab,
    closeTab,
    getTabByPath,
    refreshTabContentByPath,
    markTabSavedByPath,
    setTabErrorByPath,
    reset,
  } = manager;

  const [revealPosition, setRevealPosition] = useState<RevealPosition | null>(
    null,
  );

  const activeFilePath = useMemo(() => {
    if (!activeTab?.path) return undefined;
    return isVirtualPreviewPath(activeTab.path)
      ? (getPreviewSourcePath(activeTab.path) ?? activeTab.path)
      : activeTab.path;
  }, [activeTab?.path]);

  const openFile = useCallback(
    async (path: string) => {
      const existing = getTabByPath(path);
      const tabId = await openTab(path);
      if (existing && !existing.isModified) {
        await refreshTabContentByPath(path);
      }
      return tabId;
    },
    [getTabByPath, openTab, refreshTabContentByPath],
  );

  const openFileAt = useCallback(
    async (position: RevealPosition) => {
      await openTab(position.path);
      setRevealPosition(position);
    },
    [openTab],
  );

  const clearRevealPosition = useCallback(() => setRevealPosition(null), []);

  const togglePreview = useCallback(
    async (currentPath: string, content: string) => {
      const sourcePath = getPreviewSourcePath(currentPath) ?? currentPath;
      const previewPath = toPreviewPath(sourcePath);
      const existing = getTabByPath(previewPath);

      if (existing) {
        closeTab(existing.id);
        if (activeTabId === existing.id) {
          const sourceTab = getTabByPath(sourcePath);
          if (sourceTab) switchTab(sourceTab.id);
        }
        return;
      }

      await openTab(previewPath, {
        title: `Preview: ${deriveTitleFromPath(sourcePath)}`,
        content,
        isReadOnly: true,
      });
    },
    [getTabByPath, closeTab, activeTabId, switchTab, openTab],
  );

  const saveAll = useCallback(async () => {
    const modified = tabs.filter((tab) => tab.isModified);
    if (modified.length === 0) return;
    await Promise.all(
      modified.map(async (tab) => {
        try {
          await projectsServices.saveFileContent({
            path: tab.path,
            content: tab.content,
          });
          markTabSavedByPath(tab.path);
          setTabErrorByPath(tab.path, undefined);
        } catch (error: any) {
          setTabErrorByPath(tab.path, error?.message);
        }
      }),
    );
    await refreshProjectFiles();
  }, [tabs, markTabSavedByPath, setTabErrorByPath, refreshProjectFiles]);

  const saveTab = useCallback(
    async (tabId: EditorTabId) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      try {
        await projectsServices.saveFileContent({
          path: tab.path,
          content: tab.content,
        });
        markTabSavedByPath(tab.path);
        setTabErrorByPath(tab.path, undefined);
        await refreshProjectFiles();
      } catch (error: any) {
        setTabErrorByPath(tab.path, error?.message);
      }
    },
    [tabs, markTabSavedByPath, setTabErrorByPath, refreshProjectFiles],
  );

  const closeAll = useCallback(() => {
    const unmodified = tabs.filter((tab) => !tab.isModified);
    const modifiedCount = tabs.length - unmodified.length;
    unmodified.forEach((tab) => closeTab(tab.id));
    notifyModifiedTabsKept(modifiedCount);
  }, [tabs, closeTab]);

  // Bulk closes from the tab context menu keep changed tabs open, like Close All.
  const {
    closeTabsToLeft: closeLeftKeepingModified,
    closeTabsToRight: closeRightKeepingModified,
    closeOtherTabs: closeOthersKeepingModified,
  } = manager;
  const closeTabsToLeft = useCallback(
    (tabId: EditorTabId) => {
      const kept = closeLeftKeepingModified(tabId);
      notifyModifiedTabsKept(kept);
      return kept;
    },
    [closeLeftKeepingModified],
  );
  const closeTabsToRight = useCallback(
    (tabId: EditorTabId) => {
      const kept = closeRightKeepingModified(tabId);
      notifyModifiedTabsKept(kept);
      return kept;
    },
    [closeRightKeepingModified],
  );
  const closeOtherTabs = useCallback(
    (tabId: EditorTabId) => {
      const kept = closeOthersKeepingModified(tabId);
      notifyModifiedTabsKept(kept);
      return kept;
    },
    [closeOthersKeepingModified],
  );

  // Switching to another project starts it with an empty editor.
  const previousProjectPathRef = useRef<string | undefined>();
  useEffect(() => {
    const currentPath = project?.path;
    const previousPath = previousProjectPathRef.current;
    if (currentPath && previousPath && currentPath !== previousPath) {
      reset();
    }
    previousProjectPathRef.current = currentPath;
  }, [project?.path, reset]);

  // Re-read a tab from disk when it becomes active (unless it has unsaved
  // edits) so edits made outside the editor are never shown stale.
  const previousActiveTabIdRef = useRef<EditorTabId | null>(null);
  useEffect(() => {
    if (!activeTabId || !activeTab || !isHydrated) return;
    if (previousActiveTabIdRef.current === activeTabId) return;
    previousActiveTabIdRef.current = activeTabId;
    if (activeTab.isModified) return;
    refreshTabContentByPath(activeTab.path);
  }, [activeTabId, activeTab, isHydrated, refreshTabContentByPath]);

  // Connection edits rewrite profiles.yml / main.conf on disk; refresh them
  // if they're open and clean.
  const previousConnectionRef = useRef(connection);
  useEffect(() => {
    if (!project?.path || !connection || !isHydrated) return;
    const previous = previousConnectionRef.current;
    if (previous && previous.id === connection.id) {
      [
        `${project.path}/profiles.yml`,
        `${project.path}/rosetta/main.conf`,
      ].forEach((configPath) => {
        const tab = getTabByPath(configPath);
        if (tab && !tab.isModified) refreshTabContentByPath(configPath);
      });
    }
    previousConnectionRef.current = connection;
  }, [
    connection,
    project?.path,
    isHydrated,
    getTabByPath,
    refreshTabContentByPath,
  ]);

  // Agent file writes: refresh the tree and open/refresh the written file.
  // Every tab-manager callback used here is stable ([] deps), so the
  // subscription is created once per project/hydration without refs.
  useEffect(() => {
    if (!project?.path || !isHydrated) return undefined;
    const projectPath = project.path;
    const inFlight = new Set<string>();

    return subscribeToToolResult(async (payload) => {
      const isFileWrite =
        payload.toolName === 'writeFile' ||
        payload.toolName === 'writeDbtModel';
      const pipelineMutation = getSuccessfulPipelineMutation(
        payload.toolName,
        payload.result,
      );
      if ((!isFileWrite && !pipelineMutation) || payload.status !== 'done') {
        return;
      }

      const filePath = pipelineMutation
        ? resolveProjectMutationPath(projectPath, pipelineMutation.relativePath)
        : resolveProjectFileMutationPath(
            projectPath,
            (payload.args as any)?.filePath || (payload.args as any)?.path,
          );
      if (!filePath || inFlight.has(filePath)) return;
      inFlight.add(filePath);

      try {
        await refreshProjectFiles();
        const existing = getTabByPath(filePath);
        if (existing) {
          if (!existing.isModified) await refreshTabContentByPath(filePath);
          switchTab(existing.id);
        } else {
          const tabId = await openTab(filePath);
          if (tabId) switchTab(tabId);
        }
      } finally {
        inFlight.delete(filePath);
      }
    });
  }, [
    project?.path,
    isHydrated,
    refreshProjectFiles,
    getTabByPath,
    refreshTabContentByPath,
    switchTab,
    openTab,
  ]);

  const value = useMemo<TabsContextValue>(
    () => ({
      ...manager,
      projectId: project?.id,
      activeFilePath,
      openFile,
      openFileAt,
      revealPosition,
      clearRevealPosition,
      togglePreview,
      saveAll,
      saveTab,
      closeAll,
      closeTabsToLeft,
      closeTabsToRight,
      closeOtherTabs,
    }),
    [
      manager,
      project?.id,
      activeFilePath,
      openFile,
      openFileAt,
      revealPosition,
      clearRevealPosition,
      togglePreview,
      saveAll,
      saveTab,
      closeAll,
      closeTabsToLeft,
      closeTabsToRight,
      closeOtherTabs,
    ],
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
};

export const useTabs = (): TabsContextValue => {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error('useTabs must be used within a TabsProvider');
  }
  return ctx;
};
