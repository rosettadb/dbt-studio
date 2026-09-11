import React, {
  useState,
  useCallback,
  useMemo,
  useContext,
  useEffect,
} from 'react';
import SplitPane, { Pane } from 'split-pane-react';
import 'split-pane-react/esm/themes/default.css';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  CircularProgress,
  useMediaQuery,
} from '@mui/material';
import {
  Add,
  TableChart,
  Warning,
  InsertChart,
  Upload,
  Code,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ChatBubbleOutline,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { AppLayout } from '../../layouts';
import {
  useGetConnections,
  useDuckLakeInstances,
  useImportConnectionFromNotebook,
} from '../../controllers';
import {
  useArchivedNotebooks,
  useRestoreNotebook,
  useDeleteArchivedNotebook,
  useDeleteAllArchivedNotebooks,
  useCreateNotebook,
  useNotebooks,
  useDeleteNotebook,
  useImportAllNotebooksFromPath,
  useRenameNotebook,
  useDuplicateNotebook,
  usePythonNotebooks,
  useCreatePythonNotebook,
  useRenamePythonNotebook,
  useDuplicatePythonNotebook,
  useDeletePythonNotebook,
} from '../../controllers/notebooks.controller';
import { AppContext } from '../../context';
import { connectorsServices, DuckLakeService } from '../../services';
import { notebooksService } from '../../services/notebooks.service';
import { AnalyticsEditor } from '../../components/analytics';
import { NotebooksSidebar } from '../../components/notebook/NotebooksSidebar';
import { NotebookTabManager } from '../../components/notebook/NotebookTabManager';
import {
  NotebookEditor,
  PythonNotebookEditor,
  flushNotebookPendingSave,
  flushPythonNotebookPendingSave,
} from '../../components/notebook';
import { ExportNotebookDialog } from '../../components/notebook/ExportNotebookDialog';
import { ImportConnectionDialog } from '../../components/notebook/ImportConnectionDialog';
import { ChatWindow } from '../../components/chat';
import {
  Table,
  SupportedConnectionTypes,
  ConnectionInput,
} from '../../../types/backend';
import { NotebookImportPreview } from '../../../types/notebooks';
import useNotebookTabManager from '../../hooks/useNotebookTabManager';
import useSecureStorage from '../../hooks/useSecureStorage';
import { resolveConnectionCredentials } from '../../utils/notebookConnectionTransfer';
import {
  useNotebookConnectionState,
  useNotebookSidebarState,
  useAppContext,
} from '../../hooks';

const CHAT_MIN_WIDTH = 280;

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

const Notebooks = () => {
  const { selectedProject, projects } = useContext(AppContext);
  const { isSidebarOpen } = useContext(AppContext);
  const { data: connections = [] } = useGetConnections();
  const { data: duckLakeInstances = [] } = useDuckLakeInstances();

  const { isChatOpen, setIsChatOpen } = useAppContext();

  const CHAT_WIDTH_KEY = 'notebooks-chat-width';
  const DEFAULT_CHAT_WIDTH = 360;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [verticalSizes, setVerticalSizes] = useState<(number | string)[]>(
    () => {
      const saved = parseInt(localStorage.getItem(CHAT_WIDTH_KEY) ?? '', 10);
      const initialWidth = Number.isNaN(saved) ? DEFAULT_CHAT_WIDTH : saved;
      return ['auto', initialWidth];
    },
  );

  useEffect(() => {
    const chatWidth = verticalSizes[1];
    if (typeof chatWidth === 'number') {
      localStorage.setItem(CHAT_WIDTH_KEY, String(chatWidth));
    }
  }, [verticalSizes]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isNarrow = useMediaQuery('(max-width: 900px)');

  const {
    activeConnectionId,
    setActiveConnectionId,
    isHydrated: isConnectionHydrated,
  } = useNotebookConnectionState();

  const {
    showArchived,
    setShowArchived,
    isHydrated: isSidebarHydrated,
  } = useNotebookSidebarState();

  const [activeSidebarTab, setActiveSidebarTab] = useState(0);
  // 0 = SQL sub-screen, 1 = Jupyter sub-screen
  const [activePrimaryTab, setActivePrimaryTab] = useState(0);
  const [activeAnalyticsPageId, setActiveAnalyticsPageId] = useState<
    string | null
  >(null);

  // Reset analytics page when switching connections to prevent showing
  // a page from the previous connection
  useEffect(() => {
    setActiveAnalyticsPageId(null);
  }, [activeConnectionId]);

  const handleOpenAnalyticsPage = useCallback((pageId: string) => {
    setActiveAnalyticsPageId(pageId);
    // Future Phase 3: trigger main content to show analytics editor
  }, []);

  const notebookTabManager = useNotebookTabManager();

  // ── Per-sub-screen active tab IDs ─────────────────────────────────────────
  // SQL tabs: kind === 'sql'; Jupyter tabs: kind === 'python'
  const sqlTabs = useMemo(
    () => notebookTabManager.tabs.filter((t) => t.kind === 'sql'),
    [notebookTabManager.tabs],
  );
  const jupyterTabs = useMemo(
    () => notebookTabManager.tabs.filter((t) => t.kind === 'python'),
    [notebookTabManager.tabs],
  );

  // Active tab ID for each sub-screen: use the shared activeTabId only when
  // it belongs to that sub-screen; otherwise fall back to the last tab in
  // that sub-screen (so tabs remember position across sub-screen switches).
  const activeSqlTabId = useMemo(() => {
    const shared = notebookTabManager.activeTabId;
    if (shared && sqlTabs.some((t) => t.notebookId === shared)) return shared;
    return sqlTabs[sqlTabs.length - 1]?.notebookId ?? null;
  }, [notebookTabManager.activeTabId, sqlTabs]);

  const activeJupyterTabId = useMemo(() => {
    const shared = notebookTabManager.activeTabId;
    if (shared && jupyterTabs.some((t) => t.notebookId === shared))
      return shared;
    return jupyterTabs[jupyterTabs.length - 1]?.notebookId ?? null;
  }, [notebookTabManager.activeTabId, jupyterTabs]);

  // Wrappers that open a notebook AND switch to the correct sub-screen
  const openSqlNotebook = useCallback(
    (
      notebook: Parameters<typeof notebookTabManager.openNotebook>[0],
      connectionId: string,
    ) => {
      const id = notebookTabManager.openNotebook(notebook, connectionId);
      setActivePrimaryTab(0);
      return id;
    },
    [notebookTabManager],
  );

  const openPythonNotebookAndSwitch = useCallback(
    (notebook: Parameters<typeof notebookTabManager.openPythonNotebook>[0]) => {
      const id = notebookTabManager.openPythonNotebook(notebook);
      setActivePrimaryTab(1);
      return id;
    },
    [notebookTabManager],
  );

  const isPythonNotebookActive =
    notebookTabManager.activeTab?.kind === 'python';

  useEffect(() => {
    if (isPythonNotebookActive && isChatOpen) setIsChatOpen?.(false);
  }, [isChatOpen, isPythonNotebookActive, setIsChatOpen]);

  // Wait for all hydration to complete
  const isFullyHydrated =
    isConnectionHydrated && isSidebarHydrated && notebookTabManager.isHydrated;

  // Validate hydrated connection exists, clear if not
  useEffect(() => {
    if (!isConnectionHydrated || !activeConnectionId) return;

    const connectionExists =
      connections.some((c) => c.id === activeConnectionId) ||
      (activeConnectionId.startsWith('ducklake-') &&
        duckLakeInstances.some(
          (i) => `ducklake-${i.id}` === activeConnectionId,
        ));

    if (!connectionExists) {
      setActiveConnectionId('');
    }
  }, [
    isConnectionHydrated,
    activeConnectionId,
    connections,
    duckLakeInstances,
    setActiveConnectionId,
  ]);

  // Schema state - cached per connection (SQL Editor pattern)
  const [tabSchemas, setTabSchemas] = useState<Record<string, Table[]>>({});
  const [loadingSchemas, setLoadingSchemas] = useState<Record<string, boolean>>(
    {},
  );

  // Notebooks state - fetch from backend
  const { data: notebooks = [], isLoading: isLoadingNotebooks } =
    useNotebooks(activeConnectionId);
  const deleteNotebook = useDeleteNotebook();
  const importAllNotebooksFromPath = useImportAllNotebooksFromPath();
  const importConnectionFromNotebook = useImportConnectionFromNotebook();
  const renameNotebook = useRenameNotebook();
  const duplicateNotebook = useDuplicateNotebook();
  const secureStorage = useSecureStorage();

  // Archived notebooks state
  const { data: archivedNotebooks = {} } = useArchivedNotebooks();
  const restoreNotebook = useRestoreNotebook();
  const deleteArchivedNotebook = useDeleteArchivedNotebook();
  const deleteAllArchived = useDeleteAllArchivedNotebooks();
  const createNotebook = useCreateNotebook();
  const {
    data: pythonNotebooks = [],
    isLoading: isLoadingPythonNotebooks,
    refetch: refetchPythonNotebooks,
  } = usePythonNotebooks();
  const createPythonNotebook = useCreatePythonNotebook();
  const renamePythonNotebook = useRenamePythonNotebook();
  const duplicatePythonNotebook = useDuplicatePythonNotebook();
  const deletePythonNotebook = useDeletePythonNotebook();

  // Confirmation dialogs state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [createNotebookOpen, setCreateNotebookOpen] = useState(false);
  const [createPythonNotebookOpen, setCreatePythonNotebookOpen] =
    useState(false);
  // Python rename/duplicate/delete dialog state
  const [pythonRenameOpen, setPythonRenameOpen] = useState(false);
  const [pythonRenameId, setPythonRenameId] = useState<string | null>(null);
  const [pythonRenameName, setPythonRenameName] = useState('');
  const [pythonDuplicateOpen, setPythonDuplicateOpen] = useState(false);
  const [pythonDuplicateId, setPythonDuplicateId] = useState<string | null>(
    null,
  );
  const [pythonDuplicateName, setPythonDuplicateName] = useState('');
  const [pythonDeleteOpen, setPythonDeleteOpen] = useState(false);
  const [pythonDeleteId, setPythonDeleteId] = useState<string | null>(null);
  const [pythonDeleteName, setPythonDeleteName] = useState('');
  const [deleteNotebookConfirmOpen, setDeleteNotebookConfirmOpen] =
    useState(false);
  const [renameNotebookOpen, setRenameNotebookOpen] = useState(false);
  const [duplicateNotebookOpen, setDuplicateNotebookOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importConnectionDialogOpen, setImportConnectionDialogOpen] =
    useState(false);
  const [pendingImport, setPendingImport] = useState<{
    filePath: string;
    preview: NotebookImportPreview;
  } | null>(null);
  const [newNotebookName, setNewNotebookName] = useState('');
  const [newNotebookDescription, setNewNotebookDescription] = useState('');
  const [renameNotebookId, setRenameNotebookId] = useState<string | null>(null);
  const [renameNotebookName, setRenameNotebookName] = useState('');
  const [duplicateNotebookId, setDuplicateNotebookId] = useState<string | null>(
    null,
  );
  const [duplicateNotebookName, setDuplicateNotebookName] = useState('');
  const [notebookToDelete, setNotebookToDelete] = useState<{
    connectionKey: string;
    notebookId: string;
    notebookName: string;
  } | null>(null);
  const [activeNotebookToDelete, setActiveNotebookToDelete] = useState<{
    notebookId: string;
    notebookName: string;
  } | null>(null);
  const [connectionKeyToDeleteAll, setConnectionKeyToDeleteAll] = useState<
    string | null
  >(null);
  const [pythonTabToClose, setPythonTabToClose] = useState<{
    notebookId: string;
    notebookName: string;
  } | null>(null);

  const closePythonTab = useCallback(
    async (notebookId: string) => {
      await notebooksService.shutdownPythonNotebook(notebookId);
      notebookTabManager.closeTab(notebookId);
    },
    [notebookTabManager],
  );

  const handleCloseNotebookTab = useCallback(
    async (notebookId: string) => {
      const tab = notebookTabManager.tabs.find(
        (item) => item.notebookId === notebookId,
      );
      if (tab?.kind !== 'python') {
        notebookTabManager.closeTab(notebookId);
        return;
      }
      try {
        await flushPythonNotebookPendingSave(notebookId);
        const snapshot =
          await notebooksService.getPythonSessionSnapshot(notebookId);
        if (
          snapshot.state === 'running' ||
          snapshot.state === 'interrupting' ||
          snapshot.state === 'restarting'
        ) {
          setPythonTabToClose({
            notebookId,
            notebookName: tab.notebookName,
          });
          return;
        }
        await closePythonTab(notebookId);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Could not close notebook.',
        );
      }
    },
    [closePythonTab, notebookTabManager],
  );

  // Get active connection details
  const activeConnection = useMemo(() => {
    if (activeConnectionId.startsWith('ducklake-')) {
      const instanceId = activeConnectionId.replace('ducklake-', '');
      const instance = duckLakeInstances.find((inst) => inst.id === instanceId);
      if (instance) {
        return {
          id: activeConnectionId,
          connection: {
            name: instance.name,
            type: 'ducklake',
          },
        };
      }
    }
    return connections.find((c) => c.id === activeConnectionId);
  }, [connections, duckLakeInstances, activeConnectionId]);

  // Get schema for active connection from cache
  const activeSchema = activeConnectionId
    ? tabSchemas[activeConnectionId] || []
    : [];
  const isLoadingSchema = activeConnectionId
    ? (loadingSchemas[activeConnectionId] ?? false)
    : false;

  // Fetch schema for a connection (with caching)
  const fetchSchemaForConnection = useCallback(
    async (connectionId: string, forceRefresh = false) => {
      // Skip if already loading
      if (loadingSchemas[connectionId]) return;

      // Skip if already cached (unless force refresh)
      if (!forceRefresh && tabSchemas[connectionId]) return;

      setLoadingSchemas((prev) => ({ ...prev, [connectionId]: true }));

      try {
        if (connectionId.startsWith('ducklake-')) {
          // DuckLake schema extraction
          const instanceId = connectionId.replace('ducklake-', '');
          const duckLakeSchema =
            await DuckLakeService.extractSchema(instanceId);

          // Convert DuckLake schema to Table[] format
          const tables: Table[] = [];
          duckLakeSchema.schemas.forEach((schemaInfo) => {
            schemaInfo.tables.forEach((table) => {
              tables.push({
                name: table.name,
                type: table.type || 'TABLE',
                schema: schemaInfo.name,
                columns:
                  table.columns?.map((col, index) => ({
                    name: col.name,
                    typeName: col.type,
                    type: col.type,
                    ordinalPosition: index + 1,
                    primaryKeySequenceId: 0,
                    columnDisplaySize: 0,
                    scale: 0,
                    precision: 0,
                    columnProperties: [],
                    autoincrement: false,
                    nullable: true,
                    defaultValue: undefined,
                    primaryKey: false,
                    foreignKeys: [],
                  })) || [],
              });
            });
          });

          setTabSchemas((prev) => ({ ...prev, [connectionId]: tables }));
        } else {
          // Regular DB connection schema extraction
          const result =
            await connectorsServices.extractSchemaFromConnection(connectionId);
          if (result.error) {
            // eslint-disable-next-line no-console
            console.error('Failed to fetch schema:', result.error);
            setTabSchemas((prev) => ({ ...prev, [connectionId]: [] }));
          } else {
            setTabSchemas((prev) => ({
              ...prev,
              [connectionId]: result.tables,
            }));
          }
        }
      } catch (error: any) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch schema:', error);
        setTabSchemas((prev) => ({ ...prev, [connectionId]: [] }));
      } finally {
        setLoadingSchemas((prev) => ({ ...prev, [connectionId]: false }));
      }
    },
    [loadingSchemas, tabSchemas],
  );

  // Auto-fetch schema when connection changes
  useEffect(() => {
    if (
      activeConnectionId &&
      !tabSchemas[activeConnectionId] &&
      !loadingSchemas[activeConnectionId]
    ) {
      fetchSchemaForConnection(activeConnectionId);
    }
  }, [
    activeConnectionId,
    tabSchemas,
    loadingSchemas,
    fetchSchemaForConnection,
  ]);

  // Handle connection selection
  const handleConnectionSelect = useCallback(
    (connectionId: string) => {
      // Close all tabs when manually switching connections
      // (Notebooks are connection-specific, unlike SQL Editor where tabs are independent queries)
      if (activeConnectionId && activeConnectionId !== connectionId) {
        notebookTabManager.closeTabsByConnection(activeConnectionId);
      }

      // Set new connection
      setActiveConnectionId(connectionId);

      // Schema will auto-load via useEffect if not cached
    },
    [setActiveConnectionId, activeConnectionId, notebookTabManager],
  );

  // Handle schema refresh
  const handleRefreshSchema = useCallback(() => {
    if (activeConnectionId) {
      // Force refresh by passing forceRefresh=true
      fetchSchemaForConnection(activeConnectionId, true);
    }
  }, [activeConnectionId, fetchSchemaForConnection]);

  // Helper: Check if connection exists
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const connectionExists = useCallback(
    (connectionKey: string) => {
      if (connectionKey.startsWith('ducklake:')) {
        const instanceId = connectionKey.replace('ducklake:', '');
        return duckLakeInstances.some((inst) => inst.id === instanceId);
      }
      if (connectionKey.startsWith('db:')) {
        const connId = connectionKey.replace('db:', '');
        return connections.some((conn) => conn.id === connId);
      }
      return false;
    },
    [connections, duckLakeInstances],
  );

  // Helper: Get connection name from connectionKey
  const getConnectionName = useCallback(
    (connectionKey: string) => {
      if (connectionKey.startsWith('ducklake:')) {
        const instanceId = connectionKey.replace('ducklake:', '');
        const instance = duckLakeInstances.find(
          (inst) => inst.id === instanceId,
        );
        return instance?.name || 'Unknown DuckLake';
      }
      if (connectionKey.startsWith('db:')) {
        const connId = connectionKey.replace('db:', '');
        const conn = connections.find((c) => c.id === connId);
        return conn?.connection.name || 'Unknown Connection';
      }
      return 'Unknown';
    },
    [connections, duckLakeInstances],
  );

  // Handle restore archived notebook
  const handleRestoreNotebook = useCallback(
    (connectionKey: string, notebookId: string) => {
      // Restore to the currently selected connection
      if (!activeConnectionId) {
        toast.error('Please select a connection to restore the notebook to');
        return;
      }

      restoreNotebook.mutate({
        archivedConnectionKey: connectionKey,
        notebookId,
        targetConnectionId: activeConnectionId,
      });
    },
    [restoreNotebook, activeConnectionId],
  );

  // Handle delete archived notebook
  const handleDeleteArchivedNotebook = useCallback(() => {
    if (!notebookToDelete) return;

    deleteArchivedNotebook.mutate(
      {
        connectionKey: notebookToDelete.connectionKey,
        notebookId: notebookToDelete.notebookId,
      },
      {
        onSuccess: () => {
          setDeleteConfirmOpen(false);
          setNotebookToDelete(null);
        },
      },
    );
  }, [notebookToDelete, deleteArchivedNotebook]);

  // Handle delete all archived notebooks
  const handleDeleteAllArchived = useCallback(() => {
    deleteAllArchived.mutate(connectionKeyToDeleteAll || undefined, {
      onSuccess: () => {
        setDeleteAllConfirmOpen(false);
        setConnectionKeyToDeleteAll(null);
      },
    });
  }, [connectionKeyToDeleteAll, deleteAllArchived]);

  // Handle create notebook
  const handleCreateNotebook = useCallback(() => {
    if (!activeConnectionId || !newNotebookName.trim()) return;

    createNotebook.mutate(
      {
        connectionId: activeConnectionId,
        name: newNotebookName.trim(),
        description: newNotebookDescription.trim() || undefined,
      },
      {
        onSuccess: (newNotebook) => {
          // Open the newly created notebook in a tab
          openSqlNotebook(newNotebook, activeConnectionId);
          setCreateNotebookOpen(false);
          setNewNotebookName('');
          setNewNotebookDescription('');
        },
      },
    );
  }, [
    activeConnectionId,
    newNotebookName,
    newNotebookDescription,
    createNotebook,
    notebookTabManager,
  ]);

  const handleCreatePythonNotebook = useCallback(() => {
    if (!newNotebookName.trim()) return;
    createPythonNotebook.mutate(newNotebookName.trim(), {
      onSuccess: (notebook) => {
        openPythonNotebookAndSwitch(notebook);
        setCreatePythonNotebookOpen(false);
        setNewNotebookName('');
      },
    });
  }, [createPythonNotebook, newNotebookName, openPythonNotebookAndSwitch]);

  const handleOpenPythonNotebook = useCallback(
    (notebookId: string) => {
      const notebook = pythonNotebooks.find((n) => n.id === notebookId);
      if (notebook) openPythonNotebookAndSwitch(notebook);
    },
    [pythonNotebooks, openPythonNotebookAndSwitch],
  );

  const handleRefreshPythonNotebooks = useCallback(() => {
    refetchPythonNotebooks();
  }, [refetchPythonNotebooks]);

  const handleImportPythonNotebook = useCallback(async () => {
    try {
      const imported = await notebooksService.importPythonNotebook();
      if (!imported) return;
      await refetchPythonNotebooks();
      openPythonNotebookAndSwitch(imported);
    } catch (err) {
      toast.error(
        `Failed to import Python notebook: ${(err as Error).message}`,
      );
    }
  }, [openPythonNotebookAndSwitch, refetchPythonNotebooks]);

  const handleExportActivePythonNotebook = useCallback(async () => {
    if (!activeJupyterTabId) return;

    try {
      const saved = await flushPythonNotebookPendingSave(activeJupyterTabId);
      const revision =
        saved?.revision ??
        pythonNotebooks.find((notebook) => notebook.id === activeJupyterTabId)
          ?.revision;

      if (revision == null) {
        toast.error('Open the Python notebook before exporting it.');
        return;
      }

      await notebooksService.exportPythonNotebook(activeJupyterTabId, revision);
    } catch (err) {
      toast.error(
        `Failed to export Python notebook: ${(err as Error).message}`,
      );
    }
  }, [activeJupyterTabId, pythonNotebooks]);

  const handleRenamePythonNotebook = useCallback(
    (notebookId: string, currentName: string) => {
      setPythonRenameId(notebookId);
      setPythonRenameName(currentName);
      setPythonRenameOpen(true);
    },
    [],
  );

  const confirmRenamePythonNotebook = useCallback(() => {
    if (!pythonRenameId || !pythonRenameName.trim()) return;
    renamePythonNotebook.mutate(
      { id: pythonRenameId, name: pythonRenameName.trim() },
      {
        onSuccess: () => {
          notebookTabManager.updateTabName(
            pythonRenameId,
            pythonRenameName.trim(),
          );
          setPythonRenameOpen(false);
          setPythonRenameId(null);
          setPythonRenameName('');
        },
      },
    );
  }, [
    pythonRenameId,
    pythonRenameName,
    renamePythonNotebook,
    notebookTabManager,
  ]);

  const handleDuplicatePythonNotebook = useCallback(
    (notebookId: string, currentName: string) => {
      setPythonDuplicateId(notebookId);
      setPythonDuplicateName(`${currentName} (Copy)`);
      setPythonDuplicateOpen(true);
    },
    [],
  );

  const confirmDuplicatePythonNotebook = useCallback(() => {
    if (!pythonDuplicateId || !pythonDuplicateName.trim()) return;
    duplicatePythonNotebook.mutate(
      { id: pythonDuplicateId, name: pythonDuplicateName.trim() },
      {
        onSuccess: (notebook) => {
          if (notebook) openPythonNotebookAndSwitch(notebook);
          setPythonDuplicateOpen(false);
          setPythonDuplicateId(null);
          setPythonDuplicateName('');
        },
      },
    );
  }, [
    pythonDuplicateId,
    pythonDuplicateName,
    duplicatePythonNotebook,
    notebookTabManager,
  ]);

  const handleDeletePythonNotebook = useCallback(
    (notebookId: string, notebookName: string) => {
      setPythonDeleteId(notebookId);
      setPythonDeleteName(notebookName);
      setPythonDeleteOpen(true);
    },
    [],
  );

  const confirmDeletePythonNotebook = useCallback(() => {
    if (!pythonDeleteId) return;
    deletePythonNotebook.mutate(
      { id: pythonDeleteId },
      {
        onSuccess: () => {
          notebookTabManager.closeTab(pythonDeleteId);
          setPythonDeleteOpen(false);
          setPythonDeleteId(null);
          setPythonDeleteName('');
        },
      },
    );
  }, [pythonDeleteId, deletePythonNotebook, notebookTabManager]);

  // Import notebooks (and optionally the connection they were exported from)
  // into the given connection, opening the first imported notebook.
  const runNotebookImport = useCallback(
    async (filePath: string, connectionId: string) => {
      try {
        const imported = await importAllNotebooksFromPath.mutateAsync({
          connectionId,
          filePath,
        });

        if (imported.length > 0) {
          if (connectionId !== activeConnectionId) {
            setActiveConnectionId(connectionId);
          }
          openSqlNotebook(imported[0], connectionId);
        }
      } catch (err) {
        // Error handled by mutation
      }
    },
    [
      importAllNotebooksFromPath,
      activeConnectionId,
      setActiveConnectionId,
      notebookTabManager,
    ],
  );

  // Handle import all notebooks
  const handleImportAllNotebooks = useCallback(async () => {
    let filePath: string | null;
    try {
      filePath = await notebooksService.selectImportFile();
    } catch (err) {
      toast.error(`Failed to select import file: ${(err as Error).message}`);
      return;
    }
    if (!filePath) return;

    let preview: NotebookImportPreview;
    try {
      preview = await notebooksService.peekImportFile(filePath);
    } catch (err) {
      toast.error((err as Error).message);
      return;
    }

    if (preview.connection) {
      setPendingImport({ filePath, preview });
      setImportConnectionDialogOpen(true);
      return;
    }

    if (!activeConnectionId) {
      toast.error(
        'This file has no connection details. Add or select a connection first, then import.',
      );
      return;
    }

    await runNotebookImport(filePath, activeConnectionId);
  }, [activeConnectionId, runNotebookImport]);

  // Handle confirming the import-connection dialog
  const handleImportConnectionConfirm = useCallback(
    async (shouldImportConnection: boolean) => {
      if (!pendingImport) return;
      const { filePath, preview } = pendingImport;
      setImportConnectionDialogOpen(false);
      setPendingImport(null);

      let targetConnectionId = activeConnectionId;
      if (shouldImportConnection && preview.connection) {
        try {
          const { id } = await importConnectionFromNotebook.mutateAsync(
            preview.connection,
          );
          targetConnectionId = id;
        } catch (err) {
          toast.error(`Failed to import connection: ${(err as Error).message}`);
          return;
        }
      }

      if (!targetConnectionId) {
        toast.error('No connection available to import notebooks into.');
        return;
      }

      await runNotebookImport(filePath, targetConnectionId);
    },
    [
      pendingImport,
      activeConnectionId,
      importConnectionFromNotebook,
      runNotebookImport,
    ],
  );

  const handleOpenNotebook = useCallback(
    (notebookId: string) => {
      const notebook = notebooks.find((n) => n.id === notebookId);
      if (notebook) {
        openSqlNotebook(notebook, activeConnectionId);
      }
    },
    [notebooks, activeConnectionId, openSqlNotebook],
  );

  // Handle delete notebook
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDeleteNotebook = useCallback(
    (notebookId: string, notebookName: string) => {
      setActiveNotebookToDelete({ notebookId, notebookName });
      setDeleteNotebookConfirmOpen(true);
    },
    [],
  );

  // Handle rename notebook
  const handleRenameNotebook = useCallback(
    (notebookId: string, currentName: string) => {
      setRenameNotebookId(notebookId);
      setRenameNotebookName(currentName);
      setRenameNotebookOpen(true);
    },
    [],
  );

  // Handle duplicate notebook
  const handleDuplicateNotebook = useCallback(
    (notebookId: string, currentName: string) => {
      setDuplicateNotebookId(notebookId);
      setDuplicateNotebookName(`${currentName} (Copy)`);
      setDuplicateNotebookOpen(true);
    },
    [],
  );

  // Confirm delete notebook
  const confirmDeleteNotebook = useCallback(() => {
    if (!activeNotebookToDelete) return;

    deleteNotebook.mutate(
      {
        connectionId: activeConnectionId,
        notebookId: activeNotebookToDelete.notebookId,
      },
      {
        onSuccess: () => {
          // Close the tab if it's open
          notebookTabManager.closeTab(activeNotebookToDelete.notebookId);
          setDeleteNotebookConfirmOpen(false);
          setActiveNotebookToDelete(null);
        },
      },
    );
  }, [
    activeNotebookToDelete,
    activeConnectionId,
    deleteNotebook,
    notebookTabManager,
  ]);

  // Confirm rename notebook
  const confirmRenameNotebook = useCallback(() => {
    if (!renameNotebookId || !renameNotebookName.trim()) return;

    renameNotebook.mutate(
      {
        connectionId: activeConnectionId,
        notebookId: renameNotebookId,
        newName: renameNotebookName.trim(),
      },
      {
        onSuccess: () => {
          // Update the tab name if it's open
          notebookTabManager.updateTabName(
            renameNotebookId,
            renameNotebookName.trim(),
          );
          setRenameNotebookOpen(false);
          setRenameNotebookId(null);
          setRenameNotebookName('');
        },
      },
    );
  }, [
    renameNotebookId,
    renameNotebookName,
    activeConnectionId,
    renameNotebook,
    notebookTabManager,
  ]);

  // Confirm duplicate notebook
  const confirmDuplicateNotebook = useCallback(() => {
    if (!duplicateNotebookId || !duplicateNotebookName.trim()) return;

    duplicateNotebook.mutate(
      {
        connectionId: activeConnectionId,
        notebookId: duplicateNotebookId,
        newName: duplicateNotebookName.trim(),
      },
      {
        onSuccess: (newNotebook) => {
          // Optionally open the duplicated notebook
          openSqlNotebook(newNotebook, activeConnectionId);
          setDuplicateNotebookOpen(false);
          setDuplicateNotebookId(null);
          setDuplicateNotebookName('');
        },
      },
    );
  }, [
    duplicateNotebookId,
    duplicateNotebookName,
    activeConnectionId,
    duplicateNotebook,
    notebookTabManager,
  ]);

  const handleExportAllNotebooksClick = useCallback(() => {
    if (notebooks.length === 0) {
      return;
    }
    setExportDialogOpen(true);
  }, [notebooks.length]);

  const isDuckLakeActiveConnection = activeConnectionId.startsWith('ducklake-');

  const handleExportAllNotebooksConfirm = useCallback(
    async (includeConnection: boolean) => {
      setExportDialogOpen(false);

      let connectionDetails: ConnectionInput | undefined;
      if (
        includeConnection &&
        activeConnection &&
        !isDuckLakeActiveConnection
      ) {
        connectionDetails = await resolveConnectionCredentials(
          activeConnection.connection as ConnectionInput,
          secureStorage,
        );
      }
      if (notebookTabManager.activeTabId) {
        await flushNotebookPendingSave(notebookTabManager.activeTabId);
      }

      // Fetch fresh from disk instead of the notebooks list cache, which is
      // never invalidated when cells are added/edited (only on
      // create/rename/delete), and can be stale by the time of export.
      const freshNotebooks =
        await notebooksService.listNotebooks(activeConnectionId);

      const exportData = {
        exportDate: new Date().toISOString(),
        connectionId: activeConnectionId,
        connectionName: activeConnection?.connection.name,
        connection: connectionDetails,
        notebooks: freshNotebooks.map((notebook) => ({
          id: notebook.id,
          name: notebook.name,
          description: notebook.description,
          cells: notebook.cells.map((cell) => ({
            id: cell.id,
            type: cell.type,
            content: cell.content,
            order: cell.order,
            // Exclude output data to keep file size small
            output: cell.output
              ? {
                  type: cell.output.type,
                  columns: cell.output.columns,
                  rowCount: cell.output.rowCount,
                  totalRows: cell.output.totalRows,
                  executionTime: cell.output.executionTime,
                  // Explicitly exclude data array
                }
              : undefined,
          })),
          createdAt: notebook.createdAt,
          updatedAt: notebook.updatedAt,
        })),
      };

      // Download as JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `notebooks-${activeConnection?.connection.name || 'export'}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [
      activeConnectionId,
      activeConnection,
      isDuckLakeActiveConnection,
      secureStorage,
    ],
  );

  // Show loading state while hydrating
  if (!isFullyHydrated) {
    return (
      <AppLayout
        data-testid="notebooks-screen"
        panelTitle="Notebooks"
        sidebarContent={<Box />}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
          }}
        >
          <CircularProgress />
        </Box>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      data-testid="notebooks-screen"
      panelTitle="Notebooks"
      sidebarContent={
        <NotebooksSidebar
          // Connection selector
          connections={connections}
          duckLakeInstances={duckLakeInstances}
          projects={projects as any}
          selectedProjectId={selectedProject?.id}
          activeConnectionId={activeConnectionId}
          onConnectionSelect={handleConnectionSelect}
          // SQL connection info (for schema/tree)
          connectionName={activeConnection?.connection.name || 'Database'}
          connectionType={
            (activeConnectionId.startsWith('ducklake-')
              ? 'ducklake'
              : activeConnection?.connection.type) as SupportedConnectionTypes
          }
          schema={activeSchema}
          isLoadingSchema={isLoadingSchema}
          // SQL notebooks
          notebooks={notebooks}
          isLoadingNotebooks={isLoadingNotebooks}
          archivedNotebooks={archivedNotebooks}
          showArchived={showArchived}
          onRefresh={handleRefreshSchema}
          onCreateNotebook={() => setCreateNotebookOpen(true)}
          onOpenNotebook={handleOpenNotebook}
          onRenameNotebook={handleRenameNotebook}
          onDuplicateNotebook={handleDuplicateNotebook}
          onDeleteNotebook={handleDeleteNotebook}
          onRestoreNotebook={handleRestoreNotebook}
          onDeleteArchivedNotebook={(
            connectionKey,
            notebookId,
            notebookName,
          ) => {
            setNotebookToDelete({
              connectionKey,
              notebookId,
              notebookName,
            });
            setDeleteConfirmOpen(true);
          }}
          onToggleArchived={setShowArchived}
          getConnectionName={getConnectionName}
          onExportAllNotebooks={handleExportAllNotebooksClick}
          onImportAllNotebooks={handleImportAllNotebooks}
          onTabChange={setActiveSidebarTab}
          // Analytics
          connectionId={activeConnectionId}
          activeAnalyticsPageId={activeAnalyticsPageId}
          onOpenAnalyticsPage={handleOpenAnalyticsPage}
          onDeleteAnalyticsPage={(id) => {
            if (id === activeAnalyticsPageId) setActiveAnalyticsPageId(null);
          }}
          // Jupyter / Python
          pythonNotebooks={pythonNotebooks}
          isLoadingPythonNotebooks={isLoadingPythonNotebooks}
          onCreatePythonNotebook={() => setCreatePythonNotebookOpen(true)}
          onOpenPythonNotebook={handleOpenPythonNotebook}
          onRenamePythonNotebook={handleRenamePythonNotebook}
          onDuplicatePythonNotebook={handleDuplicatePythonNotebook}
          onDeletePythonNotebook={handleDeletePythonNotebook}
          onRefreshPythonNotebooks={handleRefreshPythonNotebooks}
          onExportPythonNotebook={handleExportActivePythonNotebook}
          onImportPythonNotebook={handleImportPythonNotebook}
          canExportPythonNotebook={Boolean(activeJupyterTabId)}
          // Primary sub-screen control (lifted up so main pane can react)
          activePrimaryTab={activePrimaryTab}
          onPrimaryTabChange={setActivePrimaryTab}
        />
      }
    >
      <SplitPane
        split="vertical"
        sizes={isChatOpen && !isNarrow ? verticalSizes : ['100%', 0]}
        onChange={(newSizes) => {
          if (isChatOpen && !isNarrow) {
            const chatWidth = newSizes[1] as number;
            setVerticalSizes([
              'auto',
              chatWidth < CHAT_MIN_WIDTH ? CHAT_MIN_WIDTH : chatWidth,
            ]);
          }
        }}
        sashRender={VerticalSash}
      >
        <Pane minSize={200}>
          <Box
            sx={{
              height: '100%',
              width: '100%',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {(() => {
              // ── Jupyter sub-screen ─────────────────────────────────────────
              if (activePrimaryTab === 1) {
                return (
                  <>
                    <NotebookTabManager
                      tabs={jupyterTabs}
                      activeTabId={activeJupyterTabId}
                      onSelect={notebookTabManager.switchTab}
                      onClose={handleCloseNotebookTab}
                      onReorder={notebookTabManager.reorderTabs}
                    />
                    <Box
                      sx={{
                        flex: 1,
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        maxWidth: isSidebarOpen
                          ? 'calc(100vw - 366px)'
                          : 'calc(100vw - 56px)',
                      }}
                    >
                      {activeJupyterTabId ? (
                        <PythonNotebookEditor
                          key={`python-notebook-${activeJupyterTabId}`}
                          notebookId={activeJupyterTabId}
                          onDeleted={notebookTabManager.closeTab}
                          onImported={openPythonNotebookAndSwitch}
                        />
                      ) : (
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: 'text.secondary',
                            p: 2,
                          }}
                        >
                          <Code sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
                          <Typography
                            variant="h6"
                            color="text.secondary"
                            sx={{ mb: 1, textAlign: 'center' }}
                          >
                            No Notebook Open
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mb: 2, textAlign: 'center' }}
                          >
                            Select a notebook from the sidebar or create a new
                            one
                          </Typography>
                          <Button
                            variant="contained"
                            startIcon={<Add />}
                            onClick={() => setCreatePythonNotebookOpen(true)}
                          >
                            New Python Notebook
                          </Button>
                        </Box>
                      )}
                    </Box>
                  </>
                );
              }

              // ── SQL sub-screen ─────────────────────────────────────────────
              if (!activeConnectionId) {
                return (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      color: 'text.secondary',
                      p: 2,
                    }}
                  >
                    <TableChart sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
                    <Typography
                      variant="h6"
                      color="text.secondary"
                      sx={{
                        mb: 1,
                        textAlign: 'center',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                      }}
                    >
                      No Connection Selected
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        mb: 2,
                        textAlign: 'center',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        whiteSpace: 'normal',
                      }}
                    >
                      Select a connection from the sidebar to start working with
                      notebooks
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 1 }}
                    >
                      or
                    </Typography>
                    <Button
                      variant="outlined"
                      startIcon={<Upload />}
                      onClick={handleImportAllNotebooks}
                    >
                      Import Notebook (JSON)
                    </Button>
                  </Box>
                );
              }

              if (activeSidebarTab === 2) {
                return (
                  <Box
                    sx={{
                      flex: 1,
                      minHeight: 0,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {activeAnalyticsPageId ? (
                      <AnalyticsEditor
                        connectionId={activeConnectionId}
                        pageId={activeAnalyticsPageId}
                        onSchemaChange={handleRefreshSchema}
                      />
                    ) : (
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '100%',
                          gap: 2,
                          color: 'text.secondary',
                        }}
                      >
                        <InsertChart sx={{ fontSize: 64, opacity: 0.2 }} />
                        <Typography variant="h6" color="text.secondary">
                          Select an analytics page from the sidebar
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          or click + to create a new dashboard page
                        </Typography>
                      </Box>
                    )}
                  </Box>
                );
              }

              return (
                <>
                  {/* SQL Notebook Tabs */}
                  <NotebookTabManager
                    tabs={sqlTabs}
                    activeTabId={activeSqlTabId}
                    onSelect={notebookTabManager.switchTab}
                    onClose={handleCloseNotebookTab}
                    onReorder={notebookTabManager.reorderTabs}
                  />

                  {/* Notebook Content */}
                  <Box
                    sx={{
                      flex: 1,
                      minHeight: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      maxWidth: isSidebarOpen
                        ? 'calc(100vw - 366px)'
                        : 'calc(100vw - 56px)',
                    }}
                  >
                    {/* SQL content — dispatch on the SQL-scoped active tab */}
                    {/* eslint-disable-next-line no-nested-ternary */}
                    {activeSqlTabId && activeConnectionId ? (
                      <NotebookEditor
                        key={`notebook-${activeSqlTabId}`}
                        instanceId={activeConnectionId}
                        notebookId={activeSqlTabId}
                        onOpenNotebook={(notebook, connectionId) => {
                          openSqlNotebook(notebook, connectionId);
                        }}
                        onSchemaChange={handleRefreshSchema}
                      />
                    ) : (
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '100%',
                          color: 'text.secondary',
                          p: 2,
                        }}
                      >
                        <TableChart
                          sx={{ fontSize: 64, opacity: 0.3, mb: 2 }}
                        />
                        <Typography
                          variant="h6"
                          color="text.secondary"
                          sx={{
                            mb: 1,
                            textAlign: 'center',
                            wordWrap: 'break-word',
                            overflowWrap: 'break-word',
                          }}
                        >
                          No Notebook Open
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            mb: 2,
                            textAlign: 'center',
                            wordWrap: 'break-word',
                            overflowWrap: 'break-word',
                            whiteSpace: 'normal',
                          }}
                        >
                          Select a notebook from the sidebar to start editing
                        </Typography>
                        <Button
                          variant="contained"
                          startIcon={<Add />}
                          onClick={() => setCreateNotebookOpen(true)}
                        >
                          Create New Notebook
                        </Button>
                      </Box>
                    )}
                  </Box>
                </>
              );
            })()}
          </Box>
        </Pane>
        <Pane minSize={CHAT_MIN_WIDTH}>
          <Box
            id="notebooks-ai-chat-panel"
            sx={{
              height: '100%',
              borderLeft: '1px solid',
              borderColor: 'divider',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {isChatOpen && !isNarrow && !isPythonNotebookActive && (
              <ChatWindow
                key={`${activeSidebarTab === 2 ? 'analytics' : 'notebooks'}-${activeConnectionId}-${activeSidebarTab === 2 ? (activeAnalyticsPageId ?? 'none') : (notebookTabManager.activeTabId ?? 'none')}`}
                screenKey={activeSidebarTab === 2 ? 'analytics' : 'notebooks'}
                connectionId={activeConnectionId ?? undefined}
                notebookId={
                  activeSidebarTab === 2
                    ? undefined
                    : (notebookTabManager.activeTabId ?? undefined)
                }
                pageId={
                  activeSidebarTab === 2
                    ? (activeAnalyticsPageId ?? undefined)
                    : undefined
                }
                projectId={
                  selectedProject?.id ? Number(selectedProject.id) : null
                }
                onClose={() => setIsChatOpen?.(false)}
              />
            )}
          </Box>
        </Pane>
      </SplitPane>

      {/* Mobile AI Chat Drawer */}
      {isNarrow && (
        <Dialog
          fullScreen
          open={!!isChatOpen && !isPythonNotebookActive}
          onClose={() => setIsChatOpen?.(false)}
        >
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <ChatWindow
              key={`${activeSidebarTab === 2 ? 'analytics' : 'notebooks'}-mobile-${activeConnectionId}-${activeSidebarTab === 2 ? (activeAnalyticsPageId ?? 'none') : (notebookTabManager.activeTabId ?? 'none')}`}
              screenKey={activeSidebarTab === 2 ? 'analytics' : 'notebooks'}
              connectionId={activeConnectionId ?? undefined}
              notebookId={
                activeSidebarTab === 2
                  ? undefined
                  : (notebookTabManager.activeTabId ?? undefined)
              }
              pageId={
                activeSidebarTab === 2
                  ? (activeAnalyticsPageId ?? undefined)
                  : undefined
              }
              projectId={
                selectedProject?.id ? Number(selectedProject.id) : null
              }
              onClose={() => setIsChatOpen?.(false)}
            />
          </Box>
        </Dialog>
      )}

      {/* Delete Notebook Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="error" />
            Delete Archived Notebook
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to permanently delete the notebook &quot;
            {notebookToDelete?.notebookName}&quot;? This action cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteArchivedNotebook}
            color="error"
            variant="contained"
            disabled={deleteArchivedNotebook.isLoading}
          >
            {deleteArchivedNotebook.isLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Active Notebook Confirmation Dialog */}
      <Dialog
        open={deleteNotebookConfirmOpen}
        onClose={() => setDeleteNotebookConfirmOpen(false)}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="error" />
            Delete Notebook
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to permanently delete the notebook &quot;
            {activeNotebookToDelete?.notebookName}&quot;? This action cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteNotebookConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={confirmDeleteNotebook}
            color="error"
            variant="contained"
            disabled={deleteNotebook.isLoading}
          >
            {deleteNotebook.isLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Notebook Dialog */}
      <Dialog
        open={createNotebookOpen}
        onClose={() => {
          setCreateNotebookOpen(false);
          setNewNotebookName('');
          setNewNotebookDescription('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Notebook</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              autoFocus
              label="Notebook Name"
              fullWidth
              value={newNotebookName}
              onChange={(e) => setNewNotebookName(e.target.value)}
              placeholder="My Notebook"
              required
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newNotebookName.trim()) {
                  e.preventDefault();
                  handleCreateNotebook();
                }
              }}
            />
            <TextField
              label="Description (optional)"
              fullWidth
              value={newNotebookDescription}
              onChange={(e) => setNewNotebookDescription(e.target.value)}
              placeholder="Describe what this notebook is for..."
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setCreateNotebookOpen(false);
              setNewNotebookName('');
              setNewNotebookDescription('');
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateNotebook}
            variant="contained"
            disabled={!newNotebookName.trim() || createNotebook.isLoading}
          >
            {createNotebook.isLoading ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={createPythonNotebookOpen}
        onClose={() => setCreatePythonNotebookOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create Python Notebook</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Notebook Name"
            value={newNotebookName}
            onChange={(event) => setNewNotebookName(event.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreatePythonNotebookOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!newNotebookName.trim() || createPythonNotebook.isLoading}
            onClick={handleCreatePythonNotebook}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Python Rename Dialog */}
      <Dialog
        open={pythonRenameOpen}
        onClose={() => setPythonRenameOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rename Python Notebook</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Notebook Name"
            value={pythonRenameName}
            onChange={(e) => setPythonRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && pythonRenameName.trim()) {
                e.preventDefault();
                confirmRenamePythonNotebook();
              }
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPythonRenameOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={
              !pythonRenameName.trim() || renamePythonNotebook.isLoading
            }
            onClick={confirmRenamePythonNotebook}
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Python Duplicate Dialog */}
      <Dialog
        open={pythonDuplicateOpen}
        onClose={() => setPythonDuplicateOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Duplicate Python Notebook</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="New Notebook Name"
            value={pythonDuplicateName}
            onChange={(e) => setPythonDuplicateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && pythonDuplicateName.trim()) {
                e.preventDefault();
                confirmDuplicatePythonNotebook();
              }
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPythonDuplicateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={
              !pythonDuplicateName.trim() || duplicatePythonNotebook.isLoading
            }
            onClick={confirmDuplicatePythonNotebook}
          >
            Duplicate
          </Button>
        </DialogActions>
      </Dialog>

      {/* Python Delete Dialog */}
      <Dialog
        open={pythonDeleteOpen}
        onClose={() => setPythonDeleteOpen(false)}
      >
        <DialogTitle>Delete Python Notebook?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete &ldquo;{pythonDeleteName}&rdquo;? Its kernel will be stopped
            and the document permanently removed. Saved cells cannot be
            recovered.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPythonDeleteOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={deletePythonNotebook.isLoading}
            onClick={confirmDeletePythonNotebook}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(pythonTabToClose)}
        onClose={() => setPythonTabToClose(null)}
      >
        <DialogTitle>Close running Python notebook?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Closing {pythonTabToClose?.notebookName} stops its kernel and loses
            all in-memory Python variables. Saved cells are preserved.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPythonTabToClose(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={async () => {
              if (!pythonTabToClose) return;
              await closePythonTab(pythonTabToClose.notebookId);
              setPythonTabToClose(null);
            }}
          >
            Stop Kernel and Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete All Archived Notebooks Confirmation Dialog */}
      <Dialog
        open={deleteAllConfirmOpen}
        onClose={() => setDeleteAllConfirmOpen(false)}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="error" />
            Delete All Archived Notebooks
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {connectionKeyToDeleteAll
              ? `Are you sure you want to permanently delete all archived notebooks for "${getConnectionName(connectionKeyToDeleteAll)}"?`
              : 'Are you sure you want to permanently delete ALL archived notebooks?'}{' '}
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteAllConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteAllArchived}
            color="error"
            variant="contained"
            disabled={deleteAllArchived.isLoading}
          >
            {deleteAllArchived.isLoading ? 'Deleting...' : 'Delete All'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Notebook Dialog */}
      <Dialog
        open={renameNotebookOpen}
        onClose={() => {
          setRenameNotebookOpen(false);
          setRenameNotebookId(null);
          setRenameNotebookName('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rename Notebook</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              autoFocus
              label="Notebook Name"
              fullWidth
              value={renameNotebookName}
              onChange={(e) => setRenameNotebookName(e.target.value)}
              placeholder="Enter new name"
              required
              onKeyPress={(e) => {
                if (e.key === 'Enter' && renameNotebookName.trim()) {
                  confirmRenameNotebook();
                }
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setRenameNotebookOpen(false);
              setRenameNotebookId(null);
              setRenameNotebookName('');
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmRenameNotebook}
            variant="contained"
            disabled={!renameNotebookName.trim() || renameNotebook.isLoading}
          >
            {renameNotebook.isLoading ? 'Renaming...' : 'Rename'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Duplicate Notebook Dialog */}
      <Dialog
        open={duplicateNotebookOpen}
        onClose={() => {
          setDuplicateNotebookOpen(false);
          setDuplicateNotebookId(null);
          setDuplicateNotebookName('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Duplicate Notebook</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              autoFocus
              label="New Notebook Name"
              fullWidth
              value={duplicateNotebookName}
              onChange={(e) => setDuplicateNotebookName(e.target.value)}
              placeholder="Enter name for duplicate"
              required
              onKeyPress={(e) => {
                if (e.key === 'Enter' && duplicateNotebookName.trim()) {
                  confirmDuplicateNotebook();
                }
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDuplicateNotebookOpen(false);
              setDuplicateNotebookId(null);
              setDuplicateNotebookName('');
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmDuplicateNotebook}
            variant="contained"
            disabled={
              !duplicateNotebookName.trim() || duplicateNotebook.isLoading
            }
          >
            {duplicateNotebook.isLoading ? 'Duplicating...' : 'Duplicate'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Export All Notebooks Dialog */}
      <ExportNotebookDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onConfirm={handleExportAllNotebooksConfirm}
        subject={`${notebooks.length} notebook${notebooks.length > 1 ? 's' : ''}`}
        connectionName={activeConnection?.connection.name}
        connectionExportDisabled={
          isDuckLakeActiveConnection || !activeConnection
        }
      />

      {/* Import Connection Dialog */}
      <ImportConnectionDialog
        open={importConnectionDialogOpen}
        connectionName={pendingImport?.preview.connectionName}
        connectionType={pendingImport?.preview.connection?.type}
        notebookCount={pendingImport?.preview.notebookCount ?? 1}
        hasActiveConnection={!!activeConnectionId}
        onClose={() => {
          setImportConnectionDialogOpen(false);
          setPendingImport(null);
        }}
        onConfirm={handleImportConnectionConfirm}
      />
    </AppLayout>
  );
};

export default Notebooks;
