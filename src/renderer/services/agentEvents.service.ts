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

export type ProjectFileMutation = {
  conversationId: number;
  toolCallId: string;
  toolName: string;
  path: string;
  kind: 'file-written' | 'pipeline-file-written';
};

const collapsePathSegments = (value: string): string => {
  const slashPath = value.replace(/\\/g, '/');
  const drive = slashPath.match(/^[A-Za-z]:/)?.[0] ?? '';
  const isAbsolute = slashPath.startsWith('/') || drive.length > 0;
  const withoutPrefix = drive
    ? slashPath.slice(drive.length).replace(/^\/+/, '')
    : slashPath.replace(/^\/+/, '');
  const segments: string[] = [];
  withoutPrefix.split('/').forEach((segment) => {
    if (!segment || segment === '.') return;
    if (segment === '..') {
      if (segments.length > 0 && segments[segments.length - 1] !== '..') {
        segments.pop();
      } else if (!isAbsolute) {
        segments.push(segment);
      }
      return;
    }
    segments.push(segment);
  });
  if (drive)
    return `${drive}${segments.length > 0 ? '/' : ''}${segments.join('/')}`;
  if (isAbsolute) return `/${segments.join('/')}`;
  return segments.join('/');
};

export const resolveProjectMutationPath = (
  projectPath: string,
  mutationPath: string,
): string | null => {
  const normalizedProject = collapsePathSegments(projectPath).replace(
    /\/+$/,
    '',
  );
  const normalizedMutation = mutationPath.replace(/\\/g, '/');
  const isAbsolute =
    normalizedMutation.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalizedMutation);
  const absolutePath = collapsePathSegments(
    isAbsolute
      ? normalizedMutation
      : `${normalizedProject}/${normalizedMutation.replace(/^\/+/, '')}`,
  );
  if (
    absolutePath !== normalizedProject &&
    !absolutePath.startsWith(`${normalizedProject}/`)
  ) {
    return null;
  }
  return absolutePath;
};

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

export const normalizeProjectFileMutation = (event: {
  conversationId: number;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  status: 'done';
}): ProjectFileMutation | null => {
  if (
    event.toolName !== 'writeFile' &&
    event.toolName !== 'writeDbtModel' &&
    event.toolName !== 'studio_pipeline_write'
  ) {
    return null;
  }
  if (!event.result || typeof event.result !== 'object') return null;
  const result = event.result as Record<string, unknown>;
  if (result.success !== true && result.bytesWritten === undefined) return null;

  const resultPath = typeof result.path === 'string' ? result.path : undefined;
  let argumentPath: string | undefined;
  if (typeof event.args.filePath === 'string') {
    argumentPath = event.args.filePath;
  } else if (typeof event.args.path === 'string') {
    argumentPath = event.args.path;
  }
  const mutationPath = resultPath ?? argumentPath;
  if (!mutationPath) return null;

  return {
    conversationId: event.conversationId,
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    path: mutationPath,
    kind:
      event.toolName === 'studio_pipeline_write' ||
      result.mutation === 'pipeline-file-written'
        ? 'pipeline-file-written'
        : 'file-written',
  };
};

export const subscribeToProjectFileMutation = (
  handler: (event: ProjectFileMutation) => void,
): Unsubscribe =>
  subscribeToToolResult((event) => {
    const mutation = normalizeProjectFileMutation(event);
    if (mutation) handler(mutation);
  });
