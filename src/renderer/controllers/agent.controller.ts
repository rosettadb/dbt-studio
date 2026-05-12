// Agent Controller - React Query hooks for agent operations

import { useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import * as agentService from '../services/agent.service';
import type {
  AgentRunRequest,
  StreamChunkPayload,
  TerminalConfirmPayload,
  ContextUsagePayload,
} from '../services/agent.service';

/**
 * Hook to run the agent
 */
export const useRunAgent = (options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  const queryClient = useQueryClient();

  return useMutation(
    (request: AgentRunRequest) => agentService.runAgent(request),
    {
      onSuccess: () => {
        // Invalidate chat messages to refresh the UI
        queryClient.invalidateQueries(['chat', 'messages']);
        options?.onSuccess?.();
      },
      onError: (error: Error) => {
        options?.onError?.(error);
      },
    },
  );
};

/**
 * Hook to cancel agent execution
 */
export const useCancelAgent = (options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  return useMutation(
    (conversationId: number) => agentService.cancelAgent(conversationId),
    {
      onSuccess: () => {
        options?.onSuccess?.();
      },
      onError: (error: Error) => {
        options?.onError?.(error);
      },
    },
  );
};

/**
 * Hook to list available agent tools
 */
export const useListAgentTools = () => {
  return useQuery(['agent', 'tools'], () => agentService.listTools(), {
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });
};

// ---------------------------------------------------------------------------
// IPC event subscription hooks (FE-03: subscriptions live here, not in components)
// ---------------------------------------------------------------------------

/**
 * Subscribe to streaming chat/agent chunks for a specific conversation.
 * Returns an unsubscribe function — call it in useEffect cleanup.
 */
export const useOnStreamChunk = (
  conversationId: number | undefined,
  handler: (payload: StreamChunkPayload) => void,
) => {
  const stableHandler = useCallback(handler, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (conversationId == null) return undefined;
    return agentService.onStreamChunk((payload) => {
      if (payload.conversationId === conversationId) stableHandler(payload);
    });
  }, [conversationId, stableHandler]);
};

/**
 * Subscribe to terminal confirmation requests for a specific conversation.
 */
export const useOnTerminalConfirm = (
  conversationId: number | undefined,
  handler: (payload: TerminalConfirmPayload) => void,
) => {
  const stableHandler = useCallback(handler, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (conversationId == null) return undefined;
    return agentService.onTerminalConfirm((payload) => {
      if (payload.conversationId === conversationId) stableHandler(payload);
    });
  }, [conversationId, stableHandler]);
};

/**
 * Subscribe to context usage breakdown events for a specific conversation.
 */
export const useOnContextUsage = (
  conversationId: number | undefined,
  handler: (payload: ContextUsagePayload) => void,
) => {
  const stableHandler = useCallback(handler, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (conversationId == null) return undefined;
    return agentService.onContextUsage((payload) => {
      if (payload.conversationId === conversationId) stableHandler(payload);
    });
  }, [conversationId, stableHandler]);
};

/**
 * Resolve a pending terminal confirmation (Allow / Deny).
 */
export const useResolveTerminalConfirm = () =>
  useMutation(({ requestId, allow }: { requestId: string; allow: boolean }) =>
    agentService.resolveTerminalConfirm(requestId, allow),
  );
