import { tool } from 'ai';
import { z } from 'zod';

import AgentService from '../../../agent.service';
import ConnectorsService from '../../../connectors.service';
import { AgentEditorBridgeService } from '../../agentEditorBridge.service';
import { truncateToolResult } from '../../tokenEstimator';
import { TerminalConfirmGate } from '../terminalConfirmGate';
import { isToolEnabled } from '../toolRegistry';
import type { QueryResultSnapshot } from '../../../../../types/backend';

const STUDIO_SQL_SCHEMA_EXTRACT_FLAG = 'studio.sql.schema_extract';
const STUDIO_SQL_QUERY_FLAG = 'studio.sql.query';
const STUDIO_SQL_GET_RESULTS_FLAG = 'studio.sql.get_query_results';
const STUDIO_SQL_GET_AGENT_RUN_RESULT_FLAG = 'studio.sql.get_agent_run_result';
const DEFAULT_MAX_OUTPUT_TOKENS = 3_000;

function normalizeFilter(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

function filterSchemaTables(tables: any[], tableFilter?: string): any[] {
  const normalized = normalizeFilter(tableFilter);
  if (!normalized) {
    return tables;
  }

  return tables.filter((table) => {
    const name = String(table?.name ?? table?.tableName ?? '').toLowerCase();
    const schema = String(
      table?.schema ?? table?.schemaName ?? '',
    ).toLowerCase();
    const fullyQualified = `${schema}.${name}`;
    return (
      name.includes(normalized) ||
      schema.includes(normalized) ||
      fullyQualified.includes(normalized)
    );
  });
}

function getFirstSqlVerb(sql: string): string {
  // 1. Strip comments
  const withoutComments = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim();

  // 2. Strip leading WITH clauses (CTEs) to find the actual verb
  let searchSql = withoutComments;
  if (withoutComments.toUpperCase().startsWith('WITH')) {
    let depth = 0;
    let i = 0;
    const upper = withoutComments.toUpperCase();

    // Skip WITH [RECURSIVE]
    if (upper.startsWith('WITH RECURSIVE')) i = 14;
    else i = 4;

    while (i < withoutComments.length) {
      // Skip whitespace
      while (i < withoutComments.length && /\s/.test(withoutComments[i]))
        i += 1;
      // Expect CTE name
      while (
        i < withoutComments.length &&
        /[A-Za-z0-9_]/.test(withoutComments[i])
      )
        i += 1;
      // Skip whitespace
      while (i < withoutComments.length && /\s/.test(withoutComments[i]))
        i += 1;
      // Expect AS
      if (withoutComments.substring(i, i + 2).toUpperCase() === 'AS') i += 2;
      // Skip whitespace
      while (i < withoutComments.length && /\s/.test(withoutComments[i]))
        i += 1;
      // Expect ( ... )
      if (withoutComments[i] === '(') {
        i += 1;
        depth = 1;
        while (i < withoutComments.length && depth > 0) {
          if (withoutComments[i] === '(') depth += 1;
          else if (withoutComments[i] === ')') depth -= 1;
          i += 1;
        }
      }
      // Skip whitespace
      while (i < withoutComments.length && /\s/.test(withoutComments[i]))
        i += 1;
      // If comma, there's another CTE
      if (withoutComments[i] === ',') i += 1;
      else break;
    }
    searchSql = withoutComments.substring(i).trim();
  }

  const match = searchSql.match(/^([A-Za-z]+)/);
  return match?.[1]?.toUpperCase() ?? '';
}

function isMutationSql(sql: string): boolean {
  const verb = getFirstSqlVerb(sql);
  return [
    'INSERT',
    'UPDATE',
    'DELETE',
    'MERGE',
    'TRUNCATE',
    'CREATE',
    'ALTER',
    'DROP',
    'REPLACE',
    'GRANT',
    'REVOKE',
  ].includes(verb);
}

/**
 * Formats a QueryResultSnapshot into a compact, human-readable summary for the LLM.
 * Enforces token safety: rows are already capped by maxRows in the IPC service;
 * individual rows are truncated at 300 chars to prevent runaway output.
 */
function formatQueryResultSummary(snapshot: QueryResultSnapshot): string {
  switch (snapshot.status) {
    case 'pending':
      return 'No query results available yet. Run a query first using studio_sql_query or studio_ducklake_query.';

    case 'error':
      return [
        `Query failed: ${snapshot.error ?? 'Unknown error'}`,
        snapshot.sql ? `SQL: ${snapshot.sql.slice(0, 500)}` : '',
      ]
        .filter(Boolean)
        .join('\n');

    case 'command':
      return [
        'Command executed successfully',
        snapshot.commandType ? `(${snapshot.commandType})` : '',
        snapshot.rowsAffected !== undefined
          ? `\u2014 ${snapshot.rowsAffected} row(s) affected`
          : '',
        snapshot.duration !== undefined
          ? `\nDuration: ${snapshot.duration}ms`
          : '',
      ]
        .filter(Boolean)
        .join(' ');

    case 'empty':
      return [
        'Query returned 0 rows.',
        `Columns: ${snapshot.columns.join(', ')}`,
        `Duration: ${snapshot.duration ?? '?'}ms`,
      ].join('\n');

    default: {
      // 'success'
      const lines = [
        `Query Results (${snapshot.totalRowCount} rows total, showing first ${snapshot.rows.length}):`,
        `Columns: ${snapshot.columns.join(', ')}`,
        '---',
        ...snapshot.rows.map((row, i) => {
          const s = JSON.stringify(row, (_, v) =>
            typeof v === 'bigint' ? v.toString() : v,
          );
          return `Row ${
            i + 1
          }: ${s.length > 300 ? `${s.slice(0, 297)}...` : s}`;
        }),
      ];
      if (snapshot.truncated) {
        lines.push(
          `\n[Truncated \u2014 ${
            snapshot.totalRowCount - snapshot.rows.length
          } more rows not shown. Use maxRows param (max 50) to see more.]`,
        );
      }
      if (snapshot.duration !== undefined) {
        lines.push(`\nDuration: ${snapshot.duration}ms`);
      }
      return lines.join('\n');
    }
  }
}

/**
 * Shared factory for the studio_sql_get_query_results tool.
 * Extracted so both createStudioSqlTools and createSqlResultInspectorTools use
 * a single implementation — any future change to the tool only needs one edit.
 */
function buildGetQueryResultsTool(conversationId: number) {
  return tool({
    description:
      'Read the current query results visible in the SQL Editor result pane. ' +
      'Use this AFTER running a query (via studio_sql_query or studio_ducklake_query) ' +
      'to inspect the output. Returns a compact summary: columns, first N rows ' +
      '(max 50), total row count, execution duration, and any error message. ' +
      'Does NOT re-execute the query.',
    inputSchema: z.object({
      tabId: z
        .string()
        .optional()
        .describe(
          'Optional SQL tab ID. Defaults to the most recently executed tab.',
        ),
      maxRows: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe(
          'Max rows to include in the summary (1\u201350, default 20).',
        ),
    }),
    execute: async ({ tabId, maxRows }) => {
      const startedAt = Date.now();
      try {
        const context = AgentService.getAgentContext(conversationId);
        if (!context?.event) {
          return {
            ok: false,
            error: 'No agent context available — cannot reach the SQL Editor.',
            meta: { duration: Date.now() - startedAt },
          };
        }
        const snapshot = await AgentEditorBridgeService.getQueryResults(
          context.event,
          { tabId, maxRows: maxRows ?? 20 },
        );
        return {
          ok: true,
          output: formatQueryResultSummary(snapshot),
          meta: {
            duration: Date.now() - startedAt,
            status: snapshot.status,
            totalRowCount: snapshot.totalRowCount,
          },
        };
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[studio_sql_get_query_results]', error);
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to read query results',
          meta: { duration: Date.now() - startedAt },
        };
      }
    },
  });
}

export function createStudioSqlTools(conversationId: number) {
  const schemaExtractEnabled = isToolEnabled(STUDIO_SQL_SCHEMA_EXTRACT_FLAG);
  const queryEnabled = isToolEnabled(STUDIO_SQL_QUERY_FLAG);
  const getResultsEnabled = isToolEnabled(STUDIO_SQL_GET_RESULTS_FLAG);

  if (!schemaExtractEnabled && !queryEnabled && !getResultsEnabled) {
    return {};
  }

  const tools: Record<string, any> = {};

  if (schemaExtractEnabled) {
    tools.studio_sql_schema_extract = tool({
      description:
        'Extract schema (tables and columns) for the active SQL connection in DBT Studio. Optionally filter by table/schema name substring.',
      inputSchema: z.object({
        tableFilter: z
          .string()
          .optional()
          .describe(
            'Optional case-insensitive table/schema substring filter (e.g. "orders", "public.orders")',
          ),
      }),
      execute: async ({ tableFilter }) => {
        const startedAt = Date.now();

        try {
          const context = AgentService.getAgentContext(conversationId);
          if (!context?.connectionId) {
            return {
              ok: false,
              error:
                'No active SQL connection found in agent context. Please open SQL chat from a selected connection.',
              meta: {
                duration: Date.now() - startedAt,
              },
            };
          }

          const schema = await ConnectorsService.extractSchemaFromConnection(
            context.connectionId.toString(),
          );

          if ((schema as any)?.error) {
            return {
              ok: false,
              error: `Failed to extract schema: ${(schema as any).error}`,
              meta: {
                duration: Date.now() - startedAt,
                connectionId: context.connectionId,
              },
            };
          }

          const filteredTables = filterSchemaTables(
            Array.isArray(schema?.tables) ? schema.tables : [],
            tableFilter,
          );

          const payload = {
            connectionId: context.connectionId,
            tables: filteredTables,
            tableCount: filteredTables.length,
          };

          const raw = JSON.stringify(payload, (_, v) =>
            typeof v === 'bigint' ? v.toString() : v,
          );
          const output = truncateToolResult(raw, DEFAULT_MAX_OUTPUT_TOKENS);
          const truncated = output !== raw;

          return {
            ok: true,
            ...(truncated ? {} : { data: payload }),
            output,
            meta: {
              duration: Date.now() - startedAt,
              tableCount: filteredTables.length,
              truncated,
            },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to extract SQL schema',
            meta: {
              duration: Date.now() - startedAt,
            },
          };
        }
      },
    });
  }

  if (queryEnabled) {
    tools.studio_sql_query = tool({
      description:
        'Execute SQL against the active DBT Studio SQL connection. DML/DDL statements require explicit user approval.',
      inputSchema: z.object({
        sql: z
          .string()
          .min(1)
          .describe('The SQL statement to execute on the active connection'),
      }),
      execute: async ({ sql }) => {
        const startedAt = Date.now();

        try {
          const context = AgentService.getAgentContext(conversationId);
          if (!context?.connectionId) {
            return {
              ok: false,
              error:
                'No active SQL connection found in agent context. Please open SQL chat from a selected connection.',
              meta: {
                duration: Date.now() - startedAt,
              },
            };
          }

          // Step 1 — Append the SQL to the Monaco editor so the user can see it
          try {
            const readRes =
              await AgentService.requestSqlEditorRead(conversationId);
            const currentContent = readRes.content || '';
            const trimmedContent = currentContent.replace(/;\s*$/, '').trim();
            const normalizedSql = sql.trim().replace(/;\s*$/, '');
            if (!currentContent.includes(normalizedSql)) {
              const newContent = trimmedContent
                ? `${trimmedContent};\n\n${normalizedSql}`
                : normalizedSql;
              await AgentService.requestSqlEditorUpdate(
                conversationId,
                newContent,
              );
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn(
              '[AgentService][SqlQuery] Failed to write query to Monaco editor:',
              e,
            );
          }

          // Step 2 — For destructive/mutating statements, ask the user before executing
          if (isMutationSql(sql)) {
            const allowed = await TerminalConfirmGate.request({
              event: context.event,
              conversationId,
              toolName: 'studio_sql_query',
              command: `⚠️ This is a DML/DDL operation that will modify your database.\n\n${sql}`,
              cwd: `connection:${context.connectionId}`,
            });

            if (!allowed) {
              return {
                ok: false,
                error: 'Query denied by user',
                meta: {
                  duration: Date.now() - startedAt,
                  requiresApproval: true,
                },
              };
            }
          }

          // Step 3 — Delegate actual execution to the frontend SQL Editor.
          // recordQueryFired() must be called BEFORE requestSqlEditorRun so the
          // push timestamp from the renderer is guaranteed to be > lastQueryFiredAt.
          AgentEditorBridgeService.recordQueryFired(conversationId.toString());
          AgentService.requestSqlEditorRun(conversationId, sql);

          return {
            ok: true,
            output:
              'Query submitted to the SQL Editor for execution. ' +
              'Now call studio_sql_get_agent_run_result to read the outcome (rows returned, rows affected, or error).',
            meta: {
              duration: Date.now() - startedAt,
              truncated: false,
            },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to execute query',
            meta: {
              duration: Date.now() - startedAt,
            },
          };
        }
      },
    });
  }

  if (getResultsEnabled) {
    tools.studio_sql_get_query_results =
      buildGetQueryResultsTool(conversationId);
  }

  return tools;
}

/**
 * Creates only the `studio_sql_get_query_results` result-inspector tool.
 *
 * This is exported separately so it can be included in BOTH the standard SQL
 * and DuckLake agent toolsets. The tool is connection-type agnostic — it reads
 * from QueryResultStore which is populated for all query types.
 *
 * Called from sqlAgent.ts outside the isDuckLake conditional.
 */
export function createSqlResultInspectorTools(
  conversationId: number,
): Record<string, any> {
  const tools: Record<string, any> = {};

  if (isToolEnabled(STUDIO_SQL_GET_RESULTS_FLAG)) {
    // Reuse the shared factory — single source of truth for this tool.
    tools.studio_sql_get_query_results =
      buildGetQueryResultsTool(conversationId);
  }

  if (isToolEnabled(STUDIO_SQL_GET_AGENT_RUN_RESULT_FLAG)) {
    tools.studio_sql_get_agent_run_result = tool({
      description:
        'Reads the result of the most recent SQL query triggered by the AI Agent ' +
        '(via studio_sql_query or studio_ducklake_query). ' +
        'The renderer pushes the outcome to the main process the moment execution ' +
        'completes, so this tool always returns the definitive success, error, or ' +
        'command result — without any race condition. ' +
        'Call this immediately after studio_sql_query / studio_ducklake_query.',
      inputSchema: z.object({
        tabId: z
          .string()
          .optional()
          .describe(
            'Optional SQL tab ID. Omit to read the most recent result from any tab.',
          ),
      }),
      execute: async ({ tabId }: { tabId?: string }) => {
        const startedAt = Date.now();
        // Wait for a fresh result — one whose push arrived after the query was fired.
        // Per-conversation keying prevents cross-tab races.
        const snapshot = await AgentEditorBridgeService.waitForRunResult(
          conversationId.toString(),
          tabId,
        );
        if (!snapshot) {
          return {
            ok: true,
            output:
              'No agent-triggered query result is available yet. ' +
              'The query may not have completed, or no query has been run in this session.',
            meta: { duration: Date.now() - startedAt, status: 'none' },
          };
        }
        return {
          ok: true,
          output: formatQueryResultSummary(snapshot),
          meta: {
            duration: Date.now() - startedAt,
            status: snapshot.status,
            totalRowCount: snapshot.totalRowCount,
          },
        };
      },
    });
  }

  return tools;
}
