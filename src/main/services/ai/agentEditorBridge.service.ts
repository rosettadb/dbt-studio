/**
 * agentEditorBridge.service.ts  (main process)
 *
 * Business logic for the agent:editor IPC channels:
 *
 *  Pull channel (studio_sql_get_query_results):
 *   1. Tool calls getQueryResults(event, opts).
 *   2. Service sends 'agent:editor:query-results-request' to renderer.
 *   3. Renderer reads QueryResultStore and invokes 'agent:editor:query-results-response'.
 *   4. resolveQueryResultsResponse() resolves the pending Promise.
 *
 *  Push channel (studio_sql_get_agent_run_result):
 *   1. Query tool calls recordQueryFired() just before firing the query.
 *   2. Renderer executes query, then invokes 'agent:editor:query-run-result' with { snapshot, pushedAt }.
 *   3. storeRunResult() stores the snapshot with its push timestamp.
 *   4. waitForRunResult() polls until a fresh push (pushedAt > lastQueryFiredAt) arrives.
 *
 * All business logic lives here per rule BE-01.
 * IPC handlers in agent.ipcHandlers.ts are thin one-line wrappers only.
 */

import { BrowserWindow } from 'electron'; // static import — no require() inside methods
import type { IpcMainInvokeEvent } from 'electron';
import type {
  QueryResultSnapshot,
  GetQueryResultsRequest,
} from '../../../types/backend';

const REPLY_TIMEOUT_MS = 3_000;

interface PendingRequest {
  resolve: (snapshot: QueryResultSnapshot) => void;
  timer: ReturnType<typeof setTimeout>;
}

// Pending resolvers keyed by requestId — pull channel
const pendingRequests = new Map<string, PendingRequest>();

// Push channel state — populated by renderer after agent-triggered execution completes.
// Keyed by tabId for multi-tab safety; lastRunResult is the most recent regardless of tab.
const lastRunResultByTab = new Map<string, QueryResultSnapshot>();
let lastRunResult: QueryResultSnapshot | null = null;

// Timestamps used to detect freshness.
// lastQueryFiredAt: set by the query tool just before firing agent:editor:run-query.
// lastRunResultPushedAt: set when the renderer pushes the result back.
// waitForRunResult() polls until lastRunResultPushedAt > lastQueryFiredAt.
let lastQueryFiredAt: number = 0;
let lastRunResultPushedAt: number = 0;

export class AgentEditorBridgeService {
  // ─── Pull channel ─────────────────────────────────────────────────────────

  /**
   * Ask the renderer for the current SQL Editor query-result snapshot.
   * Returns a Promise that resolves when the renderer replies, or after 3 s timeout.
   *
   * @param event  The IpcMainInvokeEvent from the ipcMain.handle callback.
   * @param opts   tabId (optional) and maxRows (optional, default 20, max 50).
   */
  static async getQueryResults(
    event: IpcMainInvokeEvent,
    opts: GetQueryResultsRequest,
  ): Promise<QueryResultSnapshot> {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      // eslint-disable-next-line no-console
      console.error(
        '[AgentEditorBridgeService] No BrowserWindow found for event sender — cannot fetch query results',
      );
      return { status: 'pending', columns: [], rows: [], totalRowCount: 0 };
    }

    return new Promise((resolve) => {
      const requestId = `${Date.now()}-${Math.random()}`;

      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        // eslint-disable-next-line no-console
        console.error(
          `[AgentEditorBridgeService] Timeout waiting for renderer reply (requestId=${requestId})`,
        );
        resolve({ status: 'pending', columns: [], rows: [], totalRowCount: 0 });
      }, REPLY_TIMEOUT_MS);

      pendingRequests.set(requestId, { resolve, timer });

      win.webContents.send('agent:editor:query-results-request', {
        requestId,
        ...opts,
      });
    });
  }

  /**
   * Called by the ipcMain.handle('agent:editor:query-results-response') handler
   * when the renderer has read QueryResultStore and sends back the snapshot.
   */
  static resolveQueryResultsResponse(payload: {
    requestId: string;
    snapshot: QueryResultSnapshot;
  }): void {
    const pending = pendingRequests.get(payload.requestId);
    if (!pending) return; // already timed out — discard
    clearTimeout(pending.timer);
    pendingRequests.delete(payload.requestId);
    pending.resolve(payload.snapshot);
  }

  // ─── Push channel ─────────────────────────────────────────────────────────

  /**
   * Called by studio_sql_query / studio_ducklake_query just BEFORE they fire
   * agent:editor:run-query. Records the fire timestamp so waitForRunResult()
   * knows to wait for a push that arrived strictly after this moment.
   */
  static recordQueryFired(): void {
    lastQueryFiredAt = Date.now();
  }

  /**
   * Called by ipcMain.handle('agent:editor:query-run-result') when the renderer
   * pushes the result after agent-triggered execution completes.
   *
   * Only pushes with a pushedAt >= lastRunResultPushedAt are accepted (guards
   * against out-of-order IPC delivery).
   *
   * @param snapshot  The execution result snapshot.
   * @param pushedAt  Timestamp (Date.now()) recorded by the renderer at push time.
   */
  static storeRunResult(snapshot: QueryResultSnapshot, pushedAt: number): void {
    if (pushedAt < lastRunResultPushedAt) return;
    lastRunResult = snapshot;
    lastRunResultPushedAt = pushedAt;
    if (snapshot.tabId) {
      lastRunResultByTab.set(snapshot.tabId, snapshot);
    }
  }

  /**
   * Waits until a fresh run-result is available — i.e. a push whose pushedAt
   * timestamp is strictly greater than lastQueryFiredAt.
   *
   * Solves the race condition where the agent reads after a 1-2 s LLM inference
   * step but the query itself takes 7+ seconds to complete.
   *
   * @param tabId    Optional tab ID. Omit to read the most recent result.
   * @param timeout  Max wait time in ms (default 35 000 ms).
   */
  static async waitForRunResult(
    tabId?: string,
    timeout = 35_000,
  ): Promise<QueryResultSnapshot | null> {
    const POLL_MS = 500;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      if (lastRunResultPushedAt > lastQueryFiredAt) {
        return tabId
          ? (lastRunResultByTab.get(tabId) ?? lastRunResult)
          : lastRunResult;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => {
        setTimeout(resolve, POLL_MS);
      });
    }

    // eslint-disable-next-line no-console
    console.warn(
      '[AgentEditorBridgeService] waitForRunResult timed out — returning current value',
    );
    return tabId
      ? (lastRunResultByTab.get(tabId) ?? lastRunResult)
      : lastRunResult;
  }
}
