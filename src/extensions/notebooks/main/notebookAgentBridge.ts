import AgentService from '../../../extensionApi/studioMain/agentService';
import type {
  PythonNotebookAgentArgs,
  PythonNotebookAgentOp,
  PythonNotebookAgentResult,
} from '../../../extensionApi/studioMain/pythonNotebooksTypes';

const NOTEBOOK_BRIDGE_TIMEOUT_MS = 15_000;

const pendingNotebookBridgeRequests = new Map<
  string,
  {
    resolve: (value: any) => void;
    reject: (reason?: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
    type: string;
  }
>();

/** Fails everything that is waiting for a notebook to answer. */
export const rejectPendingNotebookRequests = (error: Error): void => {
  pendingNotebookBridgeRequests.forEach(({ reject, timeout }) => {
    clearTimeout(timeout);
    reject(error);
  });
  pendingNotebookBridgeRequests.clear();
};

/**
 * The AI agent's way to the notebook that is open in the window: it asks
 * the Notebooks screen over IPC and waits for the answer.
 */
export class NotebookAgentBridge {
  private static async requestNotebookBridge(
    conversationId: number,
    type: string,
    requestChannel: string,
    responseChannel: string,
    payload: object = {},
    options: { timeoutMs?: number; timeoutMessage?: string } = {},
  ): Promise<any> {
    const context = AgentService.getAgentContext(conversationId);
    if (!context) {
      throw new Error(`No active context for conversation ${conversationId}`);
    }

    const requestId = `notebook-bridge-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingNotebookBridgeRequests.delete(requestId);
        reject(
          new Error(
            options.timeoutMessage ??
              `Timed out waiting for ${type} response from renderer`,
          ),
        );
      }, options.timeoutMs ?? NOTEBOOK_BRIDGE_TIMEOUT_MS);

      pendingNotebookBridgeRequests.set(requestId, {
        resolve,
        reject,
        timeout,
        type,
      });

      context.event.sender.send(requestChannel, {
        requestId,
        conversationId,
        ...payload,
      });
    });
  }

  public static resolveNotebookBridgeResponse(payload: {
    requestId: string;
    success: boolean;
    [key: string]: any;
  }): void {
    const request = pendingNotebookBridgeRequests.get(payload.requestId);
    if (!request) return;

    pendingNotebookBridgeRequests.delete(payload.requestId);
    clearTimeout(request.timeout);

    if (payload.success) {
      request.resolve(payload);
    } else {
      request.reject(new Error(payload.error || 'Renderer request failed'));
    }
  }

  /**
   * Python notebook agent bridge: runs one typed op in the open
   * PythonNotebookEditor. The notebook id comes from the agent context, never
   * from tool input, and the editor answers only for its own notebook.
   */
  public static async requestPythonNotebook<K extends PythonNotebookAgentOp>(
    conversationId: number,
    op: K,
    args: PythonNotebookAgentArgs<K>,
    timeoutMs: number = NOTEBOOK_BRIDGE_TIMEOUT_MS,
  ): Promise<PythonNotebookAgentResult<K>> {
    const context = AgentService.getAgentContext(conversationId);
    if (!context?.notebookId) {
      throw new Error('No notebook is open in this chat.');
    }
    const response = await this.requestNotebookBridge(
      conversationId,
      op,
      'agent:python-notebook:request',
      'agent:python-notebook:response',
      { notebookId: context.notebookId, op, args },
      {
        timeoutMs,
        timeoutMessage:
          "The notebook didn't answer. Make sure it's open in the Notebooks screen.",
      },
    );
    return response.data as PythonNotebookAgentResult<K>;
  }

  public static async requestNotebookState(conversationId: number) {
    return this.requestNotebookBridge(
      conversationId,
      'state',
      'agent:notebook:state-request',
      'agent:notebook:state-response',
    );
  }

  public static async requestNotebookCellRead(
    conversationId: number,
    cellId: string,
  ) {
    return this.requestNotebookBridge(
      conversationId,
      'cell-read',
      'agent:notebook:cell-read-request',
      'agent:notebook:cell-read-response',
      { cellId },
    );
  }

  public static async requestNotebookCellAdd(
    conversationId: number,
    content: string,
  ): Promise<{ cellId: string }> {
    return this.requestNotebookBridge(
      conversationId,
      `cell-add-${Date.now()}`,
      'agent:notebook:cell-add-request',
      'agent:notebook:cell-add-response',
      { content },
    );
  }

  public static async requestNotebookCellUpdate(
    conversationId: number,
    cellId: string,
    content: string,
  ) {
    return this.requestNotebookBridge(
      conversationId,
      'cell-update',
      'agent:notebook:cell-update-request',
      'agent:notebook:cell-update-response',
      { cellId, content },
    );
  }

  public static async requestNotebookCellRun(
    conversationId: number,
    cellId: string,
  ) {
    const context = AgentService.getAgentContext(conversationId);
    if (!context) {
      throw new Error(`No active context for conversation ${conversationId}`);
    }
    return this.requestNotebookBridge(
      conversationId,
      `cell-run-${cellId}`,
      'agent:notebook:cell-run-request',
      'agent:notebook:cell-run-response',
      { cellId },
    );
  }

  public static async requestNotebookCellResult(
    conversationId: number,
    cellId: string,
  ) {
    return this.requestNotebookBridge(
      conversationId,
      'cell-result',
      'agent:notebook:cell-result-request',
      'agent:notebook:cell-result-response',
      { cellId },
    );
  }
}
