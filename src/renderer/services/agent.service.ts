// Agent Service - Frontend service for AI Agent operations
// Handles agent execution, cancellation, and tool listing

import { client } from '../config/client';

/**
 * Context item for agent requests
 */
export interface ContextItem {
  type: string;
  name: string;
  content?: string;
  [key: string]: any;
}

/**
 * Request payload for running an agent
 */
export interface AgentRunRequest {
  conversationId: number;
  content: string;
  contextItems?: ContextItem[];
  requestedModel?: string;
  projectPath?: string;
}

/**
 * Tool information
 */
export interface AgentTool {
  name: string;
  description: string;
  category: string;
}

/**
 * Run the agent with streaming
 */
export const runAgent = async (
  request: AgentRunRequest,
): Promise<{ success: boolean }> => {
  const { data } = await client.post<AgentRunRequest, { success: boolean }>(
    'agent:run',
    request,
  );
  return data;
};

/**
 * Cancel an active agent execution
 */
export const cancelAgent = async (
  conversationId: number,
): Promise<{
  success: boolean;
  message: string;
}> => {
  const { data } = await client.post<
    { conversationId: number },
    { success: boolean; message: string }
  >('agent:cancel', { conversationId });
  return data;
};

/**
 * List available agent tools
 */
export const listTools = async (): Promise<{
  success: boolean;
  tools: AgentTool[];
  error?: string;
}> => {
  const { data } = await client.get<{
    success: boolean;
    tools: AgentTool[];
    error?: string;
  }>('agent:tools:list');
  return data;
};
