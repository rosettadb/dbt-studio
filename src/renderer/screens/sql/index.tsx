import React, { useEffect, useState } from 'react';
import SplitPane from 'split-pane-react';
import { Box, useTheme } from '@mui/material';
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
  SqlEditor,
} from '../../components';
import { QueryResult } from './queryResult';
import { ConnectionInput, Project } from '../../../types/backend';

const QUERY_HISTORY_KEY = 'query_history_key';

const Sql = () => {
  const theme = useTheme();
  const { schema } = useAppContext();
  const { data: selectedProject } = useGetSelectedProject();
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [queryResults, setQueryResults] = useState(null);
  const [error, setError] = useState<any>();
  const [queryHistory, setQueryHistory] = useLocalStorage<QueryHistoryType[]>(
    QUERY_HISTORY_KEY,
    JSON.stringify([]),
  );
  const [completions, setCompletions] = useState<
    Omit<CompletionItem, 'range'>[]
  >([]);
  const [sizes, setSizes] = useState<[number, number]>([
    window.innerHeight - 250,
    250,
  ]);

  const connectionInput = useConnectionInput(selectedProject);

  useEffect(() => {
    if (schema) {
      setCompletions(utils.generateMonacoCompletions(schema));
    }
  }, [schema]);

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
        {queryResults || error ? (
          <SplitPane
            split="horizontal"
            sizes={sizes}
            onChange={(newSizes) => setSizes(newSizes as [number, number])}
            sashRender={renderSash}
          >
            <SqlEditor
              completions={completions}
              connectionInput={connectionInput as ConnectionInput}
              selectedProject={selectedProject as Project}
              queryHistory={queryHistory}
              setQueryHistory={setQueryHistory}
              setLoadingQuery={setLoadingQuery}
              setQueryResults={setQueryResults}
              setError={setError}
            />

            <Box
              sx={{
                height: '100%',
                padding: 1,
                overflowY: 'auto',
                background: theme.palette.background.paper,
              }}
            >
              {loadingQuery && <Loader />}
              {!loadingQuery && error && (
                <ErrorMessage title="Query Failed" description={error} />
              )}
              {!loadingQuery && !error && queryResults && (
                <QueryResult results={queryResults} />
              )}
            </Box>
          </SplitPane>
        ) : (
          <SqlEditor
            completions={completions}
            connectionInput={connectionInput as ConnectionInput}
            selectedProject={selectedProject as Project}
            queryHistory={queryHistory}
            setQueryHistory={setQueryHistory}
            setLoadingQuery={setLoadingQuery}
            setQueryResults={setQueryResults}
            setError={setError}
          />
        )}
      </Box>
    </AppLayout>
  );
};

export default Sql;
