import AgentService from '../../../extensionApi/studioMain/agentService';

const pendingAnalyticsBridgeRequests = new Map<
  string,
  {
    resolve: (value: any) => void;
    reject: (reason?: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
    type: string;
  }
>();

/** Fails everything that is waiting for the Analytics editor to answer. */
export const rejectPendingAnalyticsRequests = (error: Error): void => {
  pendingAnalyticsBridgeRequests.forEach(({ reject, timeout }) => {
    clearTimeout(timeout);
    reject(error);
  });
  pendingAnalyticsBridgeRequests.clear();
};

/**
 * The AI agent's way to the Analytics page that is open in the window: it
 * asks the Analytics editor over IPC and waits for the answer.
 */
export class AnalyticsAgentBridge {
  private static async requestAnalyticsBridge(
    conversationId: number,
    type: string,
    requestChannel: string,
    responseChannel: string,
    payload: object = {},
  ): Promise<any> {
    const context = AgentService.getAgentContext(conversationId);
    if (!context) {
      throw new Error(`No active context for conversation ${conversationId}`);
    }
    if (context.screenKey !== 'analytics') {
      throw new Error(
        `Analytics bridge only available in Analytics screen (current: ${context.screenKey})`,
      );
    }
    if (!context.connectionId) {
      throw new Error('Analytics bridge requires an active connectionId');
    }
    if (!context.pageId) {
      throw new Error('Analytics bridge requires an active pageId');
    }

    const requestId = `analytics-bridge-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingAnalyticsBridgeRequests.delete(requestId);
        reject(
          new Error(
            `Timed out waiting for ${type} response from Analytics renderer`,
          ),
        );
      }, 15000);

      pendingAnalyticsBridgeRequests.set(requestId, {
        resolve,
        reject,
        timeout,
        type: responseChannel,
      });

      context.event.sender.send(requestChannel, {
        requestId,
        conversationId,
        connectionId: context.connectionId,
        pageId: context.pageId,
        ...payload,
      });
    });
  }

  public static resolveAnalyticsBridgeResponse(payload: {
    requestId: string;
    success: boolean;
    error?: string;
    [key: string]: any;
  }): void {
    const request = pendingAnalyticsBridgeRequests.get(payload.requestId);
    if (!request) return;

    pendingAnalyticsBridgeRequests.delete(payload.requestId);
    clearTimeout(request.timeout);

    if (payload.success) {
      request.resolve(payload);
    } else {
      request.reject(
        new Error(payload.error || 'Analytics renderer request failed'),
      );
    }
  }

  public static async requestAnalyticsEditorRead(conversationId: number) {
    return this.requestAnalyticsBridge(
      conversationId,
      'analytics-read',
      'agent:analytics:read-request',
      'agent:analytics:read-response',
    );
  }

  public static async requestAnalyticsEditorUpdate(
    conversationId: number,
    markdownContent: string,
  ) {
    return this.requestAnalyticsBridge(
      conversationId,
      'analytics-update',
      'agent:analytics:update-request',
      'agent:analytics:update-response',
      { markdownContent },
    );
  }

  public static async requestAnalyticsEditorRun(conversationId: number) {
    return this.requestAnalyticsBridge(
      conversationId,
      'analytics-run',
      'agent:analytics:run-request',
      'agent:analytics:run-response',
    );
  }

  public static async requestAnalyticsEditorResults(conversationId: number) {
    return this.requestAnalyticsBridge(
      conversationId,
      'analytics-query-results',
      'agent:analytics:query-results-request',
      'agent:analytics:query-results-response',
    );
  }
}
