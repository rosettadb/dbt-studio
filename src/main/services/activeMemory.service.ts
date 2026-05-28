import MainDatabaseService from './mainDatabase.service';
import { loadAISettings } from './agent.service';
import type { AgentMemoryDiagnostic } from '../../types/backend';

export default class ActiveMemoryService {
  /**
   * Internal helper to record a diagnostic trace of the active memory run.
   */
  public static async recordDiagnostic(
    diagnostic: Omit<AgentMemoryDiagnostic, 'id' | 'createdAt'>,
  ): Promise<number> {
    const db = await MainDatabaseService.getSqliteDatabase();

    const result = db
      .prepare(
        `
      INSERT INTO agent_memory_diagnostics (
        conversation_id,
        message_id,
        provider_id,
        model_id,
        execution_ms,
        prompt_tokens,
        completion_tokens,
        prompt_payload,
        completion_payload,
        recall_keys_found
      ) VALUES (
        @conversationId,
        @messageId,
        @providerId,
        @modelId,
        @executionMs,
        @promptTokens,
        @completionTokens,
        @promptPayload,
        @completionPayload,
        @recallKeysFound
      )
    `,
      )
      .run({
        conversationId: diagnostic.conversationId ?? null,
        messageId: diagnostic.messageId ?? null,
        providerId: diagnostic.providerId ?? null,
        modelId: diagnostic.modelId ?? null,
        executionMs: diagnostic.executionMs,
        promptTokens: diagnostic.promptTokens,
        completionTokens: diagnostic.completionTokens,
        promptPayload: diagnostic.promptPayload,
        completionPayload: diagnostic.completionPayload,
        recallKeysFound: diagnostic.recallKeysFound ?? null,
      });

    try {
      const settings = await loadAISettings();
      const retention =
        settings.memory?.activeMemory?.transcriptRetention ?? 10;

      // Keep only the latest <retention> diagnostics
      if (retention > 0) {
        db.prepare(
          `
          DELETE FROM agent_memory_diagnostics 
          WHERE id NOT IN (
            SELECT id FROM agent_memory_diagnostics 
            ORDER BY id DESC 
            LIMIT ?
          )
        `,
        ).run(retention);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[ActiveMemoryService] Error enforcing retention:', e);
    }

    return Number(result.lastInsertRowid);
  }

  public static async listDiagnostics(
    limit = 10,
  ): Promise<AgentMemoryDiagnostic[]> {
    const db = await MainDatabaseService.getSqliteDatabase();
    const rows = db
      .prepare(
        `
        SELECT * FROM agent_memory_diagnostics
        ORDER BY id DESC
        LIMIT ?
      `,
      )
      .all(limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      providerId: row.provider_id,
      modelId: row.model_id,
      executionMs: row.execution_ms,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      promptPayload: row.prompt_payload,
      completionPayload: row.completion_payload,
      recallKeysFound: row.recall_keys_found,
      createdAt: row.created_at,
    }));
  }

  public static async clearDiagnostics(): Promise<void> {
    const db = await MainDatabaseService.getSqliteDatabase();
    db.prepare('DELETE FROM agent_memory_diagnostics').run();
  }
}
