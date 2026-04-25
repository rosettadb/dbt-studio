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

// ─── Token Management Interfaces ─────────────────────────────────────────────

export interface TokenBudget {
  maxTotal: number;
  recentMessages: number;
  summary: number;
  relevantContext: number;
  buffer: number;
}

export interface ConversationPhase {
  phase: 'exploration' | 'implementation' | 'debugging' | 'review';
  recommendedLimit: number;
}

export interface ScoredMessage {
  message: ChatMessage;
  index: number;
  score: number;
  isRecent: boolean;
  tokenCount: number;
}

// ─── Tool Categorization ─────────────────────────────────────────────────────

const TOOL_CATEGORIES = {
  analysis: [
    'readDbtModel',
    'listDbtModels',
    'getDbtLogs',
    'listDirectory',
    'readFile',
    'pathExists',
  ],
  action: ['writeDbtModel', 'runDbtCommand', 'writeFile'],
};

export function getToolsForMode(
  mode: 'chat' | 'agent',
  aiSettings: AISettingsConfig,
) {
  const allTools = { ...dbtTools, ...filesystemTools };

  if (mode === 'chat') {
    // Chat Mode: only analysis tools
    return Object.fromEntries(
      Object.entries(allTools).filter(
        ([name]) =>
          TOOL_CATEGORIES.analysis.includes(name) &&
          aiSettings.tools[name] !== false,
      ),
    );
  }

  // Agent Mode: all enabled tools
  return Object.fromEntries(
    Object.entries(allTools).filter(
      ([name]) => aiSettings.tools[name] !== false,
    ),
  );
}

/**
 * Request payload for agent execution
 */
export interface AgentRunRequest {
  conversationId: number;
  content: string;
  contextItems?: Omit<NewContextItem, 'messageId'>[];
  requestedModel?: string;
  projectPath?: string;
  toolMode?: 'chat' | 'agent';
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
   * Builds a token budget scaled to the active model's context window.
   */
  private static buildBudgetForModel(modelId?: string): TokenBudget {
    const DEFAULT_MAX = 6000;
    const contextWindow = modelId
      ? getContextWindow(modelId)
      : Math.floor(DEFAULT_MAX / 0.85);
    const maxTotal = Math.floor(contextWindow * 0.85);
    return {
      maxTotal,
      recentMessages: Math.floor(maxTotal * 0.6),
      summary: Math.floor(maxTotal * 0.15),
      relevantContext: Math.floor(maxTotal * 0.13),
      buffer: Math.floor(maxTotal * 0.12),
    };
  }

  private static detectConversationPhase(
    messages: ChatMessage[],
  ): ConversationPhase {
    const lastFewMessages = messages.slice(-5);
    const content = lastFewMessages
      .map((m) => m.content.toLowerCase())
      .join(' ');

    if (
      content.includes('error') ||
      content.includes('debug') ||
      content.includes('fix') ||
      content.includes('issue')
    ) {
      return { phase: 'debugging', recommendedLimit: 15 };
    }

    if (
      content.includes('implement') ||
      content.includes('code') ||
      content.includes('function') ||
      content.includes('class')
    ) {
      return { phase: 'implementation', recommendedLimit: 10 };
    }

    if (
      content.includes('review') ||
      content.includes('summary') ||
      content.includes('overall') ||
      content.includes('complete')
    ) {
      return { phase: 'review', recommendedLimit: 18 };
    }

    return { phase: 'exploration', recommendedLimit: 8 };
  }

  private static scoreMessageImportance(message: ChatMessage): number {
    let score = 1;
    const content = message.content.toLowerCase();

    if (
      content.includes('error') ||
      content.includes('problem') ||
      content.includes('issue')
    )
      score += 3;
    if (
      content.includes('solution') ||
      content.includes('fixed') ||
      content.includes('resolved')
    )
      score += 3;
    if (
      content.includes('important') ||
      content.includes('key') ||
      content.includes('critical')
    )
      score += 2;
    if (
      content.includes('```') ||
      content.includes('code') ||
      content.includes('function')
    )
      score += 2;
    if (message.contextItems && message.contextItems.length > 0) score += 2;
    if (
      content.includes('decision') ||
      content.includes('approach') ||
      content.includes('strategy')
    )
      score += 2;

    const contentLength = content.length;
    if (contentLength > 500 && contentLength < 2000) score += 1;
    if (contentLength < 50) score -= 1;

    if (message.role === 'assistant' && contentLength > 200) score += 1;

    const ageInHours =
      (Date.now() - new Date(message.createdAt).getTime()) / (1000 * 60 * 60);
    const recencyBonus = Math.max(0, 3 - ageInHours / 12);
    score += recencyBonus;

    return score;
  }

  private static selectMessagesWithinBudget(
    scoredMessages: ScoredMessage[],
    tokenBudget: number,
    minMessages: number,
    maxMessages: number,
  ): ScoredMessage[] {
    const selected: ScoredMessage[] = [];
    let usedTokens = 0;

    const guaranteedRecent = scoredMessages
      .filter((item) => item.isRecent)
      .slice(-minMessages);

    guaranteedRecent.some((item) => {
      if (usedTokens + item.tokenCount <= tokenBudget) {
        selected.push(item);
        usedTokens += item.tokenCount;
        return false;
      }
      if (selected.length === 0) {
        const truncated = this.truncateMessage(item, tokenBudget);
        selected.push(truncated);
        usedTokens = tokenBudget;
        return true; // equivalent to break
      }
      return false;
    });

    const remainingMessages = scoredMessages
      .filter((item) => !item.isRecent)
      .sort((a, b) => b.score - a.score);

    remainingMessages.forEach((item) => {
      if (
        usedTokens + item.tokenCount <= tokenBudget &&
        selected.length < maxMessages
      ) {
        selected.push(item);
        usedTokens += item.tokenCount;
      }
    });

    return selected;
  }

  private static truncateMessage(
    scoredMessage: ScoredMessage,
    maxTokens: number,
  ): ScoredMessage {
    const originalContent = scoredMessage.message.content;
    const truncatedContent = this.truncateText(originalContent, maxTokens - 20);

    return {
      ...scoredMessage,
      message: {
        ...scoredMessage.message,
        content: `${truncatedContent}... [truncated]`,
      },
      tokenCount: maxTokens,
    };
  }

  private static truncateText(text: string, maxTokens: number): string {
    if (estimateTokens(text) <= maxTokens) {
      return text;
    }

    let left = 0;
    let right = text.length;
    let bestLength = 0;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const substring = text.substring(0, mid);
      const tokenCount = estimateTokens(substring);

      if (tokenCount <= maxTokens) {
        bestLength = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return text.substring(0, bestLength);
  }

  private static async summarizeConversationHistory(
    olderMessages: ChatMessage[],
  ): Promise<string | null> {
    if (olderMessages.length === 0) return null;

    try {
      const keyPoints: string[] = [];
      const topics = new Set<string>();
      const decisions: string[] = [];
      const codeElements: string[] = [];

      olderMessages.forEach((message) => {
        const content = message.content.toLowerCase();

        if (content.includes('database') || content.includes('sql'))
          topics.add('database work');
        if (content.includes('react') || content.includes('component'))
          topics.add('React development');
        if (content.includes('dbt') || content.includes('model'))
          topics.add('dbt modeling');
        if (content.includes('error') || content.includes('debug'))
          topics.add('troubleshooting');

        if (
          content.includes('decided') ||
          content.includes('choose') ||
          content.includes('prefer')
        ) {
          decisions.push(`${message.content.substring(0, 100)}...`);
        }

        if (
          content.includes('```') ||
          content.includes('function') ||
          content.includes('class')
        ) {
          codeElements.push(`${message.role}: discussed code implementation`);
        }
      });

      if (topics.size > 0)
        keyPoints.push(`Previous topics: ${Array.from(topics).join(', ')}`);
      if (decisions.length > 0)
        keyPoints.push(`Key decisions: ${decisions.slice(0, 2).join('; ')}`);
      if (codeElements.length > 0)
        keyPoints.push(
          `Technical work: ${codeElements.length} code discussions`,
        );
      keyPoints.push(
        `Conversation span: ${olderMessages.length} earlier messages`,
      );

      return keyPoints.length > 0 ? keyPoints.join('. ') : null;
    } catch (error) {
      return `Earlier conversation with ${olderMessages.length} messages`;
    }
  }

  private static async extractRelevantContext(
    olderMessages: ChatMessage[],
    currentContent: string,
  ): Promise<string[]> {
    if (!currentContent || olderMessages.length === 0) return [];

    try {
      const relevantSnippets: string[] = [];
      const currentTopics = this.extractTopicsFromContent(currentContent);

      olderMessages.forEach((message) => {
        const messageTopics = this.extractTopicsFromContent(message.content);
        const hasOverlap = currentTopics.some((topic) =>
          messageTopics.includes(topic),
        );

        if (hasOverlap && message.content.length < 200) {
          relevantSnippets.push(`${message.role}: ${message.content}`);
        } else if (hasOverlap) {
          const sentences = message.content.split(/[.!?]+/);
          const relevantSentence = sentences.find((s: string) =>
            currentTopics.some((topic) => s.toLowerCase().includes(topic)),
          );
          if (relevantSentence) {
            relevantSnippets.push(
              `${message.role}: ${relevantSentence.trim()}...`,
            );
          }
        }
      });

      return relevantSnippets.slice(0, 3);
    } catch (error) {
      return [];
    }
  }

  private static extractTopicsFromContent(content: string): string[] {
    const topics: string[] = [];
    const lowerContent = content.toLowerCase();

    const topicKeywords = [
      'database',
      'sql',
      'query',
      'table',
      'schema',
      'react',
      'component',
      'hook',
      'state',
      'props',
      'dbt',
      'model',
      'transformation',
      'analytics',
      'error',
      'debug',
      'fix',
      'issue',
      'problem',
      'api',
      'endpoint',
      'request',
      'response',
      'typescript',
      'javascript',
      'function',
      'class',
    ];

    topicKeywords.forEach((keyword) => {
      if (lowerContent.includes(keyword)) {
        topics.push(keyword);
      }
    });

    return topics;
  }

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
   * Builds turn messages with auto-compaction and dynamic token budgets.
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
    // 1. Get dynamic token budget
    const budget = this.buildBudgetForModel(modelId);

    // 2. Load all messages
    const allMessages = await MainDatabaseService.getMessages(conversationId);

    // 3. Detect conversation phase
    const phase = this.detectConversationPhase(allMessages);

    // 4. Score messages by importance
    const MIN_RECENT_MESSAGES = 4;
    const MAX_RECENT_MESSAGES = Math.min(100, phase.recommendedLimit);

    const scoredMessages: ScoredMessage[] = allMessages.map((msg, index) => ({
      message: msg,
      index,
      score: this.scoreMessageImportance(msg),
      isRecent: index >= allMessages.length - MIN_RECENT_MESSAGES,
      tokenCount: estimateTokens(msg.content),
    }));

    // 5. Select messages within budget
    const selectedMessages = this.selectMessagesWithinBudget(
      scoredMessages,
      budget.recentMessages,
      MIN_RECENT_MESSAGES,
      MAX_RECENT_MESSAGES,
    );

    // Re-sort selected messages chronologically
    const recentMessages = selectedMessages
      .map((sm) => sm.message)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

    // 6. Extract relevant context from older messages
    const selectedIds = new Set(recentMessages.map((m) => m.id));
    const olderMessages = allMessages.filter((m) => !selectedIds.has(m.id));
    const relevantContext = await this.extractRelevantContext(
      olderMessages,
      newContent,
    );

    // 7. Decide: LLM compaction or heuristic summarization
    const historyTokens = estimateMessagesTokens(recentMessages);
    const newMsgTokens = estimateTokens(newContent);
    const ctxItemTokens = estimateTokens(contextItems);
    const RESPONSE_HEADROOM = 8_000;

    const contextWindow = getContextWindow(modelId);
    const totalTokens =
      historyTokens + newMsgTokens + ctxItemTokens + RESPONSE_HEADROOM;
    const percentUsed = totalTokens / contextWindow;

    const breakdown: ContextUsageBreakdown = {
      conversation: historyTokens,
      userFiles: ctxItemTokens,
      skills: 0,
      mcpTools: 0,
      total: totalTokens,
      contextWindow,
      percentUsed: Math.min(100, Math.round(percentUsed * 100)),
    };

    const COMPACT_THRESHOLD = 0.85;

    if (percentUsed > COMPACT_THRESHOLD) {
      // Try LLM compaction first (existing AgentService logic)
      try {
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
      } catch (error) {
        // Fallback to heuristic summarization
        const summary = await this.summarizeConversationHistory(olderMessages);

        let systemPrompt = '';
        if (summary) {
          systemPrompt += `## Earlier Conversation (summarized)\n\n${summary}\n\n`;
        }
        if (relevantContext.length > 0) {
          systemPrompt += `## Relevant earlier context:\n${relevantContext.map((ctx) => `• ${ctx}`).join('\n')}\n\n`;
        }

        const finalMessages = [];
        if (systemPrompt) {
          finalMessages.push({
            role: 'system' as const,
            content: systemPrompt,
          });
        }
        finalMessages.push(...buildCoreMessages(recentMessages));

        const heuristicTokens = estimateMessagesTokens(finalMessages);
        breakdown.conversation = heuristicTokens;
        breakdown.total =
          heuristicTokens + newMsgTokens + ctxItemTokens + RESPONSE_HEADROOM;
        breakdown.percentUsed = Math.min(
          100,
          Math.round((breakdown.total / contextWindow) * 100),
        );
        return { messages: finalMessages as any, breakdown };
      }
    }

    // 8. Build final message array
    let systemPrompt = '';
    if (relevantContext.length > 0) {
      systemPrompt += `## Relevant earlier context:\n${relevantContext.map((ctx) => `• ${ctx}`).join('\n')}\n\n`;
    }

    const finalMessages = [];
    if (systemPrompt) {
      finalMessages.push({ role: 'system' as const, content: systemPrompt });
    }
    finalMessages.push(...buildCoreMessages(recentMessages));

    return { messages: finalMessages as any, breakdown };
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
      const toolMode = request.toolMode || 'agent';
      const { messages, breakdown } = await this.buildTurnMessages(
        conversationId,
        content,
        contextItems,
        modelId,
        event,
      );

      // 4. Filter tools by enabled settings
      const enabledTools = getToolsForMode(toolMode, aiSettings);

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
      let thinkingContent = '';
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
        input: unknown;
        output: unknown;
        stepNumber: number;
        status: 'done' | 'error';
      }> = [];
      const collectedParts: any[] = [];

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
              // eslint-disable-next-line no-console
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
            });

            let currentStepNumber = -1;

            /* eslint-disable no-restricted-syntax */
            for await (const chunk of result.fullStream) {
              if (abortController.signal.aborted) break;
              // Reset timeout on each received chunk — stream is alive
              clearTimeout(timeoutId);

              // Track current step number
              if (chunk.type === 'start-step') {
                currentStepNumber += 1;
                event.sender.send('agent:step-start', {
                  conversationId,
                  stepNumber: currentStepNumber,
                });
              }

              // Forward the native TextStreamPart chunk to the renderer for real-time tool arguments
              event.sender.send('chat:message:stream-chunk', {
                conversationId,
                chunk,
                done: false,
              });

              // Process chunks for backend persistence state
              switch (chunk.type) {
                case 'text-delta': {
                  fullContent += chunk.text;
                  const lastPart = collectedParts[collectedParts.length - 1];
                  if (lastPart?.type === 'text') {
                    lastPart.text += chunk.text;
                  } else {
                    collectedParts.push({ type: 'text', text: chunk.text });
                  }
                  break;
                }
                case 'reasoning-delta': {
                  const delta =
                    (chunk as any).textDelta ||
                    (chunk as any).delta ||
                    (chunk as any).text ||
                    '';
                  if (delta) {
                    thinkingContent += delta;
                  }
                  break;
                }
                case 'tool-call':
                  toolCallCount += 1;
                  collectedParts.push({
                    type: 'tool-call',
                    toolCallId: chunk.toolCallId,
                    toolName: chunk.toolName,
                    args: (chunk as any).input ?? {},
                    status: 'running',
                  });
                  break;
                case 'tool-result': {
                  collectedToolCalls.push({
                    toolName: chunk.toolName,
                    toolCallId: chunk.toolCallId,
                    input: (chunk as any).input ?? (chunk as any).args,
                    output: (chunk as any).output ?? (chunk as any).result,
                    stepNumber: currentStepNumber >= 0 ? currentStepNumber : 0,
                    status: 'done',
                  });
                  const part = collectedParts.find(
                    (p) =>
                      p.type === 'tool-call' &&
                      p.toolCallId === chunk.toolCallId,
                  );
                  if (part) {
                    part.result =
                      (chunk as any).output ?? (chunk as any).result;
                    part.status = 'done';
                  }
                  break;
                }
                case 'finish':
                  finalUsage = {
                    promptTokens: chunk.totalUsage?.inputTokens ?? 0,
                    completionTokens: chunk.totalUsage?.outputTokens ?? 0,
                    totalTokens: chunk.totalUsage?.totalTokens ?? 0,
                  };
                  break;
                default:
                  // Handle any other chunk types silently
                  break;
              }
            }
            /* eslint-enable no-restricted-syntax */

            clearTimeout(timeoutId);

            // Always send done:true so the frontend exits streaming state
            sendChunk({
              conversationId,
              chunk: '',
              done: true,
              usage: aiSettings.chat.showTokenCount ? finalUsage : undefined,
            });
          } catch (streamErr) {
            clearTimeout(timeoutId);
            sendChunk({ conversationId, chunk: '', done: true });
            throw streamErr;
          }
        } else {
          // ── Non-streaming path ──────────────────────────────────────────
          const result = await agent.generate({
            messages,
            abortSignal: abortController.signal,
          });
          fullContent = result.text;
          const totalToks = result.usage?.totalTokens ?? 0;
          finalUsage = {
            promptTokens: result.usage?.inputTokens ?? 0,
            completionTokens: result.usage?.outputTokens ?? totalToks,
            totalTokens: totalToks,
          };

          if (fullContent) {
            collectedParts.push({ type: 'text', text: fullContent });
          }

          // Collect tool calls from steps for persistence
          result.steps?.forEach((step, idx) => {
            step.toolResults?.forEach((tr) => {
              collectedToolCalls.push({
                toolName: tr.toolName,
                toolCallId: tr.toolCallId,
                input: (tr as any).input ?? (tr as any).args,
                output: (tr as any).output ?? (tr as any).result,
                stepNumber: idx,
                status: 'done',
              });
              collectedParts.push({
                type: 'tool-call',
                toolCallId: tr.toolCallId,
                toolName: tr.toolName,
                args: (tr as any).input ?? (tr as any).args,
                result: (tr as any).output ?? (tr as any).result,
                status: 'done',
              });
            });
          });

          toolCallCount += collectedToolCalls.length;

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
          ...((tc.input as object) || {}),
          stepNum: tc.stepNumber,
          tcId: tc.toolCallId,
        },
        toolOutput: tc.output ?? null,
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
          thinkingContent: thinkingContent || undefined,
          metadata: {
            ...(finalUsage
              ? {
                  promptTokens: finalUsage.promptTokens,
                  completionTokens: finalUsage.completionTokens,
                  totalTokens: finalUsage.totalTokens,
                }
              : {}),
            orderedParts:
              collectedParts.length > 0 ? collectedParts : undefined,
          },
        },
        undefined,
        toolCallsToSave.length > 0 ? toolCallsToSave : undefined,
      );
      return { success: true };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AgentService.runAgent] Error:', error);
      // eslint-disable-next-line no-console
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

  // ─── Context Resolution (ported from ChatService) ──────────────────────────

  static async getMessages(
    payload:
      | {
          conversationId?: number;
          sessionId?: number;
          limit?: number;
          offset?: number;
        }
      | number,
    maybeLimit?: number,
    maybeOffset?: number,
  ) {
    if (typeof payload === 'number') {
      return MainDatabaseService.getMessages(payload, maybeLimit, maybeOffset);
    }
    const { conversationId, sessionId, limit, offset } = payload || {};
    const id = conversationId ?? sessionId;
    if (typeof id !== 'number') {
      throw new Error(
        "getMessages requires 'conversationId' or 'sessionId' in payload",
      );
    }
    return MainDatabaseService.getMessages(id, limit, offset);
  }

  static async getMessagesWithContext(
    payload:
      | {
          conversationId?: number;
          sessionId?: number;
          limit?: number;
          offset?: number;
        }
      | number,
    maybeLimit?: number,
    maybeOffset?: number,
  ) {
    const id =
      typeof payload === 'number'
        ? payload
        : (payload.conversationId ?? payload.sessionId);
    if (typeof id !== 'number') {
      throw new Error(
        "getMessagesWithContext requires 'conversationId' or 'sessionId'",
      );
    }
    const limit =
      typeof payload === 'number' ? maybeLimit : (payload as any).limit;
    const offset =
      typeof payload === 'number' ? maybeOffset : (payload as any).offset;
    return MainDatabaseService.getMessagesWithContext(id, limit, offset);
  }

  static async resolveFileContext(filePath: string) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const name = path.basename(filePath);
      return {
        type: 'file',
        name,
        path: filePath,
        content,
        language: filePath.split('.').pop() ?? 'text',
        fileType: 'file',
      };
    } catch (error) {
      throw new Error(
        `Failed to resolve file context: ${(error as Error).message}`,
      );
    }
  }

  static async resolveSelectedFileContext(
    _filePath: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _projectPath?: string,
  ) {
    return AgentService.resolveFileContext(_filePath);
  }

  static async getFileMetadata(filePath: string) {
    try {
      const stat = fs.statSync(filePath);
      const name = path.basename(filePath);
      const ext = filePath.split('.').pop() ?? '';
      return {
        path: filePath,
        name,
        size: stat.size,
        lastModified: stat.mtime.toISOString(),
        language: ext,
        fileType: 'file',
      };
    } catch (error) {
      throw new Error(
        `Failed to get file metadata: ${(error as Error).message}`,
      );
    }
  }

  static async resolveFolderContext(folderPath: string) {
    try {
      const entries = fs.readdirSync(folderPath);
      return {
        type: 'folder',
        name: path.basename(folderPath),
        path: folderPath,
        content: entries.join('\n'),
        fileType: 'folder',
      };
    } catch (error) {
      throw new Error(
        `Failed to resolve folder context: ${(error as Error).message}`,
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async searchCodebase(_query: string) {
    // Lightweight stub — returns empty; full implementation can be added later
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async resolveUrl(_url: string) {
    throw new Error('URL context resolution is not supported in agent mode');
  }

  // ─── Tool Call Management (delegated to MainDatabaseService) ───────────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async executeToolCall(_toolCallId: number) {
    // Tool calls are executed inline by the agent — this is a no-op compatibility shim
    return {
      success: false,
      message: 'Tool calls are executed autonomously by the agent',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async cancelToolCall(_toolCallId: number) {
    return {
      success: false,
      message: 'Tool call cancellation not supported in agent mode',
    };
  }
}

export default AgentService;
