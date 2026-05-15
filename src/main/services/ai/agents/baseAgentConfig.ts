import type { LanguageModel } from 'ai';
import type { IpcMainInvokeEvent, BrowserWindow } from 'electron';
import type { AISettingsConfig } from '../../../../types/backend';
import { getVercelModel } from '../agentAdapter';
import { buildMCPToolset } from '../mcp/mcpToolAdapter';
import { discoverSkills } from '../skills/skillsDiscovery';
import { buildSkillsPrompt } from '../skills/skillsPrompt';
import { createLoadSkillTool } from '../skills/loadSkillTool';
import { truncateToolResult } from '../tokenEstimator';

export interface BaseAgentConfig {
  model: LanguageModel;
  mcpTools: Record<string, any>;
  skillsPrompt: string;
  loadSkillTool: any;
  maxSteps: number;
  mainWindow?: BrowserWindow;
  onStepFinish: (args: {
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
  }) => Promise<void>;
  prepareStep: (args: { messages: any[] }) => Promise<{ messages: any[] }>;
}

export async function buildBaseAgentConfig(options: {
  requestedModel?: string;
  conversationId: number;
  aiSettings: AISettingsConfig;
  event: IpcMainInvokeEvent;
  mainWindow?: BrowserWindow;
}): Promise<BaseAgentConfig> {
  const { requestedModel, aiSettings, mainWindow } = options;

  const model = await getVercelModel(requestedModel);
  const mcpTools = await buildMCPToolset();
  const skills = await discoverSkills();
  const skillsPrompt = buildSkillsPrompt(skills);
  const loadSkillTool = createLoadSkillTool(skills);
  // 80 steps for autoContinue: bulk SQL tasks (e.g. copying 23 tables) need
  // ~2 steps per item (studio_sql_query + studio_sql_get_agent_run_result) plus
  // schema reads and verification, so 20 was too low and would abort mid-task.
  const maxSteps = aiSettings.configuration.autoContinue ? 80 : 1;
  const MAX_TOOL_RESULT_TOKENS = 3_000;

  const prepareStep = async ({ messages }: { messages: any[] }) => {
    const compressed = messages.map((msg: any) => {
      if (msg.role === 'tool' && Array.isArray(msg.content)) {
        const newContent = msg.content.map((part: any) => {
          if (part?.type === 'tool-result' && part.result !== undefined) {
            const str =
              typeof part.result === 'string'
                ? part.result
                : JSON.stringify(part.result);
            const truncated = truncateToolResult(str, MAX_TOOL_RESULT_TOKENS);
            if (truncated !== str) return { ...part, result: truncated };
          }
          return part;
        });
        return { ...msg, content: newContent };
      }
      return msg;
    });
    return { messages: compressed };
  };

  // Gap Fix 7: onStepFinish MUST be a no-op here.
  // The real agent:step-start and agent:tool-call IPC events are emitted
  // by the AgentService.runAgent fullStream loop.
  // Duplicating the logic here would cause double-emit on every step.
  const onStepFinish = async () => {
    // Intentional no-op — IPC events are fired by the AgentService streaming loop.
  };

  return {
    model: model as LanguageModel,
    mcpTools,
    skillsPrompt,
    loadSkillTool,
    maxSteps,
    mainWindow,
    onStepFinish,
    prepareStep,
  };
}
