import type { LanguageModel } from 'ai';
import type { IpcMainInvokeEvent, BrowserWindow } from 'electron';
import type { AISettingsConfig } from '../../../../types/backend';
import { getVercelModel } from '../agentAdapter';
import { buildMCPToolset } from '../mcp/mcpToolAdapter';
import { discoverSkills } from '../skills/skillsDiscovery';
import { buildSkillsPrompt } from '../skills/skillsPrompt';
import { createLoadSkillTool } from '../skills/loadSkillTool';
import { truncateToolResult } from '../tokenEstimator';
import { readMemoryFile } from '../memory/memoryService';

export function buildMemoryPolicySection(): string {
  return `

## Memory Policy

You have a persistent memory system stored in markdown files at \`.memory/\`.
This memory survives across all your sessions and is shared between them.

For the full schema (format, naming, update rules), read \`long-term-ai-memory-schema.md\`
using the \`memory\` tool with command: 'view' and path: 'long-term-ai-memory-schema.md'.

### Before starting a task
Call \`memory\` with command: 'search' to check if relevant past context exists.

### Progressive discovery
- \`00000_maincontext.md\` is already in your context at session start.
- Read \`01000_rules-learned.md\` when you need to check constraints.
- Read \`02000_skills-learned.md\` when you need a workflow.
- Read \`03000_proprietary-knowledge.md\` when you need business context.
- Read topic files under \`topics/\` for deep dives on specific subjects.

### When to save to memory (self-learning)
Call \`memory create\` or \`memory update\` when you discover:
1. A **rule**: something that caused an error and should be avoided
2. A **user preference**: the user explicitly states a preference
3. A **workflow**: a multi-step process that worked and could be reused
4. A **concept**: business logic that explains WHY something works this way

### When NOT to save
- Routine chat (greetings, clarifications, simple Q&A)
- Trivial file edits without new insights
- Tool execution output that doesn't reveal new rules

### Where to save
See \`long-term-ai-memory-schema.md\` for exact file locations and formats.`;
}

export interface BaseAgentConfig {
  model: LanguageModel;
  mcpTools: Record<string, any>;
  skillsPrompt: string;
  loadSkillTool: any;
  maxSteps: number;
  memoryContext?: string;
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
  const memoryContext = aiSettings.configuration.autoGenerateMemories
    ? `${await readMemoryFile('00000_maincontext.md').catch(() => '')}\n${buildMemoryPolicySection()}`
    : '';
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
    memoryContext,
    maxSteps,
    mainWindow,
    onStepFinish,
    prepareStep,
  };
}
