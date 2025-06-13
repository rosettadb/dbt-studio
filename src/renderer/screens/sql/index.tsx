import React, { useEffect, useState, useRef } from 'react';
import SplitPane from 'split-pane-react';
import { Box, useTheme, Button } from '@mui/material';
import { PlayArrow } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useGetSelectedProject } from '../../controllers';
import {
  useAppContext,
  useConnectionInput,
  useLocalStorage,
} from '../../hooks';
import { CompletionItem, QueryHistoryType } from '../../../types/frontend';
import { AppLayout } from '../../layouts';
import { utils } from '../../helpers';
import { SchemaViewContainer, SchemaViewGrid } from './styles';
import {
  ErrorMessage,
  Loader,
  SchemaTreeViewer,
} from '../../components';
import { SqlEditor, SqlEditorRef } from '../../components/sqlEditor';
import { QueryResult } from './queryResult';
import { ConnectionInput, Project } from '../../../types/backend';

const QUERY_HISTORY_KEY = 'query_history_key';

const Sql = () => {
  const theme = useTheme();
  const { schema } = useAppContext();
  const { data: selectedProject } = useGetSelectedProject();
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [queryResults, setQueryResults] = useState(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryHistory, setQueryHistory] = useLocalStorage<QueryHistoryType[]>(
    QUERY_HISTORY_KEY,
    JSON.stringify([]),
  );
  const [completions, setCompletions] = useState<
    Omit<CompletionItem, 'range'>[]
  >([]);

  // 40/60 split sizes - 40% for editor, 60% for results
  const [sizes, setSizes] = useState<[number, number]>([
    window.innerHeight * 0.4,
    window.innerHeight * 0.6,
  ]);

  // Ref to access the SqlEditor's run function
  const sqlEditorRef = useRef<SqlEditorRef | null>(null);

  const connectionInput = useConnectionInput(selectedProject);

  useEffect(() => {
    if (schema) {
      setCompletions(utils.generateMonacoCompletions(schema));
    }
  }, [schema]);

  // Handle success messages with toast (keeping only for success)
  const handleSuccess = (message: string) => {
    toast.success(message);
  };

  // Handle error messages by setting error state (no toast)
  const handleError = (error: any) => {
    const errorMessage = typeof error === 'string' ? error : error?.message || 'An error occurred';
    setQueryError(errorMessage);
  };

  const handleRunClick = () => {
    if (sqlEditorRef.current) {
      sqlEditorRef.current.runQuery();
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
        {!selectedProject ? (
          <Box sx={{ padding: 2, textAlign: 'center' }}>
            <Loader />
          </Box>
        ) : (
          <SplitPane
            split="horizontal"
            sizes={sizes}
            onChange={(newSizes) => setSizes(newSizes as [number, number])}
            sashRender={renderSash}
          >
            {/* Top 40% - Monaco Editor */}
            <SqlEditor
              ref={sqlEditorRef}
              completions={completions}
              connectionInput={connectionInput as ConnectionInput}
              selectedProject={selectedProject}
              queryHistory={queryHistory}
              setQueryHistory={setQueryHistory}
              setLoadingQuery={setLoadingQuery}
              setQueryResults={setQueryResults}
              setQueryError={setQueryError}
              onError={handleError}
              onSuccess={handleSuccess}
            />

            {/* Bottom 60% - Run Button and Results */}
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: theme.palette.background.paper,
              }}
            >
              {/* Run Button Area */}
              <Box
                sx={{
                  padding: 1,
                  borderBottom: `1px solid ${theme.palette.divider}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<PlayArrow />}
                  onClick={handleRunClick}
                  disabled={loadingQuery || !connectionInput}
                  sx={{ minWidth: 120 }}
                >
                  {loadingQuery ? 'Running...' : 'Run Query'}
                </Button>
              </Box>

              {/* Results Area */}
              <Box
                sx={{
                  flex: 1,
                  padding: 1,
                  overflowY: 'auto',
                }}
              >
                {loadingQuery && <Loader />}
                {!loadingQuery && queryError && (
                  <ErrorMessage title="Query Error" description={queryError} />
                )}
                {!loadingQuery && !queryError && queryResults && (
                  <QueryResult results={queryResults} />
                )}
                {!loadingQuery && !queryError && !queryResults && (
                  <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: theme.palette.text.secondary
                  }}>
                    Click "Run Query" to execute your SQL and see results here
                  </Box>
                )}
              </Box>
            </Box>
          </SplitPane>
        )}
      </Box>
    </AppLayout>
  );
};

export default Sql;
