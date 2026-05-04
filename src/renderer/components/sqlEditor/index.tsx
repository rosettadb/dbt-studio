import React, { useRef } from 'react';
import { toast } from 'react-toastify';
import type * as monacoType from 'monaco-editor';
import { Inputs, RelativeContainer } from './styles';
import { connectorsServices, projectsServices } from '../../services';
import { DuckLakeService } from '../../services/duckLake.service';
import { QueryHistoryType } from '../../../types/frontend';
import { ConnectionInput, Project } from '../../../types/backend';
import { SqlEditorComponent } from './editorComponent';
import { QueryHistory } from './queryHistory';
import { useAppContext } from '../../hooks';
import { useSqlEditorBridge } from '../../controllers';

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
  onQuerySuccess?: () => void;
  isLoading?: boolean;
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
  onQuerySuccess,
  isLoading,
}) => {
  const { fetchSchema } = useAppContext();
  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(
    null,
  );

  // Determine if we're in connection-based mode
  const isConnectionMode = !!connectionId;

  // Detect if this is a DuckLake connection
  const isDuckLakeConnection =
    connectionInput?.type === 'ducklake' &&
    'instanceId' in connectionInput &&
    !!connectionInput.instanceId;

  // Get instanceId for DuckLake queries
  const instanceId = isDuckLakeConnection
    ? (connectionInput as any).instanceId
    : undefined;

  // Helper function to detect DDL operations that modify schema
  // Uses startsWith to prevent false positives from string literals like SELECT 'DROP TABLE users'
  const isDDLOperation = (query: string): boolean => {
    const normalizedQuery = query.trim().toUpperCase();
    const ddlKeywords = ['CREATE', 'DROP', 'ALTER', 'TRUNCATE', 'RENAME'];
    return ddlKeywords.some((keyword) => normalizedQuery.startsWith(keyword));
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
        toast.error('No connection selected');
        return;
      }
      // For DuckLake connections, check if status indicates not ready
      const duckLakeStatus = (connectionInput as any)?.status;
      if (
        isDuckLakeConnection &&
        (duckLakeStatus === 'connecting' || duckLakeStatus === 'loading')
      ) {
        toast.info('Connection is loading, please wait...');
        return;
      }
      if (isLoading && !isDuckLakeConnection) {
        toast.error('Connection is still loading...');
        return;
      }
    } else if (!connectionInput || !selectedProject) {
      toast.error('No connection or project selected');
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

      if (isDuckLakeConnection && instanceId) {
        const duckLakeQueryLimit = 10;
        const commandType = getCommandType(selectedQuery);

        const duckLakeResult = await DuckLakeService.executeQuery({
          instanceId,
          query: selectedQuery,
          queryId,
          limit: commandType === 'SELECT' ? duckLakeQueryLimit : undefined,
        });

        // Transform DuckLakeQueryResult to QueryResponseType format
        // Map fields to ensure type is number (QueryResponseType expects number)
        const mappedFields = duckLakeResult.fields?.map((field) => ({
          name: field.name,
          type: typeof field.type === 'number' ? field.type : 0, // Convert string types to 0 (unknown)
        }));

        result = {
          success: duckLakeResult.success,
          data: duckLakeResult.data,
          fields: mappedFields,
          rowCount: duckLakeResult.rowCount,
          error: duckLakeResult.error,
        };
      } else if (isConnectionMode && connectionId) {
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
        originalSql: selectedQuery,
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
        // DuckLake-specific fields
        isDuckLake: isDuckLakeConnection,
        instanceId: isDuckLakeConnection ? instanceId : undefined,
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
      if (wasDDL) {
        if (!isConnectionMode) {
          fetchSchema();
        } else if (onQuerySuccess) {
          onQuerySuccess();
        }
      }
    } catch (error) {
      toast.error('An unexpected error occurred while executing the query');
      setError(error);
    } finally {
      setLoadingQuery(false);
    }
  };

  const [queryContent, setQueryContent] = React.useState(initialQuery || '');
  const queryContentRef = useRef(queryContent);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNotifiedQueryRef = useRef(initialQuery || '');

  React.useEffect(() => {
    queryContentRef.current = queryContent;
  }, [queryContent]);

  const getEditorContent = React.useCallback(
    () => editorRef.current?.getValue() ?? queryContentRef.current,
    [],
  );

  const setEditorContent = React.useCallback(
    (content: string) => {
      setQueryContent(content);
      lastNotifiedQueryRef.current = content;
      if (onQueryChange) {
        onQueryChange(content);
      }
      if (isConnectionMode && connectionId) {
        connectorsServices
          .updateConnectionQuery(connectionId, content)
          .catch(() => {});
      } else if (selectedProject?.id) {
        projectsServices
          .updateProjectQuery({
            projectId: selectedProject.id,
            query: content,
          })
          .catch(() => {});
      }
    },
    [isConnectionMode, connectionId, onQueryChange, selectedProject?.id],
  );

  const runEditorQuery = React.useCallback(
    (query?: string) => {
      const content =
        query || editorRef.current?.getValue() || queryContentRef.current;
      if (content?.trim()) {
        // eslint-disable-next-line no-console
        console.log('[SqlEditor] Agent run-query: executing content', {
          contentLength: content.length,
          providedByAgent: !!query,
        });
        handleRunQuery(content);
      }
    },
    [handleRunQuery],
  );

  useSqlEditorBridge({
    enabled: isConnectionMode && !!connectionId,
    getContent: getEditorContent,
    setContent: setEditorContent,
    setQueryResult: setQueryResults,
    runQuery: runEditorQuery,
  });

  // Load query based on mode
  React.useEffect(() => {
    if (isConnectionMode) {
      // Connection-based mode: initialQuery is already loaded via useState.
      // We only sync if the query changed externally (e.g. from AI Agent),
      // ignoring echoed updates from our own debounced onQueryChange.
      if (
        initialQuery !== undefined &&
        initialQuery !== queryContentRef.current &&
        initialQuery !== lastNotifiedQueryRef.current
      ) {
        setQueryContent(initialQuery);
        lastNotifiedQueryRef.current = initialQuery;
      }
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
  }, [isConnectionMode, selectedProject?.id, selectedProject, initialQuery]);

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
          lastNotifiedQueryRef.current = content;
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
          isLoading={isLoading}
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
