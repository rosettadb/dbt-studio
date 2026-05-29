/**
 * agentEditorBridge.service.ts  (renderer process)
 *
 * Registers the IPC listener that serves AI Agent query-result requests.
 *
 * Pattern mirrors the existing agent:editor:read-request / read-response pair:
 *  - Main sends  'agent:editor:query-results-request' → this handler reads the store
 *  - Renderer replies via ipcRenderer.invoke('agent:editor:query-results-response', payload)
 *
 * Architecture rules enforced here:
 *  - FE-03: ipcRenderer.on / removeListener live in a renderer SERVICE, never
 *            in a React component.
 *  - Preload constraint: all channel names must be in the Channels union type.
 *    'agent:editor:query-results-request' and 'agent:editor:query-results-response'
 *    are now registered in src/types/ipc.ts → AgentChannels.
 *  - No `send` — the preload exposes `sendMessage` (one-way) and `invoke` (request-reply).
 *    We use `invoke` here so the main-process handler gets a proper return value.
 */

import type {
  QueryResultSnapshot,
  GetQueryResultsRequest,
} from '../../types/backend';
import { QueryResultStore } from '../screens/sql/queryResultStore';

// Guard: only one active listener at a time, even if the SQL screen
// unmounts and remounts (e.g. during hot reload or navigation).
let registered = false;

/**
 * Registers the IPC listener that lets the main-process AI Agent read the
 * current SQL Editor query results.
 *
 * Call once when the SQL screen mounts.  Returns a cleanup function that
 * unregisters the listener when the screen unmounts.
 */
export function registerQueryResultBridge(): () => void {
  if (registered) {
    // Already registered — return a no-op cleanup.
    return () => {};
  }
  registered = true;

  const handler = (opts: GetQueryResultsRequest & { requestId: string }) => {
    const maxRows = Math.min(opts?.maxRows ?? 20, 50);
    const snapshot = QueryResultStore.get(opts?.tabId);

    const reply: QueryResultSnapshot = snapshot
      ? {
          ...snapshot,
          rows: snapshot.rows.slice(0, maxRows),
          truncated: snapshot.rows.length > maxRows,
        }
      : {
          // No query has been run yet for this tab
          status: 'pending',
          columns: [],
          rows: [],
          totalRowCount: 0,
          tabId: opts?.tabId,
        };

    // ✅ Reply via invoke so main-process ipcMain.handle receives it.
    // channel 'agent:editor:query-results-response' is registered in AgentChannels.
    window.electron.ipcRenderer.invoke('agent:editor:query-results-response', {
      requestId: opts.requestId,
      snapshot: reply,
    });
  };

  window.electron.ipcRenderer.on(
    'agent:editor:query-results-request',
    // The preload strips the IpcRendererEvent and passes only the args,
    // so the handler receives the payload object directly.
    handler as (...args: unknown[]) => void,
  );

  return () => {
    registered = false;
    window.electron.ipcRenderer.removeListener(
      'agent:editor:query-results-request',
      handler as (...args: unknown[]) => void,
    );
  };
}
