// Drizzle Schema Definitions for Main Database
// This file defines the schema for AI providers and future features
// using Drizzle ORM for type-safe database operations

import {
  sqliteTable,
  integer,
  text,
  real,
  index,
} from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// AI Providers Configuration Table
export const aiProviders = sqliteTable(
  'ai_providers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    type: text('type').notNull(), // 'openai', 'ollama', 'gemini', 'anthropic'
    config: text('config', { mode: 'json' }).notNull(), // Provider-specific configuration
    isActive: integer('is_active', { mode: 'boolean' }).default(false),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
  },
  (table) => ({
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
    providerId: integer('provider_id').references(() => aiProviders.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
  },
  (table) => ({
    projectIdx: index('chat_conversations_project_idx').on(table.projectId),
    providerIdx: index('chat_conversations_provider_idx').on(table.providerId),
    createdAtIdx: index('chat_conversations_created_at_idx').on(
      table.createdAt,
    ),
  }),
);

// Chat Messages Table
export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'user', 'assistant', 'system'
    content: text('content').notNull(),
    metadata: text('metadata', { mode: 'json' }), // Provider-specific metadata, tokens, model info
    createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  },
  (table) => ({
    conversationIdx: index('chat_messages_conversation_idx').on(
      table.conversationId,
    ),
    roleIdx: index('chat_messages_role_idx').on(table.role),
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
    createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  },
  (table) => ({
    categoryIdx: index('prompt_templates_category_idx').on(table.category),
    providerTypeIdx: index('prompt_templates_provider_type_idx').on(
      table.providerType,
    ),
    systemIdx: index('prompt_templates_system_idx').on(table.isSystem),
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
    createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  },
  (table) => ({
    providerIdx: index('ai_usage_logs_provider_idx').on(table.providerId),
    conversationIdx: index('ai_usage_logs_conversation_idx').on(
      table.conversationId,
    ),
    operationIdx: index('ai_usage_logs_operation_idx').on(table.operationType),
    statusIdx: index('ai_usage_logs_status_idx').on(table.status),
    createdAtIdx: index('ai_usage_logs_created_at_idx').on(table.createdAt),
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
  }),
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
}));

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

// Export types for use throughout the application
export type AIProvider = typeof aiProviders.$inferSelect;
export type NewAIProvider = typeof aiProviders.$inferInsert;

export type ChatConversation = typeof chatConversations.$inferSelect;
export type NewChatConversation = typeof chatConversations.$inferInsert;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

export type PromptTemplate = typeof promptTemplates.$inferSelect;
export type NewPromptTemplate = typeof promptTemplates.$inferInsert;

export type AIUsageLog = typeof aiUsageLogs.$inferSelect;
export type NewAIUsageLog = typeof aiUsageLogs.$inferInsert;

// Complex query result types
export type ChatConversationWithMessages = ChatConversation & {
  messages: ChatMessage[];
  provider?: AIProvider;
  messageCount?: number;
  lastMessageAt?: string;
};

export type AIProviderWithStats = AIProvider & {
  conversationCount?: number;
  totalMessages?: number;
  totalTokens?: number;
  totalCost?: number;
};
