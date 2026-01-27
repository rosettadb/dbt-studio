import React, { useState, useCallback, useMemo, useEffect } from 'react';
import SplitPane from 'split-pane-react';
import {
  Box,
  Button,
  CircularProgress,
  useTheme,
  Typography,
} from '@mui/material';
import { Stop, TableChart } from '@mui/icons-material';
import { toast } from 'react-toastify';
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
import { SqlConnectionsSidebar } from '../../components/sqlConnectionsSidebar';
import useSqlTabManager from '../../hooks/useSqlTabManager';
import { useGetConnectionById } from '../../controllers';
import { SchemaTreeViewerWithSchema } from './SchemaTreeViewerWithSchema';

const QUERY_HISTORY_KEY = 'query_history_key';

const Sql = () => {
  const theme = useTheme();
  const tabManager = useSqlTabManager();
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
  const { data: activeConnection } = useGetConnectionById(
    activeTab?.connectionId,
  );

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
    window.innerHeight - 350,
    350,
  ]);
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null);

  // Get connection input for active tab
  const connectionInput = useMemo(() => {
    return activeConnection ? getConnectionInput(activeConnection) : undefined;
  }, [activeConnection]);

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
          console.error('Failed to fetch schema:', result.error);
          setTabSchemas((prev) => ({ ...prev, [connectionId]: [] }));
        } else {
          setTabSchemas((prev) => ({ ...prev, [connectionId]: result.tables }));
        }
      } catch (error: any) {
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
    if (activeQueryId) {
      try {
        await connectorsServices.cancelQuery(activeQueryId);
        toast.info('Query execution cancelled');
      } catch (e) {
        toast.error('Failed to cancel query');
      } finally {
        setActiveQueryId(null);
        if (activeTabId) {
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
      sidebarContent={
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Connections List */}
          <Box sx={{ flex: '0 0 auto', maxHeight: '40%', overflow: 'hidden' }}>
            <SqlConnectionsSidebar
              openTabs={tabs}
              activeTabId={activeTabId}
              onConnectionSelect={handleConnectionSelect}
            />
          </Box>

          {/* Divider */}
          <Box
            sx={{
              height: '1px',
              backgroundColor: theme.palette.divider,
              mx: 1,
            }}
          />

          {/* Schema Tree */}
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <SchemaViewContainer>
              <SchemaViewGrid>
                {activeTab && connectionInput ? (
                  <SchemaTreeViewerWithSchema
                    databaseName={String(connectionInput.database)}
                    type={connectionInput.type}
                    schema={activeSchema || []}
                    isLoading={isLoadingSchema}
                    onRefresh={handleRefreshSchema}
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

          {activeTab &&
            connectionInput &&
            (hasResults || hasError || isLoading ? (
              <SplitPane
                split="horizontal"
                sizes={sizes}
                onChange={(newSizes) => setSizes(newSizes as [number, number])}
                sashRender={renderSash}
              >
                <SqlEditor
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
                  onQueryStart={(id) => setActiveQueryId(id)}
                />

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
                        color="error"
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
              <SqlEditor
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
                onQueryStart={(id) => setActiveQueryId(id)}
              />
            ))}
        </Box>
      </Box>
    </AppLayout>
  );
};

export default Sql;
