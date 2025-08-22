import { client } from '../config/client';
import type {
  ChatSession,
  ChatMessage,
  ChatMessageWithContext,
  ContextItem,
  ToolCall,
  SessionMetadata,
  NewChatSession,
  NewChatMessage,
  NewContextItem,
  NewToolCall,
  ChatConversationWithMessages,
} from '../../types/chat';

class ChatService {
  // Chat Session Management

  // Get all chat sessions
  static async getSessions(projectId?: number): Promise<ChatSession[]> {
    const { data } = await client.post<number | undefined, ChatSession[]>(
      'chat:conversation:list',
      projectId,
    );
    return data;
  }

  // Get specific chat session
  static async getSession(sessionId: number): Promise<ChatSession | null> {
    const { data } = await client.post<number, ChatSession | null>(
      'chat:conversation:get',
      sessionId,
    );
    return data;
  }

  // Get session with full context
  static async getSessionWithContext(
    sessionId: number,
  ): Promise<ChatConversationWithMessages | null> {
    const { data } = await client.post<
      number,
      ChatConversationWithMessages | null
    >('chat:conversation:get-with-context', sessionId);
    return data;
  }

  // Create new chat session
  static async createSession(
    title: string,
    projectId?: number,
    providerId?: number,
  ): Promise<ChatSession> {
    const { data } = await client.post<
      { title: string; projectId?: number; providerId?: number },
      ChatSession
    >('chat:conversation:create', { title, projectId, providerId });
    return data;
  }

  // Update chat session
  static async updateSession(
    sessionId: number,
    updates: Partial<NewChatSession>,
  ): Promise<void> {
    await client.post<{ id: number; updates: Partial<NewChatSession> }>(
      'chat:conversation:update',
      { id: sessionId, updates },
    );
  }

  // Delete chat session
  static async deleteSession(sessionId: number): Promise<void> {
    await client.post<number>('chat:conversation:delete', sessionId);
  }

  // Chat Message Management

  // Get messages for a session
  static async getMessages(
    sessionId: number,
    limit?: number,
    offset?: number,
  ): Promise<ChatMessage[]> {
    const { data } = await client.post<
      { sessionId: number; limit?: number; offset?: number },
      ChatMessage[]
    >('chat:message:list', { sessionId, limit, offset });
    return data;
  }

  // Get message with full context
  static async getMessageWithContext(
    messageId: number,
  ): Promise<ChatMessageWithContext | null> {
    const { data } = await client.post<number, ChatMessageWithContext | null>(
      'chat:message:get-with-context',
      messageId,
    );
    return data;
  }

  // Send a regular message
  static async sendMessage(
    sessionId: number,
    content: string,
    metadata?: any,
    role: 'user' | 'assistant' | 'system' = 'user',
  ): Promise<ChatMessage> {
    const message: Omit<NewChatMessage, 'conversationId'> = {
      role,
      content,
      metadata,
    };

    const { data } = await client.post<
      {
        conversationId: number;
        message: Omit<NewChatMessage, 'conversationId'>;
      },
      ChatMessage
    >('chat:message:send', { conversationId: sessionId, message });
    return data;
  }

  // Send message with context items and tool calls
  static async sendMessageWithContext(
    sessionId: number,
    content: string,
    contextItems?: Omit<NewContextItem, 'messageId'>[],
    toolCalls?: Omit<NewToolCall, 'messageId'>[],
    metadata?: any,
    role: 'user' | 'assistant' | 'system' = 'user',
  ): Promise<ChatMessageWithContext> {
    const message: Omit<NewChatMessage, 'conversationId'> = {
      role,
      content,
      metadata,
    };

    const { data } = await client.post<
      {
        conversationId: number;
        message: Omit<NewChatMessage, 'conversationId'>;
        contextItems?: Omit<NewContextItem, 'messageId'>[];
        toolCalls?: Omit<NewToolCall, 'messageId'>[];
      },
      ChatMessageWithContext
    >('chat:message:add-with-context', {
      conversationId: sessionId,
      message,
      contextItems,
      toolCalls,
    });
    return data;
  }

  // Regenerate message (create variant)
  static async regenerateMessage(
    originalMessageId: number,
    newContent: string,
    metadata?: any,
  ): Promise<ChatMessage> {
    const { data } = await client.post<
      {
        originalMessageId: number;
        newContent: string;
        metadata?: any;
      },
      ChatMessage
    >('chat:message:regenerate', {
      originalMessageId,
      newContent,
      metadata,
    });
    return data;
  }

  // Stream message (foundation for real-time AI responses)
  static async streamMessage(
    sessionId: number,
    content: string,
    contextItems?: Omit<NewContextItem, 'messageId'>[],
    onChunk?: (chunk: string) => void,
  ): Promise<ChatMessageWithContext> {
    // Set up streaming listener if callback provided
    let unsubscribe: (() => void) | null = null;

    if (onChunk) {
      // The preload `on()` already strips the IpcRendererEvent and passes only args
      // so our handler receives the payload directly as the first argument.
      unsubscribe = window.electron.ipcRenderer.on(
        'chat:message:stream-chunk',
        (...args: unknown[]) => {
          const data = args[0] as {
            conversationId: number;
            chunk: string;
            done: boolean;
          };
          if (data && data.conversationId === sessionId) {
            onChunk(data.chunk);
          }
        },
      );
    }

    try {
      const { data } = await client.post<
        {
          conversationId: number;
          content: string;
          contextItems?: Omit<NewContextItem, 'messageId'>[];
        },
        ChatMessageWithContext
      >('chat:message:stream', {
        conversationId: sessionId,
        content,
        contextItems,
      });

      return data;
    } finally {
      if (unsubscribe) {
        unsubscribe();
      }
    }
  }

  // Context Management

  // Add context items to a message
  static async addContextItems(
    messageId: number,
    contextItems: Omit<NewContextItem, 'messageId'>[],
  ): Promise<ContextItem[]> {
    const { data } = await client.post<
      {
        messageId: number;
        contextItems: Omit<NewContextItem, 'messageId'>[];
      },
      ContextItem[]
    >('chat:context:add-items', { messageId, contextItems });
    return data;
  }

  // Get context items for a message
  static async getContextItems(messageId: number): Promise<ContextItem[]> {
    const { data } = await client.post<number, ContextItem[]>(
      'chat:context:get-items',
      messageId,
    );
    return data;
  }

  // Context Resolution Methods

  // Resolve file context
  static async resolveFileContext(filePath: string): Promise<ContextItem> {
    try {
      const { data } = await client.post<string, ContextItem>(
        'chat:context:resolve-file',
        filePath,
      );
      return data;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[RENDERER SERVICE] resolveFileContext - Error occurred:',
        error,
      );
      throw error;
    }
  }

  // Resolve folder context
  static async resolveFolderContext(folderPath: string): Promise<ContextItem> {
    try {
      const { data } = await client.post<string, ContextItem>(
        'chat:context:resolve-folder',
        folderPath,
      );
      return data;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[RENDERER SERVICE] resolveFolderContext - Error occurred:',
        error,
      );
      throw error;
    }
  }

  // Search codebase
  static async searchCodebase(query: string): Promise<ContextItem[]> {
    const { data } = await client.post<string, ContextItem[]>(
      'chat:context:search-codebase',
      query,
    );
    return data;
  }

  // Resolve URL context
  static async resolveUrlContext(url: string): Promise<ContextItem> {
    const { data } = await client.post<string, ContextItem>(
      'chat:context:resolve-url',
      url,
    );
    return data;
  }

  // Tool Call Management

  // Add tool calls to a message
  static async addToolCalls(
    messageId: number,
    toolCalls: Omit<NewToolCall, 'messageId'>[],
  ): Promise<ToolCall[]> {
    const { data } = await client.post<
      {
        messageId: number;
        toolCalls: Omit<NewToolCall, 'messageId'>[];
      },
      ToolCall[]
    >('chat:tool:add-calls', { messageId, toolCalls });
    return data;
  }

  // Get tool calls for a message
  static async getToolCalls(messageId: number): Promise<ToolCall[]> {
    const { data } = await client.post<number, ToolCall[]>(
      'chat:tool:get-calls',
      messageId,
    );
    return data;
  }

  // Update tool call
  static async updateToolCall(
    id: number,
    updates: Partial<Omit<NewToolCall, 'messageId'>>,
  ): Promise<void> {
    await client.post<{
      id: number;
      updates: Partial<Omit<NewToolCall, 'messageId'>>;
    }>('chat:tool:update-call', { id, updates });
  }

  // Execute tool
  static async executeTool(
    toolCallId: number,
  ): Promise<{ success: boolean; message: string }> {
    const { data } = await client.post<
      number,
      { success: boolean; message: string }
    >('chat:tool:execute', toolCallId);
    return data;
  }

  // Cancel tool execution
  static async cancelTool(
    toolCallId: number,
  ): Promise<{ success: boolean; message: string }> {
    const { data } = await client.post<
      number,
      { success: boolean; message: string }
    >('chat:tool:cancel', toolCallId);
    return data;
  }

  // Session Metadata Management

  // Set session metadata
  static async setSessionMetadata(
    sessionId: number,
    key: string,
    value: string,
  ): Promise<void> {
    await client.post<{
      conversationId: number;
      key: string;
      value: string;
    }>('chat:session:set-metadata', {
      conversationId: sessionId,
      key,
      value,
    });
  }

  // Get session metadata
  static async getSessionMetadata(
    sessionId: number,
    key?: string,
  ): Promise<SessionMetadata[]> {
    const { data } = await client.post<
      {
        conversationId: number;
        key?: string;
      },
      SessionMetadata[]
    >('chat:session:get-metadata', {
      conversationId: sessionId,
      key,
    });
    return data;
  }

  // Delete session metadata
  static async deleteSessionMetadata(
    sessionId: number,
    key?: string,
  ): Promise<void> {
    await client.post<{
      conversationId: number;
      key?: string;
    }>('chat:session:delete-metadata', {
      conversationId: sessionId,
      key,
    });
  }
}

// Export service instance following your existing pattern
export const chatService = {
  // Session management
  getSessions: ChatService.getSessions,
  getSession: ChatService.getSession,
  getSessionWithContext: ChatService.getSessionWithContext,
  createSession: ChatService.createSession,
  updateSession: ChatService.updateSession,
  deleteSession: ChatService.deleteSession,

  // Message management
  getMessages: ChatService.getMessages,
  getMessageWithContext: ChatService.getMessageWithContext,
  sendMessage: ChatService.sendMessage,
  sendMessageWithContext: ChatService.sendMessageWithContext,
  regenerateMessage: ChatService.regenerateMessage,
  streamMessage: ChatService.streamMessage,

  // Context management
  addContextItems: ChatService.addContextItems,
  getContextItems: ChatService.getContextItems,
  resolveFileContext: ChatService.resolveFileContext,
  resolveFolderContext: ChatService.resolveFolderContext,
  searchCodebase: ChatService.searchCodebase,
  resolveUrlContext: ChatService.resolveUrlContext,

  // Tool management
  addToolCalls: ChatService.addToolCalls,
  getToolCalls: ChatService.getToolCalls,
  updateToolCall: ChatService.updateToolCall,
  executeTool: ChatService.executeTool,
  cancelTool: ChatService.cancelTool,

  // Session metadata
  setSessionMetadata: ChatService.setSessionMetadata,
  getSessionMetadata: ChatService.getSessionMetadata,
  deleteSessionMetadata: ChatService.deleteSessionMetadata,
};
