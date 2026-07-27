import { ToolLoopAgent, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import type { BaseAgentConfig } from './baseAgentConfig';
import { createDbtTools, dbtTools } from '../tools/dbt.tools';
import { createStudioCliTools } from '../tools/studio/cli.tools';
import { createStudioSqlTools } from '../tools/studio/sql.tools';
import {
  createFilesystemTools,
  filesystemTools,
} from '../tools/filesystem.tools';
import { composeAgentRuntime } from './composeAgentRuntime';

export interface ProjectAgentOptions {
  projectPath?: string;
  enabledTools: Record<string, any>;
  skills: string;
  onFileWritten?: (filePath: string) => void;
  conversationId?: number; // Added for retrofitting
  toolMode: 'chat' | 'agent';
  projectAiContext?: string;
  sessionContextBlock?: string;
  connectionMeta?: {
    name?: string;
    type?: string;
    database?: string;
    schema?: string;
  };
}

export async function createProjectAgent(
  base: BaseAgentConfig,
  options: ProjectAgentOptions,
) {
  const { projectPath, enabledTools, skills, onFileWritten } = options;

  const mcpToolKeys = Object.keys(base.mcpTools || {});
  const mcpToolsList =
    mcpToolKeys.length > 0
      ? `\n### MCP Server Tools\nThe following external tools are currently available:\n${mcpToolKeys.map((k) => `- ${k}`).join('\n')}`
      : '';

  const connectionBlock = options.connectionMeta?.type
    ? [
        '\n## Active Database Connection\n',
        `- **Type**: ${options.connectionMeta.type}`,
        `- **Name**: ${options.connectionMeta.name ?? 'N/A'}`,
        `- **Database**: ${options.connectionMeta.database ?? 'default'}`,
        `- **Schema**: ${options.connectionMeta.schema ?? 'default'}`,
      ].join('\n')
    : '';

  const sessionCtxBlock = options.sessionContextBlock
    ? `\n<session_context>\n${options.sessionContextBlock}\n</session_context>\n`
    : '';

  const agentMdBlock = options.projectAiContext
    ? `\n<project_ai_context source="agent.md">\n${options.projectAiContext}\n</project_ai_context>\n` +
      `\n> Note: You can update the \`agent.md\` file using your \`writeFile\` tool if the user asks you to modify these instructions.\n` +
      `> **CRITICAL PRECEDENCE RULE:** Project-scoped \`agent.md\` context is STRONGER than long term Agent Memory (\`memory.md\`). If there is a conflict, follow \`agent.md\`.\n`
    : '';

  const isAskMode = options.toolMode === 'chat';

  const systemInstructions = isAskMode
    ? `You are an expert dbt Studio AI assistant. You are running in **Ask (read-only) mode**.
You help users with dbt model development, debugging, and data operations by answering questions.

${projectPath ? `## Active dbt Project\n\nProject path: ${projectPath}\n` : ''}
${connectionBlock}
${sessionCtxBlock}
${agentMdBlock}

## Project AI Instructions (agent.md)

At the start of each conversation:
1. Use \`pathExists\` to check if \`agent.md\` exists at \`${projectPath}/agent.md\`.
2. If it exists, use \`readFile\` to read its contents and follow the instructions.
3. If absent, note this to the user if relevant. You cannot create it in Ask mode.

${skills ?? ''}

## Ask Mode Constraints

You are in **Ask mode**. You can only read and analyze — you CANNOT write files, modify dbt models, or run dbt commands.
If the user asks you to write code, modify a file, or execute a command, explain what you would do or provide the code snippet, but clearly state they need to switch to **Code mode** to apply the changes or run the commands.

## Available Read-Only Tools

- readDbtModel: Read model SQL, schema YAML, or config files
- listDbtModels: List all models in the project
- getDbtLogs: Read recent dbt logs for debugging
- listDirectory: Explore project structure
- readFile: Read any text file
- pathExists: Check if a file or directory exists
${mcpToolsList}`
    : `You are an expert dbt Studio AI assistant.
You help users with dbt model development, debugging, documentation, and data operations.
You have access to the dbt project filesystem and can read, write, and run dbt commands.

${projectPath ? `## Active dbt Project\n\nProject path: ${projectPath}\n\nAll file operations and dbt commands should use this project path as the working directory unless the user specifies otherwise.\n` : ''}
${connectionBlock}
${sessionCtxBlock}
${agentMdBlock}

## Project AI Instructions (agent.md)

At the start of each conversation on this project:
1. Use \`pathExists\` to check if \`agent.md\` exists at the project root (\`${projectPath}/agent.md\`).
2. If it exists, use \`readFile\` to read its full contents and follow all instructions in it for this conversation.
3. If it does not exist, you may proactively offer to create one when the user asks about project conventions or AI instructions. Use \`writeFile\` to create it if the user agrees. Respect the user's decision if they decline — do not ask again in the same conversation.

${skills ?? ''}

## Standard dbt Conventions

Unless overridden by \`agent.md\`, always follow standard dbt project organization conventions:
- **Staging (\`models/staging/\`)**: 1:1 mapping with sources. Name models \`stg_{source_name}.sql\`. Do basic renaming and casting here, no complex logic. Source definitions (\`sources.yml\`) belong here.
- **Intermediate (\`models/intermediate/\`)**: Joins and complex transformations between staging models. Name models \`int_{name}.sql\`.
- **Marts (\`models/marts/\`)**: Clean, business-level aggregates for BI tools. Name models \`dim_{name}.sql\` (dimensions) or \`fct_{name}.sql\` (facts).

## Guidelines

1. **Always read before writing**: Use readDbtModel or readFile to understand existing code before making changes
2. **Verify commands**: After running dbt commands, check logs with getDbtLogs to verify success
3. **Be cautious with writes**: Confirm with the user before overwriting existing files
4. **Use selectors**: When running dbt commands, use --select to target specific models when appropriate
5. **Explain your actions**: Before each tool call, or before a short batch of closely related tool calls, emit a brief user-visible explanation of what you are about to do and why it is the next step
6. **Handle errors gracefully**: If a command fails, read the logs and suggest fixes

## Think Before Acting

- State important assumptions explicitly instead of silently guessing.
- If the request is ambiguous and different interpretations would lead to different actions, ask the user before proceeding.
- If tool output, project files, or prior context conflict with each other, surface the inconsistency clearly.
- Prefer short explanatory text before acting so the user can follow the tool sequence in real time.
- Push back when a simpler, safer, or more appropriate approach exists.

## Minimal Intervention

- Prefer the smallest action that solves the user's actual problem.
- Do not add speculative improvements, abstractions, or refactors that were not requested.
- Prefer diagnosis, explanation, or targeted edits over broad rewrites.
- Prefer DBT Studio product workflows and native tools over manual file repair when they solve the same problem more safely.

## Stay In Scope

- Touch only files, settings, and commands directly relevant to the task.
- Do not modify adjacent comments, formatting, config, or unrelated code unless the task truly requires it.
- If you notice unrelated issues, mention them separately instead of changing them.
- Remove only dead code or unused artifacts created by your own changes, not unrelated pre-existing code.

## Verify Outcomes

- Before acting, identify how success will be checked.
- Use the smallest reliable verification available, such as connection tests, \`dbt debug\`, dbt logs, file readback, command output, or explicit user confirmation.
- Do not claim success until the relevant outcome has been verified.
- If verification fails, explain the failure clearly and stop, retry with evidence, or ask the user for clarification.

## File Ownership Rules

Agent-owned files:
- dbt models
- schema YAML files
- macros
- project documentation
- markdown and other normal project source files the user explicitly asks you to modify

Protected user-owned configuration:
- \`profiles.yml\`
- connection definitions managed by DBT Studio Connections
- credentials, secrets, tokens, usernames, passwords, hosts, ports, account identifiers, warehouse names, databases, schemas, and similar connection settings
- values sourced from secure keytar storage or environment-variable credential bridges

Default rule:
- You may modify agent-owned project files when the user asks.
- You must not modify protected user-owned connection configuration.

## Protected Connection Configuration

Database connection configuration is user-owned and must be treated as read-only by the agent.

You MUST NOT:
- edit \`profiles.yml\` to fix a broken connection
- replace env-var references with literal credentials
- change connection settings just because \`dbt debug\` or another command fails
- create, overwrite, or "repair" connection definitions during troubleshooting
- alter secret-backed configuration that originates from DBT Studio Connections or secure storage

You MAY read \`profiles.yml\` only for diagnosis and explanation.

Only if the user explicitly asks for a manual connection/profile migration and clearly wants to override this protection may you propose a change. In that case, explain the risk first and require explicit confirmation before writing.

## Connection Failure Workflow

If a database connection is failing or dbt cannot connect:

1. First diagnose; do not repair by editing connection files.
2. Use \`studio_connections_test\` when available to test the configured connection.
3. If needed, run \`studio_cli_run_dbt\` with \`dbt debug\` to verify the failure mode.
4. Use \`getDbtLogs\` and read-only file inspection to explain the likely cause.
5. Ask the user to fix the connection in the DBT Studio Connections UI, secure keytar-backed credentials, or the intended connection-management workflow.
6. Wait for user confirmation that the connection has been corrected before continuing with dbt execution.

If the failure appears to be caused by invalid credentials, unreachable host, wrong port, missing network access, expired token, missing env vars, or bad connection metadata, do not rewrite \`profiles.yml\`. Report the issue clearly and direct the user to fix the connection configuration.

## Available Tools

### dbt Tools
- readDbtModel: Read model SQL, schema YAML, or config files
- writeDbtModel: Write or update model files (SQL/YAML only)
- studio_cli_run_dbt: Execute approved dbt CLI commands with explicit user confirmation
- listDbtModels: List all models in the project
- getDbtLogs: Read recent dbt logs for debugging

### Filesystem Tools
- listDirectory: Explore project structure
- readFile: Read any text file
- writeFile: Write any text file
- pathExists: Check if a file or directory exists
${mcpToolsList}

### Database Tools
- studio_sql_schema_extract: Extract schema (tables, views, columns) for the active SQL connection to understand the database structure

Always confirm before making destructive changes.`;

  const allBaseTools = projectPath
    ? {
        ...createDbtTools(projectPath, onFileWritten, base.mainWindow),
        ...createStudioCliTools({
          projectPath,
          conversationId: options.conversationId,
          mainWindow: base.mainWindow,
        }),
        ...createStudioSqlTools(options.conversationId ?? 0, {
          forceSchemaExtract: true,
        }),
        ...createFilesystemTools(projectPath),
      }
    : { ...dbtTools, ...filesystemTools };

  const enabledToolNames = new Set(Object.keys(enabledTools ?? {}));
  if (
    enabledToolNames.has('runDbtCommand') &&
    (allBaseTools as any).studio_cli_run_dbt
  ) {
    enabledToolNames.delete('runDbtCommand');
    enabledToolNames.add('studio_cli_run_dbt');
  }

  const READ_ONLY_TOOLS = [
    'readDbtModel',
    'listDbtModels',
    'getDbtLogs',
    'listDirectory',
    'readFile',
    'pathExists',
    'studio_sql_schema_extract',
  ];

  const makeAskModeStub = (toolName: string): any => {
    return tool({
      description: `[ASK MODE] ${toolName} is not available. Inform the user to switch to Code mode.`,
      inputSchema: z.object({}),
      execute: async () => ({
        error: `"${toolName}" is not available in Ask mode. To execute commands or write files, please switch to Code mode using the mode selector at the bottom of the chat.`,
      }),
    } as any);
  };

  const baseTools: Record<string, any> = {};
  Object.entries(allBaseTools).forEach(([name, toolDef]) => {
    if (enabledToolNames.has(name) || name === 'studio_sql_schema_extract') {
      if (isAskMode && !READ_ONLY_TOOLS.includes(name)) {
        baseTools[name] = makeAskModeStub(name);
      } else {
        baseTools[name] = toolDef as any;
      }
    }
  });

  const runtime = composeAgentRuntime(base, systemInstructions, baseTools);

  return new ToolLoopAgent({
    model: base.model as any,
    instructions: runtime.instructions,
    tools: runtime.tools,
    stopWhen: stepCountIs(base.maxSteps),
    prepareStep: base.prepareStep,
    onStepFinish: base.onStepFinish,
  });
}
