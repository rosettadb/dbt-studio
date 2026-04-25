// Agent Service - Frontend service for AI Agent operations
// Handles agent execution, cancellation, and tool listing

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
  chunk: string;
  done: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ToolCallPayload {
  conversationId: number;
  toolName: string;
  args: Record<string, unknown>;
  stepNumber: number;
  status: 'running' | 'done' | 'error';
}

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

export const onStreamChunk = (
  handler: (payload: StreamChunkPayload) => void,
): (() => void) => {
  const listener = (...args: unknown[]) =>
    handler(args[0] as StreamChunkPayload);
  window.electron.ipcRenderer.on('chat:message:stream-chunk', listener);
  return () =>
    window.electron.ipcRenderer.removeListener(
      'chat:message:stream-chunk',
      listener,
    );
};

export const onToolCall = (
  handler: (payload: ToolCallPayload) => void,
): (() => void) => {
  const listener = (...args: unknown[]) => handler(args[0] as ToolCallPayload);
  window.electron.ipcRenderer.on('agent:tool-call', listener);
  return () =>
    window.electron.ipcRenderer.removeListener('agent:tool-call', listener);
};

export const onTerminalConfirm = (
  handler: (payload: TerminalConfirmPayload) => void,
): (() => void) => {
  const listener = (...args: unknown[]) =>
    handler(args[0] as TerminalConfirmPayload);
  window.electron.ipcRenderer.on('agent:terminal-confirm', listener);
  return () =>
    window.electron.ipcRenderer.removeListener(
      'agent:terminal-confirm',
      listener,
    );
};

export const onContextUsage = (
  handler: (payload: ContextUsagePayload) => void,
): (() => void) => {
  const listener = (...args: unknown[]) =>
    handler(args[0] as ContextUsagePayload);
  window.electron.ipcRenderer.on('agent:context-usage', listener);
  return () =>
    window.electron.ipcRenderer.removeListener('agent:context-usage', listener);
};

export const resolveTerminalConfirm = async (
  requestId: string,
  allow: boolean,
): Promise<void> =>
  window.electron.ipcRenderer.invoke('agent:terminal-resolve', {
    requestId,
    allow,
  });
