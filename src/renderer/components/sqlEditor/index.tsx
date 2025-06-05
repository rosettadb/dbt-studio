import React, { useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
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
  setError: (v: any) => void;
};

export const SqlEditor: React.FC<Props> = ({
  completions,
  connectionInput,
  selectedProject,
  queryHistory,
  setQueryHistory,
  setLoadingQuery,
  setQueryResults,
  setError,
}) => {
  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(
    null,
  );

  const handleRunQuery = async (selectedQuery: string) => {
    if (!connectionInput || !selectedProject) return;

    setError(undefined);
    setLoadingQuery(true);

    const result = await connectorsServices.queryData({
      connection: connectionInput,
      query: selectedQuery,
    });

    if (result.error) {
      toast.error(result.error);
      setError(result.error);
      setLoadingQuery(false);
      return;
    }

    setQueryResults(result);

    const newHistoryItem: QueryHistoryType = {
      id: new Date().toISOString(),
      executedAt: new Date(),
      results: result,
      projectId: selectedProject.id,
      projectName: selectedProject.name,
      query: selectedQuery,
    };

    setQueryHistory([...queryHistory, newHistoryItem]);
    setLoadingQuery(false);
  };

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
          onRunSelected={(lineQuery) => handleRunQuery(lineQuery)}
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
};
