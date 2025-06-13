import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import type * as monacoType from 'monaco-editor';
import { Inputs, RelativeContainer } from './styles';
import { connectorsServices, projectsServices } from '../../services';
import { QueryHistoryType } from '../../../types/frontend';
import { ConnectionInput, Project } from '../../../types/backend';
import { SqlEditorComponent } from './editorComponent';
import { QueryHistory } from './queryHistory';

type Props = {
  completions: Omit<monacoType.languages.CompletionItem, 'range'>[];
  connectionInput?: ConnectionInput;
  selectedProject: Project;
  queryHistory: QueryHistoryType[];
  setQueryHistory: (v: QueryHistoryType[]) => void;
  setLoadingQuery: (v: boolean) => void;
  setQueryResults: (v: any) => void;
  setQueryError: (error: string | null) => void;
  onError: (error: any) => void;
  onSuccess: (message: string) => void;
};

export interface SqlEditorRef {
  runQuery: () => void;
}

// Helper function to detect query type and generate appropriate success message
const getSuccessMessage = (query: string, result: any) => {
  const trimmedQuery = query.trim().toLowerCase();

  if (trimmedQuery.startsWith('insert')) {
    // Try different ways to get affected rows
    const affectedRows = result?.rowCount || result?.affectedRows || result?.changes || result?.numAffectedRows || 0;

    // If we still don't have a count, check if we have data and infer from that
    if (affectedRows === 0 && result?.data) {
      // For some databases, the result might contain metadata about the operation
      if (Array.isArray(result.data) && result.data.length > 0) {
        // Check if the first row contains metadata about affected rows
        const firstRow = result.data[0];
        if (typeof firstRow === 'object' && firstRow !== null) {
          const metadataCount = firstRow['rows_affected'] || firstRow['inserted'] || firstRow['count'] || firstRow['affected_rows'];
          if (typeof metadataCount === 'number') {
            return `INSERT successful: ${metadataCount} row(s) inserted`;
          }
        }
      }
    }

    return affectedRows > 0
      ? `INSERT successful: ${affectedRows} row(s) inserted`
      : 'INSERT operation completed successfully';
  }

  if (trimmedQuery.startsWith('update')) {
    const affectedRows = result?.rowCount || result?.affectedRows || result?.changes || result?.numAffectedRows || 0;

    if (affectedRows === 0 && result?.data) {
      if (Array.isArray(result.data) && result.data.length > 0) {
        const firstRow = result.data[0];
        if (typeof firstRow === 'object' && firstRow !== null) {
          const metadataCount = firstRow['rows_affected'] || firstRow['updated'] || firstRow['count'] || firstRow['affected_rows'];
          if (typeof metadataCount === 'number') {
            return `UPDATE successful: ${metadataCount} row(s) updated`;
          }
        }
      }
    }

    return affectedRows > 0
      ? `UPDATE successful: ${affectedRows} row(s) updated`
      : 'UPDATE operation completed successfully';
  }

  if (trimmedQuery.startsWith('delete')) {
    const affectedRows = result?.rowCount || result?.affectedRows || result?.changes || result?.numAffectedRows || 0;

    if (affectedRows === 0 && result?.data) {
      if (Array.isArray(result.data) && result.data.length > 0) {
        const firstRow = result.data[0];
        if (typeof firstRow === 'object' && firstRow !== null) {
          const metadataCount = firstRow['rows_affected'] || firstRow['deleted'] || firstRow['count'] || firstRow['affected_rows'];
          if (typeof metadataCount === 'number') {
            return `DELETE successful: ${metadataCount} row(s) deleted`;
          }
        }
      }
    }

    return affectedRows > 0
      ? `DELETE successful: ${affectedRows} row(s) deleted`
      : 'DELETE operation completed successfully';
  }

  if (trimmedQuery.startsWith('create')) {
    if (trimmedQuery.includes('table')) {
      return 'Table created successfully';
    } else if (trimmedQuery.includes('database') || trimmedQuery.includes('schema')) {
      return 'Database/Schema created successfully';
    } else {
      return 'CREATE operation completed successfully';
    }
  }

  if (trimmedQuery.startsWith('drop')) {
    if (trimmedQuery.includes('table')) {
      return 'Table dropped successfully';
    } else if (trimmedQuery.includes('database') || trimmedQuery.includes('schema')) {
      return 'Database/Schema dropped successfully';
    } else {
      return 'DROP operation completed successfully';
    }
  }

  if (trimmedQuery.startsWith('alter')) {
    return 'ALTER operation completed successfully';
  }

  if (trimmedQuery.startsWith('truncate')) {
    return 'Table truncated successfully';
  }

  // For SELECT queries, show row count
  if (trimmedQuery.startsWith('select')) {
    const rowCount = result?.data?.length || 0;
    return `Query executed successfully: ${rowCount} row(s) returned`;
  }

  // Default success message for other operations
  return 'Query executed successfully';
};

export const SqlEditor = forwardRef<SqlEditorRef, Props>(({
  completions,
  connectionInput,
  selectedProject,
  queryHistory,
  setQueryHistory,
  setLoadingQuery,
  setQueryResults,
  setQueryError,
  onError,
  onSuccess,
}, ref) => {
  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(
    null,
  );

  const handleRunQuery = async (selectedQuery?: string) => {
    if (!connectionInput || !selectedProject) return;

    // If no query provided, get the entire editor content
    let queryToRun = selectedQuery;
    if (!queryToRun && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        queryToRun = model.getValue().trim();
      }
    }

    if (!queryToRun) {
      setQueryError('No query to execute');
      return;
    }

    setLoadingQuery(true);
    // Clear previous results and errors when starting a new query
    setQueryResults(null);
    setQueryError(null);

    const result = await connectorsServices.queryData({
      connection: connectionInput,
      query: queryToRun,
    });

    if (result.error) {
      setQueryError(result.error);
      setLoadingQuery(false);
      // Keep results cleared on error - don't restore previous results
      return;
    }

    // Show success message with toast
    const successMessage = getSuccessMessage(queryToRun, result);
    onSuccess(successMessage);

    setQueryResults(result);

    const newHistoryItem: QueryHistoryType = {
      id: new Date().toISOString(),
      executedAt: new Date(),
      results: result,
      projectId: selectedProject.id,
      projectName: selectedProject.name,
      query: queryToRun,
    };

    setQueryHistory([...queryHistory, newHistoryItem]);
    setLoadingQuery(false);
  };

  // Expose the runQuery function through the ref
  useImperativeHandle(ref, () => ({
    runQuery: () => handleRunQuery(),
  }));

  const query = React.useMemo(() => {
    return selectedProject?.queryEditor ?? '';
  }, [selectedProject?.queryEditor]);

  const handleQueryChange = (content: string) => {
    if (!selectedProject) return;

    projectsServices.updateProject({
      ...selectedProject,
      queryEditor: content,
    });
  };

  // Handle when a query from history is selected
  const handleHistorySelect = (historyItem: QueryHistoryType) => {
    // First update the project query in the database
    handleQueryChange(historyItem.query);

    // Then directly update the Monaco editor content if available
    if (editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        // Replace the entire editor content with the selected query
        editorRef.current.executeEdits('history-selection', [
          {
            range: model.getFullModelRange(),
            text: historyItem.query,
            forceMoveMarkers: true
          }
        ]);

        // Focus the editor
        editorRef.current.focus();

        // Position cursor at the end of the content
        const lastLine = model.getLineCount();
        const lastColumn = model.getLineMaxColumn(lastLine);
        editorRef.current.setPosition({ lineNumber: lastLine, column: lastColumn });

        console.log('Updated editor content from history selection');
      }
    }
  };

  // Don't render if selectedProject is not available
  if (!selectedProject) {
    return null;
  }

  return (
    <Inputs>
      <RelativeContainer>
        <SqlEditorComponent
          content={query}
          setContent={handleQueryChange}
          completions={completions}
          editorRef={editorRef}
        />
        {queryHistory.length > 0 && (
          <QueryHistory
            onQuerySelect={handleHistorySelect}
            queryHistory={queryHistory}
            projectId={selectedProject.id}
          />
        )}
      </RelativeContainer>
    </Inputs>
  );
});
