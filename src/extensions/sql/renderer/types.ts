import type { QueryResponseType } from '../../../extensionApi/studio/types';

// SQL Tab types for connection-based SQL tool
export type SqlTabId = string;

export interface SqlTabState {
  id: SqlTabId;
  connectionId: string;
  connectionName: string;
  connectionType: string;
  query: string;
  results?: any;
  isModified: boolean;
  isLoading: boolean;
  error?: string;
}

export interface SqlPendingCloseState {
  tabId: SqlTabId;
  tab: SqlTabState;
}

export type QueryHistoryType = {
  id: string;
  query: string;
  executedAt: Date;
  results?: QueryResponseType;
  // Project-based fields (optional for backwards compatibility)
  projectId?: string;
  projectName?: string;
  // Connection-based fields (new)
  connectionId?: string;
  connectionName?: string;
  // DuckLake-specific fields (new)
  isDuckLake?: boolean;
  instanceId?: string;
};
