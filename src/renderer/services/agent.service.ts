// Agent Service - Frontend service for AI Agent operations
// Handles agent execution, cancellation, and tool listing

import type { TextStreamPart } from 'ai';
import { client } from '../config/client';

import type { AISettingsConfig } from '../../types/backend';

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
  toolMode?: 'chat' | 'agent';
  screenKey?: 'project' | 'sql' | 'notebooks' | 'analytics';
  connectionId?: string;
  notebookId?: string;
  pageId?: string;
  includeProjectAiContext?: boolean;
  activePipelinePath?: string;
}

export type AgentContextOverheadRequest = Omit<
  AgentRunRequest,
  'content' | 'contextItems'
>;

export interface AgentContextOverhead {
  skills: number;
  mcpTools: number;
  secondBrain: number;
  contextWindow: number;
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

export const getContextOverhead = async (
  request: AgentContextOverheadRequest,
): Promise<AgentContextOverhead> => {
  const { data } = await client.post<
    AgentContextOverheadRequest,
    AgentContextOverhead
  >('agent:context-overhead:get', request);
  return data;
};

export const loadAISettings = async (): Promise<AISettingsConfig> =>
  window.electron.ipcRenderer.invoke('ai-settings:load');

export const saveAISettings = async (config: AISettingsConfig): Promise<void> =>
  window.electron.ipcRenderer.invoke('ai-settings:save', config);

export const getAISettingsFilePath = async (): Promise<string> =>
  window.electron.ipcRenderer.invoke('ai-settings:file-path');

// ---------------------------------------------------------------------------
// IPC event subscriptions (FE-03: never subscribe inside components)
// ---------------------------------------------------------------------------

export interface StreamChunkPayload {
  conversationId: number;
  chunk: TextStreamPart<any> | string; // TextStreamPart during stream, string when done
  done: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export const onStreamChunk = (
  handler: (payload: StreamChunkPayload) => void,
): (() => void) => {
  const listener = (...args: unknown[]) =>
    handler(args[0] as StreamChunkPayload);
  const unsub = window.electron.ipcRenderer.on(
    'chat:message:stream-chunk',
    listener,
  );
  return () => {
    if (typeof unsub === 'function') unsub();
  };
};

export interface TerminalConfirmPayload {
  conversationId: number;
  requestId: string;
  toolName: string;
  command: string;
  cwd: string;
}

export interface ContextUsagePayload {
  conversationId: number;
  breakdown: Record<string, unknown>;
}

export const onTerminalConfirm = (
  handler: (payload: TerminalConfirmPayload) => void,
): (() => void) => {
  const listener = (...args: unknown[]) =>
    handler(args[0] as TerminalConfirmPayload);
  const unsub = window.electron.ipcRenderer.on(
    'agent:terminal-confirm',
    listener,
  );
  return () => {
    if (typeof unsub === 'function') unsub();
  };
};

export const onContextUsage = (
  handler: (payload: ContextUsagePayload) => void,
): (() => void) => {
  const listener = (...args: unknown[]) =>
    handler(args[0] as ContextUsagePayload);
  const unsub = window.electron.ipcRenderer.on('agent:context-usage', listener);
  return () => {
    if (typeof unsub === 'function') unsub();
  };
};

export const resolveTerminalConfirm = async (
  requestId: string,
  allow: boolean,
): Promise<void> =>
  window.electron.ipcRenderer.invoke('agent:terminal-resolve', {
    requestId,
    allow,
  });
