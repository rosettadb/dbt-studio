import { useEffect } from 'react';
import { registerSqlEditorBridge } from '../services/editorBridge.service';

export const useSqlEditorBridge = (params: {
  enabled: boolean;
  getContent: () => string;
  setContent: (content: string) => void;
  setQueryResult?: (result: any) => void;
  runQuery?: (query?: string) => void;
}) => {
  const { enabled, getContent, setContent, setQueryResult, runQuery } = params;

  useEffect(() => {
    if (!enabled) return undefined;
    const unregister = registerSqlEditorBridge({
      getContent,
      setContent,
      setQueryResult: setQueryResult
        ? (result) => {
            setQueryResult(result);
          }
        : undefined,
      runQuery: runQuery
        ? (query?: string) => {
            runQuery(query);
          }
        : undefined,
    });

    return () => {
      unregister();
    };
  }, [enabled, getContent, setContent, setQueryResult, runQuery]);
};
