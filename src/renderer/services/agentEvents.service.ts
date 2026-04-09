import type { Channels } from '../../types/ipc';

type Unsubscribe = () => void;

export type ChatStreamChunkEvent = {
  conversationId: number;
  chunk: string;
  done: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export type AgentToolCallEvent = {
  conversationId: number;
  toolName: string;
  args?: unknown;
  stepNumber?: number;
  status?: string;
};

export const subscribeToChatStreamChunks = (
  handler: (event: ChatStreamChunkEvent) => void,
): Unsubscribe => {
  const channel: Channels = 'chat:message:stream-chunk';

  const wrapped = (...args: unknown[]) => {
    handler(args[0] as ChatStreamChunkEvent);
  };

  window.electron.ipcRenderer.on(channel, wrapped);

  return () => {
    window.electron.ipcRenderer.removeListener(channel, wrapped);
  };
};

export const subscribeToAgentToolCalls = (
  handler: (event: AgentToolCallEvent) => void,
): Unsubscribe => {
  const channel: Channels = 'agent:tool-call';

  const wrapped = (...args: unknown[]) => {
    handler(args[0] as AgentToolCallEvent);
  };

  window.electron.ipcRenderer.on(channel, wrapped);

  return () => {
    window.electron.ipcRenderer.removeListener(channel, wrapped);
  };
};
