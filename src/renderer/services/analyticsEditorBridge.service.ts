type AnalyticsBridgeRequestPayload = {
  requestId: string;
  conversationId: number;
  connectionId: string;
  pageId: string;
};

type AnalyticsUpdateRequestPayload = AnalyticsBridgeRequestPayload & {
  markdownContent: string;
};

export interface AnalyticsQueryResultSummary {
  rowCount: number;
  columns: string[];
  rowsPreview: any[];
}

export interface AnalyticsEditorResultsSummary {
  statuses: Record<string, 'idle' | 'running' | 'success' | 'error'>;
  errors: Record<string, string | null>;
  durations: Record<string, number | undefined>;
  results: Record<string, AnalyticsQueryResultSummary>;
}

export interface AnalyticsEditorBridgeHandlers {
  getContent: () => string;
  setContent: (markdownContent: string) => Promise<void> | void;
  runQueries: () => Promise<void>;
  getResults: () => AnalyticsEditorResultsSummary;
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Analytics bridge request failed';

export const registerAnalyticsEditorBridge = (
  handlers: AnalyticsEditorBridgeHandlers,
): (() => void) => {
  const onReadRequest = async (...args: unknown[]) => {
    const payload = args[0] as AnalyticsBridgeRequestPayload;

    try {
      const markdownContent = handlers.getContent();
      await window.electron.ipcRenderer.invoke(
        'agent:analytics:read-response',
        {
          requestId: payload.requestId,
          success: true,
          markdownContent,
        },
      );
    } catch (error) {
      await window.electron.ipcRenderer.invoke(
        'agent:analytics:read-response',
        {
          requestId: payload.requestId,
          success: false,
          error: getErrorMessage(error),
        },
      );
    }
  };

  const onUpdateRequest = async (...args: unknown[]) => {
    const payload = args[0] as AnalyticsUpdateRequestPayload;

    try {
      await handlers.setContent(payload.markdownContent ?? '');
      await window.electron.ipcRenderer.invoke(
        'agent:analytics:update-response',
        {
          requestId: payload.requestId,
          success: true,
          applied: true,
        },
      );
    } catch (error) {
      await window.electron.ipcRenderer.invoke(
        'agent:analytics:update-response',
        {
          requestId: payload.requestId,
          success: false,
          applied: false,
          error: getErrorMessage(error),
        },
      );
    }
  };

  const onRunRequest = async (...args: unknown[]) => {
    const payload = args[0] as AnalyticsBridgeRequestPayload;

    try {
      await handlers.runQueries();
      await window.electron.ipcRenderer.invoke('agent:analytics:run-response', {
        requestId: payload.requestId,
        success: true,
      });
    } catch (error) {
      await window.electron.ipcRenderer.invoke('agent:analytics:run-response', {
        requestId: payload.requestId,
        success: false,
        error: getErrorMessage(error),
      });
    }
  };

  const onResultsRequest = async (...args: unknown[]) => {
    const payload = args[0] as AnalyticsBridgeRequestPayload;

    try {
      const results = handlers.getResults();
      await window.electron.ipcRenderer.invoke(
        'agent:analytics:query-results-response',
        {
          requestId: payload.requestId,
          success: true,
          ...results,
        },
      );
    } catch (error) {
      await window.electron.ipcRenderer.invoke(
        'agent:analytics:query-results-response',
        {
          requestId: payload.requestId,
          success: false,
          error: getErrorMessage(error),
        },
      );
    }
  };

  const unsubRead = window.electron.ipcRenderer.on(
    'agent:analytics:read-request',
    onReadRequest,
  );
  const unsubUpdate = window.electron.ipcRenderer.on(
    'agent:analytics:update-request',
    onUpdateRequest,
  );
  const unsubRun = window.electron.ipcRenderer.on(
    'agent:analytics:run-request',
    onRunRequest,
  );
  const unsubResults = window.electron.ipcRenderer.on(
    'agent:analytics:query-results-request',
    onResultsRequest,
  );

  return () => {
    if (typeof unsubRead === 'function') unsubRead();
    if (typeof unsubUpdate === 'function') unsubUpdate();
    if (typeof unsubRun === 'function') unsubRun();
    if (typeof unsubResults === 'function') unsubResults();
  };
};
