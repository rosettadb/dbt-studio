import React, { useRef } from 'react';
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

    try {
      const result = await connectorsServices.queryData({
        connection: connectionInput,
        query: selectedQuery,
        projectName: selectedProject.name,
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
    } catch (error) {
      toast.error('An unexpected error occurred while executing the query');
      setError(error);
    } finally {
      setLoadingQuery(false);
    }
  };

  const [queryContent, setQueryContent] = React.useState('');
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const loadQuery = async () => {
      if (selectedProject?.id) {
        try {
          const query = await projectsServices.getQuery(selectedProject);
          setQueryContent(query);
        } catch (error) {
          setQueryContent('');
        }
      }
    };

    loadQuery();
  }, [selectedProject?.id]);

  React.useEffect(() => {
    return () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
      }
    };
  }, []);

  // Handle query content changes with debouncing
  const handleQueryChange = React.useCallback(
    (content: string) => {
      // Update local state immediately for UI responsiveness
      setQueryContent(content);

      // Debounce the API call
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
      }

      saveDebounceRef.current = setTimeout(() => {
        if (selectedProject?.id) {
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
    [selectedProject?.id],
  );

  return (
    <Inputs>
      <RelativeContainer>
        <SqlEditorComponent
          content={queryContent}
          setContent={handleQueryChange}
          completions={completions}
          editorRef={editorRef}
          onRunSelected={(lineQuery) => handleRunQuery(lineQuery)}
        />
        {queryHistory.length > 0 && (
          <QueryHistory
            onQuerySelect={(qh) => handleQueryChange(qh.query)}
            queryHistory={queryHistory}
            projectId={selectedProject.id}
          />
        )}
      </RelativeContainer>
    </Inputs>
  );
};
