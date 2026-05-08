import { ToolLoopAgent, stepCountIs, tool } from 'ai';
import { z } from 'zod';

import type { BaseAgentConfig } from './baseAgentConfig';
import { createStudioCloudTools } from '../tools/studio/cloud.tools';
import { createStudioConnectionsTools } from '../tools/studio/connections.tools';
import { createStudioDuckLakeTools } from '../tools/studio/ducklake.tools';
import { createStudioMonacoTools } from '../tools/studio/monaco.tools';
import {
  createStudioSqlTools,
  createSqlResultInspectorTools,
} from '../tools/studio/sql.tools';

export interface SqlAgentOptions {
  connectionMeta: { name: string; type: string };
  enabledTools: Record<string, any>;
  skills: string;
  conversationId: number;
  toolMode: 'chat' | 'agent';
}

export async function createSqlAgent(
  base: BaseAgentConfig,
  options: SqlAgentOptions,
) {
  const { connectionMeta, enabledTools, skills } = options;
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

  const systemInstructions = isAskMode
    ? `You are an expert AI assistant for SQL data analysis. You are running in **Ask (read-only) mode**.

## Active Connection

Name: ${connectionMeta.name}
Type: ${connectionMeta.type}${connectionHints}

## Ask Mode Constraints

You are in **Ask mode**. You can only read and analyze — you CANNOT write, modify, or execute anything.
Available tools: schema exploration, reading the current Monaco editor content, reading the last query results, listing connections and cloud objects.
NOT available: Monaco editor updates, SQL query execution, DuckLake writes, DDL/DML operations.

If the user asks you to create, modify, or execute something, explain what the SQL would look like, but clearly state they need to switch to **Code mode** to execute it.

${skills ?? ''}
${mcpToolsList}

## Guidelines

1. Explore schema (tables and columns) to answer questions accurately.
2. Read the Monaco editor to understand the user's current SQL context.
3. Use \`studio_sql_get_query_results\` or \`studio_sql_get_agent_run_result\` to read current or last query results if the user asks about them.
4. Provide SQL suggestions and explanations in your response text — do NOT attempt to write to the editor.
5. Explicitly tell the user to switch to **Code mode** if they want to run or apply queries.`
    : `You are an expert AI Agent designed to help the user analyze, write, and execute queries directly in the SQL Monaco Editor.

## Active Connection

Name: ${connectionMeta.name}
Type: ${connectionMeta.type}${connectionHints}

## Context

You have direct access to the SQL Monaco Editor. You can read its current state, and append or modify queries in the editor (do NOT delete existing queries without permission). You execute queries, and the results are automatically rendered in the UI's SQL results section.
You are strictly scoped to the database connection. Do NOT attempt to use DBT project commands.

${skills ?? ''}
${mcpToolsList}

## Tool Usage Pattern

**At session start — gather context before acting:**
1. \`studio_sql_schema_extract\` / \`studio_ducklake_schema_extract\` — understand what tables/columns exist
2. \`studio_monaco_read\` — read the user's current SQL in the editor
3. \`studio_sql_get_query_results\` — (optional) read what the user currently sees in the UI results panel

**When executing a query:**
1. \`studio_monaco_update\` — write **exactly ONE SQL statement** into the editor. The SQL runner executes only the current editor content as a single statement; multiple statements will fail.
2. \`studio_sql_query\` / \`studio_ducklake_query\` — trigger execution via the UI
3. \`studio_sql_get_agent_run_result\` — read the definitive result (success / error / command). **Always call this step.**
4. **If the result is an error:** diagnose the error message, fix the SQL (e.g. split multiple statements into one, correct syntax), update the Monaco editor with the corrected SQL via \`studio_monaco_update\`, and re-trigger execution (go back to step 2). Repeat until the query succeeds or the error is unrecoverable — in that case explain the root cause to the user.
5. **If the result is success or command:** report the outcome (rows returned, rows affected, command type) and continue.
6. **For multi-statement workflows** (e.g. CREATE SCHEMA + multiple CREATE TABLE): execute each statement separately in sequence. After each execution, overwrite the editor with the next statement and re-run.

## Guidelines

1. Always explore schema (tables and columns) before writing queries.
2. **The SQL runner executes exactly ONE statement per run.** Never write multiple SQL statements into the Monaco editor before executing. For multi-statement tasks, write and execute each statement individually in sequence.
3. Read the Monaco editor to understand the user's current SQL context before making changes.
4. **Monaco editor and multi-statement execution:** When executing a series of statements (e.g. CREATE SCHEMA then CREATE TABLE), write ONE statement to the editor, execute it, read the result, then overwrite the editor with the next statement. Do NOT append multiple statements or leave previous agent-written statements in the editor between executions. Do NOT delete or modify the user's original queries that were already present at session start unless explicitly asked.
5. After executing a query, **always** call \`studio_sql_get_agent_run_result\` to read the definitive outcome. If the result is an error, diagnose it, fix the SQL in the Monaco editor (\`studio_monaco_update\`), and re-run the corrected query. Common recoverable errors: multiple SQL statements in the editor (isolate the one statement to run), syntax errors (fix the SQL). Report the final outcome to the user.
6. Prefer read-only operations unless the user explicitly requests writes.
7. For DML/DDL operations, proceed directly — the execution tool has a built-in approval gate that will automatically request user confirmation before running. Do NOT ask for approval in the chat.`;

  // SQL connection tools + Monaco editor tools
  const isDuckLake = connectionMeta.type === 'ducklake';

  const studioSqlTools: Record<string, any> = {
    ...createStudioConnectionsTools(),
    ...createStudioCloudTools(),
    ...(isDuckLake
      ? createStudioDuckLakeTools(options.conversationId)
      : createStudioSqlTools(options.conversationId)),
    // Result inspector is connection-type agnostic — always included for both
    // standard SQL and DuckLake (QueryResultStore is populated for all query types)
    ...createSqlResultInspectorTools(options.conversationId),
    ...createStudioMonacoTools(options.conversationId),
  };

  const READ_ONLY_TOOLS = [
    'studio_sql_schema_extract',
    'studio_ducklake_schema_extract',
    'studio_monaco_read',
    'studio_connections_list',
    'studio_cloud_list_objects',
    'studio_cloud_preview_data',
    'studio_sql_get_query_results', // reads current UI result panel (context at session start)
    'studio_sql_get_agent_run_result', // reads last agent-triggered query result (push-based)
  ];

  // Build a stub that immediately returns a "not available in Ask mode" error.
  // This prevents infinite loaders: the model can call the tool but gets an
  // immediate, clear rejection instead of hanging.
  const makeAskModeStub = (toolName: string): any => {
    return tool({
      description: `[ASK MODE] ${toolName} is not available. Inform the user to switch to Code mode.`,
      inputSchema: z.object({}),
      execute: async () => ({
        error: `"${toolName}" is not available in Ask mode. To execute queries or modify the editor, please switch to Code mode using the mode selector at the bottom of the chat.`,
      }),
    } as any);
  };

  const baseTools: Record<string, any> = {};
  Object.entries(studioSqlTools).forEach(([name, toolDef]) => {
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
