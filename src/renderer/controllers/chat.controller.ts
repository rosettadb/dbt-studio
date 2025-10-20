import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from 'react-query';
import type { CustomError } from '../../types/backend';
import { QUERY_KEYS } from '../config/constants';
import { chatService } from '../services/chat.service';
import type {
  ChatSession,
  ChatMessage,
  ChatMessageWithContext,
  ContextItem,
  ToolCall,
  SessionMetadata,
  NewChatSession,
  NewContextItem,
  NewToolCall,
  ChatConversationWithMessages,
} from '../../types/chat';

// Chat Session Controllers
// These hooks provide React Query integration for chat session operations

// Get all chat sessions
export const useGetChatSessions = (
  projectId?: number,
  customOptions?: UseQueryOptions<ChatSession[], CustomError, ChatSession[]>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_CHAT_SESSIONS, projectId],
    queryFn: async () => {
      return chatService.getSessions(projectId);
    },
    ...customOptions,
  });
};

// Cancel an active streaming chat message
export const useCancelChatStream = (
  customOptions?: UseMutationOptions<
    { success: boolean },
    CustomError,
    { sessionId: number }
  >,
): UseMutationResult<
  { success: boolean },
  CustomError,
  { sessionId: number }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};

  return useMutation({
    mutationFn: async ({ sessionId }) => {
      return chatService.cancelStream(sessionId);
    },
    onSuccess: (result, variables, ...args) => {
      onCustomSuccess?.(result, variables, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Get specific chat session
export const useGetChatSession = (
  sessionId?: number,
  customOptions?: UseQueryOptions<
    ChatSession | null,
    CustomError,
    ChatSession | null
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_CHAT_SESSION_BY_ID, sessionId],
    queryFn: async () => {
      return chatService.getSession(sessionId!);
    },
    enabled: !!sessionId,
    ...customOptions,
  });
};

// Get chat session with full context
export const useGetChatSessionWithContext = (
  sessionId?: number,
  customOptions?: UseQueryOptions<
    ChatConversationWithMessages | null,
    CustomError,
    ChatConversationWithMessages | null
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_CHAT_SESSION_BY_ID, sessionId, 'with-context'],
    queryFn: async () => {
      return chatService.getSessionWithContext(sessionId!);
    },
    enabled: !!sessionId,
    ...customOptions,
  });
};

// Create chat session
export const useCreateChatSession = (
  customOptions?: UseMutationOptions<
    ChatSession,
    CustomError,
    { title: string; projectId?: number; providerId?: number }
  >,
): UseMutationResult<
  ChatSession,
  CustomError,
  { title: string; projectId?: number; providerId?: number }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, projectId, providerId }) => {
      return chatService.createSession(title, projectId, providerId);
    },
    onSuccess: async (session, variables, ...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_CHAT_SESSIONS]);
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_CHAT_SESSIONS,
        variables.projectId,
      ]);
      onCustomSuccess?.(session, variables, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Update chat session
export const useUpdateChatSession = (
  customOptions?: UseMutationOptions<
    void,
    CustomError,
    { sessionId: number; updates: Partial<NewChatSession> }
  >,
): UseMutationResult<
  void,
  CustomError,
  { sessionId: number; updates: Partial<NewChatSession> }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, updates }) => {
      return chatService.updateSession(sessionId, updates);
    },
    onSuccess: async (_, variables, ...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_CHAT_SESSIONS]);
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_CHAT_SESSION_BY_ID,
        variables.sessionId,
      ]);
      onCustomSuccess?.(_, variables, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Delete chat session
export const useDeleteChatSession = (
  customOptions?: UseMutationOptions<void, CustomError, number>,
): UseMutationResult<void, CustomError, number> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: number) => {
      return chatService.deleteSession(sessionId);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_CHAT_SESSIONS]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Chat Message Controllers

// Get messages for a session
export const useGetChatMessages = (
  sessionId?: number,
  limit?: number,
  offset?: number,
  customOptions?: UseQueryOptions<ChatMessage[], CustomError, ChatMessage[]>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_CHAT_MESSAGES, sessionId, limit, offset],
    queryFn: async () => {
      return chatService.getMessages(sessionId!, limit, offset);
    },
    enabled: !!sessionId,
    ...customOptions,
  });
};

// Get message with full context
export const useGetChatMessageWithContext = (
  messageId?: number,
  customOptions?: UseQueryOptions<
    ChatMessageWithContext | null,
    CustomError,
    ChatMessageWithContext | null
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_CHAT_MESSAGE_WITH_CONTEXT, messageId],
    queryFn: async () => {
      return chatService.getMessageWithContext(messageId!);
    },
    enabled: !!messageId,
    ...customOptions,
  });
};

// Send regular message
export const useSendChatMessage = (
  customOptions?: UseMutationOptions<
    ChatMessage,
    CustomError,
    {
      sessionId: number;
      content: string;
      role?: 'user' | 'assistant' | 'system';
      metadata?: any;
    }
  >,
): UseMutationResult<
  ChatMessage,
  CustomError,
  {
    sessionId: number;
    content: string;
    role?: 'user' | 'assistant' | 'system';
    metadata?: any;
  }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, content, role, metadata }) => {
      return chatService.sendMessage(sessionId, content, metadata, role);
    },
    // Optimistic update so the user message appears immediately
    onMutate: async (variables) => {
      const { sessionId, content, role } = variables;
      const queryKey = [QUERY_KEYS.GET_CHAT_MESSAGES, sessionId] as const;

      // Cancel any outgoing refetches for this query
      await queryClient.cancelQueries(queryKey);

      // Snapshot the previous value
      const previous = queryClient.getQueryData<ChatMessage[]>(queryKey) || [];

      // Create a temporary message entry
      const tempMessage: ChatMessage = {
        id: -Date.now(),
        conversationId: sessionId,
        role: role ?? 'user',
        content,
        metadata: { temp: true },
        toolCalls: null as any,
        contextItems: null as any,
        thinkingContent: null as any,
        signature: null as any,
        isStreaming: false,
        parentMessageId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as ChatMessage;

      // Optimistically update to the new value
      queryClient.setQueryData<ChatMessage[]>(queryKey, [
        ...previous,
        tempMessage,
      ]);

      // Return a context object with the snapshotted value
      return { previous, queryKey } as const;
    },
    onSuccess: async (message, variables, ...args) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_CHAT_MESSAGES,
        variables.sessionId,
      ]);
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_CHAT_SESSION_BY_ID,
        variables.sessionId,
      ]);
      onCustomSuccess?.(message, variables, ...args);
    },
    onError: (error, variables, context) => {
      const ctx = context as
        | { previous: ChatMessage[]; queryKey: any }
        | undefined;
      if (ctx) {
        // Rollback to previous cache on error
        queryClient.setQueryData<ChatMessage[]>(ctx.queryKey, ctx.previous);
      }
      onCustomError?.(error, variables, context as any);
    },
  });
};

// Send message with context
export const useSendChatMessageWithContext = (
  customOptions?: UseMutationOptions<
    ChatMessageWithContext,
    CustomError,
    {
      sessionId: number;
      content: string;
      contextItems?: Omit<NewContextItem, 'messageId'>[];
      toolCalls?: Omit<NewToolCall, 'messageId'>[];
      role?: 'user' | 'assistant' | 'system';
      metadata?: any;
    }
  >,
): UseMutationResult<
  ChatMessageWithContext,
  CustomError,
  {
    sessionId: number;
    content: string;
    contextItems?: Omit<NewContextItem, 'messageId'>[];
    toolCalls?: Omit<NewToolCall, 'messageId'>[];
    role?: 'user' | 'assistant' | 'system';
    metadata?: any;
  }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      content,
      contextItems,
      toolCalls,
      role,
      metadata,
    }) => {
      return chatService.sendMessageWithContext(
        sessionId,
        content,
        contextItems,
        toolCalls,
        metadata,
        role,
      );
    },
    onSuccess: async (message, variables, ...args) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_CHAT_MESSAGES,
        variables.sessionId,
      ]);
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_CHAT_SESSION_BY_ID,
        variables.sessionId,
      ]);
      onCustomSuccess?.(message, variables, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Regenerate message
export const useRegenerateChatMessage = (
  customOptions?: UseMutationOptions<
    ChatMessage,
    CustomError,
    {
      originalMessageId: number;
      newContent: string;
      metadata?: any;
    }
  >,
): UseMutationResult<
  ChatMessage,
  CustomError,
  {
    originalMessageId: number;
    newContent: string;
    metadata?: any;
  }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ originalMessageId, newContent, metadata }) => {
      return chatService.regenerateMessage(
        originalMessageId,
        newContent,
        metadata,
      );
    },
    onSuccess: async (message, variables, ...args) => {
      // Invalidate messages for the session (we need to get session from message)
      await queryClient.invalidateQueries([QUERY_KEYS.GET_CHAT_MESSAGES]);
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_CHAT_MESSAGE_WITH_CONTEXT,
        variables.originalMessageId,
      ]);
      onCustomSuccess?.(message, variables, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Stream message
export const useStreamChatMessage = (
  customOptions?: UseMutationOptions<
    ChatMessageWithContext,
    CustomError,
    {
      sessionId: number;
      content: string;
      contextItems?: Omit<NewContextItem, 'messageId'>[];
      onChunk?: (chunk: string) => void;
    }
  >,
): UseMutationResult<
  ChatMessageWithContext,
  CustomError,
  {
    sessionId: number;
    content: string;
    contextItems?: Omit<NewContextItem, 'messageId'>[];
    onChunk?: (chunk: string) => void;
  }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, content, contextItems, onChunk }) => {
      return chatService.streamMessage(
        sessionId,
        content,
        contextItems,
        onChunk,
      );
    },
    onSuccess: async (message, variables, ...args) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_CHAT_MESSAGES,
        variables.sessionId,
      ]);
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_CHAT_SESSION_BY_ID,
        variables.sessionId,
      ]);
      onCustomSuccess?.(message, variables, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Context Management Controllers

// Get context items for a message
export const useGetContextItems = (
  messageId?: number,
  customOptions?: UseQueryOptions<ContextItem[], CustomError, ContextItem[]>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_CONTEXT_ITEMS, messageId],
    queryFn: async () => {
      return chatService.getContextItems(messageId!);
    },
    enabled: !!messageId,
    ...customOptions,
  });
};

// Add context items to a message
export const useAddContextItems = (
  customOptions?: UseMutationOptions<
    ContextItem[],
    CustomError,
    {
      messageId: number;
      contextItems: Omit<NewContextItem, 'messageId'>[];
    }
  >,
): UseMutationResult<
  ContextItem[],
  CustomError,
  {
    messageId: number;
    contextItems: Omit<NewContextItem, 'messageId'>[];
  }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, contextItems }) => {
      return chatService.addContextItems(messageId, contextItems);
    },
    onSuccess: async (items, variables, ...args) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_CONTEXT_ITEMS,
        variables.messageId,
      ]);
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_CHAT_MESSAGE_WITH_CONTEXT,
        variables.messageId,
      ]);
      onCustomSuccess?.(items, variables, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Context Resolution Controllers

// Resolve file context
export const useResolveFileContext = (
  customOptions?: UseMutationOptions<ContextItem, CustomError, string>,
): UseMutationResult<ContextItem, CustomError, string> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};

  return useMutation({
    mutationFn: async (filePath: string) => {
      return chatService.resolveFileContext(filePath);
    },
    onSuccess: (item, filePath, ...args) => {
      onCustomSuccess?.(item, filePath, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Resolve selected file context with DBT enhancements
export const useResolveSelectedFileContext = (
  customOptions?: UseMutationOptions<
    ContextItem,
    CustomError,
    { filePath: string; projectPath?: string }
  >,
): UseMutationResult<
  ContextItem,
  CustomError,
  { filePath: string; projectPath?: string }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};

  return useMutation({
    mutationFn: async ({ filePath, projectPath }) => {
      return chatService.resolveSelectedFileContext(filePath, projectPath);
    },
    onSuccess: (item, variables, ...args) => {
      onCustomSuccess?.(item, variables, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Get file metadata
export const useGetFileMetadata = (
  customOptions?: UseMutationOptions<
    {
      path: string;
      name: string;
      size: number;
      lastModified: string;
      language: string;
      fileType: string;
    },
    CustomError,
    string
  >,
): UseMutationResult<
  {
    path: string;
    name: string;
    size: number;
    lastModified: string;
    language: string;
    fileType: string;
  },
  CustomError,
  string
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};

  return useMutation({
    mutationFn: async (filePath: string) => {
      return chatService.getFileMetadata(filePath);
    },
    onSuccess: (metadata, filePath, ...args) => {
      onCustomSuccess?.(metadata, filePath, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Resolve folder context
export const useResolveFolderContext = (
  customOptions?: UseMutationOptions<ContextItem, CustomError, string>,
): UseMutationResult<ContextItem, CustomError, string> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};

  return useMutation({
    mutationFn: async (folderPath: string) => {
      return chatService.resolveFolderContext(folderPath);
    },
    onSuccess: (item, folderPath, ...args) => {
      onCustomSuccess?.(item, folderPath, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Search codebase
export const useSearchCodebase = (
  customOptions?: UseMutationOptions<ContextItem[], CustomError, string>,
): UseMutationResult<ContextItem[], CustomError, string> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};

  return useMutation({
    mutationFn: async (query: string) => {
      return chatService.searchCodebase(query);
    },
    onSuccess: (items, query, ...args) => {
      onCustomSuccess?.(items, query, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Resolve URL context
export const useResolveUrlContext = (
  customOptions?: UseMutationOptions<ContextItem, CustomError, string>,
): UseMutationResult<ContextItem, CustomError, string> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};

  return useMutation({
    mutationFn: async (url: string) => {
      return chatService.resolveUrlContext(url);
    },
    onSuccess: (item, url, ...args) => {
      onCustomSuccess?.(item, url, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Tool Call Controllers

// Get tool calls for a message
export const useGetToolCalls = (
  messageId?: number,
  customOptions?: UseQueryOptions<ToolCall[], CustomError, ToolCall[]>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_TOOL_CALLS, messageId],
    queryFn: async () => {
      return chatService.getToolCalls(messageId!);
    },
    enabled: !!messageId,
    ...customOptions,
  });
};

// Add tool calls to a message
export const useAddToolCalls = (
  customOptions?: UseMutationOptions<
    ToolCall[],
    CustomError,
    {
      messageId: number;
      toolCalls: Omit<NewToolCall, 'messageId'>[];
    }
  >,
): UseMutationResult<
  ToolCall[],
  CustomError,
  {
    messageId: number;
    toolCalls: Omit<NewToolCall, 'messageId'>[];
  }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, toolCalls }) => {
      return chatService.addToolCalls(messageId, toolCalls);
    },
    onSuccess: async (calls, variables, ...args) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_TOOL_CALLS,
        variables.messageId,
      ]);
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_CHAT_MESSAGE_WITH_CONTEXT,
        variables.messageId,
      ]);
      onCustomSuccess?.(calls, variables, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Update tool call
export const useUpdateToolCall = (
  customOptions?: UseMutationOptions<
    void,
    CustomError,
    {
      id: number;
      updates: Partial<Omit<NewToolCall, 'messageId'>>;
    }
  >,
): UseMutationResult<
  void,
  CustomError,
  {
    id: number;
    updates: Partial<Omit<NewToolCall, 'messageId'>>;
  }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }) => {
      return chatService.updateToolCall(id, updates);
    },
    onSuccess: async (_, variables, ...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_TOOL_CALLS]);
      onCustomSuccess?.(_, variables, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Execute tool
export const useExecuteTool = (
  customOptions?: UseMutationOptions<
    { success: boolean; message: string },
    CustomError,
    number
  >,
): UseMutationResult<
  { success: boolean; message: string },
  CustomError,
  number
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (toolCallId: number) => {
      return chatService.executeTool(toolCallId);
    },
    onSuccess: async (result, toolCallId, ...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_TOOL_CALLS]);
      onCustomSuccess?.(result, toolCallId, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Cancel tool execution
export const useCancelTool = (
  customOptions?: UseMutationOptions<
    { success: boolean; message: string },
    CustomError,
    number
  >,
): UseMutationResult<
  { success: boolean; message: string },
  CustomError,
  number
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (toolCallId: number) => {
      return chatService.cancelTool(toolCallId);
    },
    onSuccess: async (result, toolCallId, ...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_TOOL_CALLS]);
      onCustomSuccess?.(result, toolCallId, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Session Metadata Controllers

// Get session metadata
export const useGetSessionMetadata = (
  sessionId?: number,
  key?: string,
  customOptions?: UseQueryOptions<
    SessionMetadata[],
    CustomError,
    SessionMetadata[]
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_SESSION_METADATA, sessionId, key],
    queryFn: async () => {
      return chatService.getSessionMetadata(sessionId!, key);
    },
    enabled: !!sessionId,
    ...customOptions,
  });
};

// Set session metadata
export const useSetSessionMetadata = (
  customOptions?: UseMutationOptions<
    void,
    CustomError,
    {
      sessionId: number;
      key: string;
      value: string;
    }
  >,
): UseMutationResult<
  void,
  CustomError,
  {
    sessionId: number;
    key: string;
    value: string;
  }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, key, value }) => {
      return chatService.setSessionMetadata(sessionId, key, value);
    },
    onSuccess: async (_, variables, ...args) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_SESSION_METADATA,
        variables.sessionId,
      ]);
      onCustomSuccess?.(_, variables, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

// Delete session metadata
export const useDeleteSessionMetadata = (
  customOptions?: UseMutationOptions<
    void,
    CustomError,
    {
      sessionId: number;
      key?: string;
    }
  >,
): UseMutationResult<
  void,
  CustomError,
  {
    sessionId: number;
    key?: string;
  }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, key }) => {
      return chatService.deleteSessionMetadata(sessionId, key);
    },
    onSuccess: async (_, variables, ...args) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GET_SESSION_METADATA,
        variables.sessionId,
      ]);
      onCustomSuccess?.(_, variables, ...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};
