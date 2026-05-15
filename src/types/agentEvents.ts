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

/**
 * Identifies which screen the AI agent is loaded in.
 * Used to scope sessions, system prompts, and tool sets.
 */
export type AgentScreenKey =
  | 'project' // dbt project screen (existing default)
  | 'sql' // SQL Editor screen
  | 'notebooks'; // Notebooks screen

export const MAX_USER_MESSAGE_CHARS = 50_000;
export const MAX_USER_MESSAGE_TOKENS = 8_000;
export const MAX_USER_MESSAGE_CONTEXT_FRACTION = 0.25;

export function estimateUserMessageTokens(content: string): number {
  return Math.ceil(content.length / 3);
}

export function getUserMessageTokenLimit(contextWindow: number): number {
  return Math.max(
    1,
    Math.floor(
      Math.min(
        MAX_USER_MESSAGE_TOKENS,
        contextWindow * MAX_USER_MESSAGE_CONTEXT_FRACTION,
      ),
    ),
  );
}

export function getUserMessageLimitError(
  content: string,
  contextWindow: number,
): string | null {
  if (content.length > MAX_USER_MESSAGE_CHARS) {
    return `Message is too large (${content.length.toLocaleString()} characters). The maximum is ${MAX_USER_MESSAGE_CHARS.toLocaleString()} characters. Attach large content as a file or split it into smaller messages.`;
  }

  const tokenEstimate = estimateUserMessageTokens(content);
  const tokenLimit = getUserMessageTokenLimit(contextWindow);

  if (tokenEstimate > tokenLimit) {
    return `Message is too large (about ${tokenEstimate.toLocaleString()} tokens). The maximum for a single message is ${tokenLimit.toLocaleString()} tokens. Attach large content as a file or split it into smaller messages.`;
  }

  return null;
}

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
