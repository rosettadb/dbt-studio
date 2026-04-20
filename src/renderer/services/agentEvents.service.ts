import type { Channels } from '../../types/ipc';
import type {
  ChatStreamChunkPayload,
  AgentToolCallPayload,
  AgentStepStartPayload,
  AgentTerminalConfirmPayload,
  AgentContextCompactedPayload,
} from '../../types/agentEvents';

// Re-export so consumers can import from one place
export type {
  ChatStreamChunkPayload as ChatStreamChunkEvent,
  AgentToolCallPayload as AgentToolCallEvent,
  AgentStepStartPayload as AgentStepStartEvent,
  AgentTerminalConfirmPayload as AgentTerminalConfirmEvent,
  AgentContextCompactedPayload as AgentContextCompactedEvent,
};

type Unsubscribe = () => void;

const subscribe = <T>(
  channel: Channels,
  handler: (event: T) => void,
): Unsubscribe => {
  const wrapped = (...args: unknown[]) => handler(args[0] as T);
  window.electron.ipcRenderer.on(channel, wrapped);
  return () => window.electron.ipcRenderer.removeListener(channel, wrapped);
};

export const subscribeToChatStreamChunks = (
  handler: (event: ChatStreamChunkPayload) => void,
): Unsubscribe => subscribe('chat:message:stream-chunk', handler);

export const subscribeToAgentToolCalls = (
  handler: (event: AgentToolCallPayload) => void,
): Unsubscribe => subscribe('agent:tool-call', handler);

export const subscribeToStepStart = (
  handler: (event: AgentStepStartPayload) => void,
): Unsubscribe => subscribe('agent:step-start', handler);

export const subscribeToTerminalConfirm = (
  handler: (event: AgentTerminalConfirmPayload) => void,
): Unsubscribe => subscribe('agent:terminal-confirm', handler);

export const subscribeToContextCompacted = (
  handler: (event: AgentContextCompactedPayload) => void,
): Unsubscribe => subscribe('agent:context-compacted', handler);
