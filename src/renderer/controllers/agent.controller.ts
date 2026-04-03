// Agent Controller - React Query hooks for agent operations

import { useMutation, useQuery, useQueryClient } from 'react-query';
import * as agentService from '../services/agent.service';
import type { AgentRunRequest } from '../services/agent.service';

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
