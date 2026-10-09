import { ToolLoopAgent, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import type { BaseAgentConfig } from './baseAgentConfig';
import { createStudioCloudTools } from '../tools/studio/cloud.tools';
import { createStudioConnectionsTools } from '../tools/studio/connections.tools';
import { createStudioDuckLakeTools } from '../tools/studio/ducklake.tools';
import { createStudioNotebooksTools } from '../tools/studio/notebooks.tools';
import { createPythonNotebookTools } from '../tools/studio/pythonNotebook.tools';
import { createStudioSqlTools } from '../tools/studio/sql.tools';
import { TOOL_FLAGS } from '../tools/toolRegistry';
import { NotebooksService } from '../../notebooks.service';
import PythonNotebooksService from '../../pythonNotebooks.service';
import NotebookKernelService from '../../notebookKernel.service';

import type { NotebookCell } from '../../../../types/notebooks';
import { composeAgentRuntime } from './composeAgentRuntime';
import { createDbtTools } from '../tools/dbt.tools';
import { createFilesystemTools } from '../tools/filesystem.tools';
import { EnrichedConnectionMeta } from './agentTypes';
import {
  buildDialectHints,
  buildPythonNotebookInstructions,
  formatPythonNotebookContext,
} from './notebooksAgent.prompts';

export interface NotebooksAgentOptions {
  connectionMeta: EnrichedConnectionMeta;
  notebookId?: string;
  connectionId?: string;
  enabledTools: Record<string, any>;
  /** Tools the user turned off in Settings → AI */
  disabledTools?: string[];
  skills: string;
  conversationId: number;
  toolMode: 'chat' | 'agent';
}

async function buildNotebookContextSummary(
  connectionId: string,
  notebookId: string,
): Promise<string> {
  try {
    const notebook = await NotebooksService.getNotebook(
      connectionId,
      notebookId,
    );
    if (!notebook) return '';

    let summary = `\n## Active Notebook: ${notebook.name}\n`;
    if (notebook.description) {
      summary += `Description: ${notebook.description}\n`;
    }
    summary += `Total Cells: ${notebook.cells.length}\n\n`;

    notebook.cells.forEach((cell: NotebookCell, index: number) => {
      const preview = cell.content.split('\n')[0].substring(0, 80);
      summary += `[Cell ${index + 1}] ID: ${cell.id} | Type: ${cell.type}\n`;
      summary += `Preview: ${preview}${cell.content.length > 80 ? '...' : ''}\n`;
      if (cell.output) {
        summary += `Status: ${cell.output.type}${cell.output.executionTime ? ` (${cell.output.executionTime}ms)` : ''}\n`;
      }
      summary += '\n';
    });

    return summary;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[NotebooksAgent] Failed to build notebook summary:', error);
    return '\n## Active Notebook\n(Metadata summary unavailable)\n';
  }
}

/** Tools every notebook agent may use in Ask mode (both notebook kinds). */
const READ_ONLY_TOOLS = [
  'studio_sql_schema_extract',
  'studio_ducklake_schema_extract',
  'studio_connections_list',
  'studio_cloud_list_objects',
  'studio_cloud_preview_data',
  'readDbtModel',
  'listDbtModels',
  'getDbtLogs',
  'listDirectory',
  'readFile',
  'pathExists',
  'notebooks_get_state',
  'notebooks_cell_read',
  'notebooks_cell_result',
];

const PYTHON_READ_ONLY_TOOLS = [
  ...READ_ONLY_TOOLS,
  'notebooks_variables',
  'notebooks_packages_list',
];

/**
 * Exactly one schema tool, picked by name: DuckLake's for DuckLake
 * connections, the SQL one for everything else. The query tools that write
 * to the SQL editor are never included (that editor isn't on this screen).
 */
function pickSchemaTool(
  connectionMeta: EnrichedConnectionMeta,
  conversationId: number,
): Record<string, any> {
  if (connectionMeta.type === 'ducklake') {
    const schemaTool =
      createStudioDuckLakeTools(conversationId).studio_ducklake_schema_extract;
    return schemaTool ? { studio_ducklake_schema_extract: schemaTool } : {};
  }
  const schemaTool = createStudioSqlTools(conversationId, {
    forceSchemaExtract: true,
  }).studio_sql_schema_extract;
  return schemaTool ? { studio_sql_schema_extract: schemaTool } : {};
}

export async function createNotebooksAgent(
  base: BaseAgentConfig,
  options: NotebooksAgentOptions,
) {
  const { connectionMeta, notebookId, connectionId, enabledTools, skills } =
    options;
  const mcpToolKeys = Object.keys(base.mcpTools || {});
  const mcpToolsList =
    mcpToolKeys.length > 0
      ? `\n\n## MCP Server Tools\nConnected MCP servers have exposed these external tools:\n${mcpToolKeys.map((k) => `- ${k}`).join('\n')}\nUse these tools when the user asks about MCP-backed documentation, repository/source-code reference, or external MCP capabilities.`
      : '';

  const connectionHints = buildDialectHints(connectionMeta);
  const isAskMode = options.toolMode === 'chat';

  // Python notebooks are <id>.ipynb; legacy SQL notebooks are <id>.json.
  const pythonNotebook =
    connectionId && notebookId
      ? await PythonNotebooksService.getNotebook(connectionId, notebookId)
      : null;
  const isPython = pythonNotebook !== null;

  const linkedProjectBlock = connectionMeta.linkedDbtProject
    ? `\n## Linked dbt Project\n\nThis connection is also used by the dbt project **${connectionMeta.linkedDbtProject.name}** ` +
      `at \`${connectionMeta.linkedDbtProject.path}\`. ` +
      `You can refer to this project if the user asks about dbt models that query this database.`
    : '';

  const databaseBlock =
    connectionMeta.database || connectionMeta.schema
      ? `\nDatabase: ${connectionMeta.database ?? 'N/A'}\nSchema: ${connectionMeta.schema ?? 'N/A'}`
      : '';

  const schemaTools = pickSchemaTool(connectionMeta, options.conversationId);

  const notebookContext =
    !isPython && connectionId && notebookId
      ? await buildNotebookContextSummary(connectionId, notebookId)
      : '\n## Active Notebook\n(No notebook active)\n';

  const legacyInstructions = isAskMode
    ? `You are an expert AI assistant for data analysis using Notebooks. You are running in **Ask (read-only) mode**.

## Active Connection

Name: ${connectionMeta.name}
Type: ${connectionMeta.type}${databaseBlock}${connectionHints}
${linkedProjectBlock}
${notebookContext}

## Ask Mode Constraints

You are in **Ask mode**. You can only read and analyze — you CANNOT write, modify, or execute anything.
Available tools: schema exploration, reading notebook state, listing connections.
NOT available: Cell creation, cell updates, cell execution, SQL query execution.

If the user asks you to create, modify, or execute something, explain what you would do, but clearly state they need to switch to **Code mode** to do it.

${skills ?? ''}
${mcpToolsList}

## Guidelines

1. Explore schema to answer questions accurately.
2. Read the notebook state to understand the user's current context.
3. Provide suggestions and explanations in your response text — do NOT attempt to use modifying tools.
4. Explicitly tell the user to switch to **Code mode** if they want to run or apply changes.`
    : `You are an expert AI Agent designed to help the user analyze, write, and execute queries directly in their Notebook.

## Active Connection

Name: ${connectionMeta.name}
Type: ${connectionMeta.type}${databaseBlock}${connectionHints}
${linkedProjectBlock}
${notebookContext}

## Context

You have direct access to the Notebook UI. You can read its current state, create new cells, update existing cells, and execute cells.
You are strictly scoped to the database connection. Do NOT attempt to use DBT project commands.

${skills ?? ''}
${mcpToolsList}

## Capabilities & Workflow
1. **Analyze Schema**: Use the schema tool to understand the database structure (tables, columns).
2. **Notebook Awareness**: Use \`notebooks_get_state\` to see which cells exist.
3. **Strict Single-Statement Cells**:
   - **CRITICAL RULE**: You can only write ONE SQL statement per cell. Multiple SQL statements (statement chaining) are strictly forbidden and will fail.
   - If you have a complex task requiring multiple steps, you MUST generate multiple cells in sequence:
     1. Use \`notebooks_cell_add\` to create a new cell.
     2. Write ONE query in the new cell.
     3. Execute the cell with \`notebooks_cell_run\`.
     4. Read the result with \`notebooks_cell_result\`.
     5. Based on the response, if you need to continue, create another new cell with \`notebooks_cell_add\` and repeat.
4. **Iterative Authoring & Verification**:
   - After running a cell, wait a moment and then use \`notebooks_cell_result\` to inspect the output.
   - If the output contains errors, update the broken cell with \`notebooks_cell_update\` and re-run.
   - Do NOT stop until the task is complete or you hit a blocker you cannot resolve.

## Pagination & Large Datasets
The notebook UI handles large datasets efficiently using server-side pagination.
- **Do not use explicit LIMIT clauses** in your queries.
- Any explicit \`LIMIT\` or \`OFFSET\` clauses you write will be **stripped and ignored** by the execution engine to prevent pagination conflicts.
- When you read results, you will only receive the first page (up to 10 rows). Use this to verify logic.
- The UI handles fetching the rest of the dataset automatically, so you don't need to worry about large datasets crashing the system.

## Behavioral Rules
- **No Suggestions**: Your users are Data Engineers who already have specific tasks defined by stakeholders. Do NOT suggest what to do next. Do NOT ask "Would you like me to...?" or "What would you like to do next?".
- **Concise Reporting**: Just explain or answer exactly what you have done. Be brief and professional. Do NOT add conversational filler.

`;

  const systemInstructions = pythonNotebook
    ? buildPythonNotebookInstructions({
        isAskMode,
        connectionBlock: `Name: ${connectionMeta.name}\nType: ${connectionMeta.type}${databaseBlock}${connectionHints}`,
        linkedProjectBlock,
        notebookContext: formatPythonNotebookContext(
          pythonNotebook,
          NotebookKernelService.getStatus(pythonNotebook.id).status,
        ),
        schemaToolName:
          Object.keys(schemaTools)[0] ?? 'the schema tool (currently disabled)',
        skills,
        mcpToolsList,
      })
    : legacyInstructions;

  // Explicit allowlist: connection and cloud tools, one schema tool, the
  // notebook tools for this kind, and the read-only project tools.
  const studioTools: Record<string, any> = {
    ...createStudioConnectionsTools(),
    ...createStudioCloudTools(),
    ...schemaTools,
    ...(isPython
      ? createPythonNotebookTools(options.conversationId)
      : createStudioNotebooksTools(options.conversationId)),
  };

  // If a dbt project is linked, create the pure NodeJS filesystem/DBT tools
  const linkedProjectPath = connectionMeta.linkedDbtProject?.path;
  const projectTools: Record<string, any> = linkedProjectPath
    ? {
        ...createDbtTools(linkedProjectPath, undefined, base.mainWindow),
        ...createFilesystemTools(linkedProjectPath),
      }
    : {};

  const readOnlyTools = isPython ? PYTHON_READ_ONLY_TOOLS : READ_ONLY_TOOLS;
  const disabledTools = new Set(options.disabledTools ?? []);

  const makeAskModeStub = (toolName: string): any => {
    return tool({
      description: `[ASK MODE] ${toolName} is not available. Inform the user to switch to Code mode.`,
      inputSchema: z.object({}),
      execute: async () => ({
        error: `"${toolName}" is not available in Ask mode. To execute queries or modify the notebook, please switch to Code mode using the mode selector at the bottom of the chat.`,
      }),
    } as any);
  };

  const baseTools: Record<string, any> = {};
  const register = (name: string, toolDef: any) => {
    if (
      (TOOL_FLAGS as Record<string, boolean>)[name] === false ||
      disabledTools.has(name)
    ) {
      return;
    }
    baseTools[name] =
      isAskMode && !readOnlyTools.includes(name)
        ? makeAskModeStub(name)
        : toolDef;
  };

  Object.entries(studioTools).forEach(([name, toolDef]) =>
    register(name, toolDef),
  );
  Object.entries(projectTools).forEach(([name, toolDef]) => {
    if (enabledTools?.[name]) register(name, toolDef);
  });

  // Python: read → write → run → inspect → fix, up to three attempts.
  // Legacy: one step to read notebook state and one to explain it, so a
  // single-step limit can't persist a tool-only message with no answer.
  const maxSteps = Math.max(base.maxSteps, isPython ? 12 : 2);
  const runtime = composeAgentRuntime(base, systemInstructions, baseTools);

  return new ToolLoopAgent({
    model: base.model as any,
    instructions: runtime.instructions,
    tools: runtime.tools,
    stopWhen: stepCountIs(maxSteps),
    prepareStep: base.prepareStep,
    onStepFinish: base.onStepFinish,
  });
}
