import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useContext,
} from 'react';
import SplitPane from 'split-pane-react';
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
} from '@mui/material';
import {
  Stop,
  TableChart,
  Refresh,
  Add,
  FilterList,
  Link as LinkIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { connectorsServices } from '../../services';
import { DuckLakeService } from '../../services/duckLake.service';
import { useLocalStorage } from '../../hooks';
import { QueryHistoryType } from '../../../types/frontend';
import { AppLayout } from '../../layouts';
import { utils } from '../../helpers';
import { SchemaViewContainer, SchemaViewGrid } from './styles';
import { ErrorMessage, SqlEditor } from '../../components';
import { QueryResult } from './queryResult';
import { ConnectionInput, Table } from '../../../types/backend';
import { getConnectionInput } from '../../helpers/utils';
import { SqlTabManager } from '../../components/sqlTabs';
import useSqlTabManager from '../../hooks/useSqlTabManager';
import { useGetConnectionById, useGetConnections } from '../../controllers';
import { useDuckLakeInstances } from '../../controllers/duckLake.controller';
import { SchemaTreeViewerWithSchema } from './SchemaTreeViewerWithSchema';
import connectionIcons, {
  defaultIcon,
} from '../../../../assets/connectionIcons';
import { AppContext } from '../../context/AppProvider';
import {
  generateDuckLakeCompletions,
  mergeCompletions,
} from '../../utils/duckLakeCompletions';

const QUERY_HISTORY_KEY = 'query_history_key';

const Sql = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { selectedProject } = useContext(AppContext);
  const tabManager = useSqlTabManager();
  const { data: connections = [] } = useGetConnections();
  const { data: duckLakeInstances = [] } = useDuckLakeInstances();
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

  // Check if active connection is DuckLake
  const isDuckLakeConnection =
    activeTab?.connectionId?.startsWith('ducklake-') || false;

  // Get active connection
  const { data: activeConnection, isLoading: isLoadingConnection } =
    useGetConnectionById(activeTab?.connectionId);

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
  const [tabQueryIds, setTabQueryIds] = useState<Record<string, string>>({});

  // Get connection input for active tab
  const connectionInput = useMemo(() => {
    // Handle DuckLake instances
    if (activeTab?.connectionId?.startsWith('ducklake-')) {
      const instanceId = activeTab.connectionId.replace('ducklake-', '');
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
      return undefined;
    }

    // Handle regular database connections
    if (!activeConnection || activeConnection.id !== activeTab?.connectionId) {
      return undefined;
    }
    return getConnectionInput(activeConnection);
  }, [activeConnection, activeTab, duckLakeInstances]);

  // Get schema for active tab
  const activeSchema = activeTab ? tabSchemas[activeTab.connectionId] : [];
  const isLoadingSchema = activeTab
    ? loadingSchemas[activeTab.connectionId]
    : false;

  // Store DuckLake completions and schema
  const [duckLakeCompletions, setDuckLakeCompletions] = useState<any[]>([]);
  const [duckLakeSchema, setDuckLakeSchema] = useState<any>(null);

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

  // Load DuckLake completions when connection changes
  useEffect(() => {
    const loadDuckLakeCompletions = async () => {
      if (!connectionInput || (connectionInput as any).type !== 'ducklake') {
        setDuckLakeCompletions([]);
        return;
      }

      try {
        const { instanceId } = connectionInput as any;

        if (!instanceId) {
          return;
        }

        const schema = await DuckLakeService.extractSchema(instanceId);
        const duckLakeItems = generateDuckLakeCompletions(schema);

        setDuckLakeCompletions(duckLakeItems);
        setDuckLakeSchema(schema);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
          '[SQL Screen] Failed to load DuckLake completions:',
          error,
        );
        setDuckLakeCompletions([]);
        setDuckLakeSchema(null);
      }
    };

    loadDuckLakeCompletions();
  }, [connectionInput]);

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

  // Fetch schema when active tab changes
  useEffect(() => {
    if (
      activeTab &&
      !tabSchemas[activeTab.connectionId] &&
      !loadingSchemas[activeTab.connectionId]
    ) {
      fetchSchemaForConnection(activeTab.connectionId);
    }
  }, [activeTab, tabSchemas, loadingSchemas, fetchSchemaForConnection]);

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

  // Handle query results
  const handleQueryResults = useCallback(
    (results: any) => {
      if (activeTabId) {
        updateTabResults(activeTabId, results);
      }
    },
    [activeTabId, updateTabResults],
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

  // Handle query error
  const handleSetError = useCallback(
    (error: any) => {
      if (activeTabId) {
        setTabError(activeTabId, error);
      }
    },
    [activeTabId, setTabError],
  );

  const handleCancelQuery = async () => {
    const activeQueryId = activeTabId ? tabQueryIds[activeTabId] : null;
    if (activeQueryId) {
      try {
        await connectorsServices.cancelQuery(activeQueryId);
        toast.info('Query execution cancelled');
      } catch (e) {
        toast.error('Failed to cancel query');
      } finally {
        if (activeTabId) {
          setTabQueryIds((prev) => {
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
    if (activeTab) {
      // Clear cached schema and refetch
      setTabSchemas((prev) => {
        const updated = { ...prev };
        delete updated[activeTab.connectionId];
        return updated;
      });
      fetchSchemaForConnection(activeTab.connectionId);
    }
  }, [activeTab, fetchSchemaForConnection]);

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
      sidebarContent={
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
          }}
        >
          {/* Connection Selection & Actions */}
          <Box
            sx={{
              p: '8px',
              display: 'flex',
              gap: '4px',
              alignItems: 'center',
              bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
              borderBottom: `1px solid ${theme.palette.divider}`,
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
                    if (!instance) return 'Select Connection';

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
              onClick={handleRefreshSchema}
              disabled={!activeTab}
              sx={{
                width: 28,
                height: 28,
                bgcolor: 'transparent',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' },
              }}
            >
              <Refresh sx={{ fontSize: 18 }} />
            </IconButton>
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

          {/* Search Field */}
          <Box
            sx={{
              p: '8px',
              bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
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
                    <FilterList sx={{ fontSize: 16, color: 'text.disabled' }} />
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
          </Box>

          <Box
            sx={{
              flex: 1,
              overflow: 'hidden',
              bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
            }}
          >
            <SchemaViewContainer
              style={{
                width: '100%',
                background: 'transparent',
              }}
            >
              <SchemaViewGrid>
                {activeTab && connectionInput && isDuckLakeConnection && (
                  <SchemaTreeViewerWithSchema
                    databaseName={connectionInput.name || 'DuckLake Instance'}
                    type="ducklake"
                    schema={duckLakeTables}
                    isLoading={!duckLakeSchema}
                    onRefresh={handleRefreshSchema}
                    filter={filter}
                  />
                )}
                {activeTab && connectionInput && !isDuckLakeConnection && (
                  <SchemaTreeViewerWithSchema
                    databaseName={String(
                      (connectionInput as any)?.database ??
                        activeConnection?.connection.name ??
                        'Database',
                    )}
                    type={connectionInput.type}
                    schema={activeSchema || []}
                    isLoading={isLoadingSchema}
                    onRefresh={handleRefreshSchema}
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
                    <TableChart sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Select a connection to view schema
                    </Typography>
                  </Box>
                )}
              </SchemaViewGrid>
            </SchemaViewContainer>
          </Box>
        </Box>
      }
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
              <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
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
            (hasResults || hasError || isLoading ? (
              <SplitPane
                split="horizontal"
                sizes={sizes}
                onChange={(newSizes) => setSizes(newSizes as [number, number])}
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
                        setTabQueryIds((prev) => ({
                          ...prev,
                          [activeTabId]: id,
                        }));
                      }
                    }}
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
                      setTabQueryIds((prev) => ({
                        ...prev,
                        [activeTabId]: id,
                      }));
                    }
                  }}
                  isLoading={isLoadingConnection}
                />
              </Box>
            ))}
        </Box>
      </Box>
    </AppLayout>
  );
};

export default Sql;
