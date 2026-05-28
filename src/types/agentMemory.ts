export const MEMORY_KIND = {
  PROJECT_FACT: 'project_fact',
  CONNECTION_FACT: 'connection_fact',
  NOTEBOOK_FACT: 'notebook_fact',
  USER_PREFERENCE: 'user_preference',
  DECISION: 'decision',
  TASK_STATE: 'task_state',
  ERROR_RESOLUTION: 'error_resolution',
  QUERY_PATTERN: 'query_pattern',
  SCHEMA_FACT: 'schema_fact',
  DATABASE_METADATA: 'database_metadata',
  MANUAL: 'manual',
  DREAM_SUMMARY: 'dream_summary',
  REM_PATTERN: 'rem_pattern',
} as const;
export type MemoryKind = (typeof MEMORY_KIND)[keyof typeof MEMORY_KIND];

export type AgentMemoryScreenKey = 'project' | 'sql' | 'notebooks' | 'global';
export type AgentMemoryStatus = 'active' | 'archived' | 'stale';
export type AgentMemorySourceType =
  | 'manual'
  | 'agent_turn'
  | 'database_json'
  | 'notebook_metadata'
  | 'session_corpus'
  | 'short_term'
  | 'dreaming';

export interface AgentMemoryScope {
  screenKey: AgentMemoryScreenKey;
  projectId?: string | number | null;
  connectionId?: string | null;
  notebookId?: string | number | null;
  sourceProjectId?: string | number | null;
  includeGlobal?: boolean;
}

export interface AgentMemoryEntry {
  id: number;
  scopeKey: string;
  screenKey: AgentMemoryScreenKey;
  projectId: string | null;
  connectionId: string | null;
  notebookId: string | null;
  kind: MemoryKind | string;
  sourceType: AgentMemorySourceType | string;
  sourceId: string | null;
  title: string | null;
  content: string;
  summary: string | null;
  importance: number;
  confidence: number;
  status: AgentMemoryStatus | string;
  tags: string | null;
  metadata: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
  promotedAt: string | null;
  archived: number;
}

export interface NewAgentMemoryEntry {
  scopeKey?: string;
  screenKey?: AgentMemoryScreenKey;
  projectId?: string | number | null;
  connectionId?: string | null;
  notebookId?: string | number | null;
  kind: MemoryKind | string;
  sourceType?: AgentMemorySourceType | string;
  sourceId?: string | number | null;
  title?: string | null;
  content: string;
  summary?: string | null;
  importance?: number;
  confidence?: number;
  status?: AgentMemoryStatus | string;
  tags?: string[] | string | null;
  metadata?: Record<string, unknown> | string | null;
  promotedAt?: string | null;
}

export interface AgentMemoryListFilter extends Partial<AgentMemoryScope> {
  kind?: MemoryKind | string;
  sourceType?: AgentMemorySourceType | string;
  status?: AgentMemoryStatus | string;
  archived?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AgentMemorySearchRequest extends AgentMemoryScope {
  query: string;
  kind?: MemoryKind | string;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}

export interface AgentMemorySearchResult extends AgentMemoryEntry {
  score: number;
  matchSource: 'fts' | 'like';
}

export interface AgentMemoryStats {
  durableCount: number;
  activeCount: number;
  archivedCount: number;
  shortTermCount: number;
  databaseMetadataCount: number;
  lastDreamingRunAt: string | null;
  lastMetadataRefreshAt: string | null;
  fts5Available: boolean;
}

export type AgentMemoryRecoveryAction =
  | 'dedupe'
  | 'mark_orphans_stale'
  | 'rebuild_index'
  | 'refresh_metadata';

export interface AgentMemoryHealth {
  ok: boolean;
  healthScore: number;
  fts5Available: boolean;
  activeEntries: number;
  archivedEntries: number;
  shortTermEntries: number;
  staleEntries: number;
  orphanedEntries: number;
  duplicateEntries: number;
  durableEntries: number;
  healthSnapshotId: number | null;
  recoveryActions: AgentMemoryRecoveryAction[];
  issues: string[];
}

export interface AgentMemoryRecoveryRequest {
  action: AgentMemoryRecoveryAction;
  dryRun?: boolean;
}

export interface AgentMemoryRecoveryResult {
  action: AgentMemoryRecoveryAction;
  dryRun: boolean;
  changed: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface AgentMemoryContextRequest extends AgentMemoryScope {
  query?: string;
  maxEntries?: number;
  maxChars?: number;
}

export interface AgentMemoryCaptureTurnRequest extends AgentMemoryScope {
  conversationId: number;
  userMessageId?: number | null;
  assistantMessageId?: number | null;
  userMessage: string;
  assistantMessage?: string | null;
  toolInputs?: unknown[];
  toolOutputs?: unknown[];
}

export interface SessionCorpusIngestionRequest extends AgentMemoryScope {
  conversationId?: number | null;
  messageId?: number | null;
  role: string;
  snippet: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ShortTermRecallRequest extends AgentMemoryScope {
  sourceType: string;
  sourceId?: string | number | null;
  snippet: string;
  query?: string;
  score?: number;
  conceptTags?: string[];
  metadata?: Record<string, unknown>;
}

export interface AgentMemoryShortTermRecall {
  id: number;
  recallKey: string;
  scopeKey: string;
  screenKey: AgentMemoryScreenKey;
  projectId: string | null;
  connectionId: string | null;
  notebookId: string | null;
  sourceType: string;
  sourceId: string | null;
  snippet: string;
  recallCount: number;
  dailyCount: number;
  groundedCount: number;
  totalScore: number;
  maxScore: number;
  queryHashes: string | null;
  recallDays: string | null;
  conceptTags: string | null;
  claimHash: string | null;
  firstRecalledAt: string | null;
  lastRecalledAt: string | null;
  promotedAt: string | null;
  metadata: string | null;
}

export interface AgentMemoryShortTermRecallListFilter
  extends Partial<AgentMemoryScope> {
  sourceType?: string;
  minScore?: number;
  limit?: number;
  offset?: number;
}

export interface AgentMemoryRefreshResult {
  dryRun: boolean;
  upserted: number;
  entries: NewAgentMemoryEntry[];
}

export interface AgentMemoryUpdateEntryRequest {
  id: number;
  patch: Partial<NewAgentMemoryEntry>;
}

export interface AgentMemoryEntryIdRequest {
  id: number;
}

export type AgentMemoryDreamingTrigger =
  | 'manual'
  | 'startup'
  | 'scheduled'
  | 'post_turn'
  | string;

export type AgentMemoryDreamingStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | string;

export interface AgentMemoryDreamingRun {
  id: number;
  triggerType: AgentMemoryDreamingTrigger;
  startedAt: string | null;
  completedAt: string | null;
  status: AgentMemoryDreamingStatus;
  lightCount: number;
  remCount: number;
  promotedCount: number;
  errorMessage: string | null;
  metadata: string | null;
}

export interface AgentMemoryDreamingReport {
  id: number;
  runId: number | null;
  phase: string;
  dayBucket: string;
  content: string;
  metadata: string | null;
  createdAt: string | null;
}

export interface AgentMemoryDreamingRunNowResult {
  ok: boolean;
  notImplemented?: boolean;
  message?: string;
  runId?: number;
}

export interface AgentMemoryDreamingRunListFilter {
  triggerType?: AgentMemoryDreamingTrigger;
  status?: AgentMemoryDreamingStatus;
  limit?: number;
  offset?: number;
}

export interface AgentMemoryDreamingReportListFilter {
  runId?: number;
  phase?: string;
  dayBucket?: string;
  limit?: number;
  offset?: number;
}

export type AgentMemoryWikiCompileStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'error';

export interface AgentMemoryWikiSettings {
  enabled: boolean;
  vaultPath: string | null;
  debounceMs: number;
  includeDatabaseMetadata: boolean;
  includeManualMemories: boolean;
  includePromotedMemories: boolean;
  manualNoteImportEnabled: boolean;
}

/** Plan 38 Track A — Active Memory (Proactive Recall) settings. Default-off. */
export interface AgentMemoryActiveMemorySettings {
  /** Whether the proactive recall sub-agent runs before each main agent turn. */
  enabled: boolean;
  /** How much conversation history is sent to the sub-agent. */
  mode: 'message' | 'recent' | 'full';
  /** Hard timeout in ms before the sub-agent is abandoned (clamped 1000–60000). */
  timeoutMs: number;
  /** Maximum tokens of conversation history sent to the sub-agent (clamped 100–8000). */
  maxInputTokens: number;
  /** Whether sub-agent transcripts are stored in agent_memory_diagnostics. */
  persistTranscripts: boolean;
  /** How many diagnostic rows to keep when persistTranscripts is true. */
  transcriptRetention: number;
}

export interface AgentMemoryWikiState {
  id: number;
  scopeKey: string;
  projectId: string | null;
  connectionId: string | null;
  notebookId: string | null;
  filePath: string;
  status: AgentMemoryWikiCompileStatus | string;
  pendingReason: string | null;
  queuedAt: string | null;
  lastStartedAt: string | null;
  contentHash: string | null;
  lastCompiledAt: string | null;
  lastError: string | null;
  contradictionCount: number;
  metadata: string | null;
}

export interface AgentMemoryDiagnostic {
  id: number;
  conversationId: number | null;
  messageId: number | null;
  providerId: string | null;
  modelId: string | null;
  executionMs: number;
  promptTokens: number;
  completionTokens: number;
  promptPayload: string;
  completionPayload: string;
  recallKeysFound: string | null;
  createdAt: string;
}

export interface ActiveMemoryRecallRequest {
  conversationId: number;
  messageId: number;
  scopeKey: string;
  projectId: string | null;
  connectionId: string | null;
  notebookId: string | null;
  // History will be passed as a raw string or we'll fetch it from the database based on mode.
  // We'll pass the exact message objects from the agent turn.
}

export interface ActiveMemoryRecallResult {
  status: 'success' | 'skipped' | 'timeout' | 'error' | 'circuit_open';
  summary: string;
  sourceMemoryIds: number[];
  elapsedMs: number;
  diagnosticId?: number;
}
