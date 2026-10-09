/**
 * Python notebook agent bridge (renderer side)
 *
 * Answers the Notebooks agent's requests (`agent:python-notebook:request`)
 * with the ops of the open PythonNotebookEditor. One IPC subscription serves
 * every registered notebook, and a request is answered only by the editor of
 * the notebook it names (the chat's notebook, set by main from the agent
 * context). While any Python notebook is open, every request gets a
 * response; with none open, main's timeout says to open the notebook.
 */

import type {
  PythonNotebookAgentHandlers,
  PythonNotebookAgentRequest,
  PythonNotebookAgentResponse,
} from '../../types/pythonNotebooks';

export const OTHER_NOTEBOOK_ERROR =
  'This chat belongs to another notebook. Open it to continue.';

const registry = new Map<string, PythonNotebookAgentHandlers>();
let unsubscribe: (() => void) | null = null;

const respond = (response: PythonNotebookAgentResponse) =>
  window.electron.ipcRenderer.invoke(
    'agent:python-notebook:response',
    response,
  );

async function handleRequest(request: PythonNotebookAgentRequest) {
  try {
    const handlers = registry.get(request.notebookId);
    if (!handlers) throw new Error(OTHER_NOTEBOOK_ERROR);
    if (!Object.prototype.hasOwnProperty.call(handlers, request.op)) {
      throw new Error(`Unknown notebook op: ${String(request.op)}`);
    }
    const handler = handlers[request.op] as (args: unknown) => Promise<unknown>;
    const data = await handler(request.args ?? {});
    await respond({ requestId: request.requestId, success: true, data });
  } catch (error) {
    await respond({
      requestId: request.requestId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Answer agent requests for `notebookId` with `handlers` until the returned
 * function is called (FE-03: the subscription lives here, not in components).
 */
export function registerPythonNotebookBridge(
  notebookId: string,
  handlers: PythonNotebookAgentHandlers,
): () => void {
  registry.set(notebookId, handlers);
  if (!unsubscribe) {
    const unsub = window.electron.ipcRenderer.on(
      'agent:python-notebook:request',
      (...args: unknown[]) => {
        handleRequest(args[0] as PythonNotebookAgentRequest).catch(
          () => undefined,
        );
      },
    );
    unsubscribe = typeof unsub === 'function' ? unsub : () => undefined;
  }
  return () => {
    if (registry.get(notebookId) === handlers) registry.delete(notebookId);
    if (registry.size === 0 && unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
}
