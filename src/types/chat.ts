// Chat Types for Continue.dev Integration
// Following existing type patterns from backend.ts and frontend.ts

import {
  ChatMessage,
  ContextItem,
  ContextItemType,
  MessageRole,
  ToolCall,
} from '../main/schemas/mainDatabase.schema';

// Re-export types from database schema for consistency
export type {
  ChatConversation,
  NewChatConversation,
  ChatMessage,
  NewChatMessage,
  ChatMessageWithContext,
  ContextItem,
  NewContextItem,
  ToolCall,
  NewToolCall,
  SessionMetadata,
  NewSessionMetadata,
  ChatConversationWithMessages,
  ContextItemType,
  ToolCallStatus,
  MessageRole,
  FileContextMetadata,
  FolderContextMetadata,
  SearchContextMetadata,
  UrlContextMetadata,
  DocsContextMetadata,
  CodebaseContextMetadata,
} from '../main/schemas/mainDatabase.schema';

// Frontend-specific aliases for better naming consistency
export type ChatSession =
  import('../main/schemas/mainDatabase.schema').ChatConversation;
export type NewChatSession =
  import('../main/schemas/mainDatabase.schema').NewChatConversation;

// Continue.dev specific frontend types
export interface ChatInputState {
  content: string;
  contextItems: ContextItem[];
  isStreaming: boolean;
  selectedFiles: string[];
  mentionQuery: string;
}

export interface ChatUIState {
  selectedSessionId: string | null;
  sidebarOpen: boolean;
  isLoading: boolean;
  error: string | null;
  streamingMessageId: string | null;
}

export interface MentionItem {
  id: string;
  type: 'file' | 'folder' | 'codebase' | 'docs' | 'url';
  label: string;
  description: string;
  icon?: string;
  metadata?: Record<string, any>;
}

export interface StreamingChunk {
  conversationId: string;
  messageId: string;
  chunk: string;
  done: boolean;
  timestamp: string;
}

export interface ChatContextProvider {
  type: ContextItemType;
  name: string;
  description: string;
  icon: string;
  resolve: (query: string) => Promise<ContextItem[]>;
  validate?: (query: string) => boolean;
}

// Tool execution types
export interface ToolExecutionResult {
  success: boolean;
  message: string;
  output?: any;
  error?: string;
  duration?: number;
}

// Session management types
export interface SessionListItem {
  id: string;
  title: string;
  lastMessageAt?: string;
  messageCount: number;
  projectId?: number;
  isActive: boolean;
}

// Message rendering types
export interface MessageAction {
  id: string;
  label: string;
  icon: string;
  handler: (message: ChatMessage) => void;
  visible?: (message: ChatMessage) => boolean;
}

// Context item display types
export interface ContextItemDisplay {
  item: ContextItem;
  isRemovable: boolean;
  onRemove?: (id: string) => void;
}

// Streaming configuration
export interface StreamingConfig {
  enabled: boolean;
  chunkSize: number;
  timeout: number;
  retryAttempts: number;
}

// Chat configuration
export interface ChatConfig {
  maxMessages: number;
  maxContextItems: number;
  autoSave: boolean;
  streaming: StreamingConfig;
  defaultProvider?: string;
}

// Error types specific to chat
export interface ChatError extends Error {
  code:
    | 'NETWORK_ERROR'
    | 'PROVIDER_ERROR'
    | 'CONTEXT_ERROR'
    | 'STREAMING_ERROR'
    | 'UNKNOWN_ERROR';
  details?: any;
  retryable: boolean;
}

// Event types for chat system
export interface ChatEvents {
  'message:sent': { sessionId: string; message: ChatMessage };
  'message:received': { sessionId: string; message: ChatMessage };
  'message:streaming': { sessionId: string; messageId: string; chunk: string };
  'session:created': { session: ChatSession };
  'session:deleted': { sessionId: string };
  'context:added': { messageId: string; items: ContextItem[] };
  'tool:executed': { toolCallId: string; result: ToolExecutionResult };
}

// Hook return types for React Query integration
export interface UseChatSessionsResult {
  sessions: ChatSession[];
  isLoading: boolean;
  error: ChatError | null;
  refetch: () => void;
}

export interface UseChatMessagesResult {
  messages: ChatMessage[];
  isLoading: boolean;
  error: ChatError | null;
  hasMore: boolean;
  loadMore: () => void;
}

export interface UseStreamMessageResult {
  streamMessage: (
    sessionId: string,
    content: string,
    contextItems?: ContextItem[],
  ) => Promise<ChatMessage>;
  isStreaming: boolean;
  error: ChatError | null;
  cancel: () => void;
}

// Form types for chat components
export interface CreateSessionForm {
  title: string;
  projectId?: number;
  providerId?: number;
}

export interface SendMessageForm {
  content: string;
  contextItems: ContextItem[];
  toolCalls?: ToolCall[];
}

// Search and filter types
export interface SessionFilter {
  projectId?: number;
  providerId?: number;
  dateRange?: {
    start: Date;
    end: Date;
  };
  searchQuery?: string;
}

export interface MessageFilter {
  role?: MessageRole;
  hasContext?: boolean;
  hasTools?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

// Export utility types
export type ChatServiceMethod =
  keyof typeof import('../renderer/services/chat.service').chatService;
export type ChatControllerHook = string; // Will be defined when controllers are created

// Constants
export const CHAT_CONSTANTS = {
  MAX_MESSAGE_LENGTH: 10000,
  MAX_CONTEXT_ITEMS: 20,
  MAX_TOOL_CALLS: 10,
  STREAMING_TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  DEBOUNCE_DELAY: 300,
} as const;

export const CONTEXT_PROVIDER_TYPES = {
  FILE: 'file',
  FOLDER: 'folder',
  CODEBASE: 'codebase',
  DOCS: 'docs',
  URL: 'url',
  SEARCH: 'search',
} as const;

export const MESSAGE_ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  TOOL: 'tool',
  THINKING: 'thinking',
} as const;

export const TOOL_CALL_STATUSES = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;
