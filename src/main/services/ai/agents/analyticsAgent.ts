import { ToolLoopAgent, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import type { BaseAgentConfig } from './baseAgentConfig';
import { createStudioConnectionsTools } from '../tools/studio/connections.tools';
import { createStudioDuckLakeTools } from '../tools/studio/ducklake.tools';
import { createStudioAnalyticsPagesTools } from '../tools/studio/analyticsPages.tools';
import { AnalyticsPagesService } from '../../analyticsPages.service';
import { TOOL_FLAGS } from '../tools/toolRegistry';

export interface AnalyticsAgentOptions {
  connectionMeta: { name: string; type: string };
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

  const evidenceComponentRef = `
## Evidence-Style Components Reference

Analytics pages use Evidence-style Markdown. SQL blocks define named datasets, and JSX-like components reference them:

### SQL Blocks
\`\`\`sql query_name
SELECT column1, column2 FROM my_table LIMIT 100
\`\`\`

### Available Components

**<BarChart data={query_name} x="column1" y="column2" />**
- Props: data (required), x (required), y (required), title, xLabel, yLabel, series, colorPalette

**<LineChart data={query_name} x="column1" y="column2" />**
- Props: data (required), x (required), y (required), title, xLabel, yLabel, series

**<DataTable data={query_name} />**
- Props: data (required), rows (default 10), search, sort, columns

**<BigValue data={query_name} value="column1" />**
- Props: data (required), value (required), title, fmt (number format string), comparison

**<PieChart data={query_name} name="label_col" value="value_col" />**
- Props: data (required), name (required), value (required), title, legend

### Page Frontmatter
---
title: My Dashboard
sidebar_position: 1
sidebar_badge: "New"
---
`;

  const systemInstructions = isAskMode
    ? `You are an expert AI assistant for Analytics dashboards in dbt Studio. You are running in **Ask (read-only) mode**.

## Active Connection

Name: ${connectionMeta.name}
Type: ${connectionMeta.type}${connectionHints}
${pageId ? `\n## Active Analytics Page\n\nPage ID: ${pageId}\n` : ''}${pageSummary}
${evidenceComponentRef}
## Ask Mode Constraints

You are in **Ask mode**. You can only read and analyze — you CANNOT execute queries or modify analytics pages.
If the user asks you to write or modify a page, explain what it would look like and tell them to switch to **Code mode**.

${skills ?? ''}
${mcpToolsList}`
    : `You are an expert data engineering assistant in the Analytics screen of dbt Studio.
Your goal is to help the user create and maintain Evidence-style analytics dashboards backed by real SQL queries.

## Capabilities & Workflow
1. **Inspect Schema**: Use schema tools to understand the database structure (tables, columns, types).
2. **Design the SQL**: Write SQL queries that return the data needed for each chart or table.
3. **Write the Page**: Use \`analytics_page_write\` to write Evidence-style Markdown that combines SQL blocks and chart components.
4. **Verify**: Use \`analytics_page_read\` to read back the written content and confirm correctness.

## Analytics Page Format
- Pages are Evidence-style Markdown files combining SQL blocks (\`\`\`sql query_name\`) and JSX component tags.
- Each \`\`\`sql query_name\` block defines a named dataset accessible to components via \`data={query_name}\`.
- Write complete, correct SQL — the query runs against the active database connection.

${evidenceComponentRef}

## Behavioral Rules
- **No Suggestions**: Do NOT ask "Would you like me to...?" or "What would you like to do next?". Be direct and complete the task.
- **Concise Reporting**: Briefly report what you have done. No conversational filler.
- **Always read before writing**: Call \`analytics_page_read\` first if a page already exists, to avoid overwriting user content unintentionally.

## Active Connection
Name: ${connectionMeta.name}
Type: ${connectionMeta.type}${connectionHints}
${pageId ? `\n## Active Analytics Page\n\nPage ID: ${pageId}\nConnection ID: ${connectionId}\n` : ''}${pageSummary}
${skills ?? ''}
${mcpToolsList}`;

  const studioAnalyticsTools: Record<string, any> = {
    ...createStudioConnectionsTools(),
    ...createStudioDuckLakeTools(options.conversationId),
    ...createStudioAnalyticsPagesTools(),
  };

  const READ_ONLY_TOOLS = [
    'studio_ducklake_schema_extract',
    'studio_connections_list',
    'analytics_page_read',
  ];

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
  Object.entries(studioAnalyticsTools).forEach(([name, toolDef]) => {
    const isEnabledInRegistry =
      (TOOL_FLAGS as Record<string, boolean>)[name] !== false;
    const isEnabledInMode = enabledTools?.[name] !== false;

    if (isEnabledInRegistry && isEnabledInMode) {
      if (isAskMode && !READ_ONLY_TOOLS.includes(name)) {
        baseTools[name] = makeAskModeStub(name);
      } else {
        baseTools[name] = toolDef as any;
      }
    }
  });

  // Analytics agent needs at least 2 steps: one to read/inspect, one to write and respond.
  const maxSteps = Math.max(base.maxSteps, 2);

  return new ToolLoopAgent({
    model: base.model as any,
    instructions: systemInstructions,
    tools: { ...baseTools, ...base.mcpTools, loadSkill: base.loadSkillTool },
    stopWhen: stepCountIs(maxSteps),
    prepareStep: base.prepareStep,
    onStepFinish: base.onStepFinish,
  });
}
