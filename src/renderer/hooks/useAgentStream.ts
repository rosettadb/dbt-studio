import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from 'react-query';
import {
  subscribeToChatStreamChunks,
  subscribeToStepStart,
  subscribeToAgentToolCalls,
  subscribeToTerminalConfirm,
} from '../services/agentEvents.service';
import * as agentService from '../services/agent.service';
import { parseAgentError } from '../utils/agentErrorParser';
import { QUERY_KEYS } from '../config/constants';
import type { ParsedAgentError } from '../utils/agentErrorParser';

export interface ToolCallState {
  id: string; // The toolCallId
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

export interface AgentStreamState {
  isStreaming: boolean;
  steps: AgentStep[];
  currentText: string;
  error: ParsedAgentError | null;
  pendingConfirm: TerminalConfirmRequest | null; // head of the queue
  confirmQueue: TerminalConfirmRequest[]; // full queue
}

export const useAgentStream = (sessionId: number | undefined) => {
  const queryClient = useQueryClient();
  const [streamState, setStreamState] = useState<AgentStreamState>({
    isStreaming: false,
    steps: [],
    currentText: '',
    error: null,
    pendingConfirm: null,
    confirmQueue: [],
  });

  // Keep a ref so confirmTerminal can read the latest pendingConfirm
  // without being re-created on every state change
  const stateRef = useRef(streamState);
  useEffect(() => {
    stateRef.current = streamState;
  }, [streamState]);

  // Reset state when the session changes
  useEffect(() => {
    setStreamState({
      isStreaming: false,
      steps: [],
      currentText: '',
      error: null,
      pendingConfirm: null,
      confirmQueue: [],
    });
  }, [sessionId]);

  // Subscribe to all IPC events via agentEvents.service (FE-03 compliant)
  useEffect(() => {
    if (!sessionId) return undefined;

    const unsubStepStart = subscribeToStepStart((data) => {
      if (data.conversationId !== sessionId) return;
      setStreamState((prev) => {
        const newSteps = [...prev.steps];
        // Mark the previous step as done
        if (newSteps.length > 0) {
          const last = newSteps[newSteps.length - 1];
          if (!last.durationMs) {
            newSteps[newSteps.length - 1] = {
              ...last,
              durationMs: Date.now() - last.startedAt,
            };
          }
        }
        return {
          ...prev,
          steps: [
            ...newSteps,
            {
              stepNumber: data.stepNumber,
              toolCalls: [],
              startedAt: Date.now(),
            },
          ],
        };
      });
    });

    const unsubToolCalls = subscribeToAgentToolCalls((data) => {
      if (data.conversationId !== sessionId) return;
      setStreamState((prev) => {
        const steps = [...prev.steps];
        const stepIndex = steps.findIndex(
          (s) => s.stepNumber === data.stepNumber,
        );

        let step: AgentStep;
        if (stepIndex < 0) {
          // Step arrived before its step-start event — create it
          step = {
            stepNumber: data.stepNumber,
            toolCalls: [],
            startedAt: Date.now(),
          };
          steps.push(step);
          steps.sort((a, b) => a.stepNumber - b.stepNumber);
        } else {
          step = {
            ...steps[stepIndex],
            toolCalls: [...steps[stepIndex].toolCalls],
          };
          steps[stepIndex] = step;
        }

        const tcIndex = step.toolCalls.findIndex(
          (tc) => tc.id === data.toolCallId,
        );
        if (tcIndex >= 0) {
          step.toolCalls[tcIndex] = {
            ...step.toolCalls[tcIndex],
            status: data.status as 'running' | 'done' | 'error',
            result:
              data.result !== undefined
                ? data.result
                : step.toolCalls[tcIndex].result,
            error:
              data.error !== undefined
                ? data.error
                : step.toolCalls[tcIndex].error,
            durationMs: data.durationMs,
          };
        } else {
          step.toolCalls.push({
            id: data.toolCallId,
            toolName: data.toolName,
            args: (data.args || {}) as Record<string, unknown>,
            status: data.status as 'running' | 'done' | 'error',
            durationMs: data.durationMs,
          });
        }
        return { ...prev, steps };
      });
    });

    const unsubStreamChunks = subscribeToChatStreamChunks((data) => {
      if (data.conversationId !== sessionId) return;
      if (data.done) {
        // Don't clear currentText yet — keep it visible until invalidateQueries
        // loads the persisted message. Only stop the streaming indicator.
        setStreamState((prev) => ({ ...prev, isStreaming: false }));
      } else {
        setStreamState((prev) => ({
          ...prev,
          currentText: prev.currentText + data.chunk,
        }));
      }
    });

    // FE-03: terminal confirm subscription via agentEvents.service, not raw ipcRenderer
    const unsubTerminalConfirm = subscribeToTerminalConfirm((data) => {
      if (data.conversationId !== sessionId) return;
      // Enqueue — don't overwrite an existing pending confirm
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
          // Show the first item if nothing is currently shown
          pendingConfirm: prev.pendingConfirm ?? newItem,
        };
      });
    });

    return () => {
      unsubStepStart();
      unsubToolCalls();
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

      const prev = queryClient.getQueryData<any[]>(msgKey) ?? [];
      queryClient.setQueryData(msgKey, [...prev, tempUserMsg]);

      setStreamState({
        isStreaming: true,
        steps: [],
        currentText: '',
        error: null,
        pendingConfirm: null,
        confirmQueue: [],
      });

      try {
        // Route through agentService (FE-03: no raw ipcRenderer.invoke in hooks)
        await agentService.runAgent({
          conversationId: sessionId,
          content,
          contextItems,
          requestedModel,
          toolMode,
        });

        // Agent completed — replace optimistic message with persisted data
        await queryClient.invalidateQueries(msgKey);
        // Clear live streaming text — persisted messages (with tool calls) now show from DB
        // Keep steps so FilesChangedBlock can still show the changed files
        setStreamState((s) => ({ ...s, currentText: '' }));
      } catch (error: unknown) {
        // Always invalidate to load any persisted messages (user msg was saved before stream)
        await queryClient.invalidateQueries(msgKey);
        // Clear live streaming text — persisted messages now show from DB
        // Keep steps so FilesChangedBlock remains visible
        setStreamState((s) => ({
          ...s,
          isStreaming: false,
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
      // Advance the queue — show the next pending confirm if any
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
