import { client } from '../config/client';
import type {
  ChatSession,
  ChatMessage,
  ChatMessageWithContext,
  NewChatSession,
} from '../../types/chat';

class ChatService {
  // Chat Session Management

  // Get all chat sessions
  static async getSessions(
    filter?:
      | number
      | {
          projectId?: number;
          screenKey?: string;
          connectionId?: string | null;
        },
  ): Promise<ChatSession[]> {
    const payload = typeof filter === 'number' ? { projectId: filter } : filter;
    const { data } = await client.post<any, ChatSession[]>(
      'chat:conversation:list',
      payload,
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

  // Create new chat session
  static async createSession(
    title: string,
    projectId?: number,
    providerId?: number,
    screenKey?: string,
    connectionId?: string,
  ): Promise<ChatSession> {
    const { data } = await client.post<
      {
        title: string;
        projectId?: number;
        providerId?: number;
        screenKey?: string;
        connectionId?: string;
      },
      ChatSession
    >('chat:conversation:create', {
      title,
      projectId,
      providerId,
      screenKey,
      connectionId,
    });
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

  // Get messages with full context
  static async getMessagesWithContext(
    sessionId: number,
    limit?: number,
    offset?: number,
  ): Promise<ChatMessageWithContext[]> {
    const { data } = await client.post<
      { sessionId: number; limit?: number; offset?: number },
      ChatMessageWithContext[]
    >('chat:message:list-with-context', { sessionId, limit, offset });
    return data;
  }

  // Context Management

  // Resolve selected file context with DBT enhancements
  static async resolveSelectedFileContext(
    filePath: string,
    projectPath?: string,
  ): Promise<any> {
    const { data } = await client.post<
      { filePath: string; projectPath?: string },
      any
    >('chat:context:resolve-selected-file', { filePath, projectPath });
    return data;
  }

  // Get file metadata without full content
  static async getFileMetadata(filePath: string): Promise<{
    path: string;
    name: string;
    size: number;
    lastModified: string;
    language: string;
    fileType: string;
  }> {
    const { data } = await client.post<
      string,
      {
        path: string;
        name: string;
        size: number;
        lastModified: string;
        language: string;
        fileType: string;
      }
    >('chat:context:get-file-metadata', filePath);
    return data;
  }
}

// Export service instance following your existing pattern
export const chatService = {
  // Session management
  getSessions: ChatService.getSessions,
  getSession: ChatService.getSession,
  createSession: ChatService.createSession,
  updateSession: ChatService.updateSession,
  deleteSession: ChatService.deleteSession,

  // Message management
  getMessages: ChatService.getMessages,
  getMessagesWithContext: ChatService.getMessagesWithContext,

  // Context management
  resolveSelectedFileContext: ChatService.resolveSelectedFileContext,
  getFileMetadata: ChatService.getFileMetadata,
};
