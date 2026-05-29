import { ToolLoopAgent, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import type { BaseAgentConfig } from './baseAgentConfig';
import { createStudioCloudTools } from '../tools/studio/cloud.tools';
import { createStudioConnectionsTools } from '../tools/studio/connections.tools';
import { createStudioDuckLakeTools } from '../tools/studio/ducklake.tools';

export interface NotebooksAgentOptions {
  connectionMeta: { name: string; type: string };
  notebookId?: number;
  projectPath?: string;
  enabledTools: Record<string, any>;
  skills: string;
  conversationId: number;
  toolMode: 'chat' | 'agent';
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
${mcpToolsList}`;

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

  return new ToolLoopAgent({
    model: base.model as any,
    instructions: systemInstructions,
    tools: { ...baseTools, ...base.mcpTools, loadSkill: base.loadSkillTool },
    stopWhen: stepCountIs(base.maxSteps),
    prepareStep: base.prepareStep,
    onStepFinish: base.onStepFinish,
  });
}
