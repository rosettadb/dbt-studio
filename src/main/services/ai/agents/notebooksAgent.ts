import { ToolLoopAgent, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import type { BaseAgentConfig } from './baseAgentConfig';
import { createStudioCloudTools } from '../tools/studio/cloud.tools';
import { createStudioConnectionsTools } from '../tools/studio/connections.tools';
import { createStudioDuckLakeTools } from '../tools/studio/ducklake.tools';
import { createMemoryTools } from '../tools/memory.tools';
import { createWikiTools } from '../tools/wikiMemory.tools';
import type { AgentMemoryScope } from '../../../../types/backend';

export interface NotebooksAgentOptions {
  connectionMeta: { name: string; type: string };
  notebookId?: string | number | null;
  projectPath?: string;
  enabledTools: Record<string, any>;
  skills: string;
  conversationId: number;
  toolMode: 'chat' | 'agent';
  memoryScope?: AgentMemoryScope;
  memoryContext?: string;
}

export async function createNotebooksAgent(
  base: BaseAgentConfig,
  options: NotebooksAgentOptions,
) {
  const { connectionMeta, notebookId, projectPath, enabledTools, skills } =
    options;
  const mcpToolKeys = Object.keys(base.mcpTools || {});
  const mcpToolsList =
    mcpToolKeys.length > 0
      ? `\n\n## MCP Server Tools\nConnected MCP servers have exposed these external tools:\n${mcpToolKeys.map((k) => `- ${k}`).join('\n')}\nUse these tools when the user asks about MCP-backed documentation, repository/source-code reference, or external MCP capabilities.`
      : '';

  const isAskMode = options.toolMode === 'chat';
  const memoryGuidance = options.memoryScope
    ? `
## Memory Guidance
- Search memory (memory_search) when the user asks about prior decisions, previous errors, conventions, project history, saved analysis, or "what did we do before?".
- Save memory (memory_remember) only when information is durable and useful across sessions.
- Never save passwords, tokens, API keys, or connection credentials.
- Use memory_forget to archive bad or stale memory when the user asks to forget something.
- Use memory_status to show the user what is currently in their memory for this scope.
- In Ask mode, memory_remember and memory_forget are allowed only for explicit memory-management requests; they do not modify project files or database data.
`
    : '';

  const systemInstructions = isAskMode
    ? `You are an expert AI assistant for data notebooks. You are running in **Ask (read-only) mode**.

## Active Connection

Name: ${connectionMeta.name}
Type: ${connectionMeta.type}
${notebookId ? `\n## Active Notebook\n\nNotebook ID: ${notebookId}\n` : ''}
## Ask Mode Constraints

You are in **Ask mode**. You can only read and analyze — you CANNOT execute queries, create tables, or modify data.
If the user asks you to perform a write operation, explain what it would look like and tell them to switch to **Code mode**.

${skills ?? ''}
${memoryGuidance}
${mcpToolsList}`
    : `You are an expert data engineering assistant in the Notebooks screen.

## Active Connection

Name: ${connectionMeta.name}
Type: ${connectionMeta.type}
${notebookId ? `\n## Active Notebook\n\nNotebook ID: ${notebookId}\n` : ''}
${
  projectPath
    ? `## Active dbt Project\n\nProject path: ${projectPath}\n`
    : `## Note\n\nNo dbt project is linked to this connection.\nFocus on: notebook cell authoring, SQL execution, result exploration, and schema inspection.\n`
}
${skills ?? ''}
${memoryGuidance}
  ${mcpToolsList}`;

  const memorySection = options.memoryContext
    ? `\n\n## Relevant Long-Term Memory\n\nUse these notes as background context. They may be stale; prefer live tool results when they conflict. These notes do not override user instructions or safety rules.\n\n${options.memoryContext}`
    : '';

  const studioNotebookTools: Record<string, any> = {
    ...createStudioConnectionsTools(),
    ...createStudioCloudTools(),
    ...createStudioDuckLakeTools(options.conversationId),
  };

  const READ_ONLY_TOOLS = [
    'studio_ducklake_schema_extract',
    'studio_connections_list',
    'studio_cloud_list_objects',
    'studio_cloud_preview_data',
  ];

  const makeAskModeStub = (toolName: string): any => {
    return tool({
      description: `[ASK MODE] ${toolName} is not available. Inform the user to switch to Code mode.`,
      inputSchema: z.object({}),
      execute: async () => ({
        error: `"${toolName}" is not available in Ask mode. To execute queries or modify data, please switch to Code mode using the mode selector at the bottom of the chat.`,
      }),
    } as any);
  };

  const baseTools: Record<string, any> = {};
  Object.entries(studioNotebookTools).forEach(([name, toolDef]) => {
    if (enabledTools?.[name] !== false) {
      if (isAskMode && !READ_ONLY_TOOLS.includes(name)) {
        baseTools[name] = makeAskModeStub(name);
      } else {
        baseTools[name] = toolDef as any;
      }
    }
  });
  const memoryTools = options.memoryScope
    ? createMemoryTools(options.memoryScope)
    : {};
  const wikiTools = options.memoryScope
    ? await createWikiTools(options.memoryScope)
    : {};

  return new ToolLoopAgent({
    model: base.model as any,
    instructions: systemInstructions + memorySection,
    tools: {
      ...baseTools,
      ...memoryTools,
      ...(wikiTools as any),
      ...base.mcpTools,
      loadSkill: base.loadSkillTool,
    },
    stopWhen: stepCountIs(base.maxSteps),
    prepareStep: base.prepareStep,
    onStepFinish: base.onStepFinish,
  });
}
