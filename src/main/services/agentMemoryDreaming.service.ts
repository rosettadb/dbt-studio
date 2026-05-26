/* eslint-disable no-restricted-syntax, no-await-in-loop */
import crypto from 'crypto';
import MainDatabaseService from './mainDatabase.service';
import AgentMemoryService from './agentMemory.service';
import type {
  AgentMemoryDreamingRun,
  AgentMemoryDreamingTrigger,
  AgentMemoryScreenKey,
} from '../../types/backend';

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

export interface LightDreamingResult {
  processedMessages: number;
  insertedCorpus: number;
  recalledCandidates: number;
  skippedMessages: number;
}

const MAX_MESSAGES_PER_SWEEP = 240;
const MAX_SNIPPET_CHARS = 280;
const MIN_USEFUL_SNIPPET_CHARS = 24;

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
          phase: 'light',
          lookbackDays: 2,
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
      db.prepare(
        `
          UPDATE agent_memory_dreaming_runs
          SET status = 'completed',
              completed_at = datetime('now'),
              light_count = @lightCount,
              metadata = @metadata
          WHERE id = @runId
        `,
      ).run({
        runId,
        lightCount: lightResult.recalledCandidates,
        metadata: JSON.stringify({
          phase: 'light',
          trigger,
          ...lightResult,
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
        'light',
        `Light dreaming failed: ${message}`,
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
