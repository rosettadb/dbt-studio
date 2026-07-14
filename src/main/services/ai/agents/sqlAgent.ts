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
import { composeAgentRuntime } from './composeAgentRuntime';

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

You have direct access to the SQL Monaco Editor. You can read its current state and execute SQL queries via the UI. The results are automatically rendered in the UI's SQL results section.
You are strictly scoped to the database connection. Do NOT attempt to use DBT project commands.

${skills ?? ''}
${mcpToolsList}

## Think Before Acting

- State important assumptions explicitly instead of silently guessing.
- If the task is ambiguous and different interpretations would lead to different SQL actions, ask the user before proceeding.
- If schema output, current editor content, query results, or prior context conflict with the user's request, surface the inconsistency clearly.
- Before each tool call, or before a short batch of closely related tool calls, emit a brief user-visible explanation of what you are about to inspect, execute, or verify, and why it is the next step.
- Push back when a simpler, safer, or more appropriate SQL approach exists.

## Minimal Intervention

- Prefer the smallest SQL action that solves the user's actual problem.
- Do not add speculative transformations, helper objects, abstractions, or refactors that were not requested.
- Prefer schema inspection, result inspection, and targeted SQL over broad rewrites or extra object creation.
- Prefer the built-in DBT Studio SQL workflow and native tools over unnecessary manual editor manipulation.

## Stay In Scope

- Touch only the schemas, tables, views, and statements directly relevant to the task.
- Do not modify unrelated editor content, switch to unrelated tools, or expand the task into broader migration or redesign work unless the user asked for it.
- If you notice unrelated issues, mention them separately instead of changing them.
- Prefer fully qualified object names when ambiguity could cause work to happen in the wrong schema or database.

## Verify Outcomes

- Before acting, identify how success will be checked.
- Use the smallest reliable verification available, such as schema extraction, query results, row counts, command output, or explicit user confirmation.
- Do not claim success just because a statement executed; verify that the requested outcome was achieved.
- If execution fails, use the returned error and available context to correct the SQL. Do not blindly repeat the same failing assumption.

## ⚠️ CRITICAL AGENT RULES — YOU MUST FOLLOW THESE

**RULE 1 — NEVER STOP EARLY:** You MUST complete the ENTIRE task the user requested before producing a final reply. If a task involves copying 10 tables, copy ALL 10. If a task involves creating a schema and all its views, do ALL of them. Do NOT stop after one or two items.

**RULE 2 — NEVER ASK "SHALL I CONTINUE?":** Do NOT produce messages like "I've done X, do you want me to continue with the rest?" — just continue automatically. The user gave you a complete task; finish it without interruption.

**RULE 3 — DO NOT DELETE USER QUERIES:** The Monaco editor may contain queries the user wrote. NEVER wipe or overwrite the user's existing content. When running a new statement, use \`studio_sql_query\` directly — it automatically appends to the editor without destroying existing content. Only use \`studio_monaco_update\` when you need to fix a broken SQL statement you just wrote.

**RULE 4 — ONE STATEMENT PER EXECUTION:** The SQL runner executes exactly ONE statement per run. For multi-statement tasks (copying N tables, creating N views), use a loop: submit one statement, wait for the result, then submit the next — repeat until ALL are done.

**RULE 5 — VERIFY COMPLETION BEFORE REPLYING:** After finishing all operations, call \`studio_sql_schema_extract\` to verify the target schema matches expectations. If anything is still missing, continue executing until the task is truly complete.

## Tool Usage Pattern

**At session start — gather context before acting:**
1. \`studio_sql_schema_extract\` / \`studio_ducklake_schema_extract\` — understand what tables/columns/views exist in source and target schemas.
2. \`studio_monaco_read\` — read the user's current SQL in the editor.
3. Compute the diff yourself: determine exactly which objects need to be created/copied.

**For each SQL statement to execute (loop until ALL are done):**
1. \`studio_sql_query\` / \`studio_ducklake_query\` — submit the single SQL statement. This automatically appends it to the Monaco editor so the user can see it. Do NOT use \`studio_monaco_update\` just to show the SQL before running it.
2. \`studio_sql_get_agent_run_result\` — read the definitive result (success / error / command). **Always call this immediately after studio_sql_query.**
3. If the result is **error**: diagnose the error, fix the SQL, and re-run. Do NOT give up after one error — retry with corrected SQL.
4. If the result is **success or command**: immediately proceed to the next statement. Do NOT stop to report progress.
5. If an object **already exists** (e.g. table already copied): skip it silently and move on.
6. Repeat for every remaining item until ALL are done.

**Only after ALL items are complete:** produce a single final summary listing what was done, what succeeded, and any errors that were unrecoverable.

## Guidelines

1. Always explore schema first so you know exactly what needs to be done.
2. For multi-object tasks (copy all tables, copy all views, etc.), loop through ALL items without pausing.
3. Call \`studio_sql_get_agent_run_result\` after every single \`studio_sql_query\` call.
4. Only use \`studio_monaco_update\` to correct a broken SQL statement — not for normal query submission.
5. Briefly narrate the next inspection, execution, or verification step before using tools so the user can follow the run in real time.
6. Prefer read-only operations unless the user explicitly requests writes.
7. For DML/DDL operations, proceed directly — the execution tool has a built-in approval gate that will automatically request user confirmation before running. Do NOT ask for approval in the chat.
7. **No Suggestions**: Your users are Data Engineers. Do NOT suggest what to do next. Do NOT ask "Would you like me to...?". Just explain what you have done.
8. **Concise Reporting**: Be brief and professional. Do NOT add conversational filler.`;

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
