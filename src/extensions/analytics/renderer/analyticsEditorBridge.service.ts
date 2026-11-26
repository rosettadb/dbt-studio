import { ipc } from './ipc';

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
      await ipc.invoke('agent:analytics:read-response', {
        requestId: payload.requestId,
        success: true,
        markdownContent,
      });
    } catch (error) {
      await ipc.invoke('agent:analytics:read-response', {
        requestId: payload.requestId,
        success: false,
        error: getErrorMessage(error),
      });
    }
  };

  const onUpdateRequest = async (...args: unknown[]) => {
    const payload = args[0] as AnalyticsUpdateRequestPayload;

    try {
      await handlers.setContent(payload.markdownContent ?? '');
      await ipc.invoke('agent:analytics:update-response', {
        requestId: payload.requestId,
        success: true,
        applied: true,
      });
    } catch (error) {
      await ipc.invoke('agent:analytics:update-response', {
        requestId: payload.requestId,
        success: false,
        applied: false,
        error: getErrorMessage(error),
      });
    }
  };

  const onRunRequest = async (...args: unknown[]) => {
    const payload = args[0] as AnalyticsBridgeRequestPayload;

    try {
      await handlers.runQueries();
      await ipc.invoke('agent:analytics:run-response', {
        requestId: payload.requestId,
        success: true,
      });
    } catch (error) {
      await ipc.invoke('agent:analytics:run-response', {
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
      await ipc.invoke('agent:analytics:query-results-response', {
        requestId: payload.requestId,
        success: true,
        ...results,
      });
    } catch (error) {
      await ipc.invoke('agent:analytics:query-results-response', {
        requestId: payload.requestId,
        success: false,
        error: getErrorMessage(error),
      });
    }
  };

  const unsubRead = ipc.on('agent:analytics:read-request', onReadRequest);
  const unsubUpdate = ipc.on('agent:analytics:update-request', onUpdateRequest);
  const unsubRun = ipc.on('agent:analytics:run-request', onRunRequest);
  const unsubResults = ipc.on(
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
