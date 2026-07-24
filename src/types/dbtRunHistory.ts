export type DbtRunHistoryStatus =
  | 'running'
  | 'success'
  | 'error'
  | 'warn'
  | 'skipped'
  | 'no_matches'
  | 'cancelled';

export interface DbtRunHistoryResult {
  id: string;
  runId: string;
  uniqueId?: string;
  name: string;
  resourceType?: string;
  status: DbtRunHistoryStatus;
  executionTime?: number;
  message?: string;
  adapterResponse?: Record<string, unknown>;
  compiledSql?: string;
  relationName?: string;
}

export interface DbtRunHistoryEntry {
  id: string;
  sessionId?: string;
  invocationId?: string;
  projectId?: string;
  projectName: string;
  projectPath: string;
  command: string;
  args?: string;
  fullCommand: string;
  shellCommand?: string; // full shell command for copy-to-clipboard
  status: DbtRunHistoryStatus;
  startedAt: string;
  completedAt?: string;
  elapsedTime?: number;
  rawOutputExcerpt?: string;
  errorMessage?: string;
  artifactPath?: string;
  summary: {
    total: number;
    success: number;
    error: number;
    warn: number;
    skipped: number;
  };
  results?: DbtRunHistoryResult[];
}
