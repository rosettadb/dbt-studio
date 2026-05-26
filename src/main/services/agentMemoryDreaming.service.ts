/* eslint-disable no-restricted-syntax, no-await-in-loop */
import crypto from 'crypto';
import MainDatabaseService from './mainDatabase.service';
import AgentMemoryService from './agentMemory.service';
import type {
  AgentMemoryDreamingRun,
  AgentMemoryDreamingTrigger,
  AgentMemoryScreenKey,
  MemoryKind,
  NewAgentMemoryEntry,
} from '../../types/backend';
import { MEMORY_KIND } from '../../types/backend';

type RawDreamingMessage = {
  id: number;
  conversation_id: number;
  role: string;
  content: string;
  created_at: string | null;
  screen_key: string | null;
  project_id: string | number | null;
  connection_id: string | null;
};

type RawDreamingRun = {
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

type RawPhaseSignal = {
  recall_key: string;
  hit_count: number;
};

export interface LightDreamingResult {
  processedMessages: number;
  insertedCorpus: number;
  recalledCandidates: number;
  skippedMessages: number;
}

export interface RemDreamingResult {
  evaluatedCandidates: number;
  clusters: number;
  signalsRecorded: number;
  skippedCandidates: number;
}

export interface DeepPromotionResult {
  evaluatedClusters: number;
  promotedMemories: number;
  promotedCandidates: number;
  skippedClusters: number;
}

type RemCluster = {
  key: string;
  sourceId: string;
  scopeKey: string;
  screenKey: AgentMemoryScreenKey;
  projectId: string | null;
  connectionId: string | null;
  notebookId: string | null;
  kind: MemoryKind;
  category: string;
  label: string;
  tags: string[];
  rows: RawShortTermRecall[];
  uniqueEvidenceKeys: Set<string>;
  totalRecallCount: number;
  maxScore: number;
  averageScore: number;
  firstRecalledAt: string | null;
  lastRecalledAt: string | null;
};

const MAX_MESSAGES_PER_SWEEP = 240;
const MAX_SNIPPET_CHARS = 280;
const MIN_USEFUL_SNIPPET_CHARS = 24;
const DEEP_PROMOTION_MIN_RECALLS = 3;
const DEEP_PROMOTION_MIN_UNIQUE_EVIDENCE = 3;
const DEEP_PROMOTION_MAX_AGE_DAYS = 30;
const DEEP_PROMOTION_MIN_SCORE = 0.8;
const DEEP_PROMOTION_LOOKBACK_DAYS = 30;
const REM_PHASE_PREFIX = 'rem';

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeId(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function asScreenKey(value: string | null): AgentMemoryScreenKey {
  if (value === 'sql' || value === 'notebooks' || value === 'project') {
    return value;
  }
  return 'project';
}

function normalizeTimestamp(value: string | null): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return value;
}

function dayBucketFromTimestamp(value: string): string {
  return value.slice(0, 10);
}

function toDreamingRun(row: RawDreamingRun): AgentMemoryDreamingRun {
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

function isUsefulSnippet(snippet: string): boolean {
  const normalized = snippet.replace(/\s+/g, ' ').trim();
  if (normalized.length < MIN_USEFUL_SNIPPET_CHARS) return false;
  if (!/[A-Za-z0-9]/.test(normalized)) return false;
  return true;
}

function scoreSnippet(snippet: string, role: string): number {
  const durableSignal =
    /\b(error|failed|fix|schema|model|dbt|sql|table|column|connection|notebook|decision|prefer|always|never|convention)\b/i.test(
      snippet,
    );
  const base = role === 'user' ? 0.42 : 0.34;
  return Math.min(0.7, base + (durableSignal ? 0.14 : 0));
}

function extractConceptTags(snippet: string): string[] {
  const tags = new Set<string>();
  const tagRules: Array<[RegExp, string]> = [
    [/\bdbt\b/i, 'dbt'],
    [/\bsql\b|\bquery\b/i, 'sql'],
    [/\bmodel\b|\bmodels\b/i, 'modeling'],
    [/\bschema\b|\btable\b|\bcolumn\b/i, 'schema'],
    [/\berror\b|\bfailed\b|\bfix\b/i, 'troubleshooting'],
    [/\bconnection\b|\bdatabase\b|\bwarehouse\b/i, 'connection'],
    [/\bnotebook\b|\bcell\b/i, 'notebook'],
    [/\balways\b|\bnever\b|\bprefer\b|\bconvention\b/i, 'preference'],
  ];

  tagRules.forEach(([pattern, tag]) => {
    if (pattern.test(snippet)) tags.add(tag);
  });

  return Array.from(tags).slice(0, 6);
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

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function timestampMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function ageDays(value: string | null): number {
  const parsed = timestampMs(value);
  if (parsed === null) return 0;
  return Math.max(0, (Date.now() - parsed) / (24 * 60 * 60 * 1000));
}

function normalizeTags(row: RawShortTermRecall): string[] {
  return Array.from(
    new Set(parseJsonArray(row.concept_tags).map((tag) => tag.toLowerCase())),
  ).sort();
}

function hasAnyTag(tags: string[], expected: string[]): boolean {
  return expected.some((tag) => tags.includes(tag));
}

function classifyMemoryKind(
  row: RawShortTermRecall,
  tags: string[],
): MemoryKind | null {
  const { snippet } = row;
  if (
    hasAnyTag(tags, ['preference']) ||
    /\b(always|never|prefer|preference|convention)\b/i.test(snippet)
  ) {
    return MEMORY_KIND.USER_PREFERENCE;
  }
  if (
    hasAnyTag(tags, ['troubleshooting']) ||
    /\b(error|failed|failure|fix|resolved|workaround)\b/i.test(snippet)
  ) {
    return MEMORY_KIND.ERROR_RESOLUTION;
  }
  if (/\b(decided|decision|chosen|standardize|standardized)\b/i.test(snippet)) {
    return MEMORY_KIND.DECISION;
  }
  if (hasAnyTag(tags, ['sql'])) {
    return MEMORY_KIND.QUERY_PATTERN;
  }
  if (hasAnyTag(tags, ['schema', 'modeling'])) {
    return MEMORY_KIND.SCHEMA_FACT;
  }
  if (hasAnyTag(tags, ['connection'])) {
    return MEMORY_KIND.CONNECTION_FACT;
  }
  if (hasAnyTag(tags, ['notebook']) || row.screen_key === 'notebooks') {
    return MEMORY_KIND.NOTEBOOK_FACT;
  }
  if (row.screen_key === 'project') {
    return MEMORY_KIND.PROJECT_FACT;
  }
  return tags.length > 0 ? MEMORY_KIND.REM_PATTERN : null;
}

function categoryForKind(kind: MemoryKind): string {
  if (kind === MEMORY_KIND.USER_PREFERENCE) return 'preference';
  if (kind === MEMORY_KIND.ERROR_RESOLUTION) return 'error_resolution';
  if (kind === MEMORY_KIND.QUERY_PATTERN) return 'query_pattern';
  if (kind === MEMORY_KIND.SCHEMA_FACT) return 'schema_fact';
  if (kind === MEMORY_KIND.CONNECTION_FACT) return 'connection_fact';
  if (kind === MEMORY_KIND.NOTEBOOK_FACT) return 'notebook_fact';
  if (kind === MEMORY_KIND.DECISION) return 'decision';
  if (kind === MEMORY_KIND.PROJECT_FACT) return 'project_fact';
  return 'rem_pattern';
}

function labelForCategory(category: string): string {
  return category.replace(/_/g, ' ');
}

function getEvidenceKeys(row: RawShortTermRecall): string[] {
  const queryHashes = parseJsonArray(row.query_hashes).map(
    (hash) => `query:${hash}`,
  );
  if (queryHashes.length > 0) return queryHashes;

  const metadata = parseJsonObject(row.metadata);
  const { conversationId, messageId } = metadata;
  if (conversationId !== undefined && messageId !== undefined) {
    return [`message:${conversationId}:${messageId}`];
  }
  if (row.source_id) return [`source:${row.source_type}:${row.source_id}`];
  return [`recall:${row.recall_key}`];
}

function mostRecentTimestamp(values: Array<string | null>): string | null {
  return values.reduce<string | null>((latest, value) => {
    const latestMs = timestampMs(latest);
    const valueMs = timestampMs(value);
    if (valueMs === null) return latest;
    if (latestMs === null || valueMs > latestMs) return value;
    return latest;
  }, null);
}

function oldestTimestamp(values: Array<string | null>): string | null {
  return values.reduce<string | null>((oldest, value) => {
    const oldestMs = timestampMs(oldest);
    const valueMs = timestampMs(value);
    if (valueMs === null) return oldest;
    if (oldestMs === null || valueMs < oldestMs) return value;
    return oldest;
  }, null);
}

function mergeTags(rows: RawShortTermRecall[]): string[] {
  const tags = new Set<string>();
  rows.forEach((row) => {
    normalizeTags(row).forEach((tag) => tags.add(tag));
  });
  return Array.from(tags).sort().slice(0, 8);
}

function representativeSnippets(rows: RawShortTermRecall[]): string[] {
  const seen = new Set<string>();
  return [...rows]
    .sort((a, b) => {
      const scoreDelta = b.max_score - a.max_score;
      if (scoreDelta !== 0) return scoreDelta;
      return b.recall_count - a.recall_count;
    })
    .map((row) => row.snippet.replace(/\s+/g, ' ').trim())
    .filter((snippet) => {
      const normalized = snippet.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, 4);
}

function buildRemClusters(rows: RawShortTermRecall[]): RemCluster[] {
  const clusters = new Map<string, RemCluster>();

  rows.forEach((row) => {
    const tags = normalizeTags(row);
    const kind = classifyMemoryKind(row, tags);
    if (!kind) return;

    const category = categoryForKind(kind);
    const clusterKey = `${row.scope_key}:${category}`;
    const sourceId = `rem:${sha256(clusterKey)}`;
    const existing = clusters.get(clusterKey);
    const evidenceKeys = getEvidenceKeys(row);

    if (existing) {
      existing.rows.push(row);
      evidenceKeys.forEach((key) => existing.uniqueEvidenceKeys.add(key));
      existing.totalRecallCount += row.recall_count;
      existing.maxScore = Math.max(existing.maxScore, row.max_score);
      existing.averageScore =
        existing.rows.reduce((sum, item) => sum + item.max_score, 0) /
        existing.rows.length;
      existing.firstRecalledAt = oldestTimestamp([
        existing.firstRecalledAt,
        row.first_recalled_at,
      ]);
      existing.lastRecalledAt = mostRecentTimestamp([
        existing.lastRecalledAt,
        row.last_recalled_at,
      ]);
      existing.tags = mergeTags(existing.rows);
      return;
    }

    clusters.set(clusterKey, {
      key: clusterKey,
      sourceId,
      scopeKey: row.scope_key,
      screenKey: row.screen_key,
      projectId: row.project_id,
      connectionId: row.connection_id,
      notebookId: row.notebook_id,
      kind,
      category,
      label: labelForCategory(category),
      tags,
      rows: [row],
      uniqueEvidenceKeys: new Set(evidenceKeys),
      totalRecallCount: row.recall_count,
      maxScore: row.max_score,
      averageScore: row.max_score,
      firstRecalledAt: row.first_recalled_at,
      lastRecalledAt: row.last_recalled_at,
    });
  });

  return Array.from(clusters.values()).filter(
    (cluster) =>
      cluster.rows.length > 1 ||
      cluster.totalRecallCount >= DEEP_PROMOTION_MIN_RECALLS,
  );
}

function getClusterRemHits(
  cluster: RemCluster,
  signalCounts: Map<string, number>,
): number {
  return cluster.rows.reduce(
    (sum, row) => sum + (signalCounts.get(row.recall_key) ?? 0),
    0,
  );
}

function scorePromotionCluster(
  cluster: RemCluster,
  signalCounts: Map<string, number>,
) {
  const remSignalHits = getClusterRemHits(cluster, signalCounts);
  const frequency = Math.min(1, cluster.totalRecallCount / 3);
  const relevance = Math.min(1, cluster.averageScore / 0.7);
  const diversity = Math.min(
    1,
    cluster.uniqueEvidenceKeys.size / DEEP_PROMOTION_MIN_UNIQUE_EVIDENCE,
  );
  const recency = Math.max(
    0,
    1 - ageDays(cluster.lastRecalledAt) / DEEP_PROMOTION_MAX_AGE_DAYS,
  );
  const consolidation = Math.min(
    1,
    remSignalHits / Math.max(1, cluster.rows.length),
  );
  const conceptual = Math.min(1, cluster.tags.length / 3);
  const remBoost = remSignalHits > 0 ? 0.05 : 0;
  const score = Math.min(
    1,
    frequency * 0.24 +
      relevance * 0.3 +
      diversity * 0.15 +
      recency * 0.15 +
      consolidation * 0.1 +
      conceptual * 0.06 +
      remBoost,
  );

  return {
    score,
    remSignalHits,
    components: {
      frequency,
      relevance,
      diversity,
      recency,
      consolidation,
      conceptual,
      remBoost,
    },
  };
}

function buildPromotionEntry(
  runId: number,
  cluster: RemCluster,
  score: ReturnType<typeof scorePromotionCluster>,
  now: string,
): NewAgentMemoryEntry {
  const snippets = representativeSnippets(cluster.rows);
  const content = [
    `Repeated ${cluster.label} observed in memory scope ${cluster.scopeKey}.`,
    ...snippets.map((snippet) => `- ${truncate(snippet, 220)}`),
  ].join('\n');

  return {
    scopeKey: cluster.scopeKey,
    screenKey: cluster.screenKey,
    projectId: cluster.projectId,
    connectionId: cluster.connectionId,
    notebookId: cluster.notebookId,
    kind: cluster.kind,
    sourceType: 'dreaming',
    sourceId: cluster.sourceId,
    title: `REM pattern: ${cluster.label}`,
    content,
    summary: truncate(
      `Repeated ${cluster.label} across ${cluster.rows.length} candidates and ${cluster.uniqueEvidenceKeys.size} evidence points.`,
      300,
    ),
    importance: score.score,
    confidence: Math.min(0.95, 0.72 + score.score * 0.23),
    tags: [...cluster.tags, REM_PHASE_PREFIX],
    metadata: {
      runId,
      clusterKey: cluster.key,
      category: cluster.category,
      score: score.score,
      scoreComponents: score.components,
      remSignalHits: score.remSignalHits,
      recallKeys: cluster.rows.map((row) => row.recall_key),
      shortTermIds: cluster.rows.map((row) => row.id),
      totalRecallCount: cluster.totalRecallCount,
      uniqueEvidenceCount: cluster.uniqueEvidenceKeys.size,
    },
    promotedAt: now,
  };
}

export default class AgentMemoryDreamingService {
  static async getConfigValue(key: string): Promise<string | null> {
    const db = await MainDatabaseService.getSqliteDatabase();
    const row = db
      .prepare('SELECT value FROM agent_memory_config WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  static async setConfigValue(key: string, value: string): Promise<void> {
    const db = await MainDatabaseService.getSqliteDatabase();
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

  static async runManagedSweep(
    trigger: AgentMemoryDreamingTrigger,
  ): Promise<AgentMemoryDreamingRun> {
    const db = await MainDatabaseService.getSqliteDatabase();
    const result = db
      .prepare(
        `
          INSERT INTO agent_memory_dreaming_runs (
            trigger_type, status, metadata
          )
          VALUES (@triggerType, 'running', @metadata)
        `,
      )
      .run({
        triggerType: trigger,
        metadata: JSON.stringify({
          phase: 'light_rem_deep',
          lookbackDays: 2,
          deepPromotionLookbackDays: DEEP_PROMOTION_LOOKBACK_DAYS,
          maxMessages: MAX_MESSAGES_PER_SWEEP,
        }),
      });
    const runId = Number(result.lastInsertRowid);
    // eslint-disable-next-line no-console
    console.log(
      `[AgentMemoryDreamingService] runManagedSweep started for trigger '${trigger}', runId: ${runId}`,
    );

    try {
      const lightResult = await this.runLightPhase(runId);
      const remResult = await this.runRemPhase(runId);
      const deepResult = await this.runDeepPromotionPhase(runId);
      const health = await AgentMemoryService.getHealth();
      await this.writeReport(
        runId,
        'health',
        [
          'Memory health snapshot completed.',
          `Score: ${Math.round(health.healthScore * 100)}%.`,
          `Orphaned entries: ${health.orphanedEntries}.`,
          `Duplicate entries: ${health.duplicateEntries}.`,
        ].join(' '),
        health,
      );
      db.prepare(
        `
          UPDATE agent_memory_dreaming_runs
          SET status = 'completed',
              completed_at = datetime('now'),
              light_count = @lightCount,
              rem_count = @remCount,
              promoted_count = @promotedCount,
              metadata = @metadata
          WHERE id = @runId
        `,
      ).run({
        runId,
        lightCount: lightResult.recalledCandidates,
        remCount: remResult.signalsRecorded,
        promotedCount: deepResult.promotedMemories,
        metadata: JSON.stringify({
          phase: 'light_rem_deep',
          trigger,
          light: lightResult,
          rem: remResult,
          deep: deepResult,
          health: {
            healthScore: health.healthScore,
            healthSnapshotId: health.healthSnapshotId,
            orphanedEntries: health.orphanedEntries,
            duplicateEntries: health.duplicateEntries,
          },
        }),
      });
      await this.setConfigValue(
        'last_dreaming_run_at',
        new Date().toISOString(),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      db.prepare(
        `
          UPDATE agent_memory_dreaming_runs
          SET status = 'failed',
              completed_at = datetime('now'),
              error_message = @errorMessage
          WHERE id = @runId
        `,
      ).run({ runId, errorMessage: message });
      await this.writeReport(
        runId,
        'error',
        `Memory dreaming failed: ${message}`,
        {
          trigger,
          error: message,
        },
      );
      // eslint-disable-next-line no-console
      console.error('[AgentMemoryDreaming] managed sweep failed:', error);
    }

    return this.getRunById(runId);
  }

  static async runLightPhase(runId: number): Promise<LightDreamingResult> {
    const db = await MainDatabaseService.getSqliteDatabase();
    const messages = db
      .prepare(
        `
          SELECT
            m.id,
            m.conversation_id,
            m.role,
            m.content,
            m.created_at,
            c.screen_key,
            c.project_id,
            c.connection_id
          FROM chat_messages m
          JOIN chat_conversations c ON c.id = m.conversation_id
          WHERE m.created_at >= datetime('now', '-2 days')
            AND m.role IN ('user', 'assistant')
          ORDER BY m.created_at ASC, m.id ASC
          LIMIT @limit
        `,
      )
      .all({ limit: MAX_MESSAGES_PER_SWEEP }) as RawDreamingMessage[];

    const insertCorpus = db.prepare(
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
    );

    let insertedCorpus = 0;
    let recalledCandidates = 0;
    let skippedMessages = 0;

    // eslint-disable-next-line no-console
    console.log(
      `[AgentMemoryDreamingService] runLightPhase runId: ${runId}, found ${messages.length} messages in last 2 days.`,
    );

    for (const message of messages) {
      const createdAt = normalizeTimestamp(message.created_at);
      const snippet = truncate(
        AgentMemoryService.redactSensitiveText(message.content).trim(),
        MAX_SNIPPET_CHARS,
      );
      if (!isUsefulSnippet(snippet)) {
        skippedMessages += 1;
      } else {
        const screenKey = asScreenKey(message.screen_key);
        const projectId =
          screenKey === 'project' ? normalizeId(message.project_id) : null;
        const connectionId = normalizeId(message.connection_id);
        const notebookId = null;
        const messageHash = sha256(
          `${message.conversation_id}:${message.id}:${message.role}`,
        );
        const insertResult = insertCorpus.run({
          conversationId: message.conversation_id,
          messageId: message.id,
          dayBucket: dayBucketFromTimestamp(createdAt),
          screenKey,
          projectId,
          connectionId,
          notebookId,
          role: message.role,
          snippet,
          messageHash,
          tokenEstimate: Math.ceil(snippet.length / 4),
          metadata: JSON.stringify({
            runId,
            trigger: 'light_dreaming',
            originalCreatedAt: message.created_at,
          }),
          createdAt,
        });

        if (insertResult.changes === 0) {
          skippedMessages += 1;
        } else {
          insertedCorpus += 1;
          // eslint-disable-next-line no-console
          console.log(
            `[AgentMemoryDreamingService] Inserted corpus row for messageId: ${message.id}, hash: ${messageHash}`,
          );
          await AgentMemoryService.recordShortTermRecall({
            screenKey,
            projectId,
            connectionId,
            notebookId,
            sourceType: 'session_corpus',
            sourceId: messageHash,
            snippet,
            score: scoreSnippet(snippet, message.role),
            conceptTags: extractConceptTags(snippet),
            metadata: {
              runId,
              conversationId: message.conversation_id,
              messageId: message.id,
              role: message.role,
              dayBucket: dayBucketFromTimestamp(createdAt),
            },
          });
          recalledCandidates += 1;
        }
      }
    }

    const result: LightDreamingResult = {
      processedMessages: messages.length,
      insertedCorpus,
      recalledCandidates,
      skippedMessages,
    };

    // eslint-disable-next-line no-console
    console.log(
      `[AgentMemoryDreamingService] runLightPhase complete. Processed: ${messages.length}, Inserted Corpus: ${insertedCorpus}, Recalled Candidates: ${recalledCandidates}, Skipped: ${skippedMessages}`,
    );

    await this.writeReport(
      runId,
      'light',
      [
        'Light dreaming completed.',
        `Processed messages: ${result.processedMessages}.`,
        `New session corpus rows: ${result.insertedCorpus}.`,
        `Short-term recall candidates: ${result.recalledCandidates}.`,
        `Skipped messages: ${result.skippedMessages}.`,
      ].join(' '),
      result,
    );

    return result;
  }

  static async runRemPhase(runId: number): Promise<RemDreamingResult> {
    const db = await MainDatabaseService.getSqliteDatabase();
    const candidates = db
      .prepare(
        `
          SELECT *
          FROM agent_memory_short_term_recall
          WHERE promoted_at IS NULL
            AND last_recalled_at >= datetime('now', @lookback)
          ORDER BY scope_key ASC, last_recalled_at DESC, id DESC
        `,
      )
      .all({
        lookback: `-${DEEP_PROMOTION_LOOKBACK_DAYS} days`,
      }) as RawShortTermRecall[];

    const clusters = buildRemClusters(candidates);
    const clusteredRecallKeys = new Set(
      clusters.flatMap((cluster) => cluster.rows.map((row) => row.recall_key)),
    );
    const upsertSignal = db.prepare(
      `
        INSERT INTO agent_memory_phase_signals (
          recall_key, phase, hit_count, metadata
        )
        VALUES (@recallKey, @phase, @hitCount, @metadata)
        ON CONFLICT(recall_key, phase) DO UPDATE SET
          hit_count = hit_count + excluded.hit_count,
          last_hit_at = datetime('now'),
          metadata = excluded.metadata
      `,
    );

    let signalsRecorded = 0;
    const writeSignals = db.transaction((items: RemCluster[]) => {
      items.forEach((cluster) => {
        cluster.rows.forEach((row) => {
          upsertSignal.run({
            recallKey: row.recall_key,
            phase: `${REM_PHASE_PREFIX}:${cluster.category}`,
            hitCount: 1,
            metadata: JSON.stringify(
              AgentMemoryService.redact({
                runId,
                clusterKey: cluster.key,
                category: cluster.category,
                sourceId: cluster.sourceId,
                totalRecallCount: cluster.totalRecallCount,
                uniqueEvidenceCount: cluster.uniqueEvidenceKeys.size,
              }),
            ),
          });
          signalsRecorded += 1;
        });
      });
    });

    writeSignals(clusters);

    // eslint-disable-next-line no-console
    console.log(
      `[AgentMemoryDreamingService] runRemPhase complete. Evaluated Candidates: ${candidates.length}, Clusters: ${clusters.length}, Signals Recorded: ${signalsRecorded}`,
    );

    const result: RemDreamingResult = {
      evaluatedCandidates: candidates.length,
      clusters: clusters.length,
      signalsRecorded,
      skippedCandidates: candidates.length - clusteredRecallKeys.size,
    };

    await this.writeReport(
      runId,
      REM_PHASE_PREFIX,
      [
        'REM dreaming completed.',
        `Evaluated candidates: ${result.evaluatedCandidates}.`,
        `Clusters: ${result.clusters}.`,
        `Signals recorded: ${result.signalsRecorded}.`,
        `Skipped candidates: ${result.skippedCandidates}.`,
      ].join(' '),
      {
        ...result,
        clusters: clusters.map((cluster) => ({
          key: cluster.key,
          sourceId: cluster.sourceId,
          category: cluster.category,
          kind: cluster.kind,
          scopeKey: cluster.scopeKey,
          candidateCount: cluster.rows.length,
          totalRecallCount: cluster.totalRecallCount,
          uniqueEvidenceCount: cluster.uniqueEvidenceKeys.size,
          tags: cluster.tags,
        })),
      },
    );

    return result;
  }

  static async runDeepPromotionPhase(
    runId: number,
  ): Promise<DeepPromotionResult> {
    const db = await MainDatabaseService.getSqliteDatabase();
    const candidates = db
      .prepare(
        `
          SELECT *
          FROM agent_memory_short_term_recall
          WHERE promoted_at IS NULL
            AND last_recalled_at >= datetime('now', @lookback)
          ORDER BY scope_key ASC, last_recalled_at DESC, id DESC
        `,
      )
      .all({
        lookback: `-${DEEP_PROMOTION_LOOKBACK_DAYS} days`,
      }) as RawShortTermRecall[];

    const clusters = buildRemClusters(candidates);
    const signalRows = db
      .prepare(
        `
          SELECT recall_key, SUM(hit_count) AS hit_count
          FROM agent_memory_phase_signals
          WHERE phase LIKE @phasePrefix
          GROUP BY recall_key
        `,
      )
      .all({ phasePrefix: `${REM_PHASE_PREFIX}%` }) as RawPhaseSignal[];
    const signalCounts = new Map(
      signalRows.map((row) => [row.recall_key, row.hit_count]),
    );
    const selectExisting = db.prepare(
      `
        SELECT id
        FROM agent_memory_entries
        WHERE source_type = 'dreaming'
          AND source_id = @sourceId
          AND archived = 0
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `,
    );
    const markPromoted = db.prepare(
      `
        UPDATE agent_memory_short_term_recall
        SET promoted_at = @promotedAt
        WHERE recall_key = @recallKey
      `,
    );

    let promotedMemories = 0;
    let promotedCandidates = 0;
    const skippedClusters: Array<{
      key: string;
      score: number;
      reasons: string[];
    }> = [];
    const promotedClusters: Array<{
      key: string;
      sourceId: string;
      score: number;
      candidateCount: number;
    }> = [];
    const now = new Date().toISOString();

    for (const cluster of clusters) {
      const scoring = scorePromotionCluster(cluster, signalCounts);
      const reasons: string[] = [];
      if (cluster.totalRecallCount < DEEP_PROMOTION_MIN_RECALLS) {
        reasons.push('min_recall');
      }
      if (
        cluster.uniqueEvidenceKeys.size < DEEP_PROMOTION_MIN_UNIQUE_EVIDENCE
      ) {
        reasons.push('min_unique_evidence');
      }
      if (ageDays(cluster.firstRecalledAt) > DEEP_PROMOTION_MAX_AGE_DAYS) {
        reasons.push('max_age');
      }
      if (scoring.score < DEEP_PROMOTION_MIN_SCORE) {
        reasons.push('min_score');
      }

      if (reasons.length > 0) {
        skippedClusters.push({
          key: cluster.key,
          score: scoring.score,
          reasons,
        });
      } else {
        const entry = buildPromotionEntry(runId, cluster, scoring, now);
        const existing = selectExisting.get({
          sourceId: cluster.sourceId,
        }) as { id: number } | undefined;
        if (existing) {
          await AgentMemoryService.updateEntry(existing.id, entry);
        } else {
          await AgentMemoryService.createEntry(entry);
        }

        cluster.rows.forEach((row) => {
          markPromoted.run({
            recallKey: row.recall_key,
            promotedAt: now,
          });
        });

        promotedMemories += 1;
        promotedCandidates += cluster.rows.length;
        promotedClusters.push({
          key: cluster.key,
          sourceId: cluster.sourceId,
          score: scoring.score,
          candidateCount: cluster.rows.length,
        });
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `[AgentMemoryDreamingService] runDeepPromotionPhase complete. Evaluated Clusters: ${clusters.length}, Promoted Memories: ${promotedMemories}, Promoted Candidates: ${promotedCandidates}, Skipped Clusters: ${skippedClusters.length}`,
    );

    const result: DeepPromotionResult = {
      evaluatedClusters: clusters.length,
      promotedMemories,
      promotedCandidates,
      skippedClusters: skippedClusters.length,
    };

    await this.writeReport(
      runId,
      'deep',
      [
        'Deep promotion completed.',
        `Evaluated clusters: ${result.evaluatedClusters}.`,
        `Promoted memories: ${result.promotedMemories}.`,
        `Promoted candidates: ${result.promotedCandidates}.`,
        `Skipped clusters: ${result.skippedClusters}.`,
      ].join(' '),
      {
        ...result,
        promotedClusters,
        skippedClusters: skippedClusters.slice(0, 25),
      },
    );

    return result;
  }

  private static async getRunById(id: number): Promise<AgentMemoryDreamingRun> {
    const db = await MainDatabaseService.getSqliteDatabase();
    const row = db
      .prepare('SELECT * FROM agent_memory_dreaming_runs WHERE id = ?')
      .get(id) as RawDreamingRun | undefined;
    if (!row) {
      throw new Error(`Memory dreaming run ${id} not found`);
    }
    return toDreamingRun(row);
  }

  private static async writeReport(
    runId: number,
    phase: string,
    content: string,
    metadata: unknown,
  ): Promise<void> {
    const db = await MainDatabaseService.getSqliteDatabase();
    db.prepare(
      `
        INSERT INTO agent_memory_dreaming_reports (
          run_id, phase, day_bucket, content, metadata
        )
        VALUES (@runId, @phase, @dayBucket, @content, @metadata)
      `,
    ).run({
      runId,
      phase,
      dayBucket: new Date().toISOString().slice(0, 10),
      content,
      metadata: JSON.stringify(AgentMemoryService.redact(metadata)),
    });
  }
}
