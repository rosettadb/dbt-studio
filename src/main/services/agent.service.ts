/* eslint-disable no-console */
import fs from 'fs-extra';
import path from 'path';
import { IpcMainInvokeEvent, app, BrowserWindow } from 'electron';
import { generateText } from 'ai';
import { buildBaseAgentConfig } from './ai/agents/baseAgentConfig';
import { createProjectAgent } from './ai/agents/projectAgent';
import { createSqlAgent } from './ai/agents/sqlAgent';
import { createNotebooksAgent } from './ai/agents/notebooksAgent';
import { createAnalyticsAgent } from './ai/agents/analyticsAgent';
import ConnectorsService from './connectors.service';
import { getVercelModel } from './ai/agentAdapter';
import { buildMCPToolset } from './ai/mcp/mcpToolAdapter';
import { discoverSkills } from './ai/skills/skillsDiscovery';
import { buildSkillsPrompt } from './ai/skills/skillsPrompt';
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
import SelectedFileContextProvider from './selectedFileContextProvider.service';
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
import { getUserMessageLimitError } from '../../types/agentEvents';
import { toError } from '../utils/errorSerializer';

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
const pendingEditorBridgeRequests = new Map<
  string,
  {
    resolve: (value: any) => void;
    reject: (reason?: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
    type: 'read' | 'update';
  }
>();

const pendingNotebookBridgeRequests = new Map<
  string,
  {
    resolve: (value: any) => void;
    reject: (reason?: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
    type: string;
  }
>();

// Per-conversation agent context — replaces the static singleton to prevent
// race conditions when multiple conversations run concurrently (#4)
const agentContexts = new Map<
  number,
  {
    event: IpcMainInvokeEvent;
    conversationId: number;
    screenKey: 'project' | 'sql' | 'notebooks' | 'analytics';
    connectionId?: string;
    notebookId?: string;
    pageId?: string;
    projectPath?: string;
  }
>();

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
  screenKey?: import('../../types/agentEvents').AgentScreenKey;
  connectionId?: string;
  notebookId?: string;
  pageId?: string; // Analytics: currently open page ID
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
): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
  return messages
    .filter(
      (m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system',
    )
    .map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
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

  /**
   * Resolve a pending editor read response coming from renderer bridge IPC.
   */
  public static resolveEditorReadResponse(payload: {
    requestId: string;
    success: boolean;
    content?: string;
    error?: string;
  }) {
    const pending = pendingEditorBridgeRequests.get(payload.requestId);
    if (!pending || pending.type !== 'read') return;
    clearTimeout(pending.timeout);
    pendingEditorBridgeRequests.delete(payload.requestId);
    pending.resolve(payload);
  }

  /**
   * Resolve a pending editor update response coming from renderer bridge IPC.
   */
  public static resolveEditorUpdateResponse(payload: {
    requestId: string;
    success: boolean;
    applied?: boolean;
    error?: string;
  }) {
    const pending = pendingEditorBridgeRequests.get(payload.requestId);
    if (!pending || pending.type !== 'update') return;
    clearTimeout(pending.timeout);
    pendingEditorBridgeRequests.delete(payload.requestId);
    pending.resolve(payload);
  }

  private static async requestSqlEditorBridge<T extends 'read' | 'update'>(
    conversationId: number,
    type: T,
    payload: T extends 'read' ? {} : { content: string },
  ): Promise<
    T extends 'read'
      ? { success: boolean; content?: string; error?: string }
      : { success: boolean; applied?: boolean; error?: string }
  > {
    const context = this.getAgentContext(conversationId);
    if (!context) {
      return {
        success: false,
        error: 'Agent context not found for conversation',
      } as any;
    }
    if (context.screenKey !== 'sql') {
      return {
        success: false,
        error: `Monaco bridge only available in SQL screen (current: ${context.screenKey})`,
      } as any;
    }

    const requestId = `editor-bridge-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    const channel =
      type === 'read'
        ? 'agent:editor:read-request'
        : 'agent:editor:update-request';

    const response = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingEditorBridgeRequests.delete(requestId);
        reject(
          new Error(`Timed out waiting for ${type} response from renderer`),
        );
      }, 15000);

      pendingEditorBridgeRequests.set(requestId, {
        resolve,
        reject,
        timeout,
        type,
      });
      context.event.sender.send(channel, {
        requestId,
        conversationId,
        ...(payload as any),
      });
    });

    return response;
  }

  public static async requestSqlEditorRead(conversationId: number) {
    return this.requestSqlEditorBridge(conversationId, 'read', {});
  }

  public static async requestSqlEditorUpdate(
    conversationId: number,
    content: string,
  ) {
    return this.requestSqlEditorBridge(conversationId, 'update', { content });
  }

  /**
   * Fire-and-forget: tells the SQL editor renderer to execute the current
   * editor content, equivalent to the user pressing the Run button.
   * No round-trip — the result appears in the UI's QueryResult panel.
   */
  public static requestSqlEditorRun(
    conversationId: number,
    query?: string,
  ): void {
    const context = this.getAgentContext(conversationId);
    if (!context) {
      // eslint-disable-next-line no-console
      console.warn(
        '[AgentService][MonacoRun] No agent context for conversation',
        conversationId,
      );
      return;
    }
    context.event.sender.send('agent:editor:run-query', {
      conversationId,
      query,
    });
  }

  // ─── Notebook Agent Bridge (Phase 1) ──────────────────────────────────────────

  private static async requestNotebookBridge(
    conversationId: number,
    type: string,
    requestChannel: string,
    responseChannel: string,
    payload: object = {},
  ): Promise<any> {
    const context = this.getAgentContext(conversationId);
    if (!context) {
      throw new Error(`No active context for conversation ${conversationId}`);
    }

    const requestId = `notebook-bridge-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingNotebookBridgeRequests.delete(requestId);
        reject(
          new Error(`Timed out waiting for ${type} response from renderer`),
        );
      }, 15000);

      pendingNotebookBridgeRequests.set(requestId, {
        resolve,
        reject,
        timeout,
        type,
      });

      context.event.sender.send(requestChannel, {
        requestId,
        conversationId,
        ...payload,
      });
    });
  }

  public static resolveNotebookBridgeResponse(payload: {
    requestId: string;
    success: boolean;
    [key: string]: any;
  }): void {
    const request = pendingNotebookBridgeRequests.get(payload.requestId);
    if (!request) return;

    pendingNotebookBridgeRequests.delete(payload.requestId);
    clearTimeout(request.timeout);

    if (payload.success) {
      request.resolve(payload);
    } else {
      request.reject(new Error(payload.error || 'Renderer request failed'));
    }
  }

  public static async requestNotebookState(conversationId: number) {
    return this.requestNotebookBridge(
      conversationId,
      'state',
      'agent:notebook:state-request',
      'agent:notebook:state-response',
    );
  }

  public static async requestNotebookCellRead(
    conversationId: number,
    cellId: string,
  ) {
    return this.requestNotebookBridge(
      conversationId,
      'cell-read',
      'agent:notebook:cell-read-request',
      'agent:notebook:cell-read-response',
      { cellId },
    );
  }

  public static async requestNotebookCellAdd(
    conversationId: number,
    content: string,
  ): Promise<{ cellId: string }> {
    return this.requestNotebookBridge(
      conversationId,
      `cell-add-${Date.now()}`,
      'agent:notebook:cell-add-request',
      'agent:notebook:cell-add-response',
      { content },
    );
  }

  public static async requestNotebookCellUpdate(
    conversationId: number,
    cellId: string,
    content: string,
  ) {
    return this.requestNotebookBridge(
      conversationId,
      'cell-update',
      'agent:notebook:cell-update-request',
      'agent:notebook:cell-update-response',
      { cellId, content },
    );
  }

  public static async requestNotebookCellRun(
    conversationId: number,
    cellId: string,
  ) {
    const context = this.getAgentContext(conversationId);
    if (!context) {
      throw new Error(`No active context for conversation ${conversationId}`);
    }
    return this.requestNotebookBridge(
      conversationId,
      `cell-run-${cellId}`,
      'agent:notebook:cell-run-request',
      'agent:notebook:cell-run-response',
      { cellId },
    );
  }

  public static async requestNotebookCellResult(
    conversationId: number,
    cellId: string,
  ) {
    return this.requestNotebookBridge(
      conversationId,
      'cell-result',
      'agent:notebook:cell-result-request',
      'agent:notebook:cell-result-response',
      { cellId },
    );
  }

  // ─── Context Compaction ──────────────────────────────────────────────────────

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

  /**
   * Generates a concise LLM summary of older messages for compaction.
   * The returned text is hard-capped to maxTokens.
   */
  private static async generateSummary(
    messages: ChatMessage[],
    previousSummary: string | undefined,
    maxTokens: number,
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
The summary must fit within approximately ${maxTokens} tokens.

${previousSummary ? `PREVIOUS SUMMARY TO INTEGRATE:\n${previousSummary}\n\n` : ''}NEW CONVERSATION TO SUMMARIZE:
${conversationText}

COMBINED SUMMARY:`,
    });
    return this.truncateText(text, maxTokens);
  }

  /**
   * Auto-compacts conversation history using percentage budgets:
   * - Trigger happens outside this method.
   * - Keep newest 20% tokens unchanged.
   * - Summarize older messages from scratch.
   * - Summary is capped to 10% of the summarized 50% block (5% of full window).
   */
  private static async autoCompact(
    conversationId: number,
    activeMessages: any[],
    latestSummary: any | null,
    event: IpcMainInvokeEvent,
    contextWindow: number,
  ): Promise<
    Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  > {
    const tailTokenBudget = Math.floor(contextWindow * 0.2);
    const summaryMaxTokens = Math.floor(contextWindow * 0.05);

    const systemSummaryMessage = latestSummary
      ? {
          role: 'system' as const,
          content: `## Earlier Conversation (summarized)\n\n${latestSummary.content}`,
        }
      : null;

    if (activeCompactions.has(conversationId)) {
      const core = buildCoreMessages(activeMessages);
      return systemSummaryMessage ? [systemSummaryMessage, ...core] : core;
    }
    activeCompactions.add(conversationId);

    try {
      let usedTailTokens = 0;
      const tailMessages: ChatMessage[] = [];
      const olderMessages: ChatMessage[] = [];

      for (let i = activeMessages.length - 1; i >= 0; i -= 1) {
        const msg = activeMessages[i];
        // Calculate tokens accurately including tools if they were included
        const msgTokens = estimateMessagesTokens([msg]);
        const canFitTail =
          usedTailTokens + msgTokens <= tailTokenBudget ||
          tailMessages.length === 0;
        if (canFitTail) {
          tailMessages.push(msg);
          usedTailTokens += msgTokens;
        } else {
          olderMessages.unshift(msg);
        }
      }

      if (olderMessages.length === 0) {
        const core = buildCoreMessages(activeMessages);
        return systemSummaryMessage ? [systemSummaryMessage, ...core] : core;
      }

      const summaryText = await this.generateSummary(
        olderMessages,
        latestSummary?.content,
        summaryMaxTokens,
      );

      const coversUpToMessageId = olderMessages[olderMessages.length - 1].id;

      await MainDatabaseService.saveCompactionSummary(
        conversationId,
        coversUpToMessageId,
        summaryText,
      );

      const compactedPayload: AgentContextCompactedPayload = {
        conversationId,
        messagesSummarized: olderMessages.length,
        coversUpToMessageId,
      };
      event.sender.send('agent:context-compacted', compactedPayload);

      return [
        {
          role: 'system',
          content: `## Earlier Conversation (summarized)\n\n${summaryText}`,
        },
        ...buildCoreMessages(tailMessages.reverse()),
      ];
    } finally {
      activeCompactions.delete(conversationId);
    }
  }

  /**
   * Builds turn messages with percentage-based compaction:
   * - Trigger at 70% total prompt usage.
   * - Keep 20% newest history tokens unchanged.
   * - Summarize the remaining history from scratch.
   */
  private static async buildTurnMessages(
    conversationId: number,
    newContent: string,
    contextItems: Omit<NewContextItem, 'messageId'>[] | undefined,
    modelId: string,
    event: IpcMainInvokeEvent,
    fixedOverheadTokens: { skills: number; mcpTools: number },
  ): Promise<{
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    breakdown: ContextUsageBreakdown;
  }> {
    const allMessages =
      await MainDatabaseService.getMessagesWithContext(conversationId);
    const latestSummary =
      await MainDatabaseService.getLatestCompactionSummary(conversationId);

    let activeMessages = allMessages;
    let systemSummaryMessage: {
      role: 'system';
      content: string;
    } | null = null;

    if (latestSummary && latestSummary.coversUpToMessageId) {
      activeMessages = allMessages.filter(
        (m) => m.id > latestSummary.coversUpToMessageId!,
      );
      systemSummaryMessage = {
        role: 'system',
        content: `## Earlier Conversation (summarized)\n\n${latestSummary.content}`,
      };
    }

    const coreHistory = buildCoreMessages(activeMessages);
    const fullHistory = systemSummaryMessage
      ? [systemSummaryMessage, ...coreHistory]
      : coreHistory;
    const fullEnrichedHistory = systemSummaryMessage
      ? [systemSummaryMessage, ...activeMessages]
      : activeMessages;

    const contextWindow = getContextWindow(modelId);
    const compactThreshold = contextWindow * 0.7;
    const newMsgTokens = estimateTokens(newContent);
    const ctxItemTokens = estimateTokens(contextItems);
    const historyTokens = estimateMessagesTokens(fullEnrichedHistory);

    const totalBeforeCompaction =
      historyTokens +
      newMsgTokens +
      ctxItemTokens +
      fixedOverheadTokens.skills +
      fixedOverheadTokens.mcpTools;

    const breakdown: ContextUsageBreakdown = {
      conversation: historyTokens,
      userFiles: ctxItemTokens,
      skills: fixedOverheadTokens.skills,
      mcpTools: fixedOverheadTokens.mcpTools,
      total: totalBeforeCompaction,
      contextWindow,
      percentUsed: Math.min(
        100,
        Math.round((totalBeforeCompaction / contextWindow) * 100),
      ),
    };

    if (totalBeforeCompaction >= compactThreshold) {
      const compactedMessages = await this.autoCompact(
        conversationId,
        activeMessages,
        latestSummary,
        event,
        contextWindow,
      );
      const compactedHistoryTokens = estimateMessagesTokens(compactedMessages);
      const totalAfterCompaction =
        compactedHistoryTokens +
        newMsgTokens +
        ctxItemTokens +
        fixedOverheadTokens.skills +
        fixedOverheadTokens.mcpTools;

      return {
        messages: compactedMessages,
        breakdown: {
          ...breakdown,
          conversation: compactedHistoryTokens,
          total: totalAfterCompaction,
          percentUsed: Math.min(
            100,
            Math.round((totalAfterCompaction / contextWindow) * 100),
          ),
        },
      };
    }

    return { messages: fullHistory as any, breakdown };
  }

  /**
   * Run the agent with streaming
   */

  private static assertUserMessageWithinLimit(
    content: string,
    contextWindow: number,
  ): void {
    const error = getUserMessageLimitError(content, contextWindow);
    if (error) {
      throw new Error(error);
    }
  }

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
      agentContexts.set(conversationId, {
        event,
        conversationId,
        screenKey: request.screenKey ?? 'project',
        connectionId: request.connectionId,
        notebookId: request.notebookId,
        pageId: request.pageId,
        projectPath,
      });

      // Typed helper to send stream chunks — ensures both sides use the same payload shape
      const sendChunk = (payload: ChatStreamChunkPayload) =>
        event.sender.send('chat:message:stream-chunk', payload);

      // 1. Load AI settings
      const aiSettings = await loadAISettings();

      // 2. Resolve model and enforce single-message limits before DB write.
      const model = await getVercelModel(requestedModel);
      // Extract modelId safely — prefer the SDK's own property, fall back to
      // the requested model string, then 'default'. Never silently use 32K.
      const modelId: string =
        (model as any).modelId ||
        (model as any).model ||
        requestedModel ||
        'default';
      this.assertUserMessageWithinLimit(content, getContextWindow(modelId));

      // 3. Persist user message
      await MainDatabaseService.addMessageWithContext(
        conversationId,
        { role: 'user', content },
        contextItems,
      );

      // 4. Load & potentially compact conversation history
      const toolMode = request.toolMode || 'agent';

      // Estimate non-history prompt overhead before compaction decision.
      const mcpTools = await buildMCPToolset();
      const skills = await discoverSkills();
      const skillsPrompt = buildSkillsPrompt(skills);
      const fixedOverheadTokens = {
        skills: estimateTokens(skillsPrompt),
        mcpTools: estimateTokens(Object.keys(mcpTools || {}).join(' ')),
      };

      const { messages, breakdown } = await this.buildTurnMessages(
        conversationId,
        content,
        contextItems,
        modelId,
        event,
        fixedOverheadTokens,
      );

      // 4. Filter tools by enabled settings
      const enabledTools = getToolsForMode(toolMode, aiSettings);

      // Emit context usage breakdown to UI
      const contextUsagePayload: AgentContextUsagePayload = {
        conversationId,
        breakdown,
      };
      event.sender.send('agent:context-usage', contextUsagePayload);

      // 5. Respect autoContinue (handled in baseAgentConfig)

      // 6. Create agent
      const mainWindow =
        BrowserWindow.fromWebContents(event.sender) || undefined;

      // Resolve connection name + type — no credentials returned
      let connectionMeta: { name: string; type: string } = {
        name: 'unknown',
        type: 'unknown',
      };
      if (request.connectionId) {
        try {
          if (request.connectionId.startsWith('ducklake-')) {
            const instanceId = request.connectionId.replace(/^ducklake-/, '');
            const { default: DuckLakeService } = await import(
              './duckLake.service'
            );
            const instance = await DuckLakeService.getInstance(instanceId);
            if (instance) {
              connectionMeta = {
                name: instance.name || 'DuckLake Instance',
                type: 'ducklake',
              };
            }
          } else {
            const conn = await ConnectorsService.getConnectionById(
              request.connectionId,
            );
            if (conn) {
              connectionMeta = {
                name: conn.connection.name,
                type: conn.connection.type,
              };
            }
          }
        } catch {
          // safe fallback — agent still works without connection name
        }
      }

      const base = await buildBaseAgentConfig({
        requestedModel,
        conversationId,
        aiSettings,
        event,
        mainWindow,
      });

      let agent: any;
      switch (request.screenKey ?? 'project') {
        case 'sql':
          agent = await createSqlAgent(base, {
            connectionMeta,
            enabledTools,
            skills: base.skillsPrompt,
            conversationId,
            toolMode: request.toolMode || 'agent',
          });
          break;
        case 'notebooks':
          agent = await createNotebooksAgent(base, {
            connectionMeta,
            notebookId: request.notebookId,
            connectionId: request.connectionId,
            projectPath,
            enabledTools,
            skills: base.skillsPrompt,
            conversationId,
            toolMode: request.toolMode || 'agent',
          });
          break;
        case 'analytics':
          agent = await createAnalyticsAgent(base, {
            connectionMeta,
            connectionId: request.connectionId,
            pageId: request.pageId,
            enabledTools,
            skills: base.skillsPrompt,
            conversationId,
            toolMode: request.toolMode || 'agent',
          });
          break;
        default:
          agent = await createProjectAgent(base, {
            projectPath,
            enabledTools,
            skills: base.skillsPrompt,
            conversationId,
            toolMode: request.toolMode || 'agent',
          });
      }

      const abortController = new AbortController();
      activeAgents.set(conversationId, abortController);

      let fullContent = '';
      let thinkingContent = '';
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

            // Prevent unhandled promise rejections from background resolution
            let backgroundError: unknown = null;
            result.text.catch((err: unknown) => {
              backgroundError = err;
            });
            if (result.toolCalls) {
              result.toolCalls.catch(() => {});
            }

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
                  const delta = (chunk as any).text || '';
                  if (delta) {
                    thinkingContent += delta;
                  }
                  break;
                }
                case 'tool-call':
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
                case 'error': {
                  // Extract error from the chunk and throw it so the stream fails correctly
                  throw toError((chunk as any).error);
                }
                default:
                  // Handle any other chunk types silently
                  break;
              }
            }
            /* eslint-enable no-restricted-syntax */

            clearTimeout(timeoutId);

            // If the stream ended without yielding an error chunk but a background promise failed,
            // throw it now so the agent doesn't silently "succeed".
            if (backgroundError) {
              throw backgroundError;
            }

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
            completionTokens: result.usage?.outputTokens ?? 0,
            totalTokens: totalToks,
          };

          thinkingContent =
            result.reasoningText ??
            result.reasoning?.map((p: any) => p.text).join('') ??
            '';

          if (fullContent) {
            collectedParts.push({ type: 'text', text: fullContent });
          }

          // Collect tool calls from steps for persistence
          result.steps?.forEach((step: any, idx: number) => {
            step.toolResults?.forEach((tr: any) => {
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

          sendChunk({ conversationId, chunk: fullContent, done: false });
          sendChunk({
            conversationId,
            chunk: '',
            done: true,
            usage: aiSettings.chat.showTokenCount ? finalUsage : undefined,
          });
        }

        // Guard against empty responses (e.g. Gemini Flash Lite silent failures)
        if (!fullContent.trim()) {
          const notebookStateCall =
            (request.screenKey ?? 'project') === 'notebooks'
              ? [...collectedToolCalls]
                  .reverse()
                  .find((tc) => tc.toolName === 'notebooks_get_state')
              : undefined;
          const notebookState = (notebookStateCall?.output as any)?.data;
          const notebookCells = Array.isArray(notebookState?.cells)
            ? notebookState.cells
            : [];
          const notebookFallback =
            notebookStateCall && (notebookStateCall.output as any)?.ok !== false
              ? [
                  `I inspected ${notebookState?.notebookName || notebookState?.name || 'the active notebook'}.`,
                  `It has ${notebookCells.length} cell${notebookCells.length === 1 ? '' : 's'}.`,
                  ...notebookCells
                    .slice(0, 3)
                    .map((cell: any, index: number) => {
                      const preview =
                        cell.contentPreview || cell.content || '(empty cell)';
                      const outputText = cell.hasOutput
                        ? ` Output is available${typeof cell.outputRowCount === 'number' ? ` (${cell.outputRowCount} rows loaded)` : ''}.`
                        : ' No output is currently available.';
                      return `Cell ${index + 1} is ${cell.type || 'unknown'}: \`${String(preview).trim()}\`.${outputText}`;
                    }),
                  'I do not see a notebook execution error in the state returned by the tool.',
                ].join(' ')
              : null;
          const fallback =
            notebookFallback ||
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
    } finally {
      agentContexts.delete(conversationId);
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
    filePath: string,
    projectPath?: string,
  ) {
    if (projectPath) {
      return SelectedFileContextProvider.resolveSelectedFileContext(
        filePath,
        projectPath,
      );
    }
    return AgentService.resolveFileContext(filePath);
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
