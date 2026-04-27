/**
 * Shared IPC event payload types for the agent system.
 *
 * These types are used on BOTH sides of the IPC boundary:
 *   - Main process: event.sender.send(channel, payload)
 *   - Renderer:     agentEvents.service.ts subscription handlers
 *
 * Field name mapping from Vercel AI SDK types:
 *   TypedToolCall.input   → AgentToolCallPayload.args
 *   TypedToolResult.output → AgentToolCallPayload.result
 *
 * The SDK uses `input`/`output`; we use `args`/`result` in the IPC layer
 * to match the frontend ToolCallState interface in useAgentStream.ts.
 */
import type { TextStreamPart } from 'ai';

export interface AgentStepStartPayload {
  conversationId: number;
  /** Zero-based step index, matches SDK stepNumber */
  stepNumber: number;
}

export interface AgentToolCallPayload {
  conversationId: number;
  toolCallId: string;
  toolName: string;
  /** Mapped from SDK TypedToolCall.input */
  args?: Record<string, unknown>;
  stepNumber: number;
  /** Mapped from SDK TypedToolResult.output */
  result?: unknown;
  error?: string;
  durationMs?: number;
  status: 'running' | 'done' | 'error';
}

export interface AgentTerminalConfirmPayload {
  conversationId: number;
  requestId: string;
  toolName: string;
  command: string;
  cwd: string;
}

export interface AgentContextUsagePayload {
  conversationId: number;
  breakdown: {
    conversation: number;
    userFiles: number;
    skills: number;
    mcpTools: number;
    total: number;
    contextWindow: number;
    percentUsed: number;
  };
}

export interface AgentContextCompactedPayload {
  conversationId: number;
  messagesSummarized: number;
}

export interface ChatStreamChunkPayload {
  conversationId: number;
  /**
   * A native Vercel AI SDK TextStreamPart during fullStream iteration.
   * A plain string for: timeout messages, fallback messages, non-streaming path.
   * Omitted (or empty string) when `done: true` is the stream-end sentinel.
   */
  chunk: TextStreamPart<any> | string;
  done: boolean;
  usage?: {
    /** Maps to SDK LanguageModelUsage.inputTokens */
    promptTokens: number;
    /** Maps to SDK LanguageModelUsage.outputTokens */
    completionTokens: number;
    totalTokens: number;
  };
}
