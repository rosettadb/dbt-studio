import type { QueryResponseType } from '../../../types/backend';

export type ProjectQueryResultsTab =
  | 'preview'
  | 'sql'
  | 'history'
  | 'bookmarks';

export interface ProjectQueryHistoryItem {
  id: string;
  projectId: string;
  projectName: string;
  filePath?: string;
  modelName?: string;
  rawSql: string;
  compiledSql?: string;
  executedAt: string;
  durationMs?: number;
  limit: number;
  resultsPreview?: QueryResponseType;
  rowCount?: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

export interface ProjectQueryBookmark {
  id: string;
  name: string;
  tags: string[];
  projectId: string;
  projectName: string;
  filePath?: string;
  modelName?: string;
  rawSql: string;
  compiledSql?: string;
  createdAt: string;
}

export interface ProjectQueryPreviewPayload {
  projectId: string;
  projectName: string;
  filePath?: string;
  modelName?: string;
  rawSql: string;
  compiledSql?: string;
  result?: QueryResponseType;
  durationMs?: number;
  errorMessage?: string;
}

export interface ProjectQueryPanelState {
  activeTab: ProjectQueryResultsTab;
  limit: number;
  isRunning: boolean;
  result?: QueryResponseType;
  error?: string;
  rawSql?: string;
  compiledSql?: string;
  filePath?: string;
  modelName?: string;
  lastDurationMs?: number;
  history: ProjectQueryHistoryItem[];
  bookmarks: ProjectQueryBookmark[];
}
