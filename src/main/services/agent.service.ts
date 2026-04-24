/* eslint-disable no-console */
import fs from 'fs-extra';
import path from 'path';
import { IpcMainInvokeEvent, app, BrowserWindow } from 'electron';
import { generateText } from 'ai';
import { createDbtAgent } from './ai/dbtAgent';
import { getVercelModel } from './ai/agentAdapter';
import { buildMCPToolset } from './ai/mcp/mcpToolAdapter';
import { discoverSkills } from './ai/skills/skillsDiscovery';
import { buildSkillsPrompt } from './ai/skills/skillsPrompt';
import { createLoadSkillTool } from './ai/skills/loadSkillTool';
import { dbtTools } from './ai/tools/dbt.tools';
import { filesystemTools } from './ai/tools/filesystem.tools';
import { TerminalConfirmGate } from './ai/tools/terminalConfirmGate';
import {
  estimateTokens,
  estimateMessagesTokens,
  getContextWindow,
} from './ai/tokenEstimator';
import MainDatabaseService from './mainDatabase.service';
import ProjectsService from './projects.service';
import type {
  NewContextItem,
  ChatMessage,
} from '../schemas/mainDatabase.schema';
import type { AISettingsConfig } from '../../types/backend';
import type {
  AgentStepStartPayload,
  AgentToolCallPayload,
  ChatStreamChunkPayload,
  AgentContextUsagePayload,
  AgentContextCompactedPayload,
} from '../../types/agentEvents';

// ─── AI Settings ─────────────────────────────────────────────────────────────

const AI_SETTINGS_DEFAULTS: AISettingsConfig = {
  chat: {
    streamResponses: true,
    autoIncludeFileContext: true,
    showTokenCount: false,
    autoScrollToLatest: true,
  },
  tools: {
    readDbtModel: true,
    writeDbtModel: true,
    runDbtCommand: true,
    listDbtModels: true,
    getDbtLogs: true,
    listDirectory: true,
    readFile: true,
    writeFile: true,
    pathExists: true,
  },
  configuration: {
    allowAIInBackground: true,
    autoExecution: 'allowlist',
    autoContinue: true,
    autoGenerateMemories: true,
  },
  advanced: { maxWorkspaceFileCount: 5000 },
};

const aiSettingsFilePath = () =>
  path.join(app.getPath('userData'), 'ai-settings.json');

export const loadAISettings = async (): Promise<AISettingsConfig> => {
  try {
    const fp = aiSettingsFilePath();
    if (!fs.existsSync(fp)) return AI_SETTINGS_DEFAULTS;
    const raw = await fs.readJson(fp);
    return {
      chat: { ...AI_SETTINGS_DEFAULTS.chat, ...raw.chat },
      tools: { ...AI_SETTINGS_DEFAULTS.tools, ...raw.tools },
      configuration: {
        ...AI_SETTINGS_DEFAULTS.configuration,
        ...raw.configuration,
      },
      advanced: { ...AI_SETTINGS_DEFAULTS.advanced, ...raw.advanced },
    };
  } catch (error) {
    console.error(error);
    return AI_SETTINGS_DEFAULTS;
  }
};

export const saveAISettings = async (
  config: AISettingsConfig,
): Promise<void> => {
  try {
    await fs.writeJson(aiSettingsFilePath(), config, { spaces: 2 });
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const getAISettingsFilePath = (): string => aiSettingsFilePath();

// Track active agent executions by conversationId
const activeAgents = new Map<number, AbortController>();

// Per-conversation agent context — replaces the static singleton to prevent
// race conditions when multiple conversations run concurrently (#4)
const agentContexts = new Map<
  number,
  { event: IpcMainInvokeEvent; conversationId: number }
>();

/**
 * Request payload for agent execution
 */
export interface AgentRunRequest {
  conversationId: number;
  content: string;
  contextItems?: Omit<NewContextItem, 'messageId'>[];
  requestedModel?: string;
  projectPath?: string;
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
 * Context usage breakdown emitted to the UI before each agent turn
 */
export interface ContextUsageBreakdown {
  conversation: number;
  userFiles: number;
  skills: number;
  mcpTools: number;
  total: number;
  contextWindow: number;
  percentUsed: number;
}

/** Tracks which conversations are actively compacting (prevent duplicate calls) */
const activeCompactions = new Set<number>();

/**
 * Converts ChatMessage[] into the CoreMessage format expected by the Vercel AI SDK.
 */
function buildCoreMessages(
  messages: ChatMessage[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
}

/**
 * Agent Service - handles all agent-related business logic
 */
class AgentService {
  /**
   * Returns the agent context for a specific conversation.
   * Tools call this instead of reading the old static singleton.
   */
  public static getAgentContext(conversationId: number) {
    return agentContexts.get(conversationId) ?? null;
  }

  /**
   * @deprecated Use getAgentContext(conversationId) instead.
   * Kept temporarily so existing tool code that reads currentAgentContext
   * still compiles. Will be removed once tools are updated.
   */
  public static get currentAgentContext() {
    // Return the most recently registered context as a best-effort fallback
    const entries = [...agentContexts.values()];
    return entries.length > 0 ? entries[entries.length - 1] : null;
  }

  // ─── Context Compaction ──────────────────────────────────────────────────────

  /**
   * Generates a concise LLM summary of older messages for compaction.
   */
  private static async generateSummary(
    messages: ChatMessage[],
  ): Promise<string> {
    const model = await getVercelModel();
    const conversationText = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const { text } = await generateText({
      model: model as any,
      prompt: `Summarize this dbt Studio conversation for an AI coding assistant.
Preserve exactly:
- Every file read, created, or modified (with full paths)
- Every dbt command run and its outcome (success/failure)
- Every error encountered and how it was resolved
- Current task state and what has been completed
- Any user decisions or preferences expressed
- Any code snippets still relevant to the current task

Be concise but complete. Use bullet points.

CONVERSATION:
${conversationText}

SUMMARY:`,
    });
    return text;
  }

  /**
   * Incrementally extends an existing summary with new messages.
   */
  private static async extendSummary(
    existing: string,
    newMessages: ChatMessage[],
  ): Promise<string> {
    const model = await getVercelModel();
    const newText = newMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const { text } = await generateText({
      model: model as any,
      prompt: `Update this conversation summary with new information.
Keep all existing information still relevant. Add new information from the additional messages.

EXISTING SUMMARY:
${existing}

NEW MESSAGES:
${newText}

UPDATED SUMMARY:`,
    });
    return text;
  }

  /**
   * Auto-compacts conversation history when context window is getting full.
   * Keeps the last 6 messages verbatim, summarizes older ones with the LLM.
   */
  private static async autoCompact(
    conversationId: number,
    messages: ChatMessage[],
    event: IpcMainInvokeEvent,
  ): Promise<
    Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  > {
    const ALWAYS_KEEP_RECENT = 6; // last 3 user+assistant pairs verbatim

    const recentMessages = messages.slice(-ALWAYS_KEEP_RECENT);
    const olderMessages = messages.slice(0, -ALWAYS_KEEP_RECENT);

    if (olderMessages.length === 0) return buildCoreMessages(recentMessages);

    // Prevent duplicate LLM calls if multiple messages trigger compaction simultaneously
    if (activeCompactions.has(conversationId)) {
      return buildCoreMessages(messages);
    }
    activeCompactions.add(conversationId);

    try {
      const existingSummary =
        await MainDatabaseService.getCompactionSummary(conversationId);

      let summaryText: string;
      if (existingSummary) {
        // Only extend with messages that came AFTER the last compaction point
        // to avoid re-summarizing already-summarized history (#11)
        const newMessages = existingSummary.coversUpToMessageId
          ? olderMessages.filter(
              (m) => (m.id ?? 0) > existingSummary.coversUpToMessageId!,
            )
          : olderMessages;

        summaryText =
          newMessages.length > 0
            ? await this.extendSummary(existingSummary.content, newMessages)
            : existingSummary.content;
      } else {
        summaryText = await this.generateSummary(olderMessages);
      }

      // Persist for next turn (incremental compaction)
      const lastOldMessageId = olderMessages[olderMessages.length - 1]?.id;
      await MainDatabaseService.saveCompactionSummary(
        conversationId,
        summaryText,
        lastOldMessageId,
      );

      // Notify UI
      const compactedPayload: AgentContextCompactedPayload = {
        conversationId,
        messagesSummarized: olderMessages.length,
      };
      event.sender.send('agent:context-compacted', compactedPayload);

      return [
        {
          role: 'system',
          content: `## Earlier Conversation (summarized)\n\n${summaryText}`,
        },
        ...buildCoreMessages(recentMessages),
      ];
    } finally {
      activeCompactions.delete(conversationId);
    }
  }

  /**
   * Builds turn messages with auto-compaction when context window 85% full.
   * Returns the messages to send to the model plus a context usage breakdown.
   */
  private static async buildTurnMessages(
    conversationId: number,
    newContent: string,
    contextItems: Omit<NewContextItem, 'messageId'>[] | undefined,
    modelId: string,
    event: IpcMainInvokeEvent,
  ): Promise<{
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    breakdown: ContextUsageBreakdown;
  }> {
    const contextWindow = getContextWindow(modelId);
    const RESPONSE_HEADROOM = 8_000;
    const COMPACT_THRESHOLD = 0.85;

    const allMessages = await MainDatabaseService.getMessages(conversationId);

    const historyTokens = estimateMessagesTokens(allMessages);
    const newMsgTokens = estimateTokens(newContent);
    const ctxItemTokens = estimateTokens(contextItems);
    const totalEstimate =
      historyTokens + newMsgTokens + ctxItemTokens + RESPONSE_HEADROOM;

    const percentUsed = totalEstimate / contextWindow;

    const breakdown: ContextUsageBreakdown = {
      conversation: historyTokens,
      userFiles: ctxItemTokens,
      skills: 0, // enriched in runAgent after skills are loaded
      mcpTools: 0, // enriched in runAgent after MCP is loaded
      total: totalEstimate,
      contextWindow,
      percentUsed: Math.min(100, Math.round(percentUsed * 100)),
    };

    if (percentUsed > COMPACT_THRESHOLD) {
      const compactedMessages = await this.autoCompact(
        conversationId,
        allMessages,
        event,
      );
      const compactedTokens = estimateMessagesTokens(compactedMessages);
      breakdown.conversation = compactedTokens;
      breakdown.total =
        compactedTokens + newMsgTokens + ctxItemTokens + RESPONSE_HEADROOM;
      breakdown.percentUsed = Math.min(
        100,
        Math.round((breakdown.total / contextWindow) * 100),
      );
      return { messages: compactedMessages, breakdown };
    }

    return { messages: buildCoreMessages(allMessages), breakdown };
  }

  /**
   * Run the agent with streaming
   */

  static async runAgent(
    event: IpcMainInvokeEvent,
    request: AgentRunRequest,
  ): Promise<{ success: boolean }> {
    const { conversationId, content, contextItems, requestedModel } = request;

    // Resolve projectPath: use what was sent, or fall back to the selected project
    let { projectPath } = request;
    if (!projectPath) {
      const selectedProject = await ProjectsService.getSelectedProject();
      projectPath = selectedProject?.path;
    }

    try {
      // Register per-conversation context (fixes race condition on concurrent runs)
      agentContexts.set(conversationId, { event, conversationId });

      // Typed helper to send stream chunks — ensures both sides use the same payload shape
      const sendChunk = (payload: ChatStreamChunkPayload) =>
        event.sender.send('chat:message:stream-chunk', payload);

      // 1. Load AI settings
      const aiSettings = await loadAISettings();

      // 2. Persist user message
      await MainDatabaseService.addMessageWithContext(
        conversationId,
        { role: 'user', content },
        contextItems,
      );

      // 3. Load & potentially compact conversation history
      const model = await getVercelModel(requestedModel);
      // Extract modelId safely — prefer the SDK's own property, fall back to
      // the requested model string, then 'default'. Never silently use 32K.
      const modelId: string =
        (model as any).modelId ||
        (model as any).model ||
        requestedModel ||
        'default';
      const { messages, breakdown } = await this.buildTurnMessages(
        conversationId,
        content,
        contextItems,
        modelId,
        event,
      );

      // 4. Filter tools by enabled settings
      const allTools = { ...dbtTools, ...filesystemTools };
      const enabledTools: Record<string, any> = Object.fromEntries(
        Object.entries(allTools).filter(
          ([name]) => aiSettings.tools[name] !== false,
        ),
      );

      // 4b. Get MCP tools (only connected servers)
      const mcpTools = await buildMCPToolset(['rosetta', 'dbt', 'duckdb']);

      // 4c. Discover skills and create loadSkill tool
      const skills = await discoverSkills();
      const loadSkillTool = createLoadSkillTool(skills);
      const skillsPrompt = buildSkillsPrompt(skills);

      // Enrich breakdown with skills + MCP token estimates
      breakdown.skills = estimateTokens(skillsPrompt);
      breakdown.mcpTools = estimateTokens(
        Object.keys(mcpTools || {}).join(' '),
      );
      breakdown.total += breakdown.skills + breakdown.mcpTools;
      breakdown.percentUsed = Math.min(
        100,
        Math.round((breakdown.total / breakdown.contextWindow) * 100),
      );

      // Emit context usage breakdown to UI
      const contextUsagePayload: AgentContextUsagePayload = {
        conversationId,
        breakdown,
      };
      event.sender.send('agent:context-usage', contextUsagePayload);

      // 5. Respect autoContinue
      const maxSteps = aiSettings.configuration.autoContinue ? 20 : 1;

      // 6. Create agent
      const mainWindow =
        BrowserWindow.fromWebContents(event.sender) || undefined;
      const agent = await createDbtAgent({
        requestedModel,
        projectPath,
        enabledTools,
        extraTools: { ...mcpTools, loadSkill: loadSkillTool },
        skills: skillsPrompt,
        maxSteps,
        mainWindow,
      });

      const abortController = new AbortController();
      activeAgents.set(conversationId, abortController);

      let fullContent = '';
      let toolCallCount = 0;
      let finalUsage:
        | {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
          }
        | undefined;

      // Collect all tool calls across steps for persistence after the run
      const collectedToolCalls: Array<{
        toolName: string;
        toolCallId: string;
        args: Record<string, unknown>;
        result: unknown;
        stepNumber: number;
        status: 'done' | 'error';
        durationMs?: number;
      }> = [];

      // onStepFinish is the ONLY per-call callback supported by ToolLoopAgent.stream/generate.
      // experimental_onToolCallStart/Finish/onStepStart are generateText/streamText options —
      // they are NOT forwarded by ToolLoopAgent and are silently dropped when passed via `as any`.
      //
      // Strategy: emit agent:step-start at the beginning of each step, and emit agent:tool-call
      // events for each tool call result from onStepFinish. This gives the frontend step blocks
      // and completed tool call rows. Running-state tool calls (status:'running') are not
      // available via this API — the frontend shows a spinner until the step finishes.
      //
      // SDK field names: TypedToolCall uses `input` (not `args`),
      //                  TypedToolResult uses `output` (not `result`).
      // IPC event field names: we map input→args and output→result for the frontend.
      const onStepFinish = async ({
        stepNumber,
        toolCalls,
        toolResults,
        usage,
      }: {
        stepNumber: number;
        toolCalls?: Array<{
          toolName: string;
          toolCallId: string;
          input?: unknown;
        }>;
        toolResults?: Array<{
          toolName: string;
          toolCallId: string;
          output: unknown;
        }>;
        usage?: { totalTokens?: number };
      }) => {
        // Capture final usage from the last step (this is where AI SDK actually provides it)
        // Don't overwrite if already set by a previous step
        const stepTokens = usage?.totalTokens ?? 0;
        if (stepTokens > 0 && !finalUsage?.totalTokens) {
          finalUsage = {
            promptTokens: 0,
            completionTokens: stepTokens,
            totalTokens: stepTokens,
          };
        }
        // Emit step-start at the beginning of each step (stepNumber is 0-based)
        const stepStartPayload: AgentStepStartPayload = {
          conversationId,
          stepNumber,
        };
        event.sender.send('agent:step-start', stepStartPayload);

        if (toolCalls) {
          toolCallCount += toolCalls.length;

          // Build an output map keyed by toolCallId for quick lookup
          const outputMap = new Map<string, unknown>();
          toolResults?.forEach((tr) => outputMap.set(tr.toolCallId, tr.output));

          // Emit a done event for each tool call in this step.
          // Map SDK field names (input/output) to IPC event field names (args/result).
          toolCalls.forEach((tc) => {
            const toolCallPayload: AgentToolCallPayload = {
              conversationId,
              toolName: tc.toolName,
              toolCallId: tc.toolCallId,
              args: tc.input as Record<string, unknown>, // SDK: input → IPC: args
              result: outputMap.get(tc.toolCallId), // SDK: output → IPC: result
              stepNumber,
              status: 'done',
            };
            event.sender.send('agent:tool-call', toolCallPayload);

            // Collect for DB persistence
            collectedToolCalls.push({
              toolName: tc.toolName,
              toolCallId: tc.toolCallId,
              args: tc.input as Record<string, unknown>,
              result: outputMap.get(tc.toolCallId),
              stepNumber,
              status: 'done',
            });
          });
        }
      };

      try {
        if (aiSettings.chat.streamResponses) {
          // ── Streaming path ──────────────────────────────────────────────
          // Wrap with a timeout to prevent indefinite hangs (e.g. openai.responses stalls)
          const STREAM_TIMEOUT_MS = 60_000; // 60s
          const timeoutId = setTimeout(async () => {
            console.warn(
              `[AgentService.runAgent] Stream timeout after ${STREAM_TIMEOUT_MS}ms — aborting`,
            );
            const timeoutMsg =
              '⚠️ The request timed out. The AI provider did not respond within 60 seconds. Please try again or switch to a different model.';
            // Persist the timeout message so it appears in chat history
            try {
              await MainDatabaseService.addMessageWithContext(
                conversationId,
                { role: 'assistant', content: timeoutMsg },
                undefined,
              );
            } catch (persistErr) {
              console.error(
                '[AgentService] Failed to persist timeout message:',
                persistErr,
              );
            }
            // Send to renderer then close the stream
            sendChunk({ conversationId, chunk: timeoutMsg, done: false });
            sendChunk({ conversationId, chunk: '', done: true });
            abortController.abort();
          }, STREAM_TIMEOUT_MS);

          try {
            const result = await agent.stream({
              messages,
              abortSignal: abortController.signal,
              onStepFinish,
            });

            /* eslint-disable no-restricted-syntax */
            for await (const chunk of result.textStream) {
              if (abortController.signal.aborted) break;
              // Reset timeout on each received chunk — stream is alive
              clearTimeout(timeoutId);
              fullContent += chunk;
              sendChunk({ conversationId, chunk, done: false });
            }
            /* eslint-enable no-restricted-syntax */

            clearTimeout(timeoutId);

            // Always capture usage (setting only controls display, not persistence)
            const usage = await result.usage;
            const totalToks = usage?.totalTokens ?? 0;
            finalUsage = {
              promptTokens: 0, // AI SDK v6 doesn't separate these
              completionTokens: totalToks,
              totalTokens: totalToks,
            };
            sendChunk({
              conversationId,
              chunk: '',
              done: true,
              usage: aiSettings.chat.showTokenCount ? finalUsage : undefined,
            });
          } catch (streamErr) {
            clearTimeout(timeoutId);
            // Always send done:true so the frontend exits streaming state
            sendChunk({ conversationId, chunk: '', done: true });
            throw streamErr;
          }
        } else {
          // ── Non-streaming path ──────────────────────────────────────────
          const result = await agent.generate({
            messages,
            abortSignal: abortController.signal,
            onStepFinish,
          });
          fullContent = result.text;
          const totalToks = result.usage?.totalTokens ?? 0;
          finalUsage = {
            promptTokens: 0,
            completionTokens: totalToks,
            totalTokens: totalToks,
          };
          sendChunk({ conversationId, chunk: fullContent, done: false });
          sendChunk({
            conversationId,
            chunk: '',
            done: true,
            usage: aiSettings.chat.showTokenCount ? finalUsage : undefined,
          });
        }

        // Guard against empty responses (e.g. Gemini Flash Lite silent failures)
        if (!fullContent.trim() && toolCallCount === 0) {
          const fallback =
            "I wasn't able to generate a response. Please try rephrasing your message or switching to a different model.";
          fullContent = fallback;
          sendChunk({ conversationId, chunk: fallback, done: false });
          sendChunk({ conversationId, chunk: '', done: true });
        }
      } finally {
        activeAgents.delete(conversationId);
        agentContexts.delete(conversationId); // clean up per-conversation context
      }

      // Persist assistant response with all tool calls from this run
      const toolCallsToSave: Omit<
        import('../schemas/mainDatabase.schema').NewToolCall,
        'messageId'
      >[] = collectedToolCalls.map((tc) => ({
        toolName: tc.toolName,
        toolInput: {
          ...((tc.args as object) || {}),
          stepNum: tc.stepNumber,
          tcId: tc.toolCallId,
        },
        toolOutput: tc.result ?? null,
        status: tc.status === 'done' ? 'completed' : 'failed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        errorMessage: null,
      }));

      await MainDatabaseService.addMessageWithContext(
        conversationId,
        {
          role: 'assistant',
          content: fullContent,
          metadata: finalUsage
            ? {
                promptTokens: finalUsage.promptTokens,
                completionTokens: finalUsage.completionTokens,
                totalTokens: finalUsage.totalTokens,
              }
            : undefined,
        },
        undefined,
        toolCallsToSave.length > 0 ? toolCallsToSave : undefined,
      );
      return { success: true };
    } catch (error) {
      console.error('[AgentService.runAgent] Error:', error);
      console.error('[AgentService.runAgent] Error details:', {
        conversationId,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Cancel an active agent execution
   */
  static async cancelAgent(conversationId: number): Promise<{
    success: boolean;
    message: string;
  }> {
    const controller = activeAgents.get(conversationId);
    if (controller) {
      TerminalConfirmGate.abortForConversation(conversationId);
      controller.abort();
      activeAgents.delete(conversationId);
      agentContexts.delete(conversationId);
      return { success: true, message: 'Agent execution cancelled' };
    }

    return { success: false, message: 'No active agent execution found' };
  }

  /**
   * List available agent tools
   */
  static async listTools(): Promise<{
    success: boolean;
    tools: AgentTool[];
    error?: string;
  }> {
    try {
      // Return static list of available tools
      // Note: ToolLoopAgent doesn't expose tools directly
      const tools: AgentTool[] = [
        {
          name: 'readDbtModel',
          description: 'Read a dbt model, macro, schema, or config file',
          category: 'dbt',
        },
        {
          name: 'writeDbtModel',
          description: 'Write or update a dbt model SQL or YAML file',
          category: 'dbt',
        },
        {
          name: 'runDbtCommand',
          description: 'Execute a dbt CLI command',
          category: 'dbt',
        },
        {
          name: 'listDbtModels',
          description: 'List all dbt models in the project',
          category: 'dbt',
        },
        {
          name: 'getDbtLogs',
          description: 'Read recent dbt run logs',
          category: 'dbt',
        },
        {
          name: 'listDirectory',
          description: 'List files and directories',
          category: 'filesystem',
        },
        {
          name: 'readFile',
          description: 'Read a text file',
          category: 'filesystem',
        },
        {
          name: 'writeFile',
          description: 'Write a text file',
          category: 'filesystem',
        },
        {
          name: 'pathExists',
          description: 'Check if a file or directory exists',
          category: 'filesystem',
        },
      ];

      return { success: true, tools };
    } catch (error) {
      console.error('[AgentService.listTools] Error:', error);
      return { success: false, tools: [], error: 'Failed to list tools' };
    }
  }
}

export default AgentService;
