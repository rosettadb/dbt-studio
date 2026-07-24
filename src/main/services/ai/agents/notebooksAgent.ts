import { ToolLoopAgent, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import type { BaseAgentConfig } from './baseAgentConfig';
import { createStudioCloudTools } from '../tools/studio/cloud.tools';
import { createStudioConnectionsTools } from '../tools/studio/connections.tools';
import { createStudioDuckLakeTools } from '../tools/studio/ducklake.tools';
import { createStudioNotebooksTools } from '../tools/studio/notebooks.tools';
import { NotebooksService } from '../../notebooks.service';

import type { NotebookCell } from '../../../../types/notebooks';
import { composeAgentRuntime } from './composeAgentRuntime';
import { createDbtTools } from '../tools/dbt.tools';
import { createFilesystemTools } from '../tools/filesystem.tools';
import { EnrichedConnectionMeta } from './agentTypes';

export interface NotebooksAgentOptions {
  connectionMeta: EnrichedConnectionMeta;
  notebookId?: string;
  connectionId?: string;
  enabledTools: Record<string, any>;
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

  // DuckLake is a DuckDB extension (not a JS package), version is fixed
  let duckdbVersion = '1.5.2+';
  const ducklakeVersion = '1.0';

  try {
    // Dynamically resolve duckdb version the exact same way the footer does
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    const ddbPkg = require('@duckdb/node-api/package.json');
    if (ddbPkg && ddbPkg.version) {
      duckdbVersion = ddbPkg.version;
    }
  } catch (e) {
    // fallback
  }

  let connectionHints = '';
  switch (connectionMeta.type) {
    case 'ducklake':
      connectionHints = `\n\n## DuckLake Specifics
You are connected to a DuckLake lakehouse. DuckLake is a DuckDB extension (not a separate library).
- Versions: DuckDB v${duckdbVersion}, DuckLake extension minimal v${ducklakeVersion}.
- Dialect: Use DuckDB SQL dialect and functions.
- Attach: \`ATTACH 'ducklake:my.ducklake' AS my_ducklake; USE my_ducklake;\`
- Time Travel: \`SELECT ... FROM tbl AT (VERSION => 2)\` or \`AT (TIMESTAMP => '2025-01-01')\`
- Snapshots: \`FROM my_ducklake.snapshots();\`
- Constraints: No indexes, primary keys, foreign keys, UNIQUE or CHECK constraints.
- Updates: Modeled as deletes followed by inserts (append-only Parquet storage).
- Detach: \`USE memory; DETACH my_ducklake;\``;
      break;
    case 'duckdb':
      connectionHints =
        '\n\n## Dialect Specifics\nYou are connected to DuckDB. Ensure all queries use DuckDB SQL syntax and functions.';
      break;
    case 'postgres':
    case 'postgresql':
      connectionHints =
        '\n\n## Dialect Specifics\nYou are connected to PostgreSQL. Ensure all queries use PostgreSQL SQL syntax and functions.';
      break;
    case 'bigquery':
      connectionHints =
        '\n\n## Dialect Specifics\nYou are connected to Google BigQuery. Ensure all queries use BigQuery Standard SQL syntax.';
      break;
    case 'snowflake':
      connectionHints =
        '\n\n## Dialect Specifics\nYou are connected to Snowflake. Ensure all queries use Snowflake SQL syntax and functions.';
      break;
    case 'redshift':
      connectionHints =
        '\n\n## Dialect Specifics\nYou are connected to Amazon Redshift. Ensure all queries use Redshift SQL syntax and functions.';
      break;
    case 'databricks':
      connectionHints =
        '\n\n## Dialect Specifics\nYou are connected to Databricks. Ensure all queries use Databricks/Spark SQL syntax and functions.';
      break;
    case 'kinetica':
      connectionHints =
        '\n\n## Dialect Specifics\nYou are connected to Kinetica. Ensure all queries use Kinetica SQL syntax and functions.';
      break;
    default:
      connectionHints = `\n\n## Dialect Specifics\nYou are connected to a ${connectionMeta.type} database. Ensure all queries use the correct dialect for this database.`;
      break;
  }

  const isAskMode = options.toolMode === 'chat';

  const notebookContext =
    connectionId && notebookId
      ? await buildNotebookContextSummary(connectionId, notebookId)
      : '\n## Active Notebook\n(No notebook active)\n';

  const linkedProjectBlock = connectionMeta.linkedDbtProject
    ? `\n## Linked dbt Project\n\nThis connection is also used by the dbt project **${connectionMeta.linkedDbtProject.name}** ` +
      `at \`${connectionMeta.linkedDbtProject.path}\`. ` +
      `You can refer to this project if the user asks about dbt models that query this database.`
    : '';

  const databaseBlock =
    connectionMeta.database || connectionMeta.schema
      ? `\nDatabase: ${connectionMeta.database ?? 'N/A'}\nSchema: ${connectionMeta.schema ?? 'N/A'}`
      : '';

  const systemInstructions = isAskMode
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
1. **Analyze Schema**: Use DuckLake tools to understand the database structure (tables, columns).
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

  const safeEnabledTools = { ...enabledTools };
  // The Notebooks screen does not have the SQL Editor bridge, so studio_ducklake_query
  // (which writes to the Monaco SQL editor) will crash/hang. Remove it.
  delete safeEnabledTools.studio_ducklake_query;
  delete safeEnabledTools.studio_sql_query;

  const studioNotebookTools: Record<string, any> = {
    ...createStudioConnectionsTools(),
    ...createStudioCloudTools(),
    ...createStudioDuckLakeTools(options.conversationId),
    ...createStudioNotebooksTools(options.conversationId),
  };

  // If a dbt project is linked, create the pure NodeJS filesystem/DBT tools
  const linkedProjectPath = connectionMeta.linkedDbtProject?.path;
  const projectTools: Record<string, any> = linkedProjectPath
    ? {
        ...createDbtTools(linkedProjectPath, undefined, base.mainWindow),
        ...createFilesystemTools(linkedProjectPath),
      }
    : {};

  const READ_ONLY_TOOLS = [
    'studio_ducklake_schema_extract',
    'studio_connections_list',
    'studio_cloud_list_objects',
    'studio_cloud_preview_data',
    'notebook_read',
    'notebook_list',
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

  // Combine native UI tools and project filesystem tools
  const allAvailableTools = { ...studioNotebookTools, ...projectTools };

  Object.entries(allAvailableTools).forEach(([name, toolDef]) => {
    const isUI = name in studioNotebookTools;
    const isAllowedProjectTool = enabledTools && enabledTools[name];

    if ((isUI && enabledTools?.[name] !== false) || isAllowedProjectTool) {
      if (isAskMode && !READ_ONLY_TOOLS.includes(name)) {
        baseTools[name] = makeAskModeStub(name);
      } else {
        baseTools[name] = toolDef as any;
      }
    }
  });

  // Notebook questions commonly require one step to read notebook state and a
  // second step to explain the tool result. A single-step limit can otherwise
  // persist a tool-only assistant message with no natural-language answer.
  const maxSteps = Math.max(base.maxSteps, 2);
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
