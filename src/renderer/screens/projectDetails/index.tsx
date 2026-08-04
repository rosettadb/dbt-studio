import React from 'react';
import SplitPane, { Pane } from 'split-pane-react';
import 'split-pane-react/esm/themes/default.css';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  AccountTree,
  AutoAwesome,
  AutoFixHigh,
  Cable,
  Cloud,
  Delete,
  Edit,
} from '@mui/icons-material';
import {
  Badge,
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import { toast } from 'react-toastify';
import yaml from 'js-yaml';
import { useTheme } from '@mui/material/styles';
import {
  AddConnectionModal,
  Editor,
  Loader,
  ModelSplitButton,
  NoAiSetModal,
  ProjectDbtSplitButton,
  RemoveConnectionModal,
  SplitButton,
  TerminalLayout,
  AiPromptModal,
  PipelineSelectorModal,
  PushToCloudModal,
} from '../../components';
import { TerminalLayoutRef, TerminalPanelTab } from '../../components/terminal';
import { ProjectQueryResultsPanel } from '../../components/projectQueryResults';
import {
  ProjectSidebar,
  SidebarTab,
} from '../../components/sidebar/project-sidebar';
import { Icon } from '../../components/icon';
import { icons } from '../../../../assets';
import { TabManager } from '../../components/editor/tabManager';
import { deriveTitleFromPath } from '../../hooks/useTabManager';
import {
  useGetConnectionById,
  useGetConnections,
  useGetFileStatuses,
  useGetProjectFiles,
  useGetSelectedProject,
  useGetSettings,
  useGitIsInitialized,
  useSaveFileContent,
  useUpdateProject,
  useGetFileContent,
} from '../../controllers';
import { usePipelineActionId } from '../../controllers/rosettaCloud.controller';
import {
  PipelineView,
  CloudLogViewer,
  isPipelineFile,
  parsePipelineConfig,
} from '../../components/pipelineView';
import { DbtRunHistoryPanel } from '../../components/dbtRunHistory';
import { Taskbar, TaskbarItem } from '../../components/terminal/styles';
import { projectsServices } from '../../services';
import { Content, EditorContainer, Header, NoFileSelected } from './styles';
import {
  useAppContext,
  useDbt,
  useProjectQueryResultsPanel,
  useProjectSqlExecution,
  useRosettaDBT,
  useTabManager,
} from '../../hooks';
import { Project, SupportedConnectionTypes } from '../../../types/backend';
import { AI_PROMPTS } from '../../config/constants';
import { utils } from '../../helpers';
import { AppLayout } from '../../layouts';
import ChatScreen from '../chat';
import { getFileName } from '../../services/settings.services';
import type { EditorTabId, EditorTabState } from '../../../types/editor';
import { subscribeToToolResult } from '../../services/agentEvents.service';
import {
  toPreviewPath,
  isVirtualPreviewPath,
  getPreviewSourcePath,
  isPipelineTabPath,
  getPipelineFilePath,
  toPipelineTabPath,
} from '../../components/editor/previewConstants';

const VerticalSash = (_: number, active: boolean) => (
  <div
    style={{
      width: '4px',
      height: '100%',
      cursor: 'col-resize',
      position: 'relative',
      backgroundColor: active ? 'rgba(144,202,249,0.4)' : 'transparent',
      transition: 'background-color 0.15s ease',
    }}
  >
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: 0,
        bottom: 0,
        width: '2px',
        transform: 'translateX(-50%)',
        backgroundColor: active
          ? 'rgba(144,202,249,0.8)'
          : 'rgba(255,255,255,0.08)',
        transition: 'background-color 0.15s ease',
      }}
    />
  </div>
);

const ProjectDetails: React.FC = () => {
  const navigate = useNavigate();
  const [verticalSizes, setVerticalSizes] = React.useState<(number | string)[]>(
    ['auto', 500],
  );
  // Minimum width for the chat panel — must be wide enough for the chat UI
  const CHAT_MIN_WIDTH = 280;
  const {
    isAiProviderSet,
    isChatOpen,
    setEditingFilePath: setSelectedFilePath,
    editingFilePath: selectedFilePath,
    openChatWithMessage,
    registerSyncEditorContent,
    registerOpenFile,
    registerCloseFile,
    registerRefreshFileTree,
    env,
  } = useAppContext();

  const { data: project, isLoading, refetch } = useGetSelectedProject();
  const { data: connection } = useGetConnectionById(project?.connectionId);
  const { data: settings } = useGetSettings();
  const { mutate: updateFileContent } = useSaveFileContent();

  const {
    tabs,
    activeTab,
    activeTabId,
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
  } = useTabManager(project?.id);
  const terminalLayoutRef = React.useRef<TerminalLayoutRef>(null);

  const handleTerminalTabSwitch = React.useCallback((tab: TerminalPanelTab) => {
    terminalLayoutRef.current?.switchTab(tab);
  }, []);

  const fileContent = activeTab?.content;
  const projectQueryResults = useProjectQueryResultsPanel(project?.id);
  const { executeProjectSql } = useProjectSqlExecution({
    onStart: (payload) => {
      handleTerminalTabSwitch('queryResults');
      projectQueryResults.startPreview(payload);
    },
    onSuccess: projectQueryResults.completePreview,
    onError: projectQueryResults.failPreview,
  });

  const previousProjectPathRef = React.useRef<string | undefined>();

  const [isLoadingQuery, setIsLoadingQuery] = React.useState(false);
  const [noAiSetModal, setNoAiSetModal] = React.useState(false);
  const [aiTransformationPrompt, setAiTransformationPrompt] =
    React.useState<string>();
  const [isAddConnectionModalOpen, setIsAddConnectionModalOpen] =
    React.useState(false);
  const [connectionMenuAnchor, setConnectionMenuAnchor] =
    React.useState<HTMLElement | null>(null);
  const [isRemoveConnectionConfirmOpen, setIsRemoveConnectionConfirmOpen] =
    React.useState(false);
  const [aiTransformationResponse, setAitTransformationResponse] =
    React.useState<string>();
  const [isSynchronizing, setIsSynchronizing] = React.useState(false);
  const [sidebarTab, setSidebarTab] = React.useState<SidebarTab>('explorer');
  const [pipelineModalOpen, setPipelineModalOpen] = React.useState(false);
  const [pipelineRunArgs, setPipelineRunArgs] = React.useState('');
  const [pipelineCloudModal, setPipelineCloudModal] = React.useState(false);
  const theme = useTheme();

  const handleRunPipelineFile = React.useCallback((filePath: string) => {
    // Extract pipeline name from path (filename without extension)
    const name =
      filePath
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        ?.replace(/\.(yml|yaml)$/, '') || '';
    setPipelineRunArgs(`--pipeline_name ${name}`);
    setPipelineCloudModal(true);
  }, []);

  // Pipeline tab support — derive state from the currently active tab
  const activePipelineFilePath = React.useMemo(() => {
    if (!activeTab?.path || !isPipelineTabPath(activeTab.path)) return '';
    return getPipelineFilePath(activeTab.path) ?? '';
  }, [activeTab?.path]);

  const { data: activePipelineContent, refetch: refetchPipelineContent } =
    useGetFileContent(activePipelineFilePath, {
      enabled: !!activePipelineFilePath,
    });

  const activePipelineBasename = React.useMemo(() => {
    if (!activePipelineFilePath) return null;
    const parts = activePipelineFilePath.split(/[\\/]/);
    return parts[parts.length - 1] || null;
  }, [activePipelineFilePath]);

  const recordedPipelineActionId = activePipelineBasename
    ? (project?.pipelineRuns?.[activePipelineBasename] ?? null)
    : null;

  const activePipelineActionId = usePipelineActionId(
    project?.externalId ? project?.id : null,
    activePipelineBasename,
    recordedPipelineActionId,
  );

  // Code/visual toggle for the pipeline tab — the raw YAML is edited inline
  // via a one-off Editor instance instead of opening a second tab.
  const [pipelineCodeMode, setPipelineCodeMode] = React.useState(false);
  const [pipelineDraftTab, setPipelineDraftTab] =
    React.useState<EditorTabState | null>(null);

  React.useEffect(() => {
    setPipelineCodeMode(false);
    setPipelineDraftTab(null);
  }, [activePipelineFilePath]);

  // Cloud logs auto-minimize once when a pipeline is first opened (mirrors
  // the terminal's own minimize/restore) and can be freely restored
  // afterward — restoring doesn't get overridden by mode changes.
  const [pipelineLogsMinimized, setPipelineLogsMinimized] =
    React.useState(false);

  const handleEnterPipelineCodeMode = React.useCallback(
    (content?: string) => {
      const resolvedContent = content ?? activePipelineContent;
      if (resolvedContent === undefined) {
        return;
      }
      setPipelineDraftTab({
        id: activePipelineFilePath,
        path: activePipelineFilePath,
        title: activePipelineBasename ?? activePipelineFilePath,
        content: resolvedContent,
        savedContent: resolvedContent,
        isModified: false,
        isLoading: false,
        error: undefined,
        viewState: null,
        isReadOnly: false,
      });
      setPipelineCodeMode(true);
    },
    [activePipelineFilePath, activePipelineBasename, activePipelineContent],
  );

  const handleExitPipelineCodeMode = React.useCallback(() => {
    if (
      pipelineDraftTab?.isModified &&
      // eslint-disable-next-line no-alert
      !window.confirm('Discard unsaved YAML changes?')
    ) {
      return;
    }
    setPipelineCodeMode(false);
    setPipelineDraftTab(null);
  }, [pipelineDraftTab]);

  const handleTabSelect = React.useCallback(
    (tabId: string) => {
      if (
        pipelineDraftTab?.isModified &&
        // eslint-disable-next-line no-alert
        !window.confirm('Discard unsaved YAML changes?')
      ) {
        return;
      }
      switchTab(tabId);
    },
    [pipelineDraftTab, switchTab],
  );

  const {
    data: directories,
    isLoading: isLoadingDirectories,
    refetch: fetchDirectories,
  } = useGetProjectFiles(project as Project, { enabled: !!project?.id });

  const { fn: rosettaDbt, isRunning: isRunningRosettaDbt } = useRosettaDBT(
    async () => {
      if (project) {
        await new Promise((resolve) => {
          setTimeout(resolve, 2000);
        });
        await fetchDirectories();
      }
    },
  );

  const { isRunning: isRunningDbt } = useDbt(async () => {
    await fetchDirectories();
  });

  const { data: isInitialized } = useGitIsInitialized(project?.path, {
    enabled: !!project?.path,
  });

  const { data: statuses = [], refetch: updateStatuses } = useGetFileStatuses(
    project?.path,
    { enabled: !!project?.path && !!isInitialized },
  );

  const { data: connections = [] } = useGetConnections();
  const { mutate: updateProject } = useUpdateProject();

  const handleConnectionModalClose = () => {
    setIsAddConnectionModalOpen(false);
  };

  const handleRemoveConnectionClick = () => {
    setConnectionMenuAnchor(null);
    setIsRemoveConnectionConfirmOpen(true);
  };

  const handleConfirmRemoveConnection = () => {
    if (project) {
      updateProject({
        ...project,
        connectionId: undefined,
      });
      setSelectedFilePath(undefined);
      toast.success('Connection removed from project successfully!');
    }
    setIsRemoveConnectionConfirmOpen(false);
  };

  const handleConnectionMenuClose = () => {
    setConnectionMenuAnchor(null);
  };

  /**
   * Comprehensive synchronization function that coordinates all three components:
   * 1. Git status (file changes, staging, commits)
   * 2. Monaco editor tabs (open files, modified state, content)
   * 3. File explorer (file tree, status indicators)
   */
  const handleSynchronizeAll = React.useCallback(async () => {
    setIsSynchronizing(true);
    try {
      const [statusesResult] = await Promise.all([
        updateStatuses(),
        fetchDirectories(),
      ]);

      const currentStatuses = statusesResult?.data ?? statuses ?? [];

      tabs.forEach((tab) => {
        const fileStatus = currentStatuses.find((s) => s.path === tab.path);
        if (!fileStatus) {
          closeTabByPath(tab.path);
        }
      });

      tabs.forEach((tab) => {
        const fileStatus = currentStatuses.find((s) => s.path === tab.path);
        if (!fileStatus) {
          markTabSavedByPath(tab.path);
        }
      });

      tabs.forEach((tab) => {
        const fileStatus = currentStatuses.find((s) => s.path === tab.path);
        if (fileStatus?.status === 'modified' && !tab.isModified) {
          refreshTabContentByPath(tab.path);
        }
      });
    } catch (error: any) {
      toast.error(`Sync failed: ${error?.message || 'Unknown error'}`);
      // eslint-disable-next-line no-console
      console.error('Synchronization error:', error);
    } finally {
      setIsSynchronizing(false);
    }
  }, [
    tabs,
    statuses,
    updateStatuses,
    fetchDirectories,
    closeTabByPath,
    markTabSavedByPath,
    refreshTabContentByPath,
  ]);

  const handleSaveAllTabs = React.useCallback(async () => {
    const modifiedTabs = tabs.filter((tab) => tab.isModified);
    if (modifiedTabs.length === 0) {
      return;
    }
    await Promise.all(
      modifiedTabs.map(async (tab) => {
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
    await updateStatuses();
  }, [tabs, markTabSavedByPath, setTabErrorByPath, updateStatuses]);

  const handleOpenQuerySqlInEditor = React.useCallback(
    (sql: string) => {
      if (!activeTabId) {
        toast.error('No active editor tab');
        return;
      }
      updateTabContent(activeTabId, sql);
    },
    [activeTabId, updateTabContent],
  );

  const handleExecuteEditorQuery = React.useCallback(
    async ({
      sql,
      filePath,
      modelName,
      compileModel,
    }: {
      sql: string;
      filePath: string;
      modelName?: string;
      compileModel?: boolean;
    }) => {
      if (!project) {
        toast.error('No active project');
        return;
      }
      if (!settings?.dbtPath && compileModel) {
        toast.info('Please configure dbt path in settings');
        return;
      }

      await executeProjectSql({
        project,
        filePath,
        rawSql: sql,
        modelName,
        compileModel,
        limit: projectQueryResults.state.limit,
      });
    },
    [
      executeProjectSql,
      project,
      settings?.dbtPath,
      projectQueryResults.state.limit,
    ],
  );

  const handleExecuteEditorCte = React.useCallback(
    async ({
      sql,
      filePath,
      cteName,
      modelName,
      compileModel,
    }: {
      sql: string;
      filePath: string;
      cteName: string;
      modelName?: string;
      compileModel?: boolean;
    }) => {
      if (!project) {
        toast.error('No active project');
        return;
      }
      if (!settings?.dbtPath && compileModel) {
        toast.info('Please configure dbt path in settings');
        return;
      }

      await executeProjectSql({
        project,
        filePath,
        rawSql: sql,
        querySql: sql,
        modelName,
        label: `CTE ${cteName}`,
        compileModel,
        cteName,
        limit: projectQueryResults.state.limit,
      });
    },
    [
      executeProjectSql,
      project,
      settings?.dbtPath,
      projectQueryResults.state.limit,
    ],
  );

  const handleCloseAllTabs = React.useCallback(() => {
    const unmodifiedTabs = tabs.filter((tab) => !tab.isModified);
    const modifiedCount = tabs.length - unmodifiedTabs.length;

    unmodifiedTabs.forEach((tab) => closeTab(tab.id));

    if (modifiedCount > 0) {
      toast.info(
        `${modifiedCount} modified tab${modifiedCount > 1 ? 's are' : ' is'} still open. Save or discard changes before closing.`,
      );
    }
  }, [tabs, closeTab]);

  // Toggles the markdown preview tab for a given file.
  const handleTogglePreviewTab = React.useCallback(
    async (currentPath: string, content: string) => {
      // If we are already on a preview tab, extract the real source path
      const isPreview = isVirtualPreviewPath(currentPath);
      const realSourcePath = isPreview
        ? getPreviewSourcePath(currentPath) || currentPath
        : currentPath;

      const pvPath = toPreviewPath(realSourcePath);
      const existing = tabs.find((t) => t.path === pvPath);

      if (existing) {
        // Toggle OFF: close the preview tab
        closeTab(existing.id);
        // If we were focused on the preview tab, switch back to the source tab
        if (activeTabId === existing.id) {
          const sourceTab = tabs.find((t) => t.path === realSourcePath);
          if (sourceTab) {
            switchTab(sourceTab.id);
          }
        }
        return;
      }

      // Toggle ON: open a new virtual read-only tab
      const fileName = deriveTitleFromPath(realSourcePath);
      await openTab(pvPath, {
        title: `Preview: ${fileName}`,
        content,
        isReadOnly: true,
      });
    },
    [tabs, closeTab, switchTab, openTab, activeTabId],
  );

  React.useEffect(() => {
    const fetchData = async () => {
      if (project && project.path) {
        await fetchDirectories();
      }
    };
    fetchData();
  }, [project]);

  React.useEffect(() => {
    const currentPath = project?.path;
    const previousPath = previousProjectPathRef.current;

    if (currentPath && previousPath && currentPath !== previousPath) {
      reset();
      setSelectedFilePath(undefined);
    }

    previousProjectPathRef.current = currentPath;
  }, [project?.path, reset, setSelectedFilePath]);

  React.useEffect(() => {
    if (!selectedFilePath) {
      return;
    }
    if (!isHydrated) {
      return;
    }

    openTab(selectedFilePath);
  }, [selectedFilePath, openTab, isHydrated]);

  React.useEffect(() => {
    if (activeTab?.path) {
      // Pipeline tabs don't update selectedFilePath — they manage their own content
      if (isPipelineTabPath(activeTab.path)) {
        return;
      }
      const isPreview = isVirtualPreviewPath(activeTab.path);
      const realSourcePath = isPreview
        ? getPreviewSourcePath(activeTab.path) || activeTab.path
        : activeTab.path;

      if (realSourcePath !== selectedFilePath) {
        setSelectedFilePath(realSourcePath);
      }
      return;
    }
    if (!activeTab?.path && selectedFilePath) {
      setSelectedFilePath(undefined);
    }
  }, [activeTab?.path, selectedFilePath, setSelectedFilePath]);

  React.useEffect(() => {
    const handler = (path: string, content: string) => {
      const targetTab = getTabByPath(path);
      if (!targetTab) {
        return;
      }

      updateTabContentByPath(path, content, {
        markModified: false,
      });
      setTabErrorByPath(path, undefined);
    };

    registerSyncEditorContent?.(handler);

    return () => {
      registerSyncEditorContent?.(undefined);
    };
  }, [
    updateTabContentByPath,
    setTabErrorByPath,
    getTabByPath,
    registerSyncEditorContent,
  ]);

  React.useEffect(() => {
    registerOpenFile?.((filePath: string) => {
      setSelectedFilePath(filePath);
      openTab(filePath);
    });
    return () => {
      registerOpenFile?.(undefined);
    };
  }, [registerOpenFile, setSelectedFilePath, openTab]);

  React.useEffect(() => {
    registerCloseFile?.((filePath: string) => {
      closeTabByPath(filePath);
      if (selectedFilePath === filePath) setSelectedFilePath(undefined);
    });
    return () => {
      registerCloseFile?.(undefined);
    };
  }, [
    registerCloseFile,
    closeTabByPath,
    selectedFilePath,
    setSelectedFilePath,
  ]);

  React.useEffect(() => {
    registerRefreshFileTree?.(async () => {
      await fetchDirectories();
      await updateStatuses();
    });
    return () => {
      registerRefreshFileTree?.(undefined);
    };
  }, [registerRefreshFileTree, fetchDirectories, updateStatuses]);

  // Stable refs for callbacks used in the agent file-write effect
  // This prevents the effect from re-subscribing on every render
  const fetchDirectoriesRef = React.useRef(fetchDirectories);
  const updateStatusesRef = React.useRef(updateStatuses);
  const getTabByPathRef = React.useRef(getTabByPath);
  const openTabRef = React.useRef(openTab);
  const switchTabRef = React.useRef(switchTab);
  const refreshTabContentByPathRef = React.useRef(refreshTabContentByPath);
  React.useEffect(() => {
    fetchDirectoriesRef.current = fetchDirectories;
  }, [fetchDirectories]);
  React.useEffect(() => {
    updateStatusesRef.current = updateStatuses;
  }, [updateStatuses]);
  React.useEffect(() => {
    getTabByPathRef.current = getTabByPath;
  }, [getTabByPath]);
  React.useEffect(() => {
    openTabRef.current = openTab;
  }, [openTab]);
  React.useEffect(() => {
    switchTabRef.current = switchTab;
  }, [switchTab]);
  React.useEffect(() => {
    refreshTabContentByPathRef.current = refreshTabContentByPath;
  }, [refreshTabContentByPath]);

  // Refresh file tree and open/update tab when agent writes a file
  // Uses refs so the subscription is created only once per project/hydration change
  React.useEffect(() => {
    if (!project?.path || !isHydrated) return undefined;

    // Deduplicate: track files being processed to avoid concurrent duplicate calls
    const inFlight = new Set<string>();

    const unsub = subscribeToToolResult(async (payload) => {
      const isFileWrite =
        payload.toolName === 'writeFile' ||
        payload.toolName === 'writeDbtModel';
      if (!isFileWrite || payload.status !== 'done') return;

      const filePath =
        (payload.args as any)?.filePath || (payload.args as any)?.path;
      if (!filePath) return;

      // Skip if already processing this file
      if (inFlight.has(filePath)) {
        // eslint-disable-next-line no-console
        console.log('[ProjectDetails] Skipping duplicate event for:', filePath);
        return;
      }
      inFlight.add(filePath);

      try {
        // eslint-disable-next-line no-console
        console.log(
          '[ProjectDetails] Agent wrote file, refreshing tree and opening tab:',
          filePath,
        );

        await fetchDirectoriesRef.current();
        await updateStatusesRef.current();

        // eslint-disable-next-line no-console
        console.log(
          '[ProjectDetails] fetchDirectories done, checking for existing tab',
        );

        const existingTab = getTabByPathRef.current(filePath);
        // eslint-disable-next-line no-console
        console.log('[ProjectDetails] existingTab:', existingTab?.id ?? 'none');

        if (existingTab) {
          // eslint-disable-next-line no-console
          console.log(
            '[ProjectDetails] Tab already exists, switching to:',
            existingTab.id,
          );
          await refreshTabContentByPathRef.current(filePath);
          switchTabRef.current(existingTab.id);
        } else {
          // eslint-disable-next-line no-console
          console.log('[ProjectDetails] Opening new tab for:', filePath);
          const tabId = await openTabRef.current(filePath);
          // eslint-disable-next-line no-console
          console.log('[ProjectDetails] openTab returned tabId:', tabId);
          if (tabId) switchTabRef.current(tabId);
        }
      } finally {
        inFlight.delete(filePath);
      }
    });

    return unsub;
  }, [project?.path, isHydrated]);

  // Auto-refresh tab content when focusing on a tab
  const previousActiveTabIdRef = React.useRef<EditorTabId | null>(null);
  React.useEffect(() => {
    if (!activeTabId || !activeTab || !isHydrated) {
      return;
    }

    // Only refresh if we actually switched to a different tab
    if (previousActiveTabIdRef.current === activeTabId) {
      return;
    }

    // Skip if tab has unsaved changes
    if (activeTab.isModified) {
      previousActiveTabIdRef.current = activeTabId;
      return;
    }

    // Refresh content from disk when tab becomes active
    refreshTabContentByPath(activeTab.path);
    previousActiveTabIdRef.current = activeTabId;
  }, [activeTabId, activeTab, isHydrated, refreshTabContentByPath]);

  // Auto-refresh config files when connection is updated
  const previousConnectionRef = React.useRef(connection);
  React.useEffect(() => {
    if (!project?.path || !connection || !isHydrated) {
      return;
    }

    const previousConnection = previousConnectionRef.current;

    // Check if connection data actually changed (not just initial load)
    if (previousConnection && previousConnection.id === connection.id) {
      // Connection was updated - refresh config files if they're open
      const configPaths = [
        `${project.path}/profiles.yml`,
        `${project.path}/rosetta/main.conf`,
      ];

      configPaths.forEach((configPath) => {
        const tab = tabs.find((t) => t.path === configPath);
        if (tab && !tab.isModified) {
          // Only refresh if tab is open and has no unsaved changes
          refreshTabContentByPath(configPath);
        }
      });
    }

    previousConnectionRef.current = connection;
    // DO NOT include 'tabs' in dependencies - it would cause infinite loop!
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, project?.path, isHydrated, refreshTabContentByPath]);

  const generateBasicTransformationPrompt = async (
    filePath: string,
    _project: Project,
  ) => {
    const fileName = await getFileName(filePath);
    const tables = await projectsServices.extractSchemaFromModelYaml(_project);
    // If Rosetta model.yaml is missing or empty, notify the user gracefully
    if (!tables || tables.length === 0) {
      const modelName = fileName.replace(/\.sql$/i, '');
      const { schema, table } = utils.extractSchemaAndTable(fileName);
      const expectedModel = schema && table ? `${schema}.${table}` : modelName;
      toast.info(
        `AI context incomplete: database schema missing. Run Rosetta → Raw layer to generate rosetta/${_project.name}/model.yaml (should include "${expectedModel}"). Then try again.`,
      );
    }
    const { schema, table } = utils.extractSchemaAndTable(fileName);

    const tableStructure = tables.find(
      (tmpTable) => tmpTable.name === table && tmpTable.schema === schema,
    );

    if (!tableStructure) {
      const prompt = utils.format(
        AI_PROMPTS.BASIC_TRANSFORM_PROMPT_WITHOUT_TABLE,
        fileName,
        String(fileContent),
        String(project?.dbtConnection?.type),
      );
      setAiTransformationPrompt(prompt);
      return;
    }

    const promptTable = yaml.dump({
      name: tableStructure.name,
      type: tableStructure.type,
      schema: tableStructure.schema,
      columns: tableStructure.columns.map((col) => ({
        name: col.name,
        typeName: col.typeName,
      })),
    });

    const tableName = `${schema}.${table}`;

    const prompt = utils.format(
      AI_PROMPTS.BASIC_TRANSFORM_PROMPT_WITH_TABLE,
      tableName,
      promptTable,
      fileName,
      String(fileContent),
      String(project?.dbtConnection?.type),
    );
    setAiTransformationPrompt(prompt);
  };

  const generateEnhancedTransformationPrompt = (
    content: string,
    connectionType: SupportedConnectionTypes,
  ) => {
    const prompt = utils.format(
      AI_PROMPTS.ENHANCE_ENHANCED_MODEL,
      connectionType,
      content,
    );
    setAiTransformationPrompt(prompt);
  };

  const generateDashboards = async () => {
    if (!isAiProviderSet) {
      toast.error('AI API Key not provided');
      return;
    }

    if (!selectedFilePath || !fileContent) {
      toast.error('No file selected');
      return;
    }

    setIsLoadingQuery(true);
    const fileName = await getFileName(selectedFilePath);

    try {
      const prompt = utils.format(
        AI_PROMPTS.GENERATE_DASHBOARDS,
        fileName,
        String(project?.dbtConnection?.type),
        String(fileContent),
      );
      openChatWithMessage(prompt);
    } catch (error: any) {
      if (
        typeof error?.message === 'string' &&
        (error.message.includes('429') || error.message.includes('quota'))
      ) {
        toast.error(
          'OpenAI API quota exceeded. Please check your billing details.',
        );
      } else {
        toast.error(
          `Error generating dashboards: ${error?.message || 'Unknown error'}`,
        );
      }
    } finally {
      setIsLoadingQuery(false);
    }
  };

  const menuItems = React.useMemo(() => {
    if (
      !project ||
      !selectedFilePath ||
      !fileContent ||
      !selectedFilePath.endsWith('.sql')
    ) {
      return [];
    }
    const items = [
      {
        name: 'Suggest Basic Transformations',
        onClick: () => {
          if (isAiProviderSet) {
            generateBasicTransformationPrompt(selectedFilePath, project!);
            return;
          }
          setNoAiSetModal(true);
        },
        subTitle: '',
        leftIcon: <AutoFixHigh />,
      },
      {
        name: 'Generate Analytics',
        onClick: () => {
          if (isAiProviderSet) {
            generateDashboards();
            return;
          }
          setNoAiSetModal(true);
        },
        subTitle: '',
        leftIcon: <AutoFixHigh />,
      },
    ];
    if (
      project.incrementalDir &&
      project.connection?.type &&
      selectedFilePath.includes(project?.incrementalDir)
    ) {
      items.push({
        name: 'Determine Incremental & Unique Key Columns',
        onClick: () => {
          if (isAiProviderSet) {
            generateEnhancedTransformationPrompt(
              fileContent,
              project?.connection?.type!,
            );
            return;
          }
          setNoAiSetModal(true);
        },
        subTitle: '',
        leftIcon: <AutoFixHigh />,
      });
    }
    return items;
  }, [selectedFilePath, fileContent]);

  if (isLoading) {
    return <Loader />;
  }

  if (!project?.id) {
    return <Navigate to="/app/select-project" />;
  }

  return (
    <AppLayout
      topMenuActions={
        <ProjectDbtSplitButton
          connection={connection}
          isDbtConfigured={Boolean(settings?.dbtPath)}
          isRunningDbt={isRunningDbt}
          isRunningRosettaDbt={isRunningRosettaDbt}
          project={project}
          rosettaPath={settings?.rosettaPath}
          dbtPath={settings?.dbtPath}
          environment={env}
          rosettaDbt={rosettaDbt}
          onBeforeExecute={() => {
            if (env === 'cloud') {
              setPipelineLogsMinimized(false);
            } else {
              handleTerminalTabSwitch('terminal');
            }
          }}
        />
      }
      panelTitle="DBT Studio"
      sidebarContent={
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            bgcolor: 'background.paper',
          }}
        >
          <Box
            sx={{
              borderBottom: `1px solid ${theme.palette.divider}`,
            }}
          >
            <Tabs
              value={sidebarTab}
              onChange={(_e, newValue) => setSidebarTab(newValue)}
              variant="fullWidth"
              sx={{
                minHeight: 34,
                '& .MuiTab-root': {
                  minHeight: 34,
                  fontSize: '0.7rem',
                  textTransform: 'none',
                  py: 0,
                  minWidth: 0,
                  px: 0.5,
                },
                '& .MuiTab-iconWrapper': {
                  marginRight: '4px !important',
                  marginBottom: '0 !important',
                },
              }}
            >
              <Tab
                value="explorer"
                icon={
                  <Icon
                    src={icons.folder}
                    width={15}
                    height={15}
                    color={
                      sidebarTab === 'explorer'
                        ? theme.palette.primary.main
                        : theme.palette.text.secondary
                    }
                  />
                }
                iconPosition="start"
                label="Explorer"
              />
              <Tab
                value="scm"
                icon={
                  <Badge
                    badgeContent={statuses.length}
                    color="primary"
                    max={99}
                    sx={{
                      '& .MuiBadge-badge': {
                        fontSize: 8,
                        height: 14,
                        minWidth: 14,
                        padding: '0 2px',
                        top: -2,
                        right: -6,
                      },
                    }}
                  >
                    <Icon
                      src={icons.gitBranch}
                      width={15}
                      height={15}
                      color={
                        sidebarTab === 'scm'
                          ? theme.palette.primary.main
                          : theme.palette.text.secondary
                      }
                    />
                  </Badge>
                }
                iconPosition="start"
                label="Git"
              />
              <Tab
                value="connections"
                icon={
                  <Cable
                    sx={{
                      fontSize: 15,
                      color:
                        sidebarTab === 'connections'
                          ? theme.palette.primary.main
                          : theme.palette.text.secondary,
                    }}
                  />
                }
                iconPosition="start"
                label="Database"
              />
            </Tabs>
          </Box>
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <ProjectSidebar
              activeTab={sidebarTab}
              directories={directories}
              statuses={statuses}
              isLoadingDirectories={isLoadingDirectories}
              selectedFilePath={selectedFilePath}
              project={project}
              onDeleteFile={(deletedFile: string) => {
                closeTabByPath(deletedFile);
                if (selectedFilePath?.includes(deletedFile)) {
                  setSelectedFilePath(undefined);
                }
              }}
              onFileSelect={async (fileNode) => {
                if (isPipelineFile(fileNode.path)) {
                  const pipelineTabPath = toPipelineTabPath(fileNode.path);
                  const alreadyOpen = !!getTabByPath(pipelineTabPath);
                  openTab(pipelineTabPath, {
                    title: fileNode.name,
                    content: '',
                    isReadOnly: true,
                  });
                  // If the tab was already open (e.g. after a pipeline override),
                  // React Query won't re-fetch automatically — force a refresh so
                  // the view shows the updated file content.
                  if (alreadyOpen) {
                    await refetchPipelineContent();
                  }
                  return;
                }
                if (!utils.isEditableFile(fileNode.path)) {
                  setSelectedFilePath(fileNode.path);
                  openTab(fileNode.path, { isReadOnly: true });
                  return;
                }
                setSelectedFilePath(fileNode.path);
                openTab(fileNode.path);
              }}
              onRefreshFiles={async () => {
                await fetchDirectories();
                await updateStatuses();
              }}
              onCopyPath={async (source, target) => {
                await projectsServices.copyPath({
                  source,
                  target,
                });
                await fetchDirectories();
                await updateStatuses();
              }}
              onNewFile={(filePath) => {
                if (!filePath) {
                  return;
                }
                setSelectedFilePath(filePath);
                openTab(filePath);
              }}
              onRenameFile={(oldPath, newPath) => {
                renameTab(oldPath, newPath);
                if (
                  activeTab?.path === oldPath ||
                  selectedFilePath === oldPath
                ) {
                  setSelectedFilePath(newPath);
                }
              }}
              // Source Control Monaco Editor Integration
              onSourceControlOpenFile={(filePath: string) => {
                setSelectedFilePath(filePath);
                openTab(filePath);
              }}
              onSourceControlFileSelect={(filePath: string) => {
                setSelectedFilePath(filePath);
              }}
              onSourceControlRefreshFileContent={refreshTabContentByPath}
              // Synchronization
              onSourceControlSynchronize={handleSynchronizeAll}
              isSourceControlSynchronizing={isSynchronizing}
              // Connections
              connection={connection}
              onAddConnection={() => setIsAddConnectionModalOpen(true)}
              onEditConnection={() => {
                if (connection?.id) {
                  navigate(`/app/edit-connection/${connection.id}`);
                }
              }}
              onRemoveConnection={() => {
                if (connection?.id) {
                  setIsRemoveConnectionConfirmOpen(true);
                }
              }}
              onRunPipeline={handleRunPipelineFile}
            />
          </Box>
        </Box>
      }
    >
      <SplitPane
        split="vertical"
        sizes={isChatOpen ? verticalSizes : ['100%', 0]}
        onChange={(newSizes) => {
          if (isChatOpen) {
            // Enforce minimum chat panel width
            const chatWidth = newSizes[1] as number;
            if (chatWidth < CHAT_MIN_WIDTH) {
              setVerticalSizes(['auto', CHAT_MIN_WIDTH]);
            } else {
              setVerticalSizes(newSizes);
            }
          }
        }}
        sashRender={VerticalSash}
      >
        <Pane minSize={200}>
          <Box height="100%" overflow="hidden">
            <div style={{ height: '100%', overflow: 'hidden' }}>
              <TerminalLayout
                ref={terminalLayoutRef}
                project={project}
                showQueryResultsTab={
                  selectedFilePath?.endsWith('.sql') ||
                  projectQueryResults.state.history.length > 0 ||
                  Boolean(projectQueryResults.state.result) ||
                  projectQueryResults.state.isRunning
                }
                queryResultsRevision={projectQueryResults.revision}
                queryResultsPanel={
                  <ProjectQueryResultsPanel
                    state={projectQueryResults.state}
                    onTabChange={projectQueryResults.setActiveTab}
                    onLimitChange={projectQueryResults.setLimit}
                    onClear={projectQueryResults.clear}
                    onAddBookmark={projectQueryResults.addBookmark}
                    onDeleteBookmark={projectQueryResults.deleteBookmark}
                    onRunHistoryItem={async (item) => {
                      if (!project) return;
                      await executeProjectSql({
                        project,
                        filePath: item.filePath,
                        modelName: item.modelName,
                        rawSql: item.rawSql,
                        querySql: item.compiledSql ?? item.rawSql,
                        compileModel: false,
                        limit: projectQueryResults.state.limit,
                      });
                    }}
                    onRun={
                      projectQueryResults.state.rawSql
                        ? async () => {
                            if (!project) return;
                            await executeProjectSql({
                              project,
                              filePath: projectQueryResults.state.filePath,
                              modelName: projectQueryResults.state.modelName,
                              rawSql: projectQueryResults.state.rawSql!,
                              querySql:
                                projectQueryResults.state.compiledSql ??
                                projectQueryResults.state.rawSql!,
                              compileModel: false,
                              limit: projectQueryResults.state.limit,
                            });
                          }
                        : undefined
                    }
                    onOpenSqlInEditor={handleOpenQuerySqlInEditor}
                  />
                }
                showRunHistoryTab
                runHistoryPanel={
                  <DbtRunHistoryPanel
                    projectId={project.id}
                    onFixWithAI={(prompt) => openChatWithMessage(prompt)}
                  />
                }
              >
                <Content>
                  <EditorContainer>
                    <Header>
                      <Box display="flex" flex={1} minWidth={0}>
                        <TabManager
                          tabs={tabs}
                          activeTabId={activeTabId}
                          onSelect={handleTabSelect}
                          onClose={closeTab}
                          onCloseAll={handleCloseAllTabs}
                          onSaveAll={handleSaveAllTabs}
                          onReorder={reorderTabs}
                        />
                      </Box>
                    </Header>
                    {connection?.id && (
                      <Menu
                        anchorEl={connectionMenuAnchor}
                        open={Boolean(connectionMenuAnchor)}
                        onClose={handleConnectionMenuClose}
                        anchorOrigin={{
                          vertical: 'bottom',
                          horizontal: 'right',
                        }}
                        transformOrigin={{
                          vertical: 'top',
                          horizontal: 'right',
                        }}
                      >
                        <MenuItem
                          onClick={() => {
                            navigate(`/app/edit-connection/${connection.id}`);
                            handleConnectionMenuClose();
                          }}
                        >
                          <ListItemIcon>
                            <Edit fontSize="small" color="primary" />
                          </ListItemIcon>
                          <ListItemText>Edit</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={handleRemoveConnectionClick}>
                          <ListItemIcon>
                            <Delete fontSize="small" color="error" />
                          </ListItemIcon>
                          <ListItemText>Remove</ListItemText>
                        </MenuItem>
                      </Menu>
                    )}
                    {activePipelineFilePath ? (
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          height: '100%',
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          sx={{
                            flex:
                              activePipelineActionId && !pipelineLogsMinimized
                                ? '1 1 60%'
                                : 1,
                            minHeight: 0,
                          }}
                        >
                          {pipelineCodeMode && pipelineDraftTab ? (
                            <Editor
                              projectId={project.id}
                              projectPath={project.path}
                              tabs={[pipelineDraftTab]}
                              activeTabId={pipelineDraftTab.id}
                              onTabContentChange={(_tabId, newContent) => {
                                setPipelineDraftTab((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        content: newContent,
                                        isModified:
                                          newContent !==
                                          (prev.savedContent ?? ''),
                                      }
                                    : prev,
                                );
                              }}
                              onTabSaved={() => {
                                setPipelineDraftTab((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        isModified: false,
                                        savedContent: prev.content,
                                      }
                                    : prev,
                                );
                                refetchPipelineContent();
                                updateStatuses();
                              }}
                              onTabError={(_tabId, errorMessage) => {
                                setPipelineDraftTab((prev) =>
                                  prev
                                    ? { ...prev, error: errorMessage }
                                    : prev,
                                );
                              }}
                              pendingClose={null}
                              onSaveAndClose={async () => {}}
                              onDiscardAndClose={() => {}}
                              onCancelClose={() => {}}
                              onGitStatusRefresh={updateStatuses}
                              onOpenFile={(filePath: string) => {
                                setSelectedFilePath(filePath);
                                openTab(filePath);
                              }}
                              extraActions={
                                <>
                                  {parsePipelineConfig(
                                    pipelineDraftTab.savedContent ?? '',
                                  ) === null && (
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        bgcolor: 'warning.main',
                                        color: 'warning.contrastText',
                                        px: 1,
                                        py: 0.25,
                                        borderRadius: 1,
                                        mr: 1,
                                      }}
                                    >
                                      Pipeline YAML is invalid — check syntax
                                      and required fields.
                                    </Typography>
                                  )}
                                  <Tooltip title="Visual editor">
                                    <IconButton
                                      size="small"
                                      onClick={handleExitPipelineCodeMode}
                                    >
                                      <AccountTree fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              }
                            />
                          ) : (
                            <PipelineView
                              content={activePipelineContent || ''}
                              onEdit={handleEnterPipelineCodeMode}
                              actionId={activePipelineActionId}
                              onSave={
                                activePipelineFilePath
                                  ? async (content: string) => {
                                      await projectsServices.saveFileContent({
                                        path: activePipelineFilePath,
                                        content,
                                      });
                                      await refetchPipelineContent();
                                      await updateStatuses();
                                    }
                                  : undefined
                              }
                              onRun={
                                settings?.env === 'cloud' &&
                                activePipelineFilePath
                                  ? () =>
                                      handleRunPipelineFile(
                                        activePipelineFilePath,
                                      )
                                  : undefined
                              }
                              onEnterView={() => setPipelineLogsMinimized(true)}
                            />
                          )}
                        </Box>
                        {activePipelineActionId &&
                          (pipelineLogsMinimized ? (
                            <Taskbar
                              onClick={() => setPipelineLogsMinimized(false)}
                              sx={{ cursor: 'pointer' }}
                            >
                              <TaskbarItem>
                                <Typography
                                  fontSize={13}
                                  sx={{ mr: 1 }}
                                  fontWeight="bold"
                                >
                                  Cloud Logs
                                </Typography>
                                <Cloud fontSize="small" />
                              </TaskbarItem>
                            </Taskbar>
                          ) : (
                            <Box
                              sx={{
                                flex: '1 1 40%',
                                minHeight: 0,
                                borderTop: 1,
                                borderColor: 'divider',
                              }}
                            >
                              <CloudLogViewer
                                actionId={activePipelineActionId}
                                onMinimize={() =>
                                  setPipelineLogsMinimized(true)
                                }
                              />
                            </Box>
                          ))}
                      </Box>
                    ) : (
                      <>
                        {!selectedFilePath && (
                          <NoFileSelected>
                            Please select a file from the explorer on the left!
                          </NoFileSelected>
                        )}
                        {project.path && (
                          <Editor
                            projectId={project.id}
                            projectPath={project.path}
                            tabs={tabs}
                            activeTabId={activeTabId}
                            onTabContentChange={(tabId, newContent) => {
                              updateTabContent(tabId, newContent);
                            }}
                            onTabSaved={(tabId) => {
                              markTabSaved(tabId);
                            }}
                            onTabError={(tabId, errorMessage) => {
                              setTabError(tabId, errorMessage);
                            }}
                            pendingClose={pendingClose}
                            onSaveAndClose={onSaveAndClose}
                            onDiscardAndClose={onDiscardAndClose}
                            onCancelClose={onCancelClose}
                            onGitStatusRefresh={updateStatuses}
                            onOpenFile={(filePath: string) => {
                              setSelectedFilePath(filePath);
                              openTab(filePath);
                            }}
                            onTogglePreviewTab={handleTogglePreviewTab}
                            onExecuteQuery={handleExecuteEditorQuery}
                            onExecuteCte={handleExecuteEditorCte}
                            extraActions={
                              <>
                                {menuItems.length > 0 && (
                                  <SplitButton
                                    title="AI"
                                    isLoading={isLoadingQuery}
                                    leftIcon={<AutoAwesome />}
                                    menuItems={menuItems}
                                  />
                                )}
                                {selectedFilePath?.endsWith('.sql') &&
                                  selectedFilePath?.includes('models') &&
                                  project && (
                                    <ModelSplitButton
                                      modelPath={selectedFilePath}
                                      project={project}
                                      isDbtConfigured={!!settings?.dbtPath}
                                      fileContent={fileContent}
                                      isRunningDbt={isRunningDbt}
                                      isRunningRosettaDbt={isRunningRosettaDbt}
                                      environment={env}
                                      onBeforeExecute={() => {
                                        if (env === 'cloud') {
                                          setPipelineLogsMinimized(false);
                                        } else {
                                          handleTerminalTabSwitch('terminal');
                                        }
                                      }}
                                      onQueryPreviewStart={(payload) => {
                                        handleTerminalTabSwitch('queryResults');
                                        projectQueryResults.startPreview(
                                          payload,
                                        );
                                      }}
                                      onQueryPreviewSuccess={
                                        projectQueryResults.completePreview
                                      }
                                      onQueryPreviewError={
                                        projectQueryResults.failPreview
                                      }
                                    />
                                  )}
                              </>
                            }
                          />
                        )}
                      </>
                    )}
                  </EditorContainer>
                </Content>
              </TerminalLayout>

              {noAiSetModal && (
                <NoAiSetModal
                  isOpen={noAiSetModal}
                  onClose={() => setNoAiSetModal(false)}
                />
              )}
              {aiTransformationPrompt && (
                <AiPromptModal
                  isOpen={!!aiTransformationPrompt}
                  onClose={() => {
                    setAiTransformationPrompt(undefined);
                    setAitTransformationResponse(undefined);
                  }}
                  onApply={async (value) => {
                    if (selectedFilePath) {
                      updateTabContentByPath(selectedFilePath, value, {
                        markModified: false,
                      });
                      markTabSavedByPath(selectedFilePath);
                      setTabErrorByPath(selectedFilePath, undefined);
                    } else {
                      toast.error('No file selected');
                    }
                    updateFileContent({
                      path: String(selectedFilePath),
                      content: value,
                    });
                    toast.success('Content saved!');
                  }}
                  prompt={aiTransformationPrompt}
                  onPromptChange={(value) => setAiTransformationPrompt(value)}
                  onSubmit={async () => {
                    openChatWithMessage(aiTransformationPrompt);
                    setAiTransformationPrompt(undefined);
                  }}
                  response={aiTransformationResponse}
                />
              )}
              <AddConnectionModal
                isOpen={isAddConnectionModalOpen}
                onClose={handleConnectionModalClose}
                project={project || null}
                connections={connections}
                onSuccess={() => {
                  // Refresh the project data
                  setSelectedFilePath(undefined);
                  refetch();
                }}
                onUpdateProject={updateProject}
              />
              <RemoveConnectionModal
                isOpen={isRemoveConnectionConfirmOpen}
                onClose={() => setIsRemoveConnectionConfirmOpen(false)}
                onConfirm={handleConfirmRemoveConnection}
                connectionName={
                  connection?.connection?.name || (connection as any)?.name
                }
              />
              {pipelineModalOpen && project && (
                <PipelineSelectorModal
                  isOpen={pipelineModalOpen}
                  onClose={() => setPipelineModalOpen(false)}
                  project={project}
                  onSelect={(pipelineName) => {
                    setPipelineModalOpen(false);
                    setPipelineRunArgs(`--pipeline_name ${pipelineName}`);
                    setPipelineCloudModal(true);
                  }}
                />
              )}
              {pipelineCloudModal && project && (
                <PushToCloudModal
                  isOpen={pipelineCloudModal}
                  onClose={() => {
                    setPipelineCloudModal(false);
                    setPipelineRunArgs('');
                  }}
                  onSuccess={() => setPipelineLogsMinimized(false)}
                  project={project}
                  command="pipeline"
                  initialDbtArguments={pipelineRunArgs}
                />
              )}
            </div>
          </Box>
        </Pane>
        <Pane minSize={CHAT_MIN_WIDTH}>
          <Box
            sx={{
              height: '100%',
              overflow: 'hidden',
            }}
          >
            {isChatOpen && (
              <Box height="100%">
                <ChatScreen />
              </Box>
            )}
          </Box>
        </Pane>
      </SplitPane>
    </AppLayout>
  );
};

export default ProjectDetails;
