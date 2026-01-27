import React, { useRef } from 'react';
import { toast } from 'react-toastify';
import type * as monacoType from 'monaco-editor';
import { Inputs, RelativeContainer } from './styles';
import { connectorsServices, projectsServices } from '../../services';
import { QueryHistoryType } from '../../../types/frontend';
import { ConnectionInput, Project } from '../../../types/backend';
import { SqlEditorComponent } from './editorComponent';
import { QueryHistory } from './queryHistory';
import { useAppContext } from '../../hooks';

type Props = {
  completions: Omit<monacoType.languages.CompletionItem, 'range'>[];
  connectionInput?: ConnectionInput;
  // Project-based mode (legacy)
  selectedProject?: Project;
  // Connection-based mode (new)
  connectionId?: string;
  initialQuery?: string;
  onQueryChange?: (query: string) => void;
  // Common props
  queryHistory: QueryHistoryType[];
  setQueryHistory: (v: QueryHistoryType[]) => void;
  setLoadingQuery: (v: boolean) => void;
  setQueryResults: (v: any) => void;
  setError: (v: any) => void;
  onQueryStart?: (queryId: string) => void;
};

export const SqlEditor: React.FC<Props> = ({
  completions,
  connectionInput,
  selectedProject,
  connectionId,
  initialQuery,
  onQueryChange,
  queryHistory,
  setQueryHistory,
  setLoadingQuery,
  setQueryResults,
  setError,
  onQueryStart,
}) => {
  const { fetchSchema } = useAppContext();
  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(
    null,
  );

  // Determine if we're in connection-based mode
  const isConnectionMode = !!connectionId;

  // Helper function to detect DDL operations that modify schema
  const isDDLOperation = (query: string): boolean => {
    const normalizedQuery = query.trim().toUpperCase();
    const ddlKeywords = [
      'CREATE TABLE',
      'DROP TABLE',
      'ALTER TABLE',
      'CREATE SCHEMA',
      'DROP SCHEMA',
      'CREATE VIEW',
      'DROP VIEW',
      'RENAME TABLE',
      'TRUNCATE TABLE',
    ];
    return ddlKeywords.some((keyword) => normalizedQuery.includes(keyword));
  };

  const getCommandType = (query: string): string => {
    const normalized = query.trim().toUpperCase();
    // Helper uses strict keyword check, but we can also check DML
    if (isDDLOperation(query)) return 'DDL';
    if (
      normalized.startsWith('INSERT') ||
      normalized.startsWith('UPDATE') ||
      normalized.startsWith('DELETE') ||
      normalized.startsWith('MERGE') ||
      normalized.startsWith('TRUNCATE')
    ) {
      return 'DML';
    }
    return 'SELECT';
  };

  const handleRunQuery = async (selectedQuery: string) => {
    // Validate we have a connection
    if (isConnectionMode) {
      if (!connectionId) {
        toast.error('No database connection selected');
        return;
      }
    } else if (!connectionInput || !selectedProject) {
      toast.error('No database connection configured for this project');
      return;
    }

    // Generate semi-unique ID for query cancellation
    const queryId = `query-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    setError(undefined);
    setLoadingQuery(true);

    if (onQueryStart) {
      onQueryStart(queryId);
    }

    try {
      let result;

      if (isConnectionMode && connectionId) {
        // Connection-based execution
        result = await connectorsServices.executeQueryForConnection({
          connectionId,
          query: selectedQuery,
          queryId,
        });
      } else if (connectionInput && selectedProject) {
        // Legacy project-based execution
        result = await connectorsServices.queryData({
          connection: connectionInput,
          query: selectedQuery,
          projectName: selectedProject.name,
          queryId,
        });
      } else {
        toast.error('Invalid query configuration');
        setLoadingQuery(false);
        return;
      }

      if (result.error) {
        setError(result.error);
        setLoadingQuery(false);
        return;
      }

      // Check if this was a DDL operation
      const wasDDL = isDDLOperation(selectedQuery);
      const commandType = getCommandType(selectedQuery);

      const enrichedResult = {
        ...result,
        isCommand: commandType === 'DDL' || commandType === 'DML',
        commandType,
      };

      setQueryResults(enrichedResult);

      // Truncate results for history storage to prevent quota issues
      // LocalStorage has a limit, so we can't store thousands of rows per query history item
      const historyResults = {
        ...result,
        data: result.data?.slice(0, 10), // Only store first 10 rows in history
      };

      const newHistoryItem: QueryHistoryType = {
        id: new Date().toISOString(),
        executedAt: new Date(),
        results: historyResults,
        query: selectedQuery,
        // Project-based fields (optional)
        projectId: selectedProject?.id,
        projectName: selectedProject?.name,
        // Connection-based fields (new)
        connectionId: isConnectionMode ? connectionId : undefined,
        connectionName: isConnectionMode ? connectionInput?.name : undefined,
      };

      // Limit history to last 50 items to prevent storage overflow
      // We append new item then slice the end of the array
      const updatedHistory = [...queryHistory, newHistoryItem];
      if (updatedHistory.length > 50) {
        setQueryHistory(updatedHistory.slice(updatedHistory.length - 50));
      } else {
        setQueryHistory(updatedHistory);
      }

      // Refresh schema if DDL operation was executed
      // Only for project-based mode (connection-based mode handles this differently)
      if (wasDDL && !isConnectionMode) {
        fetchSchema();
      }
    } catch (error) {
      toast.error('An unexpected error occurred while executing the query');
      setError(error);
    } finally {
      setLoadingQuery(false);
    }
  };

  const [queryContent, setQueryContent] = React.useState(initialQuery || '');
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load query based on mode
  React.useEffect(() => {
    if (isConnectionMode) {
      // Connection-based mode: use initialQuery prop
      setQueryContent(initialQuery || '');
    } else if (selectedProject?.id) {
      // Project-based mode: load from backend
      const loadQuery = async () => {
        try {
          const query = await projectsServices.getQuery(selectedProject);
          setQueryContent(query);
        } catch (error) {
          setQueryContent('');
        }
      };
      loadQuery();
    }
  }, [isConnectionMode, initialQuery, selectedProject?.id, selectedProject]);

  React.useEffect(() => {
    return () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
      }
    };
  }, []);

  // Handle query content changes with debouncing
  const handleQueryContentChange = React.useCallback(
    (content: string) => {
      // Update local state immediately for UI responsiveness
      setQueryContent(content);

      // Debounce the save operation
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
      }

      saveDebounceRef.current = setTimeout(() => {
        if (isConnectionMode) {
          // Connection-based mode: notify parent and save to backend
          if (onQueryChange) {
            onQueryChange(content);
          }
          if (connectionId) {
            connectorsServices
              .updateConnectionQuery(connectionId, content)
              .catch(() => {
                // Silently fail - query is still in local state
              });
          }
        } else if (selectedProject?.id) {
          // Project-based mode: save to backend
          projectsServices
            .updateProjectQuery({
              projectId: selectedProject.id,
              query: content,
            })
            .catch(() => {
              toast.error('Failed to save query');
            });
        }
      }, 500);
    },
    [isConnectionMode, connectionId, onQueryChange, selectedProject?.id],
  );

  // Get filter ID for query history based on mode
  const historyFilterId = isConnectionMode ? connectionId : selectedProject?.id;

  return (
    <Inputs>
      <RelativeContainer>
        <SqlEditorComponent
          content={queryContent}
          setContent={handleQueryContentChange}
          completions={completions}
          editorRef={editorRef}
          onRunSelected={(lineQuery) => handleRunQuery(lineQuery)}
        />
        {queryHistory.length > 0 && historyFilterId && (
          <QueryHistory
            onQuerySelect={(qh) => handleQueryContentChange(qh.query)}
            queryHistory={queryHistory}
            projectId={isConnectionMode ? undefined : selectedProject?.id}
            connectionId={isConnectionMode ? connectionId : undefined}
          />
        )}
      </RelativeContainer>
    </Inputs>
  );
};
