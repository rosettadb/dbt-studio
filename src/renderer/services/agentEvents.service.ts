import type { Channels } from '../../types/ipc';
import type {
  ChatStreamChunkPayload,
  AgentStepStartPayload,
  AgentTerminalConfirmPayload,
  AgentContextCompactedPayload,
} from '../../types/agentEvents';

// Re-export so consumers can import from one place
export type {
  ChatStreamChunkPayload as ChatStreamChunkEvent,
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
  const unsub = window.electron.ipcRenderer.on(channel, wrapped);
  return () => {
    if (typeof unsub === 'function') unsub();
  };
};

export const subscribeToChatStreamChunks = (
  handler: (event: ChatStreamChunkPayload) => void,
): Unsubscribe => subscribe('chat:message:stream-chunk', handler);

export const subscribeToStepStart = (
  handler: (event: AgentStepStartPayload) => void,
): Unsubscribe => subscribe('agent:step-start', handler);

export const subscribeToTerminalConfirm = (
  handler: (event: AgentTerminalConfirmPayload) => void,
): Unsubscribe => subscribe('agent:terminal-confirm', handler);

export const subscribeToContextCompacted = (
  handler: (event: AgentContextCompactedPayload) => void,
): Unsubscribe => subscribe('agent:context-compacted', handler);

/**
 * Subscribe to tool-result events extracted from the fullStream.
 * This replaces the legacy `subscribeToAgentToolCalls` for the 'done' case.
 * `handler` receives a normalized payload compatible with AgentToolCallPayload.
 */
export const subscribeToToolResult = (
  handler: (event: {
    conversationId: number;
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    result: unknown;
    status: 'done';
  }) => void,
): Unsubscribe => {
  const wrapped = (...args: unknown[]) => {
    const data = args[0] as {
      conversationId: number;
      chunk: any;
      done: boolean;
    };
    if (data?.done) return;
    const { chunk } = data;
    if (!chunk || typeof chunk === 'string' || chunk.type !== 'tool-result')
      return;
    handler({
      conversationId: data.conversationId,
      toolCallId: (chunk as any).toolCallId,
      toolName: (chunk as any).toolName,
      args: ((chunk as any).input ?? {}) as Record<string, unknown>,
      result: (chunk as any).output,
      status: 'done',
    });
  };
  const unsub = window.electron.ipcRenderer.on(
    'chat:message:stream-chunk',
    wrapped,
  );
  return () => {
    if (typeof unsub === 'function') unsub();
  };
};
