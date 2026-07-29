import type { Channels } from '../../types/ipc';
import type {
  ChatStreamChunkPayload,
  AgentStepStartPayload,
  AgentTerminalConfirmPayload,
  AgentContextCompactedPayload,
} from '../../types/agentEvents';
import {
  getToolResultError,
  isToolResultFailure,
} from '../../shared/toolResult';

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

export type PipelineCloudRunRequest = {
  conversationId: number;
  toolCallId: string;
  projectId: string;
  path: string;
  pipelineFile: string;
  requiresUserConfirmation: true;
  runStarted: false;
};

export type AgentDbtCommandLifecycleEvent =
  | {
      phase: 'started';
      conversationId: number;
      toolCallId: string;
      toolName: 'studio_cli_run_dbt' | 'runDbtCommand';
      args: Record<string, unknown>;
    }
  | {
      phase: 'finished';
      conversationId: number;
      toolCallId: string;
      toolName: 'studio_cli_run_dbt' | 'runDbtCommand';
      result?: unknown;
      failed: boolean;
      error?: string;
    };

const isAgentDbtTool = (
  toolName: unknown,
): toolName is 'studio_cli_run_dbt' | 'runDbtCommand' =>
  toolName === 'studio_cli_run_dbt' || toolName === 'runDbtCommand';

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

export const normalizePipelineCloudRunRequest = (event: {
  conversationId: number;
  toolCallId: string;
  toolName: string;
  result: unknown;
}): PipelineCloudRunRequest | null => {
  if (
    event.toolName !== 'pipeline_cloud_request_run' ||
    !event.result ||
    typeof event.result !== 'object'
  ) {
    return null;
  }
  const result = event.result as Record<string, unknown>;
  if (
    result.success !== true ||
    result.mutation !== 'pipeline-cloud-run-requested' ||
    typeof result.projectId !== 'string' ||
    typeof result.path !== 'string' ||
    typeof result.pipelineFile !== 'string' ||
    result.requiresUserConfirmation !== true ||
    result.runStarted !== false
  ) {
    return null;
  }
  return {
    conversationId: event.conversationId,
    toolCallId: event.toolCallId,
    projectId: result.projectId,
    path: result.path,
    pipelineFile: result.pipelineFile,
    requiresUserConfirmation: true,
    runStarted: false,
  };
};

export const subscribeToPipelineCloudRunRequest = (
  handler: (event: PipelineCloudRunRequest) => void,
): Unsubscribe =>
  subscribeToToolResult((event) => {
    const request = normalizePipelineCloudRunRequest(event);
    if (request) handler(request);
  });

export const subscribeToAgentDbtCommandLifecycle = (
  handler: (event: AgentDbtCommandLifecycleEvent) => void,
): Unsubscribe => {
  const toolsByCallId = new Map<
    string,
    {
      conversationId: number;
      toolName: 'studio_cli_run_dbt' | 'runDbtCommand';
    }
  >();
  return subscribeToChatStreamChunks((data) => {
    if (data?.done) {
      toolsByCallId.forEach((tracked, toolCallId) => {
        if (tracked.conversationId !== data.conversationId) return;
        handler({
          phase: 'finished',
          conversationId: data.conversationId,
          toolCallId,
          toolName: tracked.toolName,
          failed: true,
          error: 'Agent dbt command ended without a tool result.',
        });
        toolsByCallId.delete(toolCallId);
      });
      return;
    }
    if (!data.chunk || typeof data.chunk === 'string') return;
    const chunk = data.chunk as any;
    const toolCallId =
      typeof chunk.toolCallId === 'string' ? chunk.toolCallId : undefined;
    if (!toolCallId) return;

    if (chunk.type === 'tool-call' && isAgentDbtTool(chunk.toolName)) {
      toolsByCallId.set(toolCallId, {
        conversationId: data.conversationId,
        toolName: chunk.toolName,
      });
      handler({
        phase: 'started',
        conversationId: data.conversationId,
        toolCallId,
        toolName: chunk.toolName,
        args: (chunk.input ?? {}) as Record<string, unknown>,
      });
      return;
    }

    const toolName = isAgentDbtTool(chunk.toolName)
      ? chunk.toolName
      : toolsByCallId.get(toolCallId)?.toolName;
    if (!toolName) return;

    if (chunk.type === 'tool-result') {
      const result = chunk.output;
      const resultError = getToolResultError(result);
      const failed = isToolResultFailure(result) || Boolean(resultError);
      handler({
        phase: 'finished',
        conversationId: data.conversationId,
        toolCallId,
        toolName,
        result,
        failed,
        error: failed ? resultError : undefined,
      });
      toolsByCallId.delete(toolCallId);
    } else if (chunk.type === 'tool-error') {
      const error = chunk.error ?? chunk.message;
      handler({
        phase: 'finished',
        conversationId: data.conversationId,
        toolCallId,
        toolName,
        failed: true,
        error: error instanceof Error ? error.message : String(error),
      });
      toolsByCallId.delete(toolCallId);
    }
  });
};
