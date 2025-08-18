/* eslint-disable no-useless-catch */
// Main Database Service using Drizzle ORM
// This service manages the SQLite database for AI providers and future features
// Following SettingsService patterns for consistency with existing codebase

import { app } from 'electron';
import path from 'path';
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, desc, and, count } from 'drizzle-orm';
import * as schema from '../schemas/mainDatabase.schema';
import { MainDatabaseInfo, UsageStats } from '../../types/backend';
import {
  AIProvider,
  NewAIProvider,
  ChatConversation,
  NewChatConversation,
  ChatMessage,
  NewChatMessage,
  PromptTemplate,
  NewPromptTemplate,
  NewAIUsageLog,
  ChatConversationWithMessages,
} from '../schemas/mainDatabase.schema';

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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Chat Conversations table
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        project_id INTEGER,
        provider_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE SET NULL
      );

      -- Chat Messages table
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE SET NULL,
        FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE SET NULL
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS ai_providers_name_idx ON ai_providers(name);
      CREATE INDEX IF NOT EXISTS ai_providers_type_idx ON ai_providers(type);
      CREATE INDEX IF NOT EXISTS ai_providers_active_idx ON ai_providers(is_active);
      
      CREATE INDEX IF NOT EXISTS chat_conversations_project_idx ON chat_conversations(project_id);
      CREATE INDEX IF NOT EXISTS chat_conversations_provider_idx ON chat_conversations(provider_id);
      CREATE INDEX IF NOT EXISTS chat_conversations_created_at_idx ON chat_conversations(created_at);
      
      CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx ON chat_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS chat_messages_role_idx ON chat_messages(role);
      CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON chat_messages(created_at);
      
      CREATE INDEX IF NOT EXISTS prompt_templates_category_idx ON prompt_templates(category);
      CREATE INDEX IF NOT EXISTS prompt_templates_provider_type_idx ON prompt_templates(provider_type);
      CREATE INDEX IF NOT EXISTS prompt_templates_system_idx ON prompt_templates(is_system);
      
      CREATE INDEX IF NOT EXISTS ai_usage_logs_provider_idx ON ai_usage_logs(provider_id);
      CREATE INDEX IF NOT EXISTS ai_usage_logs_conversation_idx ON ai_usage_logs(conversation_id);
      CREATE INDEX IF NOT EXISTS ai_usage_logs_operation_idx ON ai_usage_logs(operation_type);
      CREATE INDEX IF NOT EXISTS ai_usage_logs_status_idx ON ai_usage_logs(status);
      CREATE INDEX IF NOT EXISTS ai_usage_logs_created_at_idx ON ai_usage_logs(created_at);
    `;

    this.sqlite.exec(createTablesSQL);
  }

  // AI Provider Management (following SettingsService patterns)
  static async saveProvider(provider: NewAIProvider): Promise<AIProvider> {
    const db = await this.getDatabase();

    try {
      const [result] = await db
        .insert(schema.aiProviders)
        .values({
          ...provider,
          updatedAt: new Date().toISOString(),
        })
        .returning();

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
      const [result] = await db
        .select()
        .from(schema.aiProviders)
        .where(eq(schema.aiProviders.id, id));

      return result || null;
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
      const [result] = await db
        .select()
        .from(schema.aiProviders)
        .where(eq(schema.aiProviders.isActive, true));

      return result || null;
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

  // Chat Conversation Management
  static async createConversation(
    title: string,
    projectId?: number,
    providerId?: number,
  ): Promise<ChatConversation> {
    const db = await this.getDatabase();

    try {
      const [result] = await db
        .insert(schema.chatConversations)
        .values({
          title,
          projectId,
          providerId,
        })
        .returning();

      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getConversations(
    projectId?: number,
  ): Promise<ChatConversation[]> {
    const db = await this.getDatabase();

    try {
      const query = db
        .select()
        .from(schema.chatConversations)
        .orderBy(desc(schema.chatConversations.updatedAt));

      if (projectId !== undefined) {
        return await query.where(
          eq(schema.chatConversations.projectId, projectId),
        );
      }

      return await query;
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
      const [result] = await db
        .insert(schema.chatMessages)
        .values({
          ...message,
          conversationId,
        })
        .returning();

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
      await db
        .delete(schema.chatMessages)
        .where(eq(schema.chatMessages.id, id));
    } catch (error) {
      throw error;
    }
  }

  // Template Management
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
      const [result] = await db
        .insert(schema.promptTemplates)
        .values(template)
        .returning();

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
        tablesCount: 5, // Fixed number of AI tables
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

  private static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }
}
