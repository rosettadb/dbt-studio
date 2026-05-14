import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useContext,
  useRef,
} from 'react';
import SplitPane, { Pane } from 'split-pane-react';
import 'split-pane-react/esm/themes/default.css';
import {
  Box,
  Button,
  CircularProgress,
  useTheme,
  Typography,
  FormControl,
  Select,
  MenuItem,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  useMediaQuery,
  Dialog,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Stop,
  TableChart,
  Refresh,
  Add,
  FilterList,
  Link as LinkIcon,
  Code as CodeTabIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { connectorsServices, DuckLakeService } from '../../services';
import { QueryResultStore } from './queryResultStore';
import { registerQueryResultBridge } from '../../services/agentEditorBridge.service';
import type { QueryResultSnapshot } from '../../../types/backend';
import { useLocalStorage } from '../../hooks';
import { QueryHistoryType } from '../../../types/frontend';
import { AppLayout } from '../../layouts';
import { utils } from '../../helpers';
import { SchemaViewContainer, SchemaViewGrid } from './styles';
import { ErrorMessage, SqlEditor } from '../../components';
import { ChatWindow } from '../../components/chat';
import { QueryResult } from './queryResult';
import { ConnectionInput, Table } from '../../../types/backend';
import { getConnectionInput } from '../../helpers/utils';
import { SqlTabManager } from '../../components/sqlTabs';
import useSqlTabManager from '../../hooks/useSqlTabManager';
import {
  useGetConnectionById,
  useGetConnections,
  useDuckLakeInstances,
} from '../../controllers';
import { SchemaTreeViewerWithSchema } from './SchemaTreeViewerWithSchema';
import { SavedQueriesList } from '../../components/sqlEditor/SavedQueriesList';
import connectionIcons, {
  defaultIcon,
} from '../../../../assets/connectionIcons';
import { AppContext } from '../../context';
import {
  generateDuckLakeCompletions,
  mergeCompletions,
} from '../../utils/duckLakeCompletions';

const QUERY_HISTORY_KEY = 'query_history_key';
const EMPTY_ARRAY: Table[] = [];
const CHAT_MIN_WIDTH = 280;
const CHAT_DEFAULT_WIDTH = 360;

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

const Sql = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { selectedProject, isChatOpen, setIsChatOpen } = useContext(AppContext);
  const tabManager = useSqlTabManager();
  const { data: connections = [] } = useGetConnections();
  const {
    data: duckLakeInstances = [],
    isLoading: isLoadingDuckLakeInstances,
    refetch: refetchDuckLakeInstances,
  } = useDuckLakeInstances();
  const [sidebarTab, setSidebarTab] = useState(0);
  const [filter, setFilter] = useState('');
  const {
    tabs,
    activeTabId,
    activeTab,
    openConnectionTab,
    switchTab,
    closeTab,
    updateTabQuery,
    updateTabResults,
    setTabLoading,
    setTabError,
    reorderTabs,
  } = tabManager;

  // Extract only stable connection-identity fields from the active tab.
  // Using the whole `activeTab` object as a dependency would cause connectionInput
  // to be recalculated on every keystroke (query text) and every query run
  // (isLoading / results), which cascades into schema re-loading and sidebar spinner flashes.
  const activeConnectionId = activeTab?.connectionId;
  const activeConnectionName = activeTab?.connectionName;

  // Check if active connection is DuckLake
  const isDuckLakeConnection =
    activeConnectionId?.startsWith('ducklake-') || false;

  // Get active connection
  const { data: activeConnection, isLoading: isLoadingConnection } =
    useGetConnectionById(activeConnectionId);

  // Schema state for active tab
  const [tabSchemas, setTabSchemas] = useState<Record<string, Table[]>>({});
  const [loadingSchemas, setLoadingSchemas] = useState<Record<string, boolean>>(
    {},
  );

  const [queryHistory, setQueryHistory] = useLocalStorage<QueryHistoryType[]>(
    QUERY_HISTORY_KEY,
    JSON.stringify([]),
  );
  const [sizes, setSizes] = useState<[number, number]>([
    window.innerHeight - 440,
    440,
  ]);
  const [tabExecutions, setTabExecutions] = useState<
    Record<string, { id: string; sql: string }>
  >({});

  const CHAT_WIDTH_KEY = 'sql-chat-width';
  const [verticalSizes, setVerticalSizes] = useState<(number | string)[]>(
    () => {
      const saved = parseInt(localStorage.getItem(CHAT_WIDTH_KEY) ?? '', 10);
      const initialWidth = Number.isNaN(saved)
        ? CHAT_DEFAULT_WIDTH
        : Math.max(saved, CHAT_MIN_WIDTH);
      return ['auto', initialWidth];
    },
  );

  useEffect(() => {
    const chatWidth = verticalSizes[1];
    if (typeof chatWidth === 'number') {
      localStorage.setItem(CHAT_WIDTH_KEY, String(chatWidth));
    }
  }, [verticalSizes]);

  const isNarrow = useMediaQuery('(max-width: 900px)');

  // Get connection input for active tab.
  // Depends only on stable connection-identity primitives, NOT the whole activeTab object,
  // to avoid re-running every time the query text or loading/result state changes.
  const connectionInput = useMemo(() => {
    // Handle DuckLake instances
    if (activeConnectionId?.startsWith('ducklake-')) {
      const instanceId = activeConnectionId.replace('ducklake-', '');
      const instance = duckLakeInstances.find((inst) => inst.id === instanceId);
      if (instance) {
        return {
          type: 'ducklake',
          name: instance.name,
          instanceId: instance.id,
          catalogType: instance.catalog.type,
          dataPath: instance.dataPath,
          status: instance.status,
        } as any;
      }
      // Even if instance is not found yet (still loading), return a minimal connection object
      // with the instanceId from the tab to prevent "Connection is still loading" errors
      // when navigating back to SQL screen
      return {
        type: 'ducklake',
        name: activeConnectionName || 'DuckLake Instance',
        instanceId,
        status: 'loading',
      } as any;
    }

    // Handle regular database connections
    if (!activeConnection || activeConnection.id !== activeConnectionId) {
      return undefined;
    }
    return getConnectionInput(activeConnection);
  }, [
    activeConnection,
    activeConnectionId,
    activeConnectionName,
    duckLakeInstances,
    isLoadingDuckLakeInstances,
  ]);

  // Get schema for active tab — use stable id primitive, not whole tab object
  const activeSchema =
    (activeConnectionId ? tabSchemas[activeConnectionId] : undefined) ||
    EMPTY_ARRAY;
  const isLoadingSchema = activeConnectionId
    ? (loadingSchemas[activeConnectionId] ?? false)
    : false;
  const sqlAgentConnectionId = useMemo<string | undefined>(() => {
    // Return the raw string connection ID — agent tools handle both regular and
    // DuckLake ("ducklake-{instanceId}") formats. Previously this coerced to a
    // number which always returned undefined for string UUID IDs.
    return activeConnectionId ?? undefined;
  }, [activeConnectionId]);

  // Store DuckLake completions and schema
  const [duckLakeCompletions, setDuckLakeCompletions] = useState<any[]>([]);
  const [duckLakeSchema, setDuckLakeSchema] = useState<any>(null);
  const [duckLakeSchemaLoading, setDuckLakeSchemaLoading] =
    useState<boolean>(false);
  const [duckLakeSchemaError, setDuckLakeSchemaError] = useState<string | null>(
    null,
  );

  const duckLakeCompletionsRequestSeq = useRef(0);
  const activeDuckLakeInstanceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeConnectionId?.startsWith('ducklake-')) {
      activeDuckLakeInstanceIdRef.current = activeConnectionId.replace(
        'ducklake-',
        '',
      );
    } else {
      activeDuckLakeInstanceIdRef.current = null;
    }
  }, [activeConnectionId]);

  // DuckLake connection lifecycle management
  // Acquire connection when DuckLake connection becomes active, release on unmount or connection change
  useEffect(() => {
    if (!isDuckLakeConnection || !activeConnectionId) {
      return () => {
        /* empty */
      };
    }

    const instanceId = activeConnectionId.replace('ducklake-', '');
    let disposed = false;
    let acquired = false;

    DuckLakeService.acquireConnection(instanceId)
      .then(() => {
        acquired = true;
        if (disposed) {
          return DuckLakeService.releaseConnection(instanceId);
        }

        return undefined;
      })
      .catch(() => {
        /* empty */

        return undefined;
      });

    // Cleanup: release connection when component unmounts or connection changes
    return () => {
      disposed = true;
      if (acquired) {
        DuckLakeService.releaseConnection(instanceId).catch(() => {
          /* empty */
        });
      }
    };
  }, [isDuckLakeConnection, activeConnectionId]);

  // Convert DuckLake schema to Table[] format for SchemaTreeViewerWithSchema
  const duckLakeTables = useMemo(() => {
    if (!duckLakeSchema || !duckLakeSchema.schemas) return [];

    const tables: Table[] = [];
    duckLakeSchema.schemas.forEach((schema: any) => {
      if (schema.tables) {
        schema.tables.forEach((table: any) => {
          tables.push({
            name: table.name,
            type: table.type || 'TABLE',
            schema: schema.name || 'main',
            columns:
              table.columns?.map((col: any) => ({
                name: col.name,
                typeName: col.type || 'UNKNOWN', // Map 'type' to 'typeName'
                ordinalPosition: col.position || 0,
                primaryKeySequenceId: 0,
                columnDisplaySize: 0,
                scale: 0,
                precision: 0,
                columnProperties: [],
                autoincrement: false,
                primaryKey: false,
                foreignKeys: [],
              })) || [],
          });
        });
      }
    });

    return tables;
  }, [duckLakeSchema]);

  const duckLakeSchemaNames = useMemo(() => {
    if (!duckLakeSchema || !duckLakeSchema.schemas) return [];
    return duckLakeSchema.schemas.map((s: any) => s.name);
  }, [duckLakeSchema]);

  // Generate completions from schema
  const completions = useMemo(() => {
    const baseCompletions = activeSchema
      ? utils.generateMonacoCompletions(activeSchema)
      : [];

    // Merge with DuckLake completions if available
    if (duckLakeCompletions.length > 0) {
      return mergeCompletions(baseCompletions, duckLakeCompletions);
    }

    return baseCompletions;
  }, [activeSchema, duckLakeCompletions]);

  const loadDuckLakeCompletions = useCallback(async () => {
    const requestSeq = duckLakeCompletionsRequestSeq.current + 1;
    duckLakeCompletionsRequestSeq.current = requestSeq;

    if (!activeConnectionId || !activeConnectionId.startsWith('ducklake-')) {
      setDuckLakeCompletions([]);
      setDuckLakeSchema(null);
      setDuckLakeSchemaLoading(false);
      setDuckLakeSchemaError(null);
      return;
    }

    const instanceId = activeConnectionId.replace('ducklake-', '');
    const requestedInstanceId = instanceId;

    const isStale = () =>
      requestSeq !== duckLakeCompletionsRequestSeq.current ||
      activeDuckLakeInstanceIdRef.current !== requestedInstanceId;

    if (!instanceId) {
      setDuckLakeCompletions([]);
      setDuckLakeSchema(null);
      setDuckLakeSchemaLoading(false);
      setDuckLakeSchemaError('Missing DuckLake instance id');
      return;
    }

    setDuckLakeSchemaLoading(true);
    setDuckLakeSchemaError(null);
    try {
      const schema = await DuckLakeService.extractSchema(instanceId);
      if (isStale()) {
        return;
      }

      const duckLakeItems = generateDuckLakeCompletions(schema);
      if (isStale()) {
        return;
      }

      setDuckLakeCompletions(duckLakeItems);
      setDuckLakeSchema(schema);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[SQL Screen] Failed to load DuckLake completions:', error);

      if (!isStale()) {
        setDuckLakeCompletions([]);
        setDuckLakeSchema(null);
        setDuckLakeSchemaError('Failed to load DuckLake schema');
      }
    } finally {
      if (!isStale()) {
        setDuckLakeSchemaLoading(false);
      }
    }
  }, [activeConnectionId]);

  // Load DuckLake completions when connection changes
  useEffect(() => {
    loadDuckLakeCompletions();
  }, [loadDuckLakeCompletions]);

  // Fetch schema for a connection
  const fetchSchemaForConnection = useCallback(
    async (connectionId: string) => {
      if (loadingSchemas[connectionId]) return;

      // Skip regular schema loading for DuckLake connections
      // DuckLake schema is loaded via extractSchema in loadDuckLakeCompletions
      if (connectionId.startsWith('ducklake-')) {
        // Mark as loaded (empty schema) to prevent loading state
        setTabSchemas((prev) => ({ ...prev, [connectionId]: [] }));
        setLoadingSchemas((prev) => ({ ...prev, [connectionId]: false }));
        return;
      }

      setLoadingSchemas((prev) => ({ ...prev, [connectionId]: true }));
      try {
        const result =
          await connectorsServices.extractSchemaFromConnection(connectionId);
        if (result.error) {
          // eslint-disable-next-line no-console
          console.error('Failed to fetch schema:', result.error);
          setTabSchemas((prev) => ({ ...prev, [connectionId]: [] }));
        } else {
          setTabSchemas((prev) => ({ ...prev, [connectionId]: result.tables }));
        }
      } catch (error: any) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch schema:', error);
        setTabSchemas((prev) => ({ ...prev, [connectionId]: [] }));
      } finally {
        setLoadingSchemas((prev) => ({ ...prev, [connectionId]: false }));
      }
    },
    [loadingSchemas],
  );

  // Fetch schema when the active connection changes.
  // Uses activeConnectionId (stable primitive) instead of activeTab (whole object)
  // so this effect doesn't run on every keystroke or query result update.
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

  // Handle connection selection from sidebar
  const handleConnectionSelect = useCallback(
    async (connection: { id: string; name: string; type: string }) => {
      await openConnectionTab(connection);
    },
    [openConnectionTab],
  );

  // Handle query change
  const handleQueryChange = useCallback(
    (query: string) => {
      if (activeTabId) {
        updateTabQuery(activeTabId, query);
      }
    },
    [activeTabId, updateTabQuery],
  );

  // Handle query results — also captures a snapshot for the AI Agent
  const handleQueryResults = useCallback(
    (results: any) => {
      if (!activeTabId) return;
      updateTabResults(activeTabId, results);

      // Determine if this is a DDL/DML command (no field list, but successful)
      const isCommand =
        results?.isCommand ||
        ((!results?.fields || results.fields.length === 0) && results?.success);

      const snapshot: QueryResultSnapshot = isCommand
        ? {
            status: 'command',
            columns: [],
            rows: [],
            totalRowCount: results?.rowCount ?? 0,
            duration: results?.duration,
            commandType: results?.commandType,
            rowsAffected: results?.rowCount,
            tabId: activeTabId,
            sql:
              (results as any)?.originalSql ?? tabExecutions[activeTabId]?.sql,
          }
        : {
            status:
              results?.data && results.data.length > 0 ? 'success' : 'empty',
            columns: results?.fields?.map((f: any) => f.name) ?? [],
            rows: results?.data ?? [],
            totalRowCount: results?.rowCount ?? results?.data?.length ?? 0,
            duration: results?.duration,
            sql:
              (results as any)?.originalSql ?? tabExecutions[activeTabId]?.sql,
            tabId: activeTabId,
          };
      QueryResultStore.set(activeTabId, snapshot);
      // Push result to main process so studio_sql_get_agent_run_result can read it.
      // Include pushedAt so the main process can detect freshness vs. stale pushes.
      const pushedAt = Date.now();
      window.electron.ipcRenderer.invoke('agent:editor:query-run-result', {
        snapshot,
        pushedAt,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTabId, updateTabResults, tabExecutions],
  );

  // Handle query loading state
  const handleSetLoadingQuery = useCallback(
    (loading: boolean) => {
      if (activeTabId) {
        setTabLoading(activeTabId, loading);
      }
    },
    [activeTabId, setTabLoading],
  );

  // Handle query error — also captures an error snapshot for the AI Agent
  const handleSetError = useCallback(
    (error: any) => {
      if (!activeTabId) return;
      setTabError(activeTabId, error);

      const errorMessage =
        typeof error === 'string'
          ? error
          : (error?.message ?? String(error ?? 'Unknown error'));

      const errorSnapshot: QueryResultSnapshot = {
        status: 'error',
        columns: [],
        rows: [],
        totalRowCount: 0,
        error: errorMessage,
        tabId: activeTabId,
      };
      QueryResultStore.set(activeTabId, errorSnapshot);
      // Only push genuine errors to main — skip null/undefined clears that would
      // produce a false 'Unknown error' and race with the real execution result.
      if (error != null) {
        const pushedAt = Date.now();
        window.electron.ipcRenderer.invoke('agent:editor:query-run-result', {
          snapshot: errorSnapshot,
          pushedAt,
        });
      }
    },
    [activeTabId, setTabError],
  );

  // Register the renderer-side IPC bridge so the AI Agent can read results.
  // The actual ipcRenderer.on lives in the service (rule FE-03).
  useEffect(() => {
    const cleanup = registerQueryResultBridge();
    return cleanup;
  }, []);

  const handleCancelQuery = async () => {
    const execution = activeTabId ? tabExecutions[activeTabId] : null;
    if (execution) {
      try {
        await connectorsServices.cancelQuery(execution.id);
        toast.info('Query execution cancelled');
      } catch (e) {
        toast.error('Failed to cancel query');
      } finally {
        if (activeTabId) {
          setTabExecutions((prev) => {
            const updated = { ...prev };
            delete updated[activeTabId];
            return updated;
          });
          setTabLoading(activeTabId, false);
        }
      }
    }
  };

  const handleRefreshSchema = useCallback(() => {
    if (activeConnectionId) {
      // Clear cached schema and refetch
      setTabSchemas((prev) => {
        const updated = { ...prev };
        delete updated[activeConnectionId];
        return updated;
      });
      fetchSchemaForConnection(activeConnectionId);

      if (isDuckLakeConnection) {
        loadDuckLakeCompletions();
        refetchDuckLakeInstances();
      }
    }
  }, [
    activeConnectionId,
    isDuckLakeConnection,
    fetchSchemaForConnection,
    loadDuckLakeCompletions,
    refetchDuckLakeInstances,
  ]);

  const renderSash = () => (
    <Box
      sx={{
        height: '4px',
        backgroundColor: theme.palette.divider,
        cursor: 'row-resize',
        width: '100%',
      }}
    />
  );

  // Check if we have results or error to show
  const hasResults = activeTab?.results;
  const hasError = activeTab?.error;
  const isLoading = activeTab?.isLoading;

  return (
    <AppLayout
      data-testid="sql-editor-screen"
      panelTitle="SQL Editor"
      sidebarContent={
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
          }}
        >
          <Box
            sx={{
              height: 40,
              px: '8px',
              display: 'flex',
              gap: '4px',
              alignItems: 'center',
              bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
              borderBottom: `1px solid ${theme.palette.divider}`,
              boxSizing: 'border-box',
            }}
          >
            <FormControl fullWidth size="small">
              <Select
                data-testid="sql-connection-select"
                value={activeTab?.connectionId || ''}
                onChange={(e) => {
                  const conn = connections.find((c) => c.id === e.target.value);
                  if (conn) {
                    handleConnectionSelect({
                      id: conn.id,
                      name: conn.connection.name,
                      type: conn.connection.type,
                    });
                  }
                }}
                displayEmpty
                renderValue={(selected) => {
                  if (!selected) return 'Select Connection';

                  // Check if it's a DuckLake instance
                  if (selected.startsWith('ducklake-')) {
                    const instanceId = selected.replace('ducklake-', '');
                    const instance = duckLakeInstances.find(
                      (inst) => inst.id === instanceId,
                    );
                    if (!instance) {
                      return activeTab?.connectionName || 'Select Connection';
                    }

                    return (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          width: '100%',
                        }}
                      >
                        <img
                          src={connectionIcons.images.ducklake || defaultIcon}
                          alt=""
                          style={{
                            width: 14,
                            height: 14,
                            objectFit: 'contain',
                          }}
                        />
                        <span
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            flex: 1,
                          }}
                        >
                          {instance.name}
                        </span>
                      </Box>
                    );
                  }

                  // Handle regular database connections
                  const conn = connections.find((c) => c.id === selected);
                  if (!conn) return 'Select Connection';
                  const icon =
                    connectionIcons.images[conn.connection.type] || defaultIcon;
                  const isProjectConnection =
                    conn.id === selectedProject?.connectionId;
                  return (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        width: '100%',
                      }}
                    >
                      <img
                        src={icon}
                        alt=""
                        style={{ width: 14, height: 14, objectFit: 'contain' }}
                      />
                      <span
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          flex: 1,
                        }}
                      >
                        {conn.connection.name}
                      </span>
                      {isProjectConnection && (
                        <Tooltip title="Project Connection">
                          <LinkIcon
                            sx={{
                              ml: 'auto',
                              fontSize: 16,
                              color: 'primary.main',
                              mr: 2,
                              transform: 'rotate(-45deg)',
                            }}
                          />
                        </Tooltip>
                      )}
                    </Box>
                  );
                }}
                sx={{
                  height: 28,
                  bgcolor:
                    theme.palette.mode === 'dark' ? '#2d2d2d' : '#e0e0e0',
                  '& .MuiSelect-select': {
                    py: 0,
                    px: 1,
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                  },
                  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                }}
              >
                <MenuItem value="" disabled sx={{ fontSize: '0.8rem' }}>
                  Select Connection
                </MenuItem>
                {/* Database Connections */}
                {connections.length > 0 && (
                  <MenuItem disabled sx={{ fontSize: '0.75rem', opacity: 0.6 }}>
                    <strong>Database Connections</strong>
                  </MenuItem>
                )}
                {connections.map((conn) => {
                  const isProjectConnection =
                    conn.id === selectedProject?.connectionId;
                  return (
                    <MenuItem
                      key={conn.id}
                      value={conn.id}
                      sx={{
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        justifyContent: 'space-between',
                      }}
                    >
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <img
                          src={
                            connectionIcons.images[conn.connection.type] ||
                            defaultIcon
                          }
                          alt=""
                          style={{
                            width: 14,
                            height: 14,
                            objectFit: 'contain',
                          }}
                        />
                        {conn.connection.name}
                      </Box>
                      {isProjectConnection && (
                        <Tooltip title="Project Connection">
                          <LinkIcon
                            sx={{
                              fontSize: 16,
                              color: 'primary.main',
                              transform: 'rotate(-45deg)',
                            }}
                          />
                        </Tooltip>
                      )}
                    </MenuItem>
                  );
                })}
                {/* DuckLake Instances */}
                {duckLakeInstances.length > 0 && (
                  <MenuItem
                    disabled
                    sx={{ fontSize: '0.75rem', opacity: 0.6, mt: 1 }}
                  >
                    <strong>DuckLake Instances</strong>
                  </MenuItem>
                )}
                {duckLakeInstances.map((instance) => (
                  <MenuItem
                    key={`ducklake-${instance.id}`}
                    value={`ducklake-${instance.id}`}
                    onClick={() => {
                      handleConnectionSelect({
                        id: `ducklake-${instance.id}`,
                        name: instance.name,
                        type: 'ducklake',
                      });
                    }}
                    sx={{
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <img
                        src={connectionIcons.images.duckdb || defaultIcon}
                        alt=""
                        style={{
                          width: 14,
                          height: 14,
                          objectFit: 'contain',
                        }}
                      />
                      {instance.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <IconButton
              size="small"
              onClick={() => navigate('/app/add-connection')}
              sx={{
                width: 28,
                height: 28,
                bgcolor: 'transparent',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' },
              }}
            >
              <Add sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>

          <Box
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
            }}
          >
            <Tabs
              value={sidebarTab}
              onChange={(e: React.SyntheticEvent, newValue: number) =>
                setSidebarTab(newValue)
              }
              variant="fullWidth"
              sx={{ minHeight: 36 }}
            >
              <Tab
                icon={<TableChart sx={{ fontSize: 16 }} />}
                iconPosition="start"
                label="Data"
                sx={{
                  minHeight: 36,
                  textTransform: 'none',
                  py: 0,
                  fontSize: '0.8rem',
                }}
              />
              <Tab
                icon={<CodeTabIcon sx={{ fontSize: 16 }} />}
                iconPosition="start"
                label="Queries"
                sx={{
                  minHeight: 36,
                  textTransform: 'none',
                  py: 0,
                  fontSize: '0.8rem',
                }}
              />
            </Tabs>
          </Box>

          {sidebarTab === 0 && (
            <>
              {/* Search Field */}
              <Box
                sx={{
                  p: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  bgcolor:
                    theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
                  borderBottom: `1px solid ${theme.palette.divider}`,
                }}
              >
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <FilterList
                          sx={{ fontSize: 16, color: 'text.disabled' }}
                        />
                      </InputAdornment>
                    ),
                    sx: {
                      height: 28,
                      fontSize: '0.8rem',
                      bgcolor: theme.palette.background.paper,
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: theme.palette.divider,
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: theme.palette.divider,
                      },
                      borderRadius: '4px',
                    },
                  }}
                />
                <Tooltip title="Refresh Schema">
                  <IconButton
                    size="small"
                    onClick={handleRefreshSchema}
                    disabled={!activeTab}
                    sx={{
                      width: 28,
                      height: 28,
                      p: 0.5,
                      bgcolor: 'transparent',
                      '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' },
                    }}
                  >
                    <Refresh sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Box>

              <Box
                sx={{
                  flex: 1,
                  overflow: 'hidden',
                  bgcolor:
                    theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
                }}
              >
                <SchemaViewContainer
                  style={{
                    width: '100%',
                    background: 'transparent',
                  }}
                >
                  <SchemaViewGrid>
                    {activeTab &&
                      connectionInput &&
                      isDuckLakeConnection &&
                      (!duckLakeSchemaLoading && duckLakeSchema === null ? (
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: 'text.secondary',
                            p: 2,
                            textAlign: 'center',
                          }}
                        >
                          <Typography variant="body2" color="text.secondary">
                            {duckLakeSchemaError || 'No Schema available'}
                          </Typography>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Refresh />}
                            onClick={handleRefreshSchema}
                            sx={{ mt: 2 }}
                          >
                            Retry
                          </Button>
                        </Box>
                      ) : (
                        <SchemaTreeViewerWithSchema
                          databaseName={
                            connectionInput.name || 'DuckLake Instance'
                          }
                          type="ducklake"
                          schema={duckLakeTables}
                          schemaNames={duckLakeSchemaNames}
                          isLoading={duckLakeSchemaLoading}
                          filter={filter}
                        />
                      ))}
                    {activeTab && connectionInput && !isDuckLakeConnection && (
                      <SchemaTreeViewerWithSchema
                        databaseName={String(
                          (connectionInput as any)?.database ??
                            activeConnection?.connection.name ??
                            'Database',
                        )}
                        type={connectionInput.type}
                        schema={activeSchema}
                        isLoading={isLoadingSchema}
                        filter={filter}
                      />
                    )}
                    {!activeTab && (
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '100%',
                          color: 'text.secondary',
                          p: 2,
                          textAlign: 'center',
                        }}
                      >
                        <TableChart
                          sx={{ fontSize: 48, opacity: 0.3, mb: 1 }}
                        />
                        <Typography variant="body2" color="text.secondary">
                          Select a connection to view schema
                        </Typography>
                      </Box>
                    )}
                  </SchemaViewGrid>
                </SchemaViewContainer>
              </Box>
            </>
          )}

          {sidebarTab === 1 && (
            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
              <SavedQueriesList
                connectionId={activeConnectionId}
                onOpenQuery={(query) => {
                  if (activeTabId) {
                    updateTabQuery(activeTabId, query);
                  }
                }}
              />
            </Box>
          )}
        </Box>
      }
    >
      <SplitPane
        split="vertical"
        sizes={isChatOpen && !isNarrow ? verticalSizes : ['100%', 0]}
        onChange={(newSizes) => {
          if (isChatOpen && !isNarrow) {
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
            {/* Tab Bar */}
            <SqlTabManager
              tabs={tabs}
              activeTabId={activeTabId}
              onSelect={switchTab}
              onClose={closeTab}
              onReorder={reorderTabs}
            />

            {/* Main Content */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              {!activeTab && (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'text.secondary',
                  }}
                >
                  <TableChart sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
                  <Typography
                    variant="h6"
                    color="text.secondary"
                    sx={{ mb: 1 }}
                  >
                    No Connection Selected
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Select a connection from the sidebar to start querying
                  </Typography>
                </Box>
              )}

              {activeTab && !connectionInput && (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'text.secondary',
                    gap: 1,
                  }}
                >
                  <CircularProgress size={28} />
                  <Typography variant="body2" color="text.secondary">
                    Loading connection...
                  </Typography>
                </Box>
              )}

              {activeTab &&
                connectionInput &&
                isDuckLakeConnection &&
                (connectionInput as any)?.status === 'loading' &&
                !isLoadingDuckLakeInstances && (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      color: 'text.secondary',
                      gap: 2,
                      p: 3,
                      textAlign: 'center',
                    }}
                  >
                    <Typography variant="h6" color="text.secondary">
                      Connection Not Found
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      The DuckLake instance &quot;{activeTab.connectionName}
                      &quot; could not be found. It may have been deleted or is
                      no longer available.
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => refetchDuckLakeInstances()}
                    >
                      Retry Loading
                    </Button>
                  </Box>
                )}

              {activeTab &&
                connectionInput &&
                (hasResults || hasError || isLoading ? (
                  <SplitPane
                    split="horizontal"
                    sizes={sizes}
                    onChange={(newSizes) =>
                      setSizes(newSizes as [number, number])
                    }
                    sashRender={renderSash}
                  >
                    <Box data-testid="sql-editor-pane" sx={{ height: '100%' }}>
                      <SqlEditor
                        key={activeTabId}
                        completions={completions}
                        connectionInput={connectionInput as ConnectionInput}
                        connectionId={activeTab.connectionId}
                        initialQuery={activeTab.query}
                        queryHistory={queryHistory}
                        setQueryHistory={setQueryHistory}
                        setLoadingQuery={handleSetLoadingQuery}
                        setQueryResults={handleQueryResults}
                        setError={handleSetError}
                        onQueryChange={handleQueryChange}
                        onQueryStart={(id) => {
                          if (activeTabId) {
                            setTabExecutions((prev) => ({
                              ...prev,
                              [activeTabId]: { id, sql: activeTab.query },
                            }));
                          }
                        }}
                        onQuerySuccess={handleRefreshSchema}
                        isLoading={isLoadingConnection}
                      />
                    </Box>

                    <Box
                      sx={{
                        height: '100%',
                        padding: 1,
                        overflowY: 'auto',
                        background: theme.palette.background.paper,
                      }}
                    >
                      {isLoading && (
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            gap: 2,
                          }}
                        >
                          <Button
                            variant="contained"
                            color="primary"
                            onClick={handleCancelQuery}
                            size="small"
                            startIcon={<Stop />}
                          >
                            Stop Query
                          </Button>
                          <CircularProgress size={50} />
                        </Box>
                      )}
                      {!isLoading && hasError && (
                        <ErrorMessage
                          title="Query Failed"
                          description={activeTab.error}
                        />
                      )}
                      {!isLoading && !hasError && hasResults && (
                        <QueryResult
                          results={activeTab.results}
                          exportContext={{
                            connectionType: connectionInput.type,
                            connectionId: activeTab.connectionId,
                            duckLakeInstanceId:
                              connectionInput.type === 'ducklake'
                                ? (connectionInput as any).instanceId
                                : undefined,
                            duckLakeReady:
                              connectionInput.type === 'ducklake'
                                ? (connectionInput as any).status !==
                                    'loading' &&
                                  (connectionInput as any).status !==
                                    'connecting'
                                : undefined,
                            originalSql:
                              (activeTab.results as any)?.originalSql ??
                              activeTab.query,
                          }}
                        />
                      )}
                    </Box>
                  </SplitPane>
                ) : (
                  <Box data-testid="sql-editor-pane" sx={{ height: '100%' }}>
                    <SqlEditor
                      key={activeTabId}
                      completions={completions}
                      connectionInput={connectionInput as ConnectionInput}
                      connectionId={activeTab.connectionId}
                      initialQuery={activeTab.query}
                      queryHistory={queryHistory}
                      setQueryHistory={setQueryHistory}
                      setLoadingQuery={handleSetLoadingQuery}
                      setQueryResults={handleQueryResults}
                      setError={handleSetError}
                      onQueryChange={handleQueryChange}
                      onQueryStart={(id) => {
                        if (activeTabId) {
                          setTabExecutions((prev) => ({
                            ...prev,
                            [activeTabId]: { id, sql: activeTab.query },
                          }));
                        }
                      }}
                      onQuerySuccess={handleRefreshSchema}
                      isLoading={isLoadingConnection}
                    />
                  </Box>
                ))}
            </Box>
          </Box>
        </Pane>
        <Pane minSize={CHAT_MIN_WIDTH}>
          <Box
            id="sql-ai-chat-panel"
            sx={{
              height: '100%',
              borderLeft: '1px solid',
              borderColor: 'divider',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {isChatOpen && !isNarrow && (
              <ChatWindow
                screenKey="sql"
                connectionId={sqlAgentConnectionId}
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
          open={!!isChatOpen}
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
              screenKey="sql"
              connectionId={sqlAgentConnectionId}
              projectId={
                selectedProject?.id ? Number(selectedProject.id) : null
              }
              onClose={() => setIsChatOpen?.(false)}
            />
          </Box>
        </Dialog>
      )}
    </AppLayout>
  );
};

export default Sql;
