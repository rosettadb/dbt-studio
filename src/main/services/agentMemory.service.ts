import crypto from 'crypto';
import MainDatabaseService from './mainDatabase.service';
import { loadDatabaseFile } from '../utils/fileHelper';
import { NotebooksService } from './notebooks.service';
import {
  AgentMemoryCaptureTurnRequest,
  AgentMemoryContextRequest,
  AgentMemoryDreamingReport,
  AgentMemoryDreamingReportListFilter,
  AgentMemoryDreamingRun,
  AgentMemoryDreamingRunListFilter,
  AgentMemoryEntry,
  AgentMemoryHealth,
  AgentMemoryListFilter,
  AgentMemoryRefreshResult,
  AgentMemoryScope,
  AgentMemoryScreenKey,
  AgentMemorySearchRequest,
  AgentMemorySearchResult,
  AgentMemoryStats,
  MEMORY_KIND,
  NewAgentMemoryEntry,
  SessionCorpusIngestionRequest,
  ShortTermRecallRequest,
} from '../../types/backend';

type SqlParams = Record<string, string | number | null>;

type RawAgentMemoryEntry = {
  id: number;
  scope_key: string;
  screen_key: AgentMemoryScreenKey;
  project_id: string | null;
  connection_id: string | null;
  notebook_id: string | null;
  kind: string;
  source_type: string;
  source_id: string | null;
  title: string | null;
  content: string;
  summary: string | null;
  importance: number;
  confidence: number;
  status: string;
  tags: string | null;
  metadata: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_accessed_at: string | null;
  access_count: number;
  promoted_at: string | null;
  archived: number;
};

type RawCount = { count: number };

type RawShortTermRecall = {
  id: number;
  recall_key: string;
  scope_key: string;
  screen_key: AgentMemoryScreenKey;
  project_id: string | null;
  connection_id: string | null;
  notebook_id: string | null;
  source_type: string;
  source_id: string | null;
  snippet: string;
  recall_count: number;
  daily_count: number;
  grounded_count: number;
  total_score: number;
  max_score: number;
  query_hashes: string | null;
  recall_days: string | null;
  concept_tags: string | null;
  claim_hash: string | null;
  first_recalled_at: string | null;
  last_recalled_at: string | null;
  promoted_at: string | null;
  metadata: string | null;
};

type RawAgentMemoryDreamingRun = {
  id: number;
  trigger_type: string;
  started_at: string | null;
  completed_at: string | null;
  status: string;
  light_count: number;
  rem_count: number;
  promoted_count: number;
  error_message: string | null;
  metadata: string | null;
};

type RawAgentMemoryDreamingReport = {
  id: number;
  run_id: number | null;
  phase: string;
  day_bucket: string;
  content: string;
  metadata: string | null;
  created_at: string | null;
};

const REDACT_KEYS = new Set([
  'password',
  'token',
  'apiKey',
  'api_key',
  'secret',
  'secretKey',
  'secret_key',
  'accessKey',
  'access_key',
  'privateKey',
  'private_key',
  'keyfile',
  'credentials',
  'credential',
  'authorization',
  'refreshToken',
  'refresh_token',
]);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_CONTEXT_ENTRIES = 8;
const DEFAULT_CONTEXT_CHARS = 6000;
const SHORT_TERM_CONTEXT_THRESHOLD = 0.6;

function normalizeId(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function clampNumber(value: number | undefined, fallback: number, max: number) {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.max(0, Math.min(max, Math.floor(value)));
}

function clampRatio(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.max(0, Math.min(1, value));
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeJsonStringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function toEntry(row: RawAgentMemoryEntry): AgentMemoryEntry {
  return {
    id: row.id,
    scopeKey: row.scope_key,
    screenKey: row.screen_key,
    projectId: row.project_id,
    connectionId: row.connection_id,
    notebookId: row.notebook_id,
    kind: row.kind,
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title,
    content: row.content,
    summary: row.summary,
    importance: row.importance,
    confidence: row.confidence,
    status: row.status,
    tags: row.tags,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAccessedAt: row.last_accessed_at,
    accessCount: row.access_count,
    promotedAt: row.promoted_at,
    archived: row.archived,
  };
}

function toDreamingRun(row: RawAgentMemoryDreamingRun): AgentMemoryDreamingRun {
  return {
    id: row.id,
    triggerType: row.trigger_type,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    lightCount: row.light_count,
    remCount: row.rem_count,
    promotedCount: row.promoted_count,
    errorMessage: row.error_message,
    metadata: row.metadata,
  };
}

function toDreamingReport(
  row: RawAgentMemoryDreamingReport,
): AgentMemoryDreamingReport {
  return {
    id: row.id,
    runId: row.run_id,
    phase: row.phase,
    dayBucket: row.day_bucket,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

function buildScopeKey(scope: AgentMemoryScope): string {
  const screenKey = scope.screenKey ?? 'global';
  const projectId = normalizeId(scope.projectId);
  const connectionId = normalizeId(scope.connectionId);
  const notebookId = normalizeId(scope.notebookId);

  if (notebookId) {
    return `connection:${connectionId ?? 'unknown'}:notebook:${notebookId}`;
  }
  if (projectId && connectionId) {
    return `project:${projectId}:connection:${connectionId}`;
  }
  if (projectId) {
    return `project:${projectId}`;
  }
  if (connectionId) {
    return `connection:${connectionId}`;
  }
  return screenKey;
}

function appendScopeWhere(
  scope: Partial<AgentMemoryScope>,
  params: SqlParams,
  alias = 'agent_memory_entries',
): string {
  const column = (name: string) => `${alias}.${name}`;
  const { screenKey } = scope;
  const projectId = normalizeId(scope.projectId);
  const sourceProjectId = normalizeId(scope.sourceProjectId);
  const connectionId = normalizeId(scope.connectionId);
  const notebookId = normalizeId(scope.notebookId);
  const includeGlobal = scope.includeGlobal !== false;

  if (notebookId && !connectionId) {
    throw new Error('Notebook memory scope requires connectionId');
  }

  const ors: string[] = [];

  if (screenKey === 'project') {
    if (projectId) {
      params.scopeProjectId = projectId;
      ors.push(`${column('project_id')} = @scopeProjectId`);
    }
    if (connectionId) {
      params.scopeConnectionId = connectionId;
      ors.push(
        `(${column('connection_id')} = @scopeConnectionId AND ${column(
          'project_id',
        )} IS NULL)`,
      );
    }
    if (projectId && connectionId) {
      params.scopeProjectConnectionKey = `project:${projectId}:connection:${connectionId}`;
      ors.push(`${column('scope_key')} = @scopeProjectConnectionKey`);
    }
  } else if (screenKey === 'sql') {
    if (connectionId) {
      params.scopeConnectionId = connectionId;
      ors.push(
        `(${column('connection_id')} = @scopeConnectionId AND ${column(
          'project_id',
        )} IS NULL)`,
      );
      ors.push(
        `(${column('screen_key')} = 'sql' AND ${column(
          'connection_id',
        )} = @scopeConnectionId)`,
      );
    }
  } else if (screenKey === 'notebooks') {
    if (connectionId && notebookId) {
      params.scopeConnectionId = connectionId;
      params.scopeNotebookId = notebookId;
      ors.push(
        `(${column('notebook_id')} = @scopeNotebookId AND ${column(
          'connection_id',
        )} = @scopeConnectionId)`,
      );
      ors.push(
        `(${column('connection_id')} = @scopeConnectionId AND ${column(
          'project_id',
        )} IS NULL AND ${column('notebook_id')} IS NULL)`,
      );
    } else if (connectionId) {
      params.scopeConnectionId = connectionId;
      ors.push(`${column('connection_id')} = @scopeConnectionId`);
    }
    if (sourceProjectId) {
      params.scopeSourceProjectId = sourceProjectId;
      ors.push(`${column('project_id')} = @scopeSourceProjectId`);
    }
  } else if (screenKey === 'global') {
    ors.push(`${column('screen_key')} = 'global'`);
  } else {
    if (projectId) {
      params.scopeProjectId = projectId;
      ors.push(`${column('project_id')} = @scopeProjectId`);
    }
    if (connectionId) {
      params.scopeConnectionId = connectionId;
      ors.push(`${column('connection_id')} = @scopeConnectionId`);
    }
    if (notebookId) {
      params.scopeNotebookId = notebookId;
      ors.push(`${column('notebook_id')} = @scopeNotebookId`);
    }
  }

  if (includeGlobal && screenKey !== 'global') {
    ors.push(`${column('screen_key')} = 'global'`);
  }

  return ors.length > 0 ? `(${ors.join(' OR ')})` : '1 = 1';
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

export default class AgentMemoryService {
  static buildScopeKey(scope: AgentMemoryScope): string {
    return buildScopeKey(scope);
  }

  static redactSensitiveFields<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactSensitiveFields(item)) as T;
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          REDACT_KEYS.has(key)
            ? '[REDACTED]'
            : this.redactSensitiveFields(item),
        ]),
      ) as T;
    }
    if (typeof value === 'string') {
      return this.redactSensitiveText(value) as T;
    }
    return value;
  }

  static redact<T>(value: T): T {
    return this.redactSensitiveFields(value);
  }

  static redactSensitiveText(value: string): string {
    return value.replace(
      /\b(password|token|api[_-]?key|secret|secret[_-]?key|access[_-]?key|private[_-]?key|authorization|refresh[_-]?token)\b\s*[:=]\s*([^\s,;]+)/gi,
      '$1: [REDACTED]',
    );
  }

  private static async getDb() {
    return MainDatabaseService.getSqliteDatabase();
  }

  private static async getConfigValue(key: string): Promise<string | null> {
    const db = await this.getDb();
    const row = db
      .prepare('SELECT value FROM agent_memory_config WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private static async setConfigValue(
    key: string,
    value: string,
  ): Promise<void> {
    const db = await this.getDb();
    db.prepare(
      `
        INSERT INTO agent_memory_config (key, value, updated_at)
        VALUES (@key, @value, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = datetime('now')
      `,
    ).run({ key, value });
  }

  private static async isFts5Available(): Promise<boolean> {
    const configured = await this.getConfigValue('fts5_available');
    if (configured === 'true') return true;
    if (configured === 'false') return false;

    const db = await this.getDb();
    try {
      db.prepare('SELECT rowid FROM agent_memory_fts LIMIT 1').all();
      await this.setConfigValue('fts5_available', 'true');
      return true;
    } catch {
      await this.setConfigValue('fts5_available', 'false');
      return false;
    }
  }

  private static async getEntryById(id: number): Promise<AgentMemoryEntry> {
    const db = await this.getDb();
    const row = db
      .prepare('SELECT * FROM agent_memory_entries WHERE id = ?')
      .get(id) as RawAgentMemoryEntry | undefined;
    if (!row) {
      throw new Error(`Memory entry ${id} not found`);
    }
    return toEntry(row);
  }

  private static entryWriteParams(
    input: NewAgentMemoryEntry,
    now: string,
  ): SqlParams {
    const scope: AgentMemoryScope = {
      screenKey: input.screenKey ?? 'global',
      projectId: input.projectId,
      connectionId: input.connectionId,
      notebookId: input.notebookId,
    };
    const metadata = this.redactSensitiveFields(input.metadata ?? null);
    const tags = Array.isArray(input.tags)
      ? JSON.stringify(input.tags)
      : (input.tags ?? null);

    return {
      scopeKey: input.scopeKey ?? buildScopeKey(scope),
      screenKey: scope.screenKey,
      projectId: normalizeId(input.projectId),
      connectionId: normalizeId(input.connectionId),
      notebookId: normalizeId(input.notebookId),
      kind: input.kind,
      sourceType: input.sourceType ?? 'manual',
      sourceId: normalizeId(input.sourceId),
      title: input.title ? this.redactSensitiveText(input.title) : null,
      content: this.redactSensitiveText(input.content),
      summary: input.summary ? this.redactSensitiveText(input.summary) : null,
      importance: clampRatio(input.importance, 0.5),
      confidence: clampRatio(input.confidence, 0.8),
      status: input.status ?? 'active',
      tags,
      metadata: safeJsonStringify(metadata),
      now,
      promotedAt: input.promotedAt ?? null,
    };
  }

  static async createEntry(
    input: NewAgentMemoryEntry,
  ): Promise<AgentMemoryEntry> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const result = db
      .prepare(
        `
          INSERT INTO agent_memory_entries (
            scope_key, screen_key, project_id, connection_id, notebook_id,
            kind, source_type, source_id, title, content, summary,
            importance, confidence, status, tags, metadata, created_at,
            updated_at, promoted_at, archived
          )
          VALUES (
            @scopeKey, @screenKey, @projectId, @connectionId, @notebookId,
            @kind, @sourceType, @sourceId, @title, @content, @summary,
            @importance, @confidence, @status, @tags, @metadata, @now,
            @now, @promotedAt, 0
          )
        `,
      )
      .run(this.entryWriteParams(input, now));

    return this.getEntryById(Number(result.lastInsertRowid));
  }

  static async updateEntry(
    id: number,
    patch: Partial<NewAgentMemoryEntry>,
  ): Promise<void> {
    const db = await this.getDb();
    const updates: string[] = [];
    const params: SqlParams = { id };

    const set = (
      column: string,
      key: string,
      value: string | number | null,
    ) => {
      updates.push(`${column} = @${key}`);
      params[key] = value;
    };

    if (patch.scopeKey !== undefined)
      set('scope_key', 'scopeKey', patch.scopeKey);
    if (patch.screenKey !== undefined)
      set('screen_key', 'screenKey', patch.screenKey);
    if (patch.projectId !== undefined)
      set('project_id', 'projectId', normalizeId(patch.projectId));
    if (patch.connectionId !== undefined)
      set('connection_id', 'connectionId', normalizeId(patch.connectionId));
    if (patch.notebookId !== undefined)
      set('notebook_id', 'notebookId', normalizeId(patch.notebookId));
    if (patch.kind !== undefined) set('kind', 'kind', patch.kind);
    if (patch.sourceType !== undefined)
      set('source_type', 'sourceType', patch.sourceType);
    if (patch.sourceId !== undefined)
      set('source_id', 'sourceId', normalizeId(patch.sourceId));
    if (patch.title !== undefined)
      set(
        'title',
        'title',
        patch.title ? this.redactSensitiveText(patch.title) : null,
      );
    if (patch.content !== undefined)
      set('content', 'content', this.redactSensitiveText(patch.content));
    if (patch.summary !== undefined)
      set(
        'summary',
        'summary',
        patch.summary ? this.redactSensitiveText(patch.summary) : null,
      );
    if (patch.importance !== undefined)
      set('importance', 'importance', clampRatio(patch.importance, 0.5));
    if (patch.confidence !== undefined)
      set('confidence', 'confidence', clampRatio(patch.confidence, 0.8));
    if (patch.status !== undefined) set('status', 'status', patch.status);
    if (patch.tags !== undefined) {
      set(
        'tags',
        'tags',
        Array.isArray(patch.tags) ? JSON.stringify(patch.tags) : patch.tags,
      );
    }
    if (patch.metadata !== undefined) {
      set(
        'metadata',
        'metadata',
        safeJsonStringify(this.redactSensitiveFields(patch.metadata)),
      );
    }
    if (patch.promotedAt !== undefined)
      set('promoted_at', 'promotedAt', patch.promotedAt);

    if (updates.length === 0) return;
    updates.push("updated_at = datetime('now')");

    db.prepare(
      `UPDATE agent_memory_entries SET ${updates.join(', ')} WHERE id = @id`,
    ).run(params);
  }

  static async archiveEntry(id: number): Promise<void> {
    const db = await this.getDb();
    db.prepare(
      `
        UPDATE agent_memory_entries
        SET archived = 1, status = 'archived', updated_at = datetime('now')
        WHERE id = ?
      `,
    ).run(id);
  }

  static async deleteEntry(id: number): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM agent_memory_entries WHERE id = ?').run(id);
  }

  static async listEntries(
    filter: AgentMemoryListFilter = {},
  ): Promise<AgentMemoryEntry[]> {
    const db = await this.getDb();
    const params: SqlParams = {};
    const where = ['1 = 1'];

    if (filter.archived === undefined) {
      where.push('archived = 0');
    } else {
      params.archived = filter.archived ? 1 : 0;
      where.push('archived = @archived');
    }
    if (filter.kind) {
      params.kind = filter.kind;
      where.push('kind = @kind');
    }
    if (filter.sourceType) {
      params.sourceType = filter.sourceType;
      where.push('source_type = @sourceType');
    }
    if (filter.status) {
      params.status = filter.status;
      where.push('status = @status');
    }
    if (
      filter.screenKey ||
      filter.projectId !== undefined ||
      filter.connectionId !== undefined ||
      filter.notebookId !== undefined ||
      filter.sourceProjectId !== undefined
    ) {
      where.push(appendScopeWhere(filter, params));
    }
    if (filter.search?.trim()) {
      params.likeQuery = `%${escapeLike(filter.search.trim())}%`;
      where.push(
        `(title LIKE @likeQuery ESCAPE '\\' OR content LIKE @likeQuery ESCAPE '\\' OR summary LIKE @likeQuery ESCAPE '\\' OR tags LIKE @likeQuery ESCAPE '\\')`,
      );
    }

    const limit = clampNumber(filter.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const offset = clampNumber(filter.offset, 0, Number.MAX_SAFE_INTEGER);
    params.limit = limit;
    params.offset = offset;

    const rows = db
      .prepare(
        `
          SELECT *
          FROM agent_memory_entries
          WHERE ${where.join(' AND ')}
          ORDER BY importance DESC, updated_at DESC, id DESC
          LIMIT @limit OFFSET @offset
        `,
      )
      .all(params) as RawAgentMemoryEntry[];

    return rows.map(toEntry);
  }

  private static sanitizeFtsQuery(query: string): string {
    const terms = query
      .trim()
      .split(/\s+/)
      .map((term) => term.replace(/[^A-Za-z0-9_-]/g, ''))
      .filter(Boolean)
      .slice(0, 12);
    return terms.length > 0
      ? terms.map((term) => `"${term}"`).join(' OR ')
      : '';
  }

  static async searchEntries(
    req: AgentMemorySearchRequest,
  ): Promise<AgentMemorySearchResult[]> {
    const query = req.query.trim();
    if (!query) {
      const entries = await this.listEntries({
        ...req,
        archived: req.includeArchived,
      });
      return entries.map((entry) => ({
        ...entry,
        score: entry.importance,
        matchSource: 'like',
      }));
    }

    const useFts = await this.isFts5Available();
    if (useFts) {
      try {
        return await this.searchEntriesWithFts(req);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[AgentMemory] FTS search failed; falling back:', error);
      }
    }
    return this.searchEntriesWithLike(req);
  }

  private static async searchEntriesWithFts(
    req: AgentMemorySearchRequest,
  ): Promise<AgentMemorySearchResult[]> {
    const db = await this.getDb();
    const params: SqlParams = {
      ftsQuery: this.sanitizeFtsQuery(req.query),
      limit: clampNumber(req.limit, DEFAULT_LIMIT, MAX_LIMIT),
      offset: clampNumber(req.offset, 0, Number.MAX_SAFE_INTEGER),
    };
    if (!params.ftsQuery) return this.searchEntriesWithLike(req);

    const where = [appendScopeWhere(req, params, 'e')];
    if (!req.includeArchived) where.push('e.archived = 0');
    if (req.kind) {
      params.kind = req.kind;
      where.push('e.kind = @kind');
    }

    const rows = db
      .prepare(
        `
          SELECT e.*, bm25(agent_memory_fts) AS score
          FROM agent_memory_fts
          JOIN agent_memory_entries e ON e.id = agent_memory_fts.rowid
          WHERE agent_memory_fts MATCH @ftsQuery
            AND ${where.join(' AND ')}
          ORDER BY score ASC, e.importance DESC, e.updated_at DESC
          LIMIT @limit OFFSET @offset
        `,
      )
      .all(params) as Array<RawAgentMemoryEntry & { score: number }>;

    return rows.map((row) => ({
      ...toEntry(row),
      score: row.score,
      matchSource: 'fts',
    }));
  }

  private static async searchEntriesWithLike(
    req: AgentMemorySearchRequest,
  ): Promise<AgentMemorySearchResult[]> {
    const db = await this.getDb();
    const params: SqlParams = {
      likeQuery: `%${escapeLike(req.query.trim())}%`,
      limit: clampNumber(req.limit, DEFAULT_LIMIT, MAX_LIMIT),
      offset: clampNumber(req.offset, 0, Number.MAX_SAFE_INTEGER),
    };
    const where = [
      appendScopeWhere(req, params),
      `(title LIKE @likeQuery ESCAPE '\\' OR content LIKE @likeQuery ESCAPE '\\' OR summary LIKE @likeQuery ESCAPE '\\' OR tags LIKE @likeQuery ESCAPE '\\')`,
    ];
    if (!req.includeArchived) where.push('archived = 0');
    if (req.kind) {
      params.kind = req.kind;
      where.push('kind = @kind');
    }

    const rows = db
      .prepare(
        `
          SELECT *
          FROM agent_memory_entries
          WHERE ${where.join(' AND ')}
          ORDER BY importance DESC, confidence DESC, updated_at DESC
          LIMIT @limit OFFSET @offset
        `,
      )
      .all(params) as RawAgentMemoryEntry[];

    return rows.map((row) => ({
      ...toEntry(row),
      score: row.importance,
      matchSource: 'like',
    }));
  }

  static async rebuildIndex(): Promise<void> {
    const db = await this.getDb();
    try {
      db.prepare(
        "INSERT INTO agent_memory_fts(agent_memory_fts) VALUES('rebuild')",
      ).run();
      await this.setConfigValue('fts5_available', 'true');
    } catch (error) {
      await this.setConfigValue('fts5_available', 'false');
      throw error;
    }
  }

  static async getStats(): Promise<AgentMemoryStats> {
    const db = await this.getDb();
    const countOne = (sql: string): number =>
      (db.prepare(sql).get() as RawCount | undefined)?.count ?? 0;
    const fts5Available = await this.isFts5Available();

    return {
      durableCount: countOne(
        'SELECT COUNT(*) AS count FROM agent_memory_entries WHERE archived = 0',
      ),
      activeCount: countOne(
        "SELECT COUNT(*) AS count FROM agent_memory_entries WHERE archived = 0 AND status = 'active'",
      ),
      archivedCount: countOne(
        'SELECT COUNT(*) AS count FROM agent_memory_entries WHERE archived = 1',
      ),
      shortTermCount: countOne(
        'SELECT COUNT(*) AS count FROM agent_memory_short_term_recall WHERE promoted_at IS NULL',
      ),
      databaseMetadataCount: countOne(
        "SELECT COUNT(*) AS count FROM agent_memory_entries WHERE kind = 'database_metadata' AND archived = 0",
      ),
      lastDreamingRunAt: await this.getConfigValue('last_dreaming_run_at'),
      lastMetadataRefreshAt: await this.getConfigValue(
        'last_metadata_refresh_at',
      ),
      fts5Available,
    };
  }

  static async listDreamingRuns(
    filter: AgentMemoryDreamingRunListFilter = {},
  ): Promise<AgentMemoryDreamingRun[]> {
    const db = await this.getDb();
    const params: SqlParams = {};
    const where = ['1 = 1'];

    if (filter.triggerType) {
      params.triggerType = filter.triggerType;
      where.push('trigger_type = @triggerType');
    }
    if (filter.status) {
      params.status = filter.status;
      where.push('status = @status');
    }

    params.limit = clampNumber(filter.limit, DEFAULT_LIMIT, MAX_LIMIT);
    params.offset = clampNumber(filter.offset, 0, Number.MAX_SAFE_INTEGER);

    const rows = db
      .prepare(
        `
          SELECT *
          FROM agent_memory_dreaming_runs
          WHERE ${where.join(' AND ')}
          ORDER BY started_at DESC, id DESC
          LIMIT @limit OFFSET @offset
        `,
      )
      .all(params) as RawAgentMemoryDreamingRun[];

    return rows.map(toDreamingRun);
  }

  static async listDreamingReports(
    filter: AgentMemoryDreamingReportListFilter = {},
  ): Promise<AgentMemoryDreamingReport[]> {
    const db = await this.getDb();
    const params: SqlParams = {};
    const where = ['1 = 1'];

    if (filter.runId !== undefined) {
      params.runId = filter.runId;
      where.push('run_id = @runId');
    }
    if (filter.phase) {
      params.phase = filter.phase;
      where.push('phase = @phase');
    }
    if (filter.dayBucket) {
      params.dayBucket = filter.dayBucket;
      where.push('day_bucket = @dayBucket');
    }

    params.limit = clampNumber(filter.limit, DEFAULT_LIMIT, MAX_LIMIT);
    params.offset = clampNumber(filter.offset, 0, Number.MAX_SAFE_INTEGER);

    const rows = db
      .prepare(
        `
          SELECT *
          FROM agent_memory_dreaming_reports
          WHERE ${where.join(' AND ')}
          ORDER BY created_at DESC, id DESC
          LIMIT @limit OFFSET @offset
        `,
      )
      .all(params) as RawAgentMemoryDreamingReport[];

    return rows.map(toDreamingReport);
  }

  static async refreshDatabaseJsonMemory(
    opts: { dryRun?: boolean } = {},
  ): Promise<AgentMemoryRefreshResult> {
    const dbFile = await loadDatabaseFile();
    const connections = dbFile.connections ?? [];
    const projects = dbFile.projects ?? [];
    const connectionEntries: NewAgentMemoryEntry[] = connections.map((conn) => {
      const linkedProjects = projects.filter((p) => p.connectionId === conn.id);
      const sanitizedConnection = this.redactSensitiveFields(conn.connection);
      const details = sanitizedConnection as Record<string, unknown>;
      const usefulDetails = [
        details.host && `host: ${details.host}`,
        details.account && `account: ${details.account}`,
        details.project && `project: ${details.project}`,
        details.database && `database: ${details.database}`,
        details.schema && `schema: ${details.schema}`,
        details.dataset && `dataset: ${details.dataset}`,
        details.warehouse && `warehouse: ${details.warehouse}`,
        details.role && `role: ${details.role}`,
      ].filter(Boolean);

      return {
        scopeKey: `connection:${conn.id}`,
        screenKey: 'global',
        connectionId: conn.id,
        kind: MEMORY_KIND.DATABASE_METADATA,
        sourceType: 'database_json',
        sourceId: `connection:${conn.id}`,
        title: `Connection: ${conn.connection.name} (${conn.connection.type})`,
        content: [
          `Connection "${conn.connection.name}" (type: ${conn.connection.type}).`,
          usefulDetails.length > 0
            ? `Details: ${usefulDetails.join(', ')}.`
            : '',
          `Used by projects: ${
            linkedProjects.map((p) => p.name).join(', ') || 'none'
          }.`,
        ]
          .filter(Boolean)
          .join(' '),
        importance: 0.9,
        confidence: 1,
        metadata: { connection: sanitizedConnection },
      };
    });

    const projectEntries: NewAgentMemoryEntry[] = projects.flatMap(
      (project) => {
        const connection = connections.find(
          (conn) => conn.id === project.connectionId,
        );
        const rows: NewAgentMemoryEntry[] = [
          {
            scopeKey: `project:${project.id}`,
            screenKey: 'project',
            projectId: project.id,
            connectionId: project.connectionId ?? null,
            kind: MEMORY_KIND.DATABASE_METADATA,
            sourceType: 'database_json',
            sourceId: `project:${project.id}`,
            title: `Project: ${project.name}`,
            content: `Project "${project.name}" at path "${project.path}". Connection: ${
              connection?.connection.name ?? 'none'
            }.`,
            importance: 0.95,
            confidence: 1,
            metadata: this.redactSensitiveFields({
              path: project.path,
              connectionId: project.connectionId,
            }),
          },
        ];

        if (project.connectionId && connection) {
          rows.push({
            scopeKey: `project:${project.id}:connection:${connection.id}`,
            screenKey: 'project',
            projectId: project.id,
            connectionId: connection.id,
            kind: MEMORY_KIND.DATABASE_METADATA,
            sourceType: 'database_json',
            sourceId: `project_connection:${project.id}:${connection.id}`,
            title: `${project.name} -> ${connection.connection.name}`,
            content: `Project "${project.name}" is linked to connection "${connection.connection.name}" (${connection.connection.type}).`,
            importance: 0.9,
            confidence: 1,
            metadata: { projectId: project.id, connectionId: connection.id },
          });
        }

        return rows;
      },
    );

    const notebookEntryGroups = await Promise.all(
      connections.map(async (conn): Promise<NewAgentMemoryEntry[]> => {
        try {
          const notebooks = await NotebooksService.listNotebooks(conn.id);
          return notebooks.map((notebook) => ({
            scopeKey: `connection:${conn.id}:notebook:${notebook.id}`,
            screenKey: 'notebooks',
            connectionId: conn.id,
            notebookId: notebook.id,
            kind: MEMORY_KIND.DATABASE_METADATA,
            sourceType: 'notebook_metadata',
            sourceId: `notebook:${conn.id}:${notebook.id}`,
            title: `Notebook: ${notebook.name}`,
            content: `Notebook "${notebook.name}" on connection "${conn.connection.name}". ${notebook.cellCount} cells. Updated: ${notebook.updatedAt}.`,
            importance: 0.8,
            confidence: 1,
            metadata: {
              connectionId: conn.id,
              notebookId: notebook.id,
              description: notebook.description,
            },
          }));
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(
            '[AgentMemory] notebook metadata refresh failed:',
            error,
          );
          return [];
        }
      }),
    );

    const entries = [
      ...connectionEntries,
      ...projectEntries,
      ...notebookEntryGroups.flat(),
    ];

    if (opts.dryRun) {
      return { dryRun: true, upserted: 0, entries };
    }

    const db = await this.getDb();
    const selectExisting = db.prepare(
      `
        SELECT id FROM agent_memory_entries
        WHERE source_type = @sourceType AND source_id = @sourceId
      `,
    );
    const insertEntry = db.prepare(
      `
        INSERT INTO agent_memory_entries (
          scope_key, screen_key, project_id, connection_id, notebook_id,
          kind, source_type, source_id, title, content, summary,
          importance, confidence, status, tags, metadata, created_at,
          updated_at, promoted_at, archived
        )
        VALUES (
          @scopeKey, @screenKey, @projectId, @connectionId, @notebookId,
          @kind, @sourceType, @sourceId, @title, @content, @summary,
          @importance, @confidence, @status, @tags, @metadata, @now,
          @now, @promotedAt, 0
        )
      `,
    );
    const updateEntry = db.prepare(
      `
        UPDATE agent_memory_entries
        SET scope_key = @scopeKey,
            screen_key = @screenKey,
            project_id = @projectId,
            connection_id = @connectionId,
            notebook_id = @notebookId,
            kind = @kind,
            source_type = @sourceType,
            source_id = @sourceId,
            title = @title,
            content = @content,
            summary = @summary,
            importance = @importance,
            confidence = @confidence,
            status = @status,
            tags = @tags,
            metadata = @metadata,
            updated_at = @now,
            promoted_at = @promotedAt,
            archived = 0
        WHERE id = @id
      `,
    );

    const now = new Date().toISOString();
    const upsertMetadata = db.transaction((items: NewAgentMemoryEntry[]) => {
      items.forEach((entry) => {
        const params = this.entryWriteParams(entry, now);
        const existing = selectExisting.get({
          sourceType: params.sourceType,
          sourceId: params.sourceId,
        }) as { id: number } | undefined;

        if (existing) {
          updateEntry.run({ ...params, id: existing.id });
        } else {
          insertEntry.run(params);
        }
      });
    });

    upsertMetadata(entries);

    await this.setConfigValue(
      'last_metadata_refresh_at',
      new Date().toISOString(),
    );

    return { dryRun: false, upserted: entries.length, entries };
  }

  static async buildMemoryContext(
    req: AgentMemoryContextRequest,
  ): Promise<string> {
    const maxEntries = clampNumber(
      req.maxEntries,
      DEFAULT_CONTEXT_ENTRIES,
      MAX_LIMIT,
    );
    const maxChars = clampNumber(req.maxChars, DEFAULT_CONTEXT_CHARS, 50_000);
    const metadata = await this.listEntries({
      ...req,
      kind: MEMORY_KIND.DATABASE_METADATA,
      limit: maxEntries,
    });
    const durable = req.query?.trim()
      ? await this.searchEntries({
          ...req,
          query: req.query,
          limit: maxEntries,
        })
      : await this.listEntries({ ...req, limit: maxEntries });

    const seen = new Set<number>();
    const selectedMetadata = metadata.filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
    const selectedDurable = durable.filter((entry) => {
      if (entry.kind === MEMORY_KIND.DATABASE_METADATA || seen.has(entry.id)) {
        return false;
      }
      seen.add(entry.id);
      return true;
    });
    const shortTerm = await this.listShortTermForContext(req, maxEntries);

    const entryIds = [...selectedMetadata, ...selectedDurable].map(
      (entry) => entry.id,
    );
    if (entryIds.length > 0) {
      await this.markAccessed(entryIds);
    }

    const sections: string[] = [];
    if (selectedMetadata.length > 0) {
      sections.push(
        [
          '### Active Context',
          ...selectedMetadata.map(
            (entry) =>
              `- [${entry.kind}] ${entry.title ?? 'Memory'}: ${truncate(
                entry.summary ?? entry.content,
                500,
              )}`,
          ),
        ].join('\n'),
      );
    }
    if (selectedDurable.length > 0) {
      sections.push(
        [
          '### Durable Memory',
          ...selectedDurable.map(
            (entry) =>
              `- [${entry.kind}] ${entry.title ?? 'Memory'}: ${truncate(
                entry.summary ?? entry.content,
                500,
              )}`,
          ),
        ].join('\n'),
      );
    }
    if (shortTerm.length > 0) {
      sections.push(
        [
          '### Recent Recall',
          ...shortTerm.map(
            (entry) =>
              `- [candidate] ${truncate(
                entry.snippet,
                400,
              )} (score ${entry.max_score.toFixed(2)})`,
          ),
        ].join('\n'),
      );
    }

    return truncate(sections.join('\n\n'), maxChars);
  }

  private static async listShortTermForContext(
    scope: AgentMemoryScope,
    limit: number,
  ): Promise<RawShortTermRecall[]> {
    const db = await this.getDb();
    const params: SqlParams = {
      threshold: SHORT_TERM_CONTEXT_THRESHOLD,
      limit,
    };
    const where = [
      appendScopeWhere(scope, params, 'agent_memory_short_term_recall'),
      'promoted_at IS NULL',
      'max_score >= @threshold',
    ];

    return db
      .prepare(
        `
          SELECT *
          FROM agent_memory_short_term_recall
          WHERE ${where.join(' AND ')}
          ORDER BY max_score DESC, recall_count DESC, last_recalled_at DESC
          LIMIT @limit
        `,
      )
      .all(params) as RawShortTermRecall[];
  }

  private static async markAccessed(ids: number[]): Promise<void> {
    const db = await this.getDb();
    const placeholders = ids.map((_, idx) => `@id${idx}`).join(', ');
    const params = Object.fromEntries(ids.map((id, idx) => [`id${idx}`, id]));
    db.prepare(
      `
        UPDATE agent_memory_entries
        SET access_count = access_count + 1,
            last_accessed_at = datetime('now')
        WHERE id IN (${placeholders})
      `,
    ).run(params);
  }

  static async ingestSessionCorpus(
    req: SessionCorpusIngestionRequest,
  ): Promise<void> {
    const db = await this.getDb();
    const createdAt = req.createdAt ?? new Date().toISOString();
    const messageHash = sha256(
      `${req.conversationId ?? 'none'}:${req.messageId ?? 'none'}:${req.role}`,
    );
    const snippet = truncate(this.redactSensitiveText(req.snippet), 280);

    db.prepare(
      `
        INSERT OR IGNORE INTO agent_memory_session_corpus (
          conversation_id, message_id, day_bucket, screen_key, project_id,
          connection_id, notebook_id, role, snippet, message_hash,
          token_estimate, metadata, created_at
        )
        VALUES (
          @conversationId, @messageId, @dayBucket, @screenKey, @projectId,
          @connectionId, @notebookId, @role, @snippet, @messageHash,
          @tokenEstimate, @metadata, @createdAt
        )
      `,
    ).run({
      conversationId: req.conversationId ?? null,
      messageId: req.messageId ?? null,
      dayBucket: createdAt.slice(0, 10),
      screenKey: req.screenKey,
      projectId: normalizeId(req.projectId),
      connectionId: normalizeId(req.connectionId),
      notebookId: normalizeId(req.notebookId),
      role: req.role,
      snippet,
      messageHash,
      tokenEstimate: Math.ceil(snippet.length / 4),
      metadata: safeJsonStringify(this.redactSensitiveFields(req.metadata)),
      createdAt,
    });

    await this.recordShortTermRecall({
      ...req,
      sourceType: 'session_corpus',
      sourceId: messageHash,
      snippet,
      score: 0.3,
    });
  }

  static async recordShortTermRecall(
    req: ShortTermRecallRequest,
  ): Promise<void> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const scopeKey = buildScopeKey(req);
    const snippet = truncate(this.redactSensitiveText(req.snippet), 500);
    const recallKey = sha256(
      `${scopeKey}:${req.sourceType}:${normalizeId(req.sourceId) ?? ''}:${snippet}`,
    );
    const existing = db
      .prepare(
        'SELECT * FROM agent_memory_short_term_recall WHERE recall_key = ?',
      )
      .get(recallKey) as RawShortTermRecall | undefined;
    const queryHash = req.query ? sha256(req.query) : null;
    const recallDay = now.slice(0, 10);
    const queryHashes = new Set(parseJsonArray(existing?.query_hashes ?? null));
    const recallDays = new Set(parseJsonArray(existing?.recall_days ?? null));
    if (queryHash) queryHashes.add(queryHash);
    recallDays.add(recallDay);

    if (existing) {
      const totalScore = existing.total_score + (req.score ?? 0.3);
      db.prepare(
        `
          UPDATE agent_memory_short_term_recall
          SET recall_count = recall_count + 1,
              total_score = @totalScore,
              max_score = @maxScore,
              query_hashes = @queryHashes,
              recall_days = @recallDays,
              last_recalled_at = @now,
              metadata = @metadata
          WHERE recall_key = @recallKey
        `,
      ).run({
        recallKey,
        totalScore,
        maxScore: Math.max(existing.max_score, req.score ?? 0.3),
        queryHashes: JSON.stringify(Array.from(queryHashes)),
        recallDays: JSON.stringify(Array.from(recallDays)),
        now,
        metadata: safeJsonStringify(this.redactSensitiveFields(req.metadata)),
      });
      return;
    }

    db.prepare(
      `
        INSERT INTO agent_memory_short_term_recall (
          recall_key, scope_key, screen_key, project_id, connection_id,
          notebook_id, source_type, source_id, snippet, recall_count,
          total_score, max_score, query_hashes, recall_days, first_recalled_at,
          last_recalled_at, metadata
        )
        VALUES (
          @recallKey, @scopeKey, @screenKey, @projectId, @connectionId,
          @notebookId, @sourceType, @sourceId, @snippet, 1,
          @score, @score, @queryHashes, @recallDays, @now, @now, @metadata
        )
      `,
    ).run({
      recallKey,
      scopeKey,
      screenKey: req.screenKey,
      projectId: normalizeId(req.projectId),
      connectionId: normalizeId(req.connectionId),
      notebookId: normalizeId(req.notebookId),
      sourceType: req.sourceType,
      sourceId: normalizeId(req.sourceId),
      snippet,
      score: req.score ?? 0.3,
      queryHashes: JSON.stringify(Array.from(queryHashes)),
      recallDays: JSON.stringify(Array.from(recallDays)),
      now,
      metadata: safeJsonStringify(this.redactSensitiveFields(req.metadata)),
    });
  }

  static async captureTurn(req: AgentMemoryCaptureTurnRequest): Promise<void> {
    const rememberMatch = /\bremember\b[:\s-]*(.+)?/is.exec(req.userMessage);
    if (rememberMatch) {
      const content = (rememberMatch[1] ?? req.userMessage).trim();
      if (content) {
        await this.createEntry({
          ...req,
          kind: MEMORY_KIND.MANUAL,
          sourceType: 'manual',
          sourceId: `conversation:${req.conversationId}:message:${
            req.userMessageId ?? 'unknown'
          }`,
          title: 'Manual memory',
          content,
          importance: 0.8,
          confidence: 0.9,
          metadata: {
            conversationId: req.conversationId,
            userMessageId: req.userMessageId,
          },
        });
      }
      return;
    }

    await this.ingestSessionCorpus({
      ...req,
      messageId: req.userMessageId,
      role: 'user',
      snippet: req.userMessage,
      metadata: { conversationId: req.conversationId },
    });

    if (req.assistantMessage) {
      await this.ingestSessionCorpus({
        ...req,
        messageId: req.assistantMessageId,
        role: 'assistant',
        snippet: req.assistantMessage,
        metadata: {
          conversationId: req.conversationId,
          toolInputs: this.redactSensitiveFields(req.toolInputs ?? []),
          toolOutputs: this.redactSensitiveFields(req.toolOutputs ?? []),
        },
      });
    }
  }

  static async getHealth(): Promise<AgentMemoryHealth> {
    const db = await this.getDb();
    const stats = await this.getStats();
    const countOne = (sql: string): number =>
      (db.prepare(sql).get() as RawCount | undefined)?.count ?? 0;
    const issues: string[] = [];
    if (!stats.fts5Available) {
      issues.push('FTS5 unavailable; LIKE fallback will be used.');
    }

    return {
      ok: issues.length === 0,
      fts5Available: stats.fts5Available,
      activeEntries: stats.activeCount,
      archivedEntries: stats.archivedCount,
      shortTermEntries: stats.shortTermCount,
      staleEntries: countOne(
        "SELECT COUNT(*) AS count FROM agent_memory_entries WHERE status = 'stale'",
      ),
      // TODO(P6): compute orphaned entries once scheduler/metadata recovery exists.
      orphanedEntries: 0,
      issues,
    };
  }
}
