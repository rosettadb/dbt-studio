type MonacoReadRequestPayload = {
  requestId: string;
  conversationId: number;
};

type MonacoUpdateRequestPayload = {
  requestId: string;
  conversationId: number;
  content: string;
};

type QueryResultPayload = {
  conversationId: number;
  result: {
    connectionId: string | number;
    success: boolean;
    rowCount: number;
    isCommand: boolean;
    commandType?: string;
    fields?: { name: string }[];
    data?: any[];
    duration?: number;
    originalSql?: string;
  };
};

type RunQueryPayload = {
  conversationId: number;
  query?: string;
};

export interface SqlEditorBridgeHandlers {
  getContent: () => string;
  setContent: (content: string) => void;
  setQueryResult?: (result: QueryResultPayload['result']) => void;
  /** Called when the agent requests query execution (equivalent to pressing Run). */
  runQuery?: (query?: string) => void;
}

export const registerSqlEditorBridge = (
  handlers: SqlEditorBridgeHandlers,
): (() => void) => {
  const onReadRequest = async (...args: unknown[]) => {
    const payload = args[0] as MonacoReadRequestPayload;

    try {
      const content = handlers.getContent();
      await window.electron.ipcRenderer.invoke('agent:editor:read-response', {
        requestId: payload.requestId,
        success: true,
        content,
      });
    } catch (error) {
      await window.electron.ipcRenderer.invoke('agent:editor:read-response', {
        requestId: payload.requestId,
        success: false,
        error: (error as Error).message,
      });
      // eslint-disable-next-line no-console
      console.error(
        '[EditorBridge][RendererService] Monaco read response failed',
        error,
      );
    }
  };

  const onUpdateRequest = async (...args: unknown[]) => {
    const payload = args[0] as MonacoUpdateRequestPayload;

    try {
      handlers.setContent(payload.content ?? '');
      await window.electron.ipcRenderer.invoke('agent:editor:update-response', {
        requestId: payload.requestId,
        success: true,
        applied: true,
      });
    } catch (error) {
      await window.electron.ipcRenderer.invoke('agent:editor:update-response', {
        requestId: payload.requestId,
        success: false,
        applied: false,
        error: (error as Error).message,
      });
      // eslint-disable-next-line no-console
      console.error(
        '[EditorBridge][RendererService] Monaco update response failed',
        error,
      );
    }
  };

  const onQueryResult = (...args: unknown[]) => {
    const payload = args[0] as QueryResultPayload;
    if (!handlers.setQueryResult) return;
    handlers.setQueryResult(payload.result);
  };

  const onRunQuery = (...args: unknown[]) => {
    const payload = args[0] as RunQueryPayload;
    if (handlers.runQuery) {
      handlers.runQuery(payload.query);
    }
  };

  const unsubRead = window.electron.ipcRenderer.on(
    'agent:editor:read-request',
    onReadRequest,
  );
  const unsubUpdate = window.electron.ipcRenderer.on(
    'agent:editor:update-request',
    onUpdateRequest,
  );
  const unsubQueryResult = window.electron.ipcRenderer.on(
    'agent:editor:query-result',
    onQueryResult,
  );
  const unsubRunQuery = window.electron.ipcRenderer.on(
    'agent:editor:run-query',
    onRunQuery,
  );

  return () => {
    if (typeof unsubRead === 'function') unsubRead();
    if (typeof unsubUpdate === 'function') unsubUpdate();
    if (typeof unsubQueryResult === 'function') unsubQueryResult();
    if (typeof unsubRunQuery === 'function') unsubRunQuery();
  };
};
