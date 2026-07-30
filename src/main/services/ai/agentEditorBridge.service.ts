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
 *   1. Query tool calls recordQueryFired(conversationId) just before firing the query.
 *   2. Renderer executes query, then invokes 'agent:editor:query-run-result' with { snapshot, pushedAt }.
 *   3. storeRunResult() stores the snapshot keyed by tabId with its push timestamp.
 *   4. waitForRunResult(conversationId, tabId?) polls until a fresh push arrives whose
 *      pushedAt is strictly greater than the fire timestamp for that conversationId.
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
// Keyed by tabId for multi-tab safety.
const lastRunResultByTab = new Map<string, QueryResultSnapshot>();
const lastRunResultPushedAtByTab = new Map<string, number>();

// Per-conversation fire timestamps — keyed by String(conversationId).
// Prevents cross-tab/cross-conversation races when multiple agents run concurrently.
const lastQueryFiredAtByConv = new Map<string, number>();

// Global fallback scalars (kept for backward-compat with callers that don't pass a key).
let lastRunResult: QueryResultSnapshot | null = null;
let lastRunResultPushedAt: number = 0;
let lastQueryFiredAt: number = 0;

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

  static resetForFactoryReset(): void {
    const emptySnapshot: QueryResultSnapshot = {
      status: 'pending',
      columns: [],
      rows: [],
      totalRowCount: 0,
    };

    pendingRequests.forEach(({ resolve, timer }) => {
      clearTimeout(timer);
      resolve(emptySnapshot);
    });
    pendingRequests.clear();
    lastRunResultByTab.clear();
    lastRunResultPushedAtByTab.clear();
    lastQueryFiredAtByConv.clear();
    lastRunResult = null;
    lastRunResultPushedAt = 0;
    lastQueryFiredAt = 0;
  }

  // ─── Push channel ─────────────────────────────────────────────────────────

  /**
   * Called by studio_sql_query / studio_ducklake_query just BEFORE they fire
   * agent:editor:run-query. Records the fire timestamp keyed by conversationId
   * so waitForRunResult() can detect freshness per-conversation.
   *
   * @param conversationId  String representation of the active conversation ID.
   */
  static recordQueryFired(conversationId: string): void {
    const now = Date.now();
    lastQueryFiredAt = now; // global fallback
    lastQueryFiredAtByConv.set(conversationId, now);
  }

  /**
   * Called by ipcMain.handle('agent:editor:query-run-result') when the renderer
   * pushes the result after agent-triggered execution completes.
   *
   * Only pushes with a pushedAt >= lastRunResultPushedAt (global) are accepted
   * to guard against out-of-order IPC delivery on the global path.
   *
   * @param snapshot  The execution result snapshot.
   * @param pushedAt  Timestamp (Date.now()) recorded by the renderer at push time.
   */
  static storeRunResult(snapshot: QueryResultSnapshot, pushedAt: number): void {
    // 1. Tab-specific storage: gated by per-tab timestamp.
    if (snapshot.tabId) {
      const lastTabPushedAt =
        lastRunResultPushedAtByTab.get(snapshot.tabId) ?? 0;
      if (pushedAt >= lastTabPushedAt) {
        lastRunResultByTab.set(snapshot.tabId, snapshot);
        lastRunResultPushedAtByTab.set(snapshot.tabId, pushedAt);
      }
    }

    // 2. Global storage: gated by global timestamp.
    if (pushedAt >= lastRunResultPushedAt) {
      lastRunResult = snapshot;
      lastRunResultPushedAt = pushedAt;
    }
  }

  /**
   * Waits until a fresh run-result is available — i.e. a push whose pushedAt
   * timestamp is strictly greater than the fire timestamp for this conversationId.
   *
   * Per-conversation keying prevents cross-tab races when multiple agents run
   * concurrently (e.g. SQL screen + Notebooks screen or two SQL tabs).
   *
   * @param conversationId  String representation of the active conversation ID.
   * @param tabId           Optional tab ID. Omit to accept any tab's fresh result.
   * @param timeout         Max wait time in ms (default 35 000 ms).
   */
  static async waitForRunResult(
    conversationId: string,
    tabId?: string,
    timeout = 35_000,
  ): Promise<QueryResultSnapshot | null> {
    const POLL_MS = 500;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const firedAt =
        lastQueryFiredAtByConv.get(conversationId) ?? lastQueryFiredAt;

      if (tabId) {
        // Check the specific tab's push timestamp.
        const pushedAt = lastRunResultPushedAtByTab.get(tabId) ?? 0;
        if (pushedAt > firedAt) {
          return lastRunResultByTab.get(tabId) ?? lastRunResult;
        }
      } else {
        // No tabId — accept the freshest result from ANY tab that arrived after
        // this conversation's fire time, or fall back to the global scalar.
        // Array.from().reduce() avoids for...of (iterator protocol banned by ESLint).
        const freshest = Array.from(
          lastRunResultPushedAtByTab.entries(),
        ).reduce<{ snapshot: QueryResultSnapshot | null; pushedAt: number }>(
          (acc, [tId, pAt]) => {
            if (pAt > firedAt && pAt > acc.pushedAt) {
              return {
                snapshot: lastRunResultByTab.get(tId) ?? null,
                pushedAt: pAt,
              };
            }
            return acc;
          },
          { snapshot: null, pushedAt: 0 },
        );
        if (freshest.snapshot) return freshest.snapshot;

        // Global scalar fallback for callers that did not pass conversationId.
        if (lastRunResultPushedAt > firedAt) return lastRunResult;
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
