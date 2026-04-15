/* eslint-disable no-console */
import fs from 'fs-extra';
import path from 'path';
import { IpcMainInvokeEvent, app, BrowserWindow } from 'electron';
import { createDbtAgent } from './ai/dbtAgent';
import { buildMCPToolset } from './ai/mcp/mcpToolAdapter';
import { dbtTools } from './ai/tools/dbt.tools';
import { filesystemTools } from './ai/tools/filesystem.tools';
import MainDatabaseService from './mainDatabase.service';
import ProjectsService from './projects.service';
import type { NewContextItem } from '../schemas/mainDatabase.schema';
import type { AISettingsConfig } from '../../types/backend';

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
 * Agent Service - handles all agent-related business logic
 */
class AgentService {
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

    console.log('[AgentService.runAgent] Starting agent execution:', {
      conversationId,
      contentLength: content.length,
      contextItemsCount: contextItems?.length || 0,
      requestedModel,
      projectPath,
    });

    try {
      // 1. Load AI settings
      const aiSettings = await loadAISettings();

      // 2. Persist user message
      console.log('[AgentService.runAgent] Persisting user message...');
      await MainDatabaseService.addMessageWithContext(
        conversationId,
        { role: 'user', content },
        contextItems,
      );

      // 3. Load conversation history
      const history = await MainDatabaseService.getMessages(conversationId, 20);
      const messages = history
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      // 4. Filter tools by enabled settings
      const allTools = { ...dbtTools, ...filesystemTools };
      const enabledTools: Record<string, any> = Object.fromEntries(
        Object.entries(allTools).filter(
          ([name]) => aiSettings.tools[name] !== false,
        ),
      );

      // 4b. Get MCP tools (only connected servers)
      const mcpTools = await buildMCPToolset(['rosetta', 'dbt', 'duckdb']);

      // 5. Respect autoContinue
      const maxSteps = aiSettings.configuration.autoContinue ? 20 : 1;

      // 6. Create agent
      console.log('[AgentService.runAgent] Creating dbt agent...');
      const mainWindow =
        BrowserWindow.fromWebContents(event.sender) || undefined;
      const agent = await createDbtAgent({
        requestedModel,
        projectPath,
        enabledTools,
        extraTools: mcpTools,
        maxSteps,
        mainWindow,
      });
      console.log('[AgentService.runAgent] Agent created successfully');
      // 4. Stream — agent.stream() is the v6 API
      const abortController = new AbortController();
      activeAgents.set(conversationId, abortController);
      console.log(
        '[AgentService.runAgent] Agent registered, starting stream...',
      );

      let fullContent = '';
      let chunkCount = 0;
      let toolCallCount = 0;

      const onStepFinish = async ({
        stepNumber,
        toolCalls,
      }: {
        stepNumber: number;
        toolCalls?: Array<{ toolName: string; args?: unknown }>;
      }) => {
        if (toolCalls) {
          toolCallCount += toolCalls.length;
          toolCalls.forEach((tc) => {
            event.sender.send('agent:tool-call', {
              conversationId,
              toolName: tc.toolName,
              args: tc.args ?? {},
              stepNumber,
              status: 'done',
            });
          });
        }
      };

      try {
        if (aiSettings.chat.streamResponses) {
          // ── Streaming path ──────────────────────────────────────────────
          const result = await agent.stream({
            messages,
            abortSignal: abortController.signal,
            onStepFinish,
          });

          /* eslint-disable no-restricted-syntax */
          for await (const chunk of result.textStream) {
            if (abortController.signal.aborted) break;
            fullContent += chunk;
            chunkCount += 1;
            event.sender.send('chat:message:stream-chunk', {
              conversationId,
              chunk,
              done: false,
            });
          }
          /* eslint-enable no-restricted-syntax */

          // Send usage if showTokenCount is enabled
          const usage = await result.usage;
          event.sender.send('chat:message:stream-chunk', {
            conversationId,
            chunk: '',
            done: true,
            usage: aiSettings.chat.showTokenCount
              ? {
                  promptTokens: usage?.inputTokens ?? 0,
                  completionTokens: usage?.outputTokens ?? 0,
                  totalTokens:
                    (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
                }
              : undefined,
          });
        } else {
          // ── Non-streaming path ──────────────────────────────────────────
          const result = await agent.generate({
            messages,
            abortSignal: abortController.signal,
            onStepFinish,
          });
          fullContent = result.text;
          chunkCount = 1;
          event.sender.send('chat:message:stream-chunk', {
            conversationId,
            chunk: fullContent,
            done: false,
          });
          event.sender.send('chat:message:stream-chunk', {
            conversationId,
            chunk: '',
            done: true,
            usage: aiSettings.chat.showTokenCount
              ? {
                  promptTokens: result.usage?.inputTokens ?? 0,
                  completionTokens: result.usage?.outputTokens ?? 0,
                  totalTokens:
                    (result.usage?.inputTokens ?? 0) +
                    (result.usage?.outputTokens ?? 0),
                }
              : undefined,
          });
        }

        console.log('[AgentService.runAgent] Complete:', {
          totalChunks: chunkCount,
          totalToolCalls: toolCallCount,
          contentLength: fullContent.length,
        });

        // Guard against empty responses (e.g. Gemini Flash Lite silent failures)
        if (!fullContent.trim() && toolCallCount === 0) {
          console.warn(
            '[AgentService.runAgent] Empty response with no tool calls — sending fallback message',
          );
          const fallback =
            "I wasn't able to generate a response. Please try rephrasing your message or switching to a different model.";
          fullContent = fallback;
          event.sender.send('chat:message:stream-chunk', {
            conversationId,
            chunk: fallback,
            done: false,
          });
          event.sender.send('chat:message:stream-chunk', {
            conversationId,
            chunk: '',
            done: true,
          });
        }
      } finally {
        activeAgents.delete(conversationId);
      }

      // Persist assistant response
      await MainDatabaseService.addMessageWithContext(
        conversationId,
        { role: 'assistant', content: fullContent },
        undefined,
      );
      console.log('[AgentService.runAgent] Assistant response persisted');

      console.log(
        '[AgentService.runAgent] Agent execution completed successfully',
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
    console.log('[AgentService.cancelAgent] Attempting to cancel agent:', {
      conversationId,
    });

    const controller = activeAgents.get(conversationId);
    if (controller) {
      controller.abort();
      activeAgents.delete(conversationId);
      console.log('[AgentService.cancelAgent] Agent cancelled successfully');
      return { success: true, message: 'Agent execution cancelled' };
    }

    console.log('[AgentService.cancelAgent] No active agent found');
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
    console.log('[AgentService.listTools] Listing available tools...');

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

      console.log('[AgentService.listTools] Tools listed:', {
        totalTools: tools.length,
        categories: [...new Set(tools.map((t) => t.category))],
      });

      return { success: true, tools };
    } catch (error) {
      console.error('[AgentService.listTools] Error:', error);
      return { success: false, tools: [], error: 'Failed to list tools' };
    }
  }
}

export default AgentService;
