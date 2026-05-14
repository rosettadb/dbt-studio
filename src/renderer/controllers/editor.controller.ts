import { useEffect, useRef } from 'react';
import { registerSqlEditorBridge } from '../services/editorBridge.service';

export const useSqlEditorBridge = (params: {
  enabled: boolean;
  getContent: () => string;
  setContent: (content: string) => void;
  setQueryResult?: (result: any) => void;
  runQuery?: (query?: string) => void;
}) => {
  const { enabled, getContent, setContent, setQueryResult, runQuery } = params;

  // Use a ref to store the latest versions of unstable function props
  const callbacksRef = useRef({
    getContent,
    setContent,
    setQueryResult,
    runQuery,
  });

  // Update the ref whenever the props change
  useEffect(() => {
    callbacksRef.current = { getContent, setContent, setQueryResult, runQuery };
  }, [getContent, setContent, setQueryResult, runQuery]);

  useEffect(() => {
    if (!enabled) return undefined;

    // Register with wrappers that read from the latest ref
    const unregister = registerSqlEditorBridge({
      getContent: () => callbacksRef.current.getContent(),
      setContent: (content) => callbacksRef.current.setContent(content),
      setQueryResult: setQueryResult
        ? (result) => {
            if (callbacksRef.current.setQueryResult) {
              callbacksRef.current.setQueryResult(result);
            }
          }
        : undefined,
      runQuery: runQuery
        ? (query?: string) => {
            if (callbacksRef.current.runQuery) {
              callbacksRef.current.runQuery(query);
            }
          }
        : undefined,
    });

    return () => {
      unregister();
    };
  }, [enabled]);
};
