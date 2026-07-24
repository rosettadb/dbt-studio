import { ToolLoopAgent, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import type { BaseAgentConfig } from './baseAgentConfig';
import { createStudioConnectionsTools } from '../tools/studio/connections.tools';
import { createStudioDuckLakeTools } from '../tools/studio/ducklake.tools';
import { createStudioAnalyticsPagesTools } from '../tools/studio/analyticsPages.tools';
import {
  createStudioSqlTools,
  createSqlResultInspectorTools,
} from '../tools/studio/sql.tools';
import { AnalyticsPagesService } from '../../analyticsPages.service';
import { TOOL_FLAGS } from '../tools/toolRegistry';
import { evidenceComponentRef } from './analyticsAgent.prompts';
import { composeAgentRuntime } from './composeAgentRuntime';
import { createDbtTools } from '../tools/dbt.tools';
import { createFilesystemTools } from '../tools/filesystem.tools';
import { EnrichedConnectionMeta } from './agentTypes';

export interface AnalyticsAgentOptions {
  connectionMeta: EnrichedConnectionMeta;
  connectionId?: string;
  pageId?: string; // Currently open analytics page
  enabledTools: Record<string, any>;
  skills: string;
  conversationId: number;
  toolMode: 'chat' | 'agent';
}

async function buildAnalyticsPageContextSummary(
  connectionId: string,
  pageId: string,
): Promise<string> {
  try {
    const page = await AnalyticsPagesService.get(connectionId, pageId);
    if (!page) return '';

    let summary = `\n## Active Analytics Page: ${page.title}\n`;
    summary += `Route Path: ${page.routePath}\n`;
    summary += `Page ID: ${page.id}\n`;
    if (page.markdownContent) {
      const preview = page.markdownContent.substring(0, 200);
      summary += `\nContent Preview:\n${preview}${page.markdownContent.length > 200 ? '...' : ''}\n`;
    }
    return summary;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      '[AnalyticsAgent] Failed to build page context summary:',
      error,
    );
    return '\n## Active Analytics Page\n(Metadata summary unavailable)\n';
  }
}

export async function createAnalyticsAgent(
  base: BaseAgentConfig,
  options: AnalyticsAgentOptions,
) {
  const { connectionMeta, connectionId, pageId, enabledTools, skills } =
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

  let pageSummary = '';
  if (connectionId && pageId) {
    pageSummary = await buildAnalyticsPageContextSummary(connectionId, pageId);
  }

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
    ? `You are an expert AI assistant for Analytics dashboards in dbt Studio. You are running in **Ask (read-only) mode**.

## Active Connection

Name: ${connectionMeta.name}
Type: ${connectionMeta.type}${databaseBlock}${connectionHints}
${linkedProjectBlock}
${pageSummary}

## Ask Mode Constraints

You are in **Ask mode**. You can only read and analyze — you CANNOT write, modify, or execute anything.
Available tools: schema exploration, reading analytics page content, listing connections.
NOT available: Modifying page Markdown, modifying component props, executing SQL.

If the user asks you to create, modify, or execute something, explain what you would do, but clearly state they need to switch to **Code mode** to do it.

${skills ?? ''}
${mcpToolsList}

## Guidelines

1. Explore schema to answer questions accurately.
2. Read the page summary to understand the user's current dashboard context.
3. Provide suggestions and explanations in your response text — do NOT attempt to use modifying tools.
4. Explicitly tell the user to switch to **Code mode** if they want to run or apply changes.`
    : `You are an expert data engineering assistant in the Analytics screen of dbt Studio.
Your goal is to help the user create and maintain Evidence-style analytics dashboards backed by real SQL queries.

## Active Connection

Name: ${connectionMeta.name}
Type: ${connectionMeta.type}${databaseBlock}${connectionHints}
${linkedProjectBlock}
${pageSummary}

## Intent Gate
Before using any tool, classify the user's request:
- **Simple chat / acknowledgement / session check**: reply directly. Do not use tools. Examples: "say page A session ready", "hello", "are you there?", "thanks".
- **Read-only analysis**: use read/schema/list tools only when the user explicitly asks to inspect, read, explain, summarize, compare, or debug.
- **Write/run workflow**: use write/run tools only when the user explicitly asks to create, add, build, generate, update, edit, run, verify, or fix analytics content.

If the request is simple chat, stop after answering. Do not inspect schema, do not read the page, do not write the page, and do not run queries.

## Capabilities & Workflow
Use this workflow only for explicit dashboard creation/editing/running tasks:
1. **Read the Active Page First**: Use \`analytics_active_page_read\` before any write. This reads live Monaco content, including unsaved changes.
2. **Inspect Schema**: Use \`studio_sql_schema_extract\` / \`studio_ducklake_schema_extract\` when creating or changing SQL.
3. **Use Stored Pages as Context Only**: Use \`analytics_pages_list\` and \`analytics_page_db_read\` only to inspect sibling pages on the same connection. Do not edit non-active pages.
4. **Design and Test SQL**: Use \`studio_sql_query\` / \`studio_ducklake_query\` for non-mutating test queries, then read the output with \`studio_sql_get_agent_run_result\`.
5. **Write the Active Page**: Use \`analytics_active_page_write\` to update the live Monaco Markdown.
6. **Run the Active Page**: Use \`analytics_active_page_run\`.
7. **Inspect UI Results**: Use \`analytics_active_page_get_results\`.
8. **Fix and Rerun**: If any SQL block has status \`error\`, fix the SQL/Markdown, write again, run again, and inspect results again.

## Analytics Page Format
- Pages are Evidence-style Markdown files combining SQL blocks (\`\`\`sql query_name\`) and JSX component tags.
- Each \`\`\`sql query_name\` block defines a named dataset accessible to components via \`data={query_name}\`.
- Write complete, correct SQL — the query runs against the active database connection.
- Never write a SQL block without immediately following it with a component that renders it (e.g. DataTable, a chart, Value). Raw SQL alone is not a valid page.

${evidenceComponentRef}

## Behavioral Rules
- **Respect User Intent**: Do exactly what the user asked, and no more. Do not proactively create dashboards, queries, charts, or page content.
- **No Unrequested Writes**: Never call \`analytics_active_page_write\` unless the user explicitly asks to create, add, build, generate, update, edit, fix, or otherwise change the active page.
- **No Unrequested Runs**: Never call \`analytics_active_page_run\` unless the user explicitly asks to run, verify, test, fix, or create/edit content that requires verification.
- **No Tools for Simple Replies**: For "say X", greetings, and session readiness checks, answer directly without tools.
- **No Suggestions**: Do NOT ask "Would you like me to...?" or "What would you like to do next?". Be direct and complete the task.
- **Concise Reporting**: Briefly report what you have done. No conversational filler.
- **Always read before writing**: Call \`analytics_active_page_read\` first if a page already exists, to avoid overwriting user content unintentionally.
- **Active page source of truth**: Use active-page tools for the currently open page. They already know the active connectionId and pageId from session context; do not ask the user for those IDs.
- **Stored pages are context only**: Use \`analytics_pages_list\` and \`analytics_page_db_read\` only to inspect other pages on the same connection.
- **No manual IDs for active page**: Never ask the user for the active page ID or active connection ID. The active-page tools infer them from the current Analytics session.
- **Verify before final answer**: Do not give a final success response until you have run the page and inspected \`analytics_active_page_get_results\`, unless the user explicitly asked for read-only analysis.

${skills ?? ''}
${mcpToolsList}`;

  const isDuckLake = connectionMeta.type === 'ducklake';

  const studioAnalyticsTools: Record<string, any> = {
    ...createStudioConnectionsTools(),
    ...(isDuckLake
      ? createStudioDuckLakeTools(options.conversationId)
      : createStudioSqlTools(options.conversationId)),
    ...createSqlResultInspectorTools(options.conversationId),
    ...createStudioAnalyticsPagesTools(options.conversationId),
  };

  const READ_ONLY_TOOLS = [
    'studio_sql_schema_extract',
    'studio_ducklake_schema_extract',
    'studio_connections_list',
    'studio_sql_get_query_results',
    'studio_sql_get_agent_run_result',
    'analytics_active_page_read',
    'analytics_active_page_get_results',
    'analytics_pages_list',
    'analytics_page_db_read',
    'readDbtModel',
    'listDbtModels',
    'getDbtLogs',
    'listDirectory',
    'readFile',
    'pathExists',
  ];

  // If a dbt project is linked, create the pure NodeJS filesystem/DBT tools
  const linkedProjectPath = connectionMeta.linkedDbtProject?.path;
  const projectTools: Record<string, any> = linkedProjectPath
    ? {
        ...createDbtTools(linkedProjectPath, undefined, base.mainWindow),
        ...createFilesystemTools(linkedProjectPath),
      }
    : {};

  const makeAskModeStub = (toolName: string): any => {
    return tool({
      description: `[ASK MODE] ${toolName} is not available. Inform the user to switch to Code mode.`,
      inputSchema: z.object({}),
      execute: async () => ({
        error: `"${toolName}" is not available in Ask mode. To modify analytics pages or execute queries, please switch to Code mode using the mode selector at the bottom of the chat.`,
      }),
    } as any);
  };

  const baseTools: Record<string, any> = {};

  // Combine native UI tools and project filesystem tools
  const allAvailableTools = { ...studioAnalyticsTools, ...projectTools };

  Object.entries(allAvailableTools).forEach(([name, toolDef]) => {
    const isEnabledInRegistry =
      (TOOL_FLAGS as Record<string, boolean>)[name] !== false;
    const isUI = name in studioAnalyticsTools;
    const isAllowedProjectTool = enabledTools && enabledTools[name];

    if (isEnabledInRegistry && ((isUI && enabledTools?.[name] !== false) || isAllowedProjectTool)) {
      if (isAskMode && !READ_ONLY_TOOLS.includes(name)) {
        baseTools[name] = makeAskModeStub(name);
      } else {
        baseTools[name] = toolDef as any;
      }
    }
  });

  // Analytics agent needs enough steps for read → schema/query → write → run → inspect/fix.
  const maxSteps = Math.max(base.maxSteps, 6);
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
