import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from 'react-query';
import {
  subscribeToChatStreamChunks,
  subscribeToStepStart,
  subscribeToTerminalConfirm,
} from '../services/agentEvents.service';
import * as agentService from '../services/agent.service';
import { parseAgentError } from '../utils/agentErrorParser';
import { QUERY_KEYS } from '../config/constants';
import type { ParsedAgentError } from '../utils/agentErrorParser';
import {
  getToolResultError,
  isToolResultFailure,
} from '../../shared/toolResult';

// ---------------------------------------------------------------------------
// Content part types — ordered interleaved stream units (Kiro/Claude style)
// ---------------------------------------------------------------------------

export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ToolCallContentPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status: 'running' | 'done' | 'error';
  durationMs?: number;
}

export type StreamContentPart = TextContentPart | ToolCallContentPart;

// ---------------------------------------------------------------------------
// Legacy types — kept for AgentStepBlock / ToolCallRow / MessageRenderer
// They are now DERIVED from contentParts, not the primary source of truth.
// ---------------------------------------------------------------------------

export interface ToolCallState {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status: 'running' | 'done' | 'error';
  durationMs?: number;
}

export interface AgentStep {
  stepNumber: number;
  toolCalls: ToolCallState[];
  startedAt: number;
  durationMs?: number;
}

export interface TerminalConfirmRequest {
  requestId: string;
  toolName: string;
  command: string;
  cwd: string;
}

// ---------------------------------------------------------------------------
// AgentStreamState — contentParts is the primary field
// steps + currentText are derived for backward-compatible consumers
// ---------------------------------------------------------------------------

export interface AgentStreamState {
  isStreaming: boolean;
  /** Ordered interleaved content parts — primary source of truth */
  contentParts: StreamContentPart[];
  /**
   * Derived from contentParts for backward compatibility.
   * Concatenation of all TextContentPart.text values.
   */
  currentText: string;
  /**
   * Derived from contentParts for backward compatibility.
   * Tool calls grouped by implicit step order (one step per contiguous group).
   */
  steps: AgentStep[];
  error: ParsedAgentError | null;
  pendingConfirm: TerminalConfirmRequest | null;
  confirmQueue: TerminalConfirmRequest[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveCurrentText(parts: StreamContentPart[]): string {
  return parts
    .filter((p): p is TextContentPart => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

function deriveSteps(parts: StreamContentPart[]): AgentStep[] {
  // Group tool-call parts into a single synthetic step (step 0)
  // preserving the order they arrived
  const toolCalls: ToolCallState[] = parts
    .filter((p): p is ToolCallContentPart => p.type === 'tool-call')
    .map((p) => ({
      id: p.toolCallId,
      toolName: p.toolName,
      args: p.args,
      result: p.result,
      error: p.error,
      status: p.status,
      durationMs: p.durationMs,
    }));

  if (toolCalls.length === 0) return [];
  return [{ stepNumber: 0, toolCalls, startedAt: 0 }];
}

const EMPTY_STATE: AgentStreamState = {
  isStreaming: false,
  contentParts: [],
  currentText: '',
  steps: [],
  error: null,
  pendingConfirm: null,
  confirmQueue: [],
};

function withParts(
  prev: AgentStreamState,
  updater: (parts: StreamContentPart[]) => StreamContentPart[],
): AgentStreamState {
  const nextParts = updater(prev.contentParts);
  return {
    ...prev,
    contentParts: nextParts,
    currentText: deriveCurrentText(nextParts),
    steps: deriveSteps(nextParts),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useAgentStream = (sessionId: number | undefined) => {
  const queryClient = useQueryClient();
  const [streamState, setStreamState] = useState<AgentStreamState>(EMPTY_STATE);

  // Keep a ref so confirmTerminal can read the latest pendingConfirm
  // without being re-created on every state change
  const stateRef = useRef(streamState);
  useEffect(() => {
    stateRef.current = streamState;
  }, [streamState]);

  // Reset state when the session changes
  useEffect(() => {
    setStreamState(EMPTY_STATE);
  }, [sessionId]);

  // Subscribe to all IPC events via agentEvents.service (FE-03 compliant)
  useEffect(() => {
    if (!sessionId) return undefined;

    // step-start is still used by the backend to signal a new LLM step,
    // but for the contentParts model we don't need to track it separately —
    // the tool-call chunks themselves carry all the info we need.
    // We keep the subscription to avoid missed events if the backend sends
    // something we might want to use in future.
    const unsubStepStart = subscribeToStepStart(() => {
      // No-op: step boundary information is implicit in contentParts order
    });

    const unsubStreamChunks = subscribeToChatStreamChunks((data) => {
      if (data.conversationId !== sessionId) return;

      if (data.done) {
        // A terminal stream must never leave a tool call spinning forever.
        setStreamState((prev) =>
          withParts({ ...prev, isStreaming: false }, (parts) =>
            parts.map((part) =>
              part.type === 'tool-call' && part.status === 'running'
                ? {
                    ...part,
                    status: 'error' as const,
                    error:
                      'Tool call ended without a result. Check the tool arguments and try again.',
                  }
                : part,
            ),
          ),
        );
        return;
      }

      const { chunk } = data;

      // String chunks come from timeout/fallback messages or the non-streaming path
      if (typeof chunk === 'string') {
        if (chunk) {
          setStreamState((prev) =>
            withParts(prev, (parts) => {
              const last = parts[parts.length - 1];
              if (last?.type === 'text') {
                return [
                  ...parts.slice(0, -1),
                  { type: 'text', text: last.text + chunk },
                ];
              }
              return [...parts, { type: 'text', text: chunk }];
            }),
          );
        }
        return;
      }

      switch (chunk.type) {
        case 'text-delta':
          setStreamState((prev) =>
            withParts(prev, (parts) => {
              const last = parts[parts.length - 1];
              if (last?.type === 'text') {
                // Append to the current text part
                return [
                  ...parts.slice(0, -1),
                  { type: 'text', text: last.text + chunk.text },
                ];
              }
              // Start a fresh text part
              return [...parts, { type: 'text', text: chunk.text }];
            }),
          );
          break;

        case 'tool-call': {
          const toolCallId = (chunk as any).toolCallId as string;
          const toolName = (chunk as any).toolName as string;
          const args = ((chunk as any).input ?? {}) as Record<string, unknown>;
          setStreamState((prev) =>
            withParts(prev, (parts) => [
              ...parts,
              {
                type: 'tool-call',
                toolCallId,
                toolName,
                args,
                status: 'running',
              } satisfies ToolCallContentPart,
            ]),
          );
          break;
        }

        case 'tool-result': {
          const resultToolCallId = (chunk as any).toolCallId as string;
          const { output } = chunk as any;
          const failed = isToolResultFailure(output);
          setStreamState((prev) =>
            withParts(prev, (parts) =>
              parts.map((p) =>
                p.type === 'tool-call' && p.toolCallId === resultToolCallId
                  ? {
                      ...p,
                      result: output,
                      error: failed ? getToolResultError(output) : undefined,
                      status: failed ? ('error' as const) : ('done' as const),
                    }
                  : p,
              ),
            ),
          );
          break;
        }

        case 'tool-error': {
          const errorToolCallId = (chunk as any).toolCallId as string;
          const errorDetail = (chunk as any).error || (chunk as any).message;
          setStreamState((prev) =>
            withParts(prev, (parts) =>
              parts.map((p) =>
                p.type === 'tool-call' && p.toolCallId === errorToolCallId
                  ? { ...p, error: errorDetail, status: 'error' as const }
                  : p,
              ),
            ),
          );
          break;
        }

        case 'reasoning-delta': {
          // Reasoning/thinking deltas are captured by the backend into
          // thinkingContent and persisted. No dedicated UI state field here.
          break;
        }

        case 'error': {
          setStreamState((prev) => ({
            ...prev,
            error: parseAgentError((chunk as any).error),
          }));
          break;
        }

        default:
          // Other chunk types (source, etc.) are ignored in UI
          break;
      }
    });

    // FE-03: terminal confirm subscription via agentEvents.service, not raw ipcRenderer
    const unsubTerminalConfirm = subscribeToTerminalConfirm((data) => {
      if (data.conversationId !== sessionId) return;
      setStreamState((prev) => {
        const newItem: TerminalConfirmRequest = {
          requestId: data.requestId,
          toolName: data.toolName,
          command: data.command,
          cwd: data.cwd,
        };
        const newQueue = [...prev.confirmQueue, newItem];
        return {
          ...prev,
          confirmQueue: newQueue,
          pendingConfirm: prev.pendingConfirm ?? newItem,
        };
      });
    });

    return () => {
      unsubStepStart();
      unsubStreamChunks();
      unsubTerminalConfirm();
    };
  }, [sessionId]);

  const startStream = useCallback(
    async (
      content: string,
      contextItems?: any[],
      requestedModel?: string,
      toolMode?: 'chat' | 'agent',
      screenKey?: string,
      connectionId?: string,
      notebookId?: string,
      pageId?: string,
      projectAiContext?: string,
    ) => {
      if (!sessionId) return;

      const msgKey = [
        QUERY_KEYS.GET_CHAT_MESSAGES_WITH_CONTEXT,
        sessionId,
        undefined,
        undefined,
      ] as const;

      // Optimistic: add the user message immediately so it shows while agent runs
      const tempUserId = -Date.now();
      const tempUserMsg = {
        id: tempUserId,
        conversationId: sessionId,
        role: 'user',
        content,
        contextItems: contextItems?.length
          ? contextItems.map((ci, i) => ({ id: i, ...ci }))
          : null,
        toolCalls: null,
        thinkingContent: null,
        signature: null,
        isStreaming: false,
        parentMessageId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any;

      const prevMessages = queryClient.getQueryData<any[]>(msgKey) ?? [];
      queryClient.setQueryData(msgKey, [...prevMessages, tempUserMsg]);

      setStreamState({
        ...EMPTY_STATE,
        isStreaming: true,
      });

      try {
        await agentService.runAgent({
          conversationId: sessionId,
          content,
          contextItems,
          requestedModel,
          toolMode,
          screenKey: screenKey as any,
          connectionId,
          notebookId,
          pageId,
          projectAiContext,
        });

        // Agent completed — replace optimistic message with persisted data
        await queryClient.invalidateQueries(msgKey);
        // Clear live content parts — persisted messages now show from DB.
        // Keep steps (derived) so FilesChangedBlock can still read changed files.
        setStreamState((s) => ({
          ...s,
          contentParts: s.contentParts.filter((p) => p.type === 'tool-call'),
          currentText: '',
        }));
      } catch (error: unknown) {
        await queryClient.invalidateQueries(msgKey);
        setStreamState((s) => ({
          ...s,
          isStreaming: false,
          contentParts: s.contentParts.filter((p) => p.type === 'tool-call'),
          currentText: '',
          error: parseAgentError(error),
        }));
      }
    },
    [sessionId, queryClient],
  );

  const cancelStream = useCallback(async () => {
    if (!sessionId) return;
    try {
      await agentService.cancelAgent(sessionId);
      setStreamState((prev) => ({
        ...prev,
        isStreaming: false,
        pendingConfirm: null,
        confirmQueue: [],
      }));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }, [sessionId]);

  const confirmTerminal = useCallback(async (allow: boolean) => {
    const p = stateRef.current.pendingConfirm;
    if (!p) return;
    try {
      await agentService.resolveTerminalConfirm(p.requestId, allow);
      setStreamState((prev) => {
        const remaining = prev.confirmQueue.filter(
          (item) => item.requestId !== p.requestId,
        );
        return {
          ...prev,
          confirmQueue: remaining,
          pendingConfirm: remaining.length > 0 ? remaining[0] : null,
        };
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }, []);

  const clearError = useCallback(() => {
    setStreamState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    streamState,
    startStream,
    cancelStream,
    confirmTerminal,
    clearError,
  };
};
