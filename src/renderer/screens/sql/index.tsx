import React, { useState } from 'react';
import SplitPane from 'split-pane-react';
import { Box, Button, CircularProgress, useTheme } from '@mui/material';
import { Stop } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { connectorsServices } from '../../services';
import { useGetConnectionById, useGetSelectedProject } from '../../controllers';
import { useAppContext, useLocalStorage } from '../../hooks';
import { QueryHistoryType } from '../../../types/frontend';
import { AppLayout } from '../../layouts';
import { utils } from '../../helpers';
import { SchemaViewContainer, SchemaViewGrid } from './styles';
import {
  ErrorMessage,
  Loader,
  NoConnectionMessage,
  SchemaTreeViewer,
  SqlEditor,
} from '../../components';
import { QueryResult } from './queryResult';
import { ConnectionInput } from '../../../types/backend';
import { getConnectionInput } from '../../helpers/utils';

const QUERY_HISTORY_KEY = 'query_history_key';

const Sql = () => {
  const theme = useTheme();
  const { schema } = useAppContext();
  const { data: selectedProject } = useGetSelectedProject();
  const { data: connection } = useGetConnectionById(
    selectedProject?.connectionId,
  );
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [queryResults, setQueryResults] = useState(null);
  const [error, setError] = useState<any>();
  const [queryHistory, setQueryHistory] = useLocalStorage<QueryHistoryType[]>(
    QUERY_HISTORY_KEY,
    JSON.stringify([]),
  );
  const [sizes, setSizes] = useState<[number, number]>([
    window.innerHeight - 350,
    350,
  ]);
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null);

  const connectionInput = React.useMemo(() => {
    return connection ? getConnectionInput(connection) : undefined;
  }, [connection]);

  const completions = React.useMemo(() => {
    return schema ? utils.generateMonacoCompletions(schema) : [];
  }, [schema]);

  const handleCancelQuery = async () => {
    if (activeQueryId) {
      try {
        await connectorsServices.cancelQuery(activeQueryId);
        toast.info('Query execution cancelled');
      } catch (e) {
        toast.error('Failed to cancel query');
      } finally {
        setActiveQueryId(null);
        setLoadingQuery(false);
      }
    }
  };

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

  return (
    <AppLayout
      sidebarContent={
        <SchemaViewContainer>
          <SchemaViewGrid>
            <SchemaTreeViewer
              databaseName={String(connectionInput?.database)}
              type={connectionInput?.type ?? 'postgres'}
            />
          </SchemaViewGrid>
        </SchemaViewContainer>
      }
    >
      <Box sx={{ height: '100%' }}>
        {!selectedProject && (
          <Box sx={{ padding: 2, textAlign: 'center' }}>
            <Loader />
          </Box>
        )}
        {selectedProject && !connectionInput && (
          <NoConnectionMessage projectName={selectedProject.name} />
        )}
        {selectedProject && connectionInput && (
          <SplitPane
            split="horizontal"
            sizes={sizes}
            onChange={(newSizes) => setSizes(newSizes as [number, number])}
            sashRender={renderSash}
          >
            <Box sx={{ height: '100%' }} data-testid="sql-editor-split">
              <SqlEditor
                completions={completions}
                connectionInput={connectionInput as ConnectionInput}
                selectedProject={selectedProject}
                queryHistory={queryHistory}
                setQueryHistory={setQueryHistory}
                setLoadingQuery={setLoadingQuery}
                setQueryResults={setQueryResults}
                setError={setError}
                onQueryStart={(id) => setActiveQueryId(id)}
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
              {loadingQuery && (
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
              {!loadingQuery && error && (
                <ErrorMessage title="Query Failed" description={error} />
              )}
              {!loadingQuery && !error && queryResults && (
                <QueryResult results={queryResults} />
              )}
            </Box>
          </SplitPane>
        )}
        {selectedProject && connectionInput && !queryResults && !error && (
          <Box sx={{ height: '100%' }} data-testid="sql-editor-standalone">
            <SqlEditor
              completions={completions}
              connectionInput={connectionInput as ConnectionInput}
              selectedProject={selectedProject}
              queryHistory={queryHistory}
              setQueryHistory={setQueryHistory}
              setLoadingQuery={setLoadingQuery}
              setQueryResults={setQueryResults}
              setError={setError}
            />
          </Box>
        )}
      </Box>
    </AppLayout>
  );
};

export default Sql;
