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
  NewChatSession,
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

// Get messages with full context
export const useGetChatMessagesWithContext = (
  sessionId?: number,
  limit?: number,
  offset?: number,
  customOptions?: UseQueryOptions<
    ChatMessageWithContext[],
    CustomError,
    ChatMessageWithContext[]
  >,
) => {
  return useQuery({
    queryKey: [
      QUERY_KEYS.GET_CHAT_MESSAGES_WITH_CONTEXT,
      sessionId,
      limit,
      offset,
    ],
    queryFn: async () => {
      return chatService.getMessagesWithContext(sessionId!, limit, offset);
    },
    enabled: !!sessionId,
    ...customOptions,
  });
};
