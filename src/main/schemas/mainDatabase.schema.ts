// Drizzle Schema Definitions for Main Database
// This file defines the schema for AI providers and future features
// using Drizzle ORM for type-safe database operations

import {
  sqliteTable,
  integer,
  text,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql, relations } from 'drizzle-orm';

// AI Providers Configuration Table
export const aiProviders = sqliteTable(
  'ai_providers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    type: text('type').notNull(), // 'openai', 'ollama', 'gemini', 'anthropic'
    config: text('config', { mode: 'json' }).notNull(), // Provider-specific configuration
    isActive: integer('is_active', { mode: 'boolean' }).default(false),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table: any) => ({
    nameIdx: index('ai_providers_name_idx').on(table.name),
    typeIdx: index('ai_providers_type_idx').on(table.type),
    activeIdx: index('ai_providers_active_idx').on(table.isActive),
  }),
);

// Chat Conversations Table
export const chatConversations = sqliteTable(
  'chat_conversations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    projectId: integer('project_id'), // References existing project IDs from database.json (read-only)
    screenKey: text('screen_key').default('project').notNull(),
    connectionId: text('connection_id'),
    providerId: integer('provider_id').references(() => aiProviders.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table: any) => ({
    projectIdx: index('chat_conversations_project_idx').on(table.projectId),
    screenKeyIdx: index('chat_conversations_screen_key_idx').on(
      table.screenKey,
    ),
    connectionIdx: index('chat_conversations_connection_idx').on(
      table.connectionId,
    ),
    providerIdx: index('chat_conversations_provider_idx').on(table.providerId),
    createdAtIdx: index('chat_conversations_created_at_idx').on(
      table.createdAt,
    ),
  }),
);

// Chat Messages Table - Enhanced with Continue.dev features
// Workaround for self-referencing table circular type error
export const chatMessages: any = sqliteTable(
  'chat_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'user', 'assistant', 'system', 'tool', 'thinking'
    content: text('content').notNull(),
    metadata: text('metadata', { mode: 'json' }), // Provider-specific metadata, tokens, model info
    // Continue.dev enhancements
    toolCalls: text('tool_calls', { mode: 'json' }), // Tool call information
    contextItems: text('context_items', { mode: 'json' }), // Associated context items
    thinkingContent: text('thinking_content'), // For reasoning/thinking messages
    signature: text('signature'), // Message signature for verification
    // Streaming and editing support
    isStreaming: integer('is_streaming', { mode: 'boolean' }).default(false),
    parentMessageId: integer('parent_message_id').references(
      () => chatMessages.id as any,
      { onDelete: 'set null' },
    ), // For message editing/regeneration
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table: any) => ({
    conversationIdx: index('chat_messages_conversation_idx').on(
      table.conversationId,
    ),
    roleIdx: index('chat_messages_role_idx').on(table.role),
    parentIdx: index('chat_messages_parent_idx').on(table.parentMessageId),
    streamingIdx: index('chat_messages_streaming_idx').on(table.isStreaming),
    createdAtIdx: index('chat_messages_created_at_idx').on(table.createdAt),
  }),
);

// AI Prompt Templates Table
export const promptTemplates = sqliteTable(
  'prompt_templates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    template: text('template').notNull(),
    category: text('category').notNull(), // 'model_enhancement', 'dashboard', 'chat', 'custom', 'sql_optimization'
    providerType: text('provider_type'), // null for universal templates
    isSystem: integer('is_system', { mode: 'boolean' }).default(false),
    variables: text('variables', { mode: 'json' }), // Array of template variables
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table: any) => ({
    categoryIdx: index('prompt_templates_category_idx').on(table.category),
    providerTypeIdx: index('prompt_templates_provider_type_idx').on(
      table.providerType,
    ),
    systemIdx: index('prompt_templates_system_idx').on(table.isSystem),
  }),
);

// Context Items Table - For Continue.dev context providers
export const contextItems = sqliteTable(
  'context_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    messageId: integer('message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'file', 'folder', 'url', 'search', 'docs', 'codebase'
    name: text('name').notNull(),
    description: text('description'),
    content: text('content').notNull(),
    metadata: text('metadata', { mode: 'json' }), // Type-specific metadata (file path, line numbers, etc.)
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table: any) => ({
    messageIdx: index('context_items_message_idx').on(table.messageId),
    typeIdx: index('context_items_type_idx').on(table.type),
    nameIdx: index('context_items_name_idx').on(table.name),
  }),
);

// Session Metadata Table - For Continue.dev session-specific data
export const sessionMetadata = sqliteTable(
  'session_metadata',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table: any) => ({
    conversationIdx: index('session_metadata_conversation_idx').on(
      table.conversationId,
    ),
    keyIdx: index('session_metadata_key_idx').on(table.key),
    uniqueConversationKey: index('session_metadata_unique_idx').on(
      table.conversationId,
      table.key,
    ),
  }),
);

// Chat Compaction Summaries Table - For Phase 8 long-context management
export const chatCompactionSummaries = sqliteTable(
  'chat_compaction_summaries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    coversUpToMessageId: integer('covers_up_to_message_id'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table: any) => ({
    conversationIdx: index('chat_compaction_summaries_conversation_idx').on(
      table.conversationId,
    ),
  }),
);

// Tool Calls Table - For Continue.dev tool execution tracking
export const toolCalls = sqliteTable(
  'tool_calls',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    messageId: integer('message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    toolName: text('tool_name').notNull(),
    toolInput: text('tool_input', { mode: 'json' }).notNull(),
    toolOutput: text('tool_output', { mode: 'json' }),
    status: text('status').notNull().default('pending'), // 'pending', 'running', 'completed', 'failed', 'cancelled'
    startedAt: text('started_at').default(sql`CURRENT_TIMESTAMP`),
    completedAt: text('completed_at'),
    errorMessage: text('error_message'),
  },
  (table: any) => ({
    messageIdx: index('tool_calls_message_idx').on(table.messageId),
    toolNameIdx: index('tool_calls_tool_name_idx').on(table.toolName),
    statusIdx: index('tool_calls_status_idx').on(table.status),
    startedAtIdx: index('tool_calls_started_at_idx').on(table.startedAt),
  }),
);

// AI Usage Analytics Table
export const aiUsageLogs = sqliteTable(
  'ai_usage_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    providerId: integer('provider_id').references(() => aiProviders.id, {
      onDelete: 'set null',
    }),
    conversationId: integer('conversation_id').references(
      () => chatConversations.id,
      { onDelete: 'set null' },
    ),
    operationType: text('operation_type').notNull(), // 'chat', 'enhance_model', 'generate_dashboard', 'sql_optimization'
    tokensUsed: integer('tokens_used'),
    costEstimate: real('cost_estimate'), // Using real for decimal precision
    durationMs: integer('duration_ms').notNull(),
    status: text('status').notNull(), // 'success', 'error', 'partial'
    errorMessage: text('error_message'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table: any) => ({
    providerIdx: index('ai_usage_logs_provider_idx').on(table.providerId),
    conversationIdx: index('ai_usage_logs_conversation_idx').on(
      table.conversationId,
    ),
    operationIdx: index('ai_usage_logs_operation_idx').on(table.operationType),
    statusIdx: index('ai_usage_logs_status_idx').on(table.status),
    createdAtIdx: index('ai_usage_logs_created_at_idx').on(table.createdAt),
  }),
);

// --- Agent Memory System Tables (OpenClaw style) ---

export const agentMemoryEntries = sqliteTable(
  'agent_memory_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scopeKey: text('scope_key').notNull(),
    screenKey: text('screen_key').notNull().default('global'),
    projectId: text('project_id'),
    connectionId: text('connection_id'),
    notebookId: text('notebook_id'),
    kind: text('kind').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id'),
    title: text('title'),
    content: text('content').notNull(),
    summary: text('summary'),
    importance: real('importance').notNull().default(0.5),
    confidence: real('confidence').notNull().default(0.8),
    status: text('status').notNull().default('active'),
    tags: text('tags'),
    metadata: text('metadata'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
    lastAccessedAt: text('last_accessed_at'),
    accessCount: integer('access_count').notNull().default(0),
    promotedAt: text('promoted_at'),
    archived: integer('archived').notNull().default(0),
  },
  (table: any) => ({
    scopeIdx: index('ame_scope_idx').on(table.scopeKey),
    screenIdx: index('ame_screen_idx').on(table.screenKey),
    projectIdx: index('ame_project_idx').on(table.projectId),
    connectionIdx: index('ame_connection_idx').on(table.connectionId),
    notebookIdx: index('ame_notebook_idx').on(table.notebookId),
    kindIdx: index('ame_kind_idx').on(table.kind),
    sourceIdx: index('ame_source_idx').on(table.sourceType, table.sourceId),
    updatedIdx: index('ame_updated_idx').on(table.updatedAt),
    archivedIdx: index('ame_archived_idx').on(table.archived),
  }),
);

export const agentMemorySessionCorpus = sqliteTable(
  'agent_memory_session_corpus',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: integer('conversation_id'),
    messageId: integer('message_id'),
    dayBucket: text('day_bucket').notNull(),
    screenKey: text('screen_key').notNull(),
    projectId: text('project_id'),
    connectionId: text('connection_id'),
    notebookId: text('notebook_id'),
    role: text('role').notNull(),
    snippet: text('snippet').notNull(),
    messageHash: text('message_hash').notNull().unique(),
    tokenEstimate: integer('token_estimate'),
    metadata: text('metadata'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
);

export const agentMemoryDailyEntries = sqliteTable(
  'agent_memory_daily_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    dayBucket: text('day_bucket').notNull(),
    scopeKey: text('scope_key').notNull(),
    screenKey: text('screen_key').notNull(),
    projectId: text('project_id'),
    connectionId: text('connection_id'),
    notebookId: text('notebook_id'),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id'),
    content: text('content').notNull(),
    summary: text('summary'),
    metadata: text('metadata'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table: any) => ({
    dayIdx: index('amde_day_idx').on(table.dayBucket),
    scopeIdx: index('amde_scope_idx').on(table.scopeKey),
  }),
);

export const agentMemoryShortTermRecall = sqliteTable(
  'agent_memory_short_term_recall',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recallKey: text('recall_key').notNull().unique(),
    scopeKey: text('scope_key').notNull(),
    screenKey: text('screen_key').notNull(),
    projectId: text('project_id'),
    connectionId: text('connection_id'),
    notebookId: text('notebook_id'),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id'),
    snippet: text('snippet').notNull(),
    recallCount: integer('recall_count').notNull().default(0),
    dailyCount: integer('daily_count').notNull().default(0),
    groundedCount: integer('grounded_count').notNull().default(0),
    totalScore: real('total_score').notNull().default(0),
    maxScore: real('max_score').notNull().default(0),
    queryHashes: text('query_hashes'),
    recallDays: text('recall_days'),
    conceptTags: text('concept_tags'),
    claimHash: text('claim_hash'),
    firstRecalledAt: text('first_recalled_at').default(sql`CURRENT_TIMESTAMP`),
    lastRecalledAt: text('last_recalled_at').default(sql`CURRENT_TIMESTAMP`),
    promotedAt: text('promoted_at'),
    metadata: text('metadata'),
  },
);

export const agentMemoryPhaseSignals = sqliteTable(
  'agent_memory_phase_signals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recallKey: text('recall_key').notNull(),
    phase: text('phase').notNull(),
    hitCount: integer('hit_count').notNull().default(0),
    firstHitAt: text('first_hit_at').default(sql`CURRENT_TIMESTAMP`),
    lastHitAt: text('last_hit_at').default(sql`CURRENT_TIMESTAMP`),
    metadata: text('metadata'),
  },
  (table: any) => ({
    uniquePhaseIdx: uniqueIndex('amps_unique_idx').on(
      table.recallKey,
      table.phase,
    ),
  }),
);

export const agentMemoryDreamingRuns = sqliteTable(
  'agent_memory_dreaming_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    triggerType: text('trigger_type').notNull(),
    startedAt: text('started_at').default(sql`CURRENT_TIMESTAMP`),
    completedAt: text('completed_at'),
    status: text('status').notNull().default('running'),
    lightCount: integer('light_count').notNull().default(0),
    remCount: integer('rem_count').notNull().default(0),
    promotedCount: integer('promoted_count').notNull().default(0),
    errorMessage: text('error_message'),
    metadata: text('metadata'),
  },
  (table: any) => ({
    startedIdx: index('amdr_started_idx').on(table.startedAt),
  }),
);

export const agentMemoryDreamingReports = sqliteTable(
  'agent_memory_dreaming_reports',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: integer('run_id').references(() => agentMemoryDreamingRuns.id, {
      onDelete: 'set null',
    }),
    phase: text('phase').notNull(),
    dayBucket: text('day_bucket').notNull(),
    content: text('content').notNull(),
    metadata: text('metadata'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
);

export const agentMemoryEmbeddingCache = sqliteTable(
  'agent_memory_embedding_cache',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    contentHash: text('content_hash').notNull(),
    dims: integer('dims'),
    embedding: text('embedding').notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table: any) => ({
    uniqueCacheIdx: uniqueIndex('amec_unique_idx').on(
      table.provider,
      table.model,
      table.contentHash,
    ),
  }),
);

export const agentMemoryConfig = sqliteTable('agent_memory_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const agentMemoryHealthSnapshots = sqliteTable(
  'agent_memory_health_snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    healthScore: real('health_score').notNull(),
    shortTermCount: integer('short_term_count').notNull().default(0),
    durableCount: integer('durable_count').notNull().default(0),
    staleCount: integer('stale_count').notNull().default(0),
    orphanCount: integer('orphan_count').notNull().default(0),
    duplicateCount: integer('duplicate_count').notNull().default(0),
    metadata: text('metadata'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table: any) => ({
    createdIdx: index('amhs_created_idx').on(table.createdAt),
  }),
);

// Define Relations for Drizzle ORM
export const aiProvidersRelations = relations(aiProviders, ({ many }) => ({
  conversations: many(chatConversations),
  usageLogs: many(aiUsageLogs),
}));

export const chatConversationsRelations = relations(
  chatConversations,
  ({ one, many }) => ({
    provider: one(aiProviders, {
      fields: [chatConversations.providerId],
      references: [aiProviders.id],
    }),
    messages: many(chatMessages),
    usageLogs: many(aiUsageLogs),
    sessionMetadata: many(sessionMetadata),
    compactionSummaries: many(chatCompactionSummaries),
  }),
);

export const chatMessagesRelations = relations(
  chatMessages,
  ({ one, many }) => ({
    conversation: one(chatConversations, {
      fields: [chatMessages.conversationId],
      references: [chatConversations.id],
    }),
    parentMessage: one(chatMessages, {
      fields: [chatMessages.parentMessageId],
      references: [chatMessages.id],
    }),
    contextItems: many(contextItems),
    toolCalls: many(toolCalls),
  }),
);

export const contextItemsRelations = relations(contextItems, ({ one }) => ({
  message: one(chatMessages, {
    fields: [contextItems.messageId],
    references: [chatMessages.id],
  }),
}));

export const sessionMetadataRelations = relations(
  sessionMetadata,
  ({ one }) => ({
    conversation: one(chatConversations, {
      fields: [sessionMetadata.conversationId],
      references: [chatConversations.id],
    }),
  }),
);

export const toolCallsRelations = relations(toolCalls, ({ one }) => ({
  message: one(chatMessages, {
    fields: [toolCalls.messageId],
    references: [chatMessages.id],
  }),
}));

export const chatCompactionSummariesRelations = relations(
  chatCompactionSummaries,
  ({ one }) => ({
    conversation: one(chatConversations, {
      fields: [chatCompactionSummaries.conversationId],
      references: [chatConversations.id],
    }),
  }),
);

export const aiUsageLogsRelations = relations(aiUsageLogs, ({ one }) => ({
  provider: one(aiProviders, {
    fields: [aiUsageLogs.providerId],
    references: [aiProviders.id],
  }),
  conversation: one(chatConversations, {
    fields: [aiUsageLogs.conversationId],
    references: [chatConversations.id],
  }),
}));

export const agentMemoryDreamingReportsRelations = relations(
  agentMemoryDreamingReports,
  ({ one }) => ({
    run: one(agentMemoryDreamingRuns, {
      fields: [agentMemoryDreamingReports.runId],
      references: [agentMemoryDreamingRuns.id],
    }),
  }),
);

export const agentMemoryDreamingRunsRelations = relations(
  agentMemoryDreamingRuns,
  ({ many }) => ({
    reports: many(agentMemoryDreamingReports),
  }),
);

// Export types for use throughout the application
export type AIProvider = typeof aiProviders.$inferSelect;
export type NewAIProvider = typeof aiProviders.$inferInsert;

export type ChatConversation = typeof chatConversations.$inferSelect;
export type NewChatConversation = typeof chatConversations.$inferInsert;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

export type ContextItem = typeof contextItems.$inferSelect;
export type NewContextItem = typeof contextItems.$inferInsert;

export type SessionMetadata = typeof sessionMetadata.$inferSelect;
export type NewSessionMetadata = typeof sessionMetadata.$inferInsert;

export type ToolCall = typeof toolCalls.$inferSelect;
export type NewToolCall = typeof toolCalls.$inferInsert;

export type PromptTemplate = typeof promptTemplates.$inferSelect;
export type NewPromptTemplate = typeof promptTemplates.$inferInsert;

export type AIUsageLog = typeof aiUsageLogs.$inferSelect;
export type NewAIUsageLog = typeof aiUsageLogs.$inferInsert;

export type AgentMemoryEntry = typeof agentMemoryEntries.$inferSelect;
export type NewAgentMemoryEntry = typeof agentMemoryEntries.$inferInsert;

export type AgentMemorySessionCorpus = typeof agentMemorySessionCorpus.$inferSelect;
export type NewAgentMemorySessionCorpus = typeof agentMemorySessionCorpus.$inferInsert;

export type AgentMemoryDailyEntry = typeof agentMemoryDailyEntries.$inferSelect;
export type NewAgentMemoryDailyEntry = typeof agentMemoryDailyEntries.$inferInsert;

export type AgentMemoryShortTermRecall = typeof agentMemoryShortTermRecall.$inferSelect;
export type NewAgentMemoryShortTermRecall = typeof agentMemoryShortTermRecall.$inferInsert;

export type AgentMemoryPhaseSignal = typeof agentMemoryPhaseSignals.$inferSelect;
export type NewAgentMemoryPhaseSignal = typeof agentMemoryPhaseSignals.$inferInsert;

export type AgentMemoryDreamingRun = typeof agentMemoryDreamingRuns.$inferSelect;
export type NewAgentMemoryDreamingRun = typeof agentMemoryDreamingRuns.$inferInsert;

export type AgentMemoryDreamingReport = typeof agentMemoryDreamingReports.$inferSelect;
export type NewAgentMemoryDreamingReport = typeof agentMemoryDreamingReports.$inferInsert;

export type AgentMemoryEmbeddingCache = typeof agentMemoryEmbeddingCache.$inferSelect;
export type NewAgentMemoryEmbeddingCache = typeof agentMemoryEmbeddingCache.$inferInsert;

export type AgentMemoryConfig = typeof agentMemoryConfig.$inferSelect;
export type NewAgentMemoryConfig = typeof agentMemoryConfig.$inferInsert;

export type AgentMemoryHealthSnapshot =
  typeof agentMemoryHealthSnapshots.$inferSelect;
export type NewAgentMemoryHealthSnapshot =
  typeof agentMemoryHealthSnapshots.$inferInsert;

// Complex query result types - Enhanced with Continue.dev features
export type ChatConversationWithMessages = ChatConversation & {
  messages: ChatMessage[];
  provider?: AIProvider;
  messageCount?: number;
  lastMessageAt?: string;
  sessionMetadata?: SessionMetadata[];
};

export type ChatMessageWithContext = ChatMessage & {
  contextItems: ContextItem[];
  toolCalls: ToolCall[];
  parentMessage?: ChatMessage;
};

export type AIProviderWithStats = AIProvider & {
  conversationCount?: number;
  totalMessages?: number;
  totalTokens?: number;
  totalCost?: number;
};

// Continue.dev specific types
export type ContextItemType =
  | 'file'
  | 'folder'
  | 'url'
  | 'search'
  | 'docs'
  | 'codebase';

export type ToolCallStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool' | 'thinking';

// Context item metadata types for different providers
export interface FileContextMetadata {
  path: string;
  startLine?: number;
  endLine?: number;
  language?: string;
  size?: number;
}

export interface FolderContextMetadata {
  path: string;
  fileCount?: number;
  totalSize?: number;
}

export interface SearchContextMetadata {
  query: string;
  resultCount?: number;
  searchType?: 'content' | 'filename' | 'symbol';
}

export interface UrlContextMetadata {
  url: string;
  title?: string;
  contentType?: string;
  fetchedAt?: string;
}

export interface DocsContextMetadata {
  source: string;
  section?: string;
  url?: string;
  relevanceScore?: number;
}

export interface CodebaseContextMetadata {
  query: string;
  files: string[];
  relevanceScore?: number;
  searchMethod?: 'semantic' | 'keyword' | 'symbol';
}
