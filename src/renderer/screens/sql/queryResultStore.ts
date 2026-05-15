/**
 * queryResultStore.ts
 *
 * Module-level in-memory store that holds a compact snapshot of the SQL Editor
 * query result for each active tab.
 *
 * Written from index.tsx callbacks (handleQueryResults / handleSetError) so that
 * BOTH success and error outcomes are captured. Errors bypass QueryResult.tsx
 * entirely, which is why the write point is upstream in index.tsx.
 *
 * Read by agentEditorBridge.service.ts (renderer side of the AI Agent IPC bridge).
 */

import type { QueryResultSnapshot } from '../../../types/backend';

// One snapshot per SQL tab, keyed by the tab manager's activeTabId string.
const snapshots = new Map<string, QueryResultSnapshot>();

// Tracks the most recently written tab so get() works without a tabId.
let lastActiveTabId: string | undefined;

export const QueryResultStore = {
  /**
   * Store a snapshot for a given tab.
   * Called from index.tsx after handleQueryResults or handleSetError fires.
   */
  set(tabId: string, snapshot: QueryResultSnapshot): void {
    snapshots.set(tabId, { ...snapshot, capturedAt: Date.now() });
    lastActiveTabId = tabId;
  },

  /**
   * Retrieve the snapshot for a given tab.
   * If tabId is omitted, returns the snapshot for the most recently active tab.
   * Returns undefined if no query has been run yet.
   */
  get(tabId?: string): QueryResultSnapshot | undefined {
    const id = tabId ?? lastActiveTabId;
    return id ? snapshots.get(id) : undefined;
  },

  /**
   * Remove the snapshot for a tab (e.g. when the tab is closed).
   * Prevents stale data from leaking across tab sessions.
   */
  clear(tabId: string): void {
    snapshots.delete(tabId);
    if (lastActiveTabId === tabId) {
      lastActiveTabId = undefined;
    }
  },
};
