import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
} from '@mui/material';
import {
  Stop,
  TableChart,
  Refresh,
  Add,
  FilterList,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { connectorsServices } from '../../services';
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
import { SchemaTreeViewerWithSchema } from './SchemaTreeViewerWithSchema';
import connectionIcons, {
  defaultIcon,
} from '../../../../assets/connectionIcons';

const QUERY_HISTORY_KEY = 'query_history_key';

const Sql = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const tabManager = useSqlTabManager();
  const { data: connections = [] } = useGetConnections();
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
    window.innerHeight - 410,
    410,
  ]);
  const [tabQueryIds, setTabQueryIds] = useState<Record<string, string>>({});

  // Get connection input for active tab
  const connectionInput = useMemo(() => {
    if (!activeConnection || activeConnection.id !== activeTab?.connectionId) {
      return undefined;
    }
    return getConnectionInput(activeConnection);
  }, [activeConnection, activeTab]);

  // Get schema for active tab
  const activeSchema = activeTab ? tabSchemas[activeTab.connectionId] : [];
  const isLoadingSchema = activeTab
    ? loadingSchemas[activeTab.connectionId]
    : false;

  // Generate completions from schema
  const completions = useMemo(() => {
    return activeSchema ? utils.generateMonacoCompletions(activeSchema) : [];
  }, [activeSchema]);

  // Fetch schema for a connection
  const fetchSchemaForConnection = useCallback(
    async (connectionId: string) => {
      if (loadingSchemas[connectionId]) return;

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
                  const conn = connections.find((c) => c.id === selected);
                  if (!conn) return 'Select Connection';
                  const icon =
                    connectionIcons.images[conn.connection.type] || defaultIcon;
                  return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                        }}
                      >
                        {conn.connection.name}
                      </span>
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
                {connections.map((conn) => (
                  <MenuItem
                    key={conn.id}
                    value={conn.id}
                    sx={{
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <img
                      src={
                        connectionIcons.images[conn.connection.type] ||
                        defaultIcon
                      }
                      alt=""
                      style={{ width: 14, height: 14, objectFit: 'contain' }}
                    />
                    {conn.connection.name}
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
                {activeTab && connectionInput ? (
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
                    <QueryResult results={activeTab.results} />
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
