/* eslint-disable no-useless-catch */
// Main Database Service using Drizzle ORM
// This service manages the SQLite database for AI providers and future features
// Following SettingsService patterns for consistency with existing codebase

import { app } from 'electron';
import path from 'path';
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, desc, and, count, inArray, isNull } from 'drizzle-orm';
import * as schema from '../schemas/mainDatabase.schema';
import { MainDatabaseInfo, UsageStats } from '../../types/backend';
import {
  AIProvider,
  NewAIProvider,
  ChatConversation,
  NewChatConversation,
  ChatMessage,
  NewChatMessage,
  ChatMessageWithContext,
  ContextItem,
  NewContextItem,
  SessionMetadata,
  ToolCall,
  NewToolCall,
  PromptTemplate,
  NewPromptTemplate,
  NewAIUsageLog,
  ChatConversationWithMessages,
} from '../schemas/mainDatabase.schema';
import type { AgentScreenKey } from '../../types/agentEvents';

export interface GetConversationsFilter {
  projectId?: number;
  screenKey?: AgentScreenKey;
  connectionId?: string | null;
  notebookId?: string | null;
}

export default class MainDatabaseService {
  private static sqlite: Database.Database | null = null;

  private static db: BetterSQLite3Database<typeof schema> | null = null;

  private static readonly DB_PATH = path.join(
    app.getPath('userData'),
    'main-database.db',
  );

  // Initialize database following SettingsService patterns
  static async initializeDatabase(): Promise<void> {
    try {
      if (!this.sqlite) {
        // Create SQLite connection with optimizations
        this.sqlite = new Database(this.DB_PATH);

        // Enable WAL mode for better concurrency (like existing connection handling)
        this.sqlite.pragma('journal_mode = WAL');
        this.sqlite.pragma('synchronous = NORMAL');
        this.sqlite.pragma('cache_size = 1000');
        this.sqlite.pragma('temp_store = memory');
        this.sqlite.pragma('foreign_keys = ON');

        // Create Drizzle instance
        this.db = drizzle(this.sqlite, { schema });

        // Run migrations
        await this.runMigrations();
      }
    } catch (error) {
      throw error;
    }
  }

  // Get database instance (early initialization pattern like SettingsService)
  private static async getDatabase(): Promise<
    BetterSQLite3Database<typeof schema>
  > {
    if (!this.db) {
      await this.initializeDatabase();
    }
    return this.db!;
  }

  // Run migrations (following SettingsService version management pattern)
  private static async runMigrations(): Promise<void> {
    try {
      if (!this.db) {
        throw new Error('Database not initialized');
      }

      // Drizzle will handle migrations automatically
      // For now, we'll create tables manually until migration files are set up
      await this.createTables();

      // After creating tables, ensure schema is up to date for existing installs
      await this.ensureSchemaUpToDate();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[MAIN DATABASE] Migration error:', error);
      throw error;
    }
  }

  // Create tables manually (temporary until proper migrations are set up)
  private static async createTables(): Promise<void> {
    if (!this.sqlite) {
      // eslint-disable-next-line no-console
      console.error('[MAIN DATABASE] SQLite connection not initialized');
      throw new Error('SQLite connection not initialized');
    }

    const createTablesSQL = `
      -- AI Providers table
      CREATE TABLE IF NOT EXISTS ai_providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        config TEXT NOT NULL,
        is_active INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Chat Conversations table
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        project_id INTEGER,
        provider_id INTEGER,
        screen_key TEXT DEFAULT 'project',
        connection_id TEXT,
        notebook_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE SET NULL
      );

      -- Chat Messages table - Enhanced with Continue.dev features
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        tool_calls TEXT,
        context_items TEXT,
        thinking_content TEXT,
        signature TEXT,
        is_streaming INTEGER DEFAULT 0,
        parent_message_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL
      );

      -- Context Items table - For Continue.dev context providers
      CREATE TABLE IF NOT EXISTS context_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
      );

      -- Session Metadata table - For Continue.dev session-specific data
      CREATE TABLE IF NOT EXISTS session_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
      );

      -- Tool Calls table - For Continue.dev tool execution tracking
      CREATE TABLE IF NOT EXISTS tool_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        tool_input TEXT NOT NULL,
        tool_output TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        error_message TEXT,
        FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
      );

      -- Prompt Templates table
      CREATE TABLE IF NOT EXISTS prompt_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        template TEXT NOT NULL,
        category TEXT NOT NULL,
        provider_type TEXT,
        is_system INTEGER DEFAULT 0,
        variables TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- AI Usage Logs table
      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER,
        conversation_id INTEGER,
        operation_type TEXT NOT NULL,
        tokens_used INTEGER,
        cost_estimate REAL,
        duration_ms INTEGER NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE SET NULL,
        FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE SET NULL
      );

      -- Chat Compaction Summaries table
      CREATE TABLE IF NOT EXISTS chat_compaction_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        covers_up_to_message_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS ai_providers_name_idx ON ai_providers(name);
      CREATE INDEX IF NOT EXISTS ai_providers_type_idx ON ai_providers(type);
      CREATE INDEX IF NOT EXISTS ai_providers_active_idx ON ai_providers(is_active);

      CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx ON chat_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS chat_messages_role_idx ON chat_messages(role);
      CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON chat_messages(created_at);

      CREATE INDEX IF NOT EXISTS context_items_message_idx ON context_items(message_id);
      CREATE INDEX IF NOT EXISTS context_items_type_idx ON context_items(type);
      CREATE INDEX IF NOT EXISTS context_items_name_idx ON context_items(name);

      CREATE INDEX IF NOT EXISTS session_metadata_conversation_idx ON session_metadata(conversation_id);
      CREATE INDEX IF NOT EXISTS session_metadata_key_idx ON session_metadata(key);
      CREATE UNIQUE INDEX IF NOT EXISTS session_metadata_unique_idx ON session_metadata(conversation_id, key);

      CREATE INDEX IF NOT EXISTS tool_calls_message_idx ON tool_calls(message_id);
      CREATE INDEX IF NOT EXISTS tool_calls_tool_name_idx ON tool_calls(tool_name);
      CREATE INDEX IF NOT EXISTS tool_calls_status_idx ON tool_calls(status);
      CREATE INDEX IF NOT EXISTS tool_calls_started_at_idx ON tool_calls(started_at);

      CREATE INDEX IF NOT EXISTS prompt_templates_category_idx ON prompt_templates(category);
      CREATE INDEX IF NOT EXISTS prompt_templates_provider_type_idx ON prompt_templates(provider_type);
      CREATE INDEX IF NOT EXISTS prompt_templates_system_idx ON prompt_templates(is_system);

      CREATE INDEX IF NOT EXISTS ai_usage_logs_provider_idx ON ai_usage_logs(provider_id);
      CREATE INDEX IF NOT EXISTS ai_usage_logs_conversation_idx ON ai_usage_logs(conversation_id);
      CREATE INDEX IF NOT EXISTS ai_usage_logs_operation_idx ON ai_usage_logs(operation_type);
      CREATE INDEX IF NOT EXISTS ai_usage_logs_status_idx ON ai_usage_logs(status);
      CREATE INDEX IF NOT EXISTS ai_usage_logs_created_at_idx ON ai_usage_logs(created_at);

      CREATE INDEX IF NOT EXISTS chat_compaction_summaries_conversation_idx ON chat_compaction_summaries(conversation_id);
    `;

    this.sqlite.exec(createTablesSQL);
  }

  // Ensure schema is up-to-date for users with older DB files
  private static async ensureSchemaUpToDate(): Promise<void> {
    if (!this.sqlite) {
      throw new Error('SQLite connection not initialized');
    }

    // Helper to get current columns of a table
    const getColumns = (table: string): Set<string> => {
      const stmt = this.sqlite!.prepare(`PRAGMA table_info(${table});`);
      const rows = stmt.all() as Array<{ name: string }>;
      return new Set(rows.map((r) => r.name));
    };

    try {
      const alterStatements: string[] = [];

      // chat_conversations: ensure enhanced columns exist
      const chatConvCols = getColumns('chat_conversations');

      if (!chatConvCols.has('project_id')) {
        alterStatements.push(
          'ALTER TABLE chat_conversations ADD COLUMN project_id INTEGER;',
        );
      }

      if (!chatConvCols.has('provider_id')) {
        alterStatements.push(
          'ALTER TABLE chat_conversations ADD COLUMN provider_id INTEGER;',
        );
      }

      if (!chatConvCols.has('screen_key')) {
        alterStatements.push(
          "ALTER TABLE chat_conversations ADD COLUMN screen_key TEXT DEFAULT 'project';",
        );
      }

      if (!chatConvCols.has('connection_id')) {
        alterStatements.push(
          'ALTER TABLE chat_conversations ADD COLUMN connection_id TEXT;',
        );
      }
      if (!chatConvCols.has('notebook_id')) {
        alterStatements.push(
          'ALTER TABLE chat_conversations ADD COLUMN notebook_id TEXT;',
        );
        alterStatements.push(
          'CREATE INDEX IF NOT EXISTS chat_conversations_notebook_idx ON chat_conversations(notebook_id);',
        );
      }

      // Ensure indexes exist for chat_conversations (safe with CREATE INDEX IF NOT EXISTS if columns exist)
      // We run these after potentially adding columns above
      alterStatements.push(
        'CREATE INDEX IF NOT EXISTS chat_conversations_project_idx ON chat_conversations(project_id);',
      );
      alterStatements.push(
        'CREATE INDEX IF NOT EXISTS chat_conversations_screen_key_idx ON chat_conversations(screen_key);',
      );
      alterStatements.push(
        'CREATE INDEX IF NOT EXISTS chat_conversations_connection_idx ON chat_conversations(connection_id);',
      );
      alterStatements.push(
        'CREATE INDEX IF NOT EXISTS chat_conversations_provider_idx ON chat_conversations(provider_id);',
      );
      alterStatements.push(
        'CREATE INDEX IF NOT EXISTS chat_conversations_created_at_idx ON chat_conversations(created_at);',
      );

      // chat_messages: ensure enhanced columns exist
      const chatMsgCols = getColumns('chat_messages');
      if (!chatMsgCols.has('tool_calls')) {
        alterStatements.push(
          'ALTER TABLE chat_messages ADD COLUMN tool_calls TEXT;',
        );
      }
      if (!chatMsgCols.has('context_items')) {
        alterStatements.push(
          'ALTER TABLE chat_messages ADD COLUMN context_items TEXT;',
        );
      }
      if (!chatMsgCols.has('thinking_content')) {
        alterStatements.push(
          'ALTER TABLE chat_messages ADD COLUMN thinking_content TEXT;',
        );
      }
      if (!chatMsgCols.has('signature')) {
        alterStatements.push(
          'ALTER TABLE chat_messages ADD COLUMN signature TEXT;',
        );
      }
      if (!chatMsgCols.has('is_streaming')) {
        alterStatements.push(
          'ALTER TABLE chat_messages ADD COLUMN is_streaming INTEGER DEFAULT 0;',
        );
      }
      if (!chatMsgCols.has('parent_message_id')) {
        alterStatements.push(
          'ALTER TABLE chat_messages ADD COLUMN parent_message_id INTEGER;',
        );
      }

      // Ensure indexes exist for chat_messages (safe if columns exist)
      alterStatements.push(
        'CREATE INDEX IF NOT EXISTS chat_messages_parent_idx ON chat_messages(parent_message_id);',
      );
      alterStatements.push(
        'CREATE INDEX IF NOT EXISTS chat_messages_streaming_idx ON chat_messages(is_streaming);',
      );

      if (alterStatements.length > 0) {
        const transaction = this.sqlite.transaction((sqls: string[]) => {
          sqls.forEach((sql) => {
            this.sqlite!.prepare(sql).run();
          });
        });
        transaction(alterStatements);
        // Note: SQLite cannot add foreign keys via ALTER TABLE; acceptable for legacy DBs.
      }

      // tool_calls table might be missing entirely on older DBs; create if absent
      const tables = this.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>;
      const tableNames = new Set(tables.map((t) => t.name));
      if (!tableNames.has('tool_calls')) {
        this.sqlite.exec(`
          CREATE TABLE IF NOT EXISTS tool_calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            tool_name TEXT NOT NULL,
            tool_input TEXT NOT NULL,
            tool_output TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            started_at TEXT DEFAULT (datetime('now')),
            completed_at TEXT,
            error_message TEXT,
            FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS tool_calls_message_idx ON tool_calls(message_id);
          CREATE INDEX IF NOT EXISTS tool_calls_tool_name_idx ON tool_calls(tool_name);
          CREATE INDEX IF NOT EXISTS tool_calls_status_idx ON tool_calls(status);
          CREATE INDEX IF NOT EXISTS tool_calls_started_at_idx ON tool_calls(started_at);
        `);
      }

      // chat_compaction_summaries table might be missing
      if (!tableNames.has('chat_compaction_summaries')) {
        this.sqlite.exec(`
          CREATE TABLE IF NOT EXISTS chat_compaction_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            covers_up_to_message_id INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS chat_compaction_summaries_conversation_idx ON chat_compaction_summaries(conversation_id);
        `);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[MAIN DATABASE] ensureSchemaUpToDate error:', error);
      // Re-throw to surface during init so we know something went wrong
      throw error;
    }
  }

  // AI Provider Management (following SettingsService patterns)
  static async saveProvider(provider: NewAIProvider): Promise<AIProvider> {
    const db = await this.getDatabase();

    try {
      const results = await db
        .insert(schema.aiProviders)
        .values({
          ...provider,
          updatedAt: new Date().toISOString(),
        })
        .returning();

      const [result] = Array.isArray(results) ? results : [results];
      if (!result) {
        throw new Error('Failed to save provider');
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getProviders(): Promise<AIProvider[]> {
    const db = await this.getDatabase();

    try {
      const providers = await db
        .select()
        .from(schema.aiProviders)
        .orderBy(desc(schema.aiProviders.createdAt));

      return providers;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[MAIN DATABASE] getProviders - Error fetching providers:',
        error,
      );
      throw error;
    }
  }

  static async getProvider(id: number): Promise<AIProvider | null> {
    const db = await this.getDatabase();

    try {
      const results = await db
        .select()
        .from(schema.aiProviders)
        .where(eq(schema.aiProviders.id, id));

      if (Array.isArray(results)) {
        return results[0] || null;
      }
      return null;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[MAIN DATABASE] getProvider - Error getting provider ${id}:`,
        error,
      );
      throw error;
    }
  }

  static async updateProvider(
    id: number,
    updates: Partial<NewAIProvider>,
  ): Promise<void> {
    const db = await this.getDatabase();

    try {
      const updateData = {
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await db
        .update(schema.aiProviders)
        .set(updateData)
        .where(eq(schema.aiProviders.id, id));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[MAIN DATABASE] Error during provider update:', error);
      // eslint-disable-next-line no-console
      console.error('[MAIN DATABASE] Error details:', {
        id,
        updates,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  static async deleteProvider(id: number): Promise<void> {
    const db = await this.getDatabase();

    try {
      await db.delete(schema.aiProviders).where(eq(schema.aiProviders.id, id));
    } catch (error) {
      throw error;
    }
  }

  static async getActiveProvider(): Promise<AIProvider | null> {
    const db = await this.getDatabase();

    try {
      const results = await db
        .select()
        .from(schema.aiProviders)
        .where(eq(schema.aiProviders.isActive, true));

      return results[0] || null;
    } catch (error) {
      throw error;
    }
  }

  static async setActiveProvider(id: number): Promise<void> {
    const db = await this.getDatabase();

    try {
      // First, deactivate all providers
      await db.update(schema.aiProviders).set({ isActive: false });

      // Then activate the selected provider
      await db
        .update(schema.aiProviders)
        .set({ isActive: true })
        .where(eq(schema.aiProviders.id, id));
    } catch (error) {
      throw error;
    }
  }

  static async deactivateAllProviders(): Promise<void> {
    const db = await this.getDatabase();

    try {
      // Deactivate all providers
      await db.update(schema.aiProviders).set({ isActive: false });
    } catch (error) {
      throw error;
    }
  }

  // Chat Conversation Management
  static async createConversation(
    title: string,
    projectId?: number,
    providerId?: number,
    screenKey?: AgentScreenKey,
    connectionId?: string,
    notebookId?: string,
  ): Promise<ChatConversation> {
    const db = await this.getDatabase();

    try {
      const results = await db
        .insert(schema.chatConversations)
        .values({
          title,
          projectId,
          providerId,
          screenKey: screenKey ?? 'project',
          connectionId,
          notebookId,
        })
        .returning();

      const [result] = Array.isArray(results) ? results : [results];
      if (!result) {
        throw new Error('Failed to create conversation');
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getConversations(
    filter: number | GetConversationsFilter = {},
  ): Promise<ChatConversation[]> {
    const db = await this.getDatabase();

    const opts: GetConversationsFilter =
      typeof filter === 'number' ? { projectId: filter } : filter;

    try {
      const conditions = [];
      if (opts.projectId !== undefined)
        conditions.push(eq(schema.chatConversations.projectId, opts.projectId));
      if (opts.screenKey !== undefined)
        conditions.push(eq(schema.chatConversations.screenKey, opts.screenKey));
      if (opts.connectionId !== undefined) {
        if (opts.connectionId === null) {
          conditions.push(isNull(schema.chatConversations.connectionId));
        } else {
          conditions.push(
            eq(schema.chatConversations.connectionId, opts.connectionId),
          );
        }
      }
      if (opts.notebookId !== undefined) {
        if (opts.notebookId === null) {
          conditions.push(isNull(schema.chatConversations.notebookId));
        } else {
          conditions.push(
            eq(schema.chatConversations.notebookId, opts.notebookId),
          );
        }
      }

      const query = db
        .select()
        .from(schema.chatConversations)
        .orderBy(desc(schema.chatConversations.updatedAt));

      return conditions.length > 0
        ? await query.where(and(...conditions))
        : await query;
    } catch (error) {
      throw error;
    }
  }

  static async getConversation(
    id: number,
  ): Promise<ChatConversationWithMessages | null> {
    const db = await this.getDatabase();

    try {
      const conversation = await db
        .select()
        .from(schema.chatConversations)
        .where(eq(schema.chatConversations.id, id));

      if (!conversation[0]) {
        return null;
      }

      const messages = await db
        .select()
        .from(schema.chatMessages)
        .where(eq(schema.chatMessages.conversationId, id))
        .orderBy(schema.chatMessages.createdAt);

      return {
        ...conversation[0],
        messages,
        messageCount: messages.length,
        lastMessageAt: messages[messages.length - 1]?.createdAt || undefined,
      };
    } catch (error) {
      throw error;
    }
  }

  static async updateConversation(
    id: number,
    updates: Partial<NewChatConversation>,
  ): Promise<void> {
    const db = await this.getDatabase();

    try {
      await db
        .update(schema.chatConversations)
        .set({
          ...updates,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.chatConversations.id, id));
    } catch (error) {
      throw error;
    }
  }

  static async deleteConversation(id: number): Promise<void> {
    const db = await this.getDatabase();

    try {
      // First, get all messages in this conversation
      const messages = await db
        .select({ id: schema.chatMessages.id })
        .from(schema.chatMessages)
        .where(eq(schema.chatMessages.conversationId, id));

      // Delete all context items for messages in this conversation
      if (messages.length > 0) {
        const messageIds = messages.map((m) => m.id);
        await db
          .delete(schema.contextItems)
          .where(inArray(schema.contextItems.messageId, messageIds));

        // Also delete tool calls for messages in this conversation
        await db
          .delete(schema.toolCalls)
          .where(inArray(schema.toolCalls.messageId, messageIds));
      }

      // Delete all messages in this conversation
      await db
        .delete(schema.chatMessages)
        .where(eq(schema.chatMessages.conversationId, id));

      // Finally, delete the conversation itself
      await db
        .delete(schema.chatConversations)
        .where(eq(schema.chatConversations.id, id));
    } catch (error) {
      throw error;
    }
  }

  // Chat Message Management
  static async addMessage(
    conversationId: number,
    message: Omit<NewChatMessage, 'conversationId'>,
  ): Promise<ChatMessage> {
    const db = await this.getDatabase();

    try {
      const results = await db
        .insert(schema.chatMessages)
        .values({
          ...message,
          conversationId,
        })
        .returning();

      const [result] = Array.isArray(results) ? results : [results];
      if (!result) {
        throw new Error('Failed to insert message');
      }

      // Update conversation's updatedAt timestamp
      await db
        .update(schema.chatConversations)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(schema.chatConversations.id, conversationId));

      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getMessages(
    conversationId: number,
    limit?: number,
    offset?: number,
  ): Promise<ChatMessage[]> {
    const db = await this.getDatabase();

    try {
      if (limit && offset) {
        return await db
          .select()
          .from(schema.chatMessages)
          .where(eq(schema.chatMessages.conversationId, conversationId))
          .orderBy(schema.chatMessages.createdAt)
          .limit(limit)
          .offset(offset);
      }
      if (limit) {
        return await db
          .select()
          .from(schema.chatMessages)
          .where(eq(schema.chatMessages.conversationId, conversationId))
          .orderBy(schema.chatMessages.createdAt)
          .limit(limit);
      }
      if (offset) {
        return await db
          .select()
          .from(schema.chatMessages)
          .where(eq(schema.chatMessages.conversationId, conversationId))
          .orderBy(schema.chatMessages.createdAt)
          .offset(offset);
      }
      return await db
        .select()
        .from(schema.chatMessages)
        .where(eq(schema.chatMessages.conversationId, conversationId))
        .orderBy(schema.chatMessages.createdAt);
    } catch (error) {
      throw error;
    }
  }

  static async updateMessage(id: number, content: string): Promise<void> {
    const db = await this.getDatabase();

    try {
      await db
        .update(schema.chatMessages)
        .set({ content })
        .where(eq(schema.chatMessages.id, id));
    } catch (error) {
      throw error;
    }
  }

  static async deleteMessage(id: number): Promise<void> {
    const db = await this.getDatabase();

    try {
      // Delete context items for this message
      await db
        .delete(schema.contextItems)
        .where(eq(schema.contextItems.messageId, id));

      // Delete tool calls for this message
      await db
        .delete(schema.toolCalls)
        .where(eq(schema.toolCalls.messageId, id));

      // Delete the message itself
      await db
        .delete(schema.chatMessages)
        .where(eq(schema.chatMessages.id, id));
    } catch (error) {
      throw error;
    }
  }

  static async compactConversationMessages(
    conversationId: number,
    summarizedMessageIds: number[],
    summaryContent: string,
    createdAt?: string,
  ): Promise<ChatMessage | null> {
    if (summarizedMessageIds.length === 0) return null;

    const db = await this.getDatabase();

    try {
      await db
        .delete(schema.contextItems)
        .where(inArray(schema.contextItems.messageId, summarizedMessageIds));

      await db
        .delete(schema.toolCalls)
        .where(inArray(schema.toolCalls.messageId, summarizedMessageIds));

      await db
        .delete(schema.chatMessages)
        .where(
          and(
            eq(schema.chatMessages.conversationId, conversationId),
            inArray(schema.chatMessages.id, summarizedMessageIds),
          ),
        );

      const results = await db
        .insert(schema.chatMessages)
        .values({
          conversationId,
          role: 'system',
          content: summaryContent,
          metadata: {
            compacted: true,
            summarizedMessageCount: summarizedMessageIds.length,
          },
          createdAt: createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .returning();

      const [summaryMessage] = Array.isArray(results) ? results : [results];

      await db
        .update(schema.chatConversations)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(schema.chatConversations.id, conversationId));

      return summaryMessage ?? null;
    } catch (error) {
      throw error;
    }
  }

  static async getPromptTemplates(
    category?: string,
    providerType?: string,
  ): Promise<PromptTemplate[]> {
    const db = await this.getDatabase();

    try {
      const conditions = [];

      if (category) {
        conditions.push(eq(schema.promptTemplates.category, category));
      }

      if (providerType) {
        conditions.push(eq(schema.promptTemplates.providerType, providerType));
      }

      if (conditions.length > 0) {
        return await db
          .select()
          .from(schema.promptTemplates)
          .where(and(...conditions))
          .orderBy(schema.promptTemplates.name);
      }
      return await db
        .select()
        .from(schema.promptTemplates)
        .orderBy(schema.promptTemplates.name);
    } catch (error) {
      throw error;
    }
  }

  static async savePromptTemplate(
    template: NewPromptTemplate,
  ): Promise<PromptTemplate> {
    const db = await this.getDatabase();

    try {
      const results = await db
        .insert(schema.promptTemplates)
        .values(template)
        .returning();

      const result = results[0];
      if (!result) {
        throw new Error('Failed to save prompt template');
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  static async updatePromptTemplate(
    id: number,
    updates: Partial<NewPromptTemplate>,
  ): Promise<void> {
    const db = await this.getDatabase();

    try {
      await db
        .update(schema.promptTemplates)
        .set(updates)
        .where(eq(schema.promptTemplates.id, id));
    } catch (error) {
      throw error;
    }
  }

  static async deletePromptTemplate(id: number): Promise<void> {
    const db = await this.getDatabase();

    try {
      await db
        .delete(schema.promptTemplates)
        .where(eq(schema.promptTemplates.id, id));
    } catch (error) {
      throw error;
    }
  }

  // Analytics and Usage Logging
  static async logUsage(usage: NewAIUsageLog): Promise<void> {
    const db = await this.getDatabase();

    try {
      await db.insert(schema.aiUsageLogs).values(usage);
    } catch (error) {
      throw error;
    }
  }

  static async getUsageStats(
    timeframe: 'day' | 'week' | 'month',
    providerId?: number,
  ): Promise<UsageStats> {
    const db = await this.getDatabase();

    try {
      // Calculate date range based on timeframe
      const now = new Date();
      const startDate = new Date();

      switch (timeframe) {
        case 'day':
          startDate.setDate(now.getDate() - 1);
          break;
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
        default:
          startDate.setDate(now.getDate() - 7); // Default to week
          break;
      }

      const startDateStr = startDate.toISOString();

      // Build base query conditions
      const conditions = [eq(schema.aiUsageLogs.createdAt, startDateStr)];
      if (providerId) {
        conditions.push(eq(schema.aiUsageLogs.providerId, providerId));
      }

      // This is a simplified implementation
      // In production, you'd want more sophisticated aggregation queries
      const logs = await db
        .select()
        .from(schema.aiUsageLogs)
        .where(and(...conditions));

      // Calculate statistics
      const totalRequests = logs.length;
      const totalTokens = logs.reduce(
        (acc, log) => acc + (log.tokensUsed || 0),
        0,
      );
      const totalCost = logs.reduce(
        (acc, log) => acc + (log.costEstimate || 0),
        0,
      );
      const successfulLogs = logs.filter((log) => log.status === 'success');
      const successRate =
        totalRequests > 0 ? successfulLogs.length / totalRequests : 0;
      const averageResponseTime =
        logs.reduce((acc, log) => acc + log.durationMs, 0) / totalRequests || 0;

      // Group by provider
      const byProvider: UsageStats['byProvider'] = {};
      const byOperation: UsageStats['byOperation'] = {};

      logs.forEach((log) => {
        if (log.providerId) {
          if (!byProvider[log.providerId]) {
            byProvider[log.providerId] = {
              requests: 0,
              tokens: 0,
              cost: 0,
              avgResponseTime: 0,
            };
          }
          byProvider[log.providerId].requests += 1;
          byProvider[log.providerId].tokens += log.tokensUsed || 0;
          byProvider[log.providerId].cost += log.costEstimate || 0;
          byProvider[log.providerId].avgResponseTime += log.durationMs;
        }

        if (!byOperation[log.operationType]) {
          byOperation[log.operationType] = {
            requests: 0,
            tokens: 0,
            avgResponseTime: 0,
          };
        }
        byOperation[log.operationType].requests += 1;
        byOperation[log.operationType].tokens += log.tokensUsed || 0;
        byOperation[log.operationType].avgResponseTime += log.durationMs;
      });

      // Calculate averages
      Object.values(byProvider).forEach((stats) => {
        if (stats.requests > 0) {
          stats.avgResponseTime /= stats.requests;
        }
      });

      Object.values(byOperation).forEach((stats) => {
        if (stats.requests > 0) {
          stats.avgResponseTime /= stats.requests;
        }
      });

      return {
        totalRequests,
        totalTokens,
        totalCost,
        averageResponseTime,
        successRate,
        byProvider,
        byOperation,
      };
    } catch (error) {
      throw error;
    }
  }

  // Utility methods for database management
  static async closeDatabase(): Promise<void> {
    try {
      if (this.sqlite) {
        this.sqlite.close();
        this.sqlite = null;
        this.db = null;
      }
    } catch (error) {
      // Ignore close errors
    }
  }

  // Factory reset support (following SettingsService pattern)
  static async resetDatabase(): Promise<void> {
    try {
      await this.closeDatabase();

      // Remove database file
      const fs = await import('fs-extra');
      if (await fs.pathExists(this.DB_PATH)) {
        await fs.remove(this.DB_PATH);
      }

      // Reinitialize
      await this.initializeDatabase();
    } catch (error) {
      throw error;
    }
  }

  // Database Information Methods
  static async getDatabaseInfo(): Promise<MainDatabaseInfo> {
    try {
      const db = await this.getDatabase();
      const fs = await import('fs-extra');

      // Get file stats
      const stats = await fs.stat(this.DB_PATH);
      const sizeInBytes = stats.size;
      const sizeFormatted = this.formatFileSize(sizeInBytes);

      // Get SQLite version using raw connection
      const sqliteVersionResult = this.sqlite
        ?.prepare('SELECT sqlite_version() as version')
        .get() as { version: string };
      const sqliteVersion = sqliteVersionResult?.version || 'Unknown';

      // Get table counts
      const [
        conversationsResult,
        messagesResult,
        providersResult,
        templatesResult,
      ] = await Promise.all([
        db.select({ count: count() }).from(schema.chatConversations),
        db.select({ count: count() }).from(schema.chatMessages),
        db.select({ count: count() }).from(schema.aiProviders),
        db.select({ count: count() }).from(schema.promptTemplates),
      ]);

      return {
        path: this.DB_PATH,
        size: sizeFormatted,
        sqliteVersion,
        status: this.db ? 'connected' : 'disconnected',
        tablesCount: 8, // Updated count: ai_providers, chat_conversations, chat_messages, context_items, session_metadata, tool_calls, prompt_templates, ai_usage_logs
        conversationsCount: conversationsResult[0]?.count || 0,
        messagesCount: messagesResult[0]?.count || 0,
        providersCount: providersResult[0]?.count || 0,
        templatesCount: templatesResult[0]?.count || 0,
        createdAt: stats.birthtime.toISOString(),
        lastModified: stats.mtime.toISOString(),
      };
    } catch (error) {
      return {
        path: this.DB_PATH,
        size: 'Unknown',
        sqliteVersion: 'Unknown',
        status: 'error',
        tablesCount: 0,
        conversationsCount: 0,
        messagesCount: 0,
        providersCount: 0,
        templatesCount: 0,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      };
    }
  }

  // Continue.dev Enhanced Methods

  // Context Items Management
  static async addContextItems(
    messageId: number,
    contextItems: Omit<NewContextItem, 'messageId'>[],
  ): Promise<ContextItem[]> {
    const db = await this.getDatabase();

    try {
      const itemsToInsert = contextItems.map((item) => ({
        ...item,
        messageId,
      }));

      const results = await db
        .insert(schema.contextItems)
        .values(itemsToInsert)
        .returning();

      return results;
    } catch (error) {
      throw error;
    }
  }

  static async getContextItems(messageId: number): Promise<ContextItem[]> {
    const db = await this.getDatabase();

    try {
      return await db
        .select()
        .from(schema.contextItems)
        .where(eq(schema.contextItems.messageId, messageId));
    } catch (error) {
      throw error;
    }
  }

  // Enhanced Message Methods with Context
  static async addMessageWithContext(
    conversationId: number,
    message: Omit<NewChatMessage, 'conversationId'>,
    contextItems?: Omit<NewContextItem, 'messageId'>[],
    toolCalls?: Omit<NewToolCall, 'messageId'>[],
  ): Promise<ChatMessageWithContext> {
    const db = await this.getDatabase();

    try {
      // Insert message
      const messageResults = await db
        .insert(schema.chatMessages)
        .values({
          ...message,
          conversationId,
        })
        .returning();

      const [newMessage] = Array.isArray(messageResults)
        ? messageResults
        : [messageResults];
      if (!newMessage) {
        throw new Error('Failed to insert message');
      }

      // Insert context items if provided
      let contextItemsResult: ContextItem[] = [];
      if (contextItems && contextItems.length > 0) {
        contextItemsResult = await this.addContextItems(
          newMessage.id,
          contextItems,
        );
      }

      // Insert tool calls if provided
      let toolCallsResult: ToolCall[] = [];
      if (toolCalls && toolCalls.length > 0) {
        toolCallsResult = await this.addToolCalls(newMessage.id, toolCalls);
      }

      return {
        ...newMessage,
        contextItems: contextItemsResult,
        toolCalls: toolCallsResult,
      };
    } catch (error) {
      throw error;
    }
  }

  static async getMessageWithContext(
    messageId: number,
  ): Promise<ChatMessageWithContext | null> {
    const db = await this.getDatabase();

    try {
      const message = await db
        .select()
        .from(schema.chatMessages)
        .where(eq(schema.chatMessages.id, messageId));

      if (!message[0]) {
        return null;
      }

      const [contextItems, toolCalls] = await Promise.all([
        this.getContextItems(messageId),
        this.getToolCalls(messageId),
      ]);

      return {
        ...message[0],
        contextItems,
        toolCalls,
      };
    } catch (error) {
      throw error;
    }
  }

  // New method: Get messages with context items
  static async getMessagesWithContext(
    conversationId: number,
    limit?: number,
    offset?: number,
  ): Promise<ChatMessageWithContext[]> {
    try {
      // First get the messages using the existing method
      const messages = await this.getMessages(conversationId, limit, offset);

      // Then get context items and tool calls for each message
      const messagesWithContext = await Promise.all(
        messages.map(async (message) => {
          const [contextItems, toolCalls] = await Promise.all([
            this.getContextItems(message.id),
            this.getToolCalls(message.id),
          ]);

          return {
            ...message,
            contextItems,
            toolCalls,
          };
        }),
      );

      return messagesWithContext;
    } catch (error) {
      throw error;
    }
  }

  // Tool Calls Management
  static async addToolCalls(
    messageId: number,
    toolCalls: Omit<NewToolCall, 'messageId'>[],
  ): Promise<ToolCall[]> {
    const db = await this.getDatabase();

    try {
      const callsToInsert = toolCalls.map((call) => ({
        ...call,
        messageId,
      }));

      const results = await db
        .insert(schema.toolCalls)
        .values(callsToInsert)
        .returning();

      return results;
    } catch (error) {
      throw error;
    }
  }

  static async getToolCalls(messageId: number): Promise<ToolCall[]> {
    const db = await this.getDatabase();

    try {
      return await db
        .select()
        .from(schema.toolCalls)
        .where(eq(schema.toolCalls.messageId, messageId));
    } catch (error) {
      throw error;
    }
  }

  static async updateToolCall(
    id: number,
    updates: Partial<Omit<NewToolCall, 'messageId'>>,
  ): Promise<void> {
    const db = await this.getDatabase();

    try {
      await db
        .update(schema.toolCalls)
        .set(updates)
        .where(eq(schema.toolCalls.id, id));
    } catch (error) {
      throw error;
    }
  }

  // Session Metadata Management
  static async setSessionMetadata(
    conversationId: number,
    key: string,
    value: string,
  ): Promise<void> {
    const db = await this.getDatabase();

    try {
      await db
        .insert(schema.sessionMetadata)
        .values({
          conversationId,
          key,
          value,
          updatedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: [
            schema.sessionMetadata.conversationId,
            schema.sessionMetadata.key,
          ],
          set: {
            value,
            updatedAt: new Date().toISOString(),
          },
        });
    } catch (error) {
      throw error;
    }
  }

  static async getSessionMetadata(
    conversationId: number,
    key?: string,
  ): Promise<SessionMetadata[]> {
    const db = await this.getDatabase();

    try {
      if (key) {
        return await db
          .select()
          .from(schema.sessionMetadata)
          .where(
            and(
              eq(schema.sessionMetadata.conversationId, conversationId),
              eq(schema.sessionMetadata.key, key),
            ),
          );
      }

      return await db
        .select()
        .from(schema.sessionMetadata)
        .where(eq(schema.sessionMetadata.conversationId, conversationId));
    } catch (error) {
      throw error;
    }
  }

  static async deleteSessionMetadata(
    conversationId: number,
    key?: string,
  ): Promise<void> {
    const db = await this.getDatabase();

    try {
      if (key) {
        await db
          .delete(schema.sessionMetadata)
          .where(
            and(
              eq(schema.sessionMetadata.conversationId, conversationId),
              eq(schema.sessionMetadata.key, key),
            ),
          );
      } else {
        await db
          .delete(schema.sessionMetadata)
          .where(eq(schema.sessionMetadata.conversationId, conversationId));
      }
    } catch (error) {
      throw error;
    }
  }

  // Enhanced Conversation Methods
  static async getConversationWithContext(
    id: number,
  ): Promise<ChatConversationWithMessages | null> {
    const db = await this.getDatabase();

    try {
      const conversation = await db
        .select()
        .from(schema.chatConversations)
        .where(eq(schema.chatConversations.id, id));

      if (!conversation[0]) {
        return null;
      }

      // Get messages with their context items and tool calls
      const messages: ChatMessage[] = await db
        .select()
        .from(schema.chatMessages)
        .where(eq(schema.chatMessages.conversationId, id))
        .orderBy(schema.chatMessages.createdAt);

      // Get session metadata
      const sessionMetadata = await this.getSessionMetadata(id);

      return {
        ...conversation[0],
        messages,
        messageCount: messages.length,
        lastMessageAt: messages[messages.length - 1]?.createdAt || undefined,
        sessionMetadata,
      };
    } catch (error) {
      throw error;
    }
  }

  // Streaming Message Support
  static async updateMessageStreaming(
    messageId: number,
    isStreaming: boolean,
    content?: string,
  ): Promise<void> {
    const db = await this.getDatabase();

    try {
      const updates: Partial<NewChatMessage> = {
        isStreaming,
        updatedAt: new Date().toISOString(),
      };

      if (content !== undefined) {
        updates.content = content;
      }

      await db
        .update(schema.chatMessages)
        .set(updates)
        .where(eq(schema.chatMessages.id, messageId));
    } catch (error) {
      throw error;
    }
  }

  // Message Regeneration Support
  static async createMessageVariant(
    originalMessageId: number,
    newContent: string,
    metadata?: any,
  ): Promise<ChatMessage> {
    const db = await this.getDatabase();

    try {
      // Get original message
      const originalMessage = await db
        .select()
        .from(schema.chatMessages)
        .where(eq(schema.chatMessages.id, originalMessageId));

      if (!originalMessage[0]) {
        throw new Error('Original message not found');
      }

      // Create new message as variant
      const messageResults = await db
        .insert(schema.chatMessages)
        .values({
          conversationId: originalMessage[0].conversationId,
          role: originalMessage[0].role,
          content: newContent,
          metadata: metadata || originalMessage[0].metadata,
          parentMessageId: originalMessageId,
        })
        .returning();

      const [newMessage] = Array.isArray(messageResults)
        ? messageResults
        : [messageResults];
      if (!newMessage) {
        throw new Error('Failed to create message variant');
      }

      return newMessage;
    } catch (error) {
      throw error;
    }
  }

  private static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }
}
