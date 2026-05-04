import { tool } from 'ai';
import { z } from 'zod';

import AgentService from '../../../agent.service';
import ConnectorsService from '../../../connectors.service';
import { truncateToolResult } from '../../tokenEstimator';
import { TerminalConfirmGate } from '../terminalConfirmGate';
import { isToolEnabled } from '../toolRegistry';

const STUDIO_SQL_SCHEMA_EXTRACT_FLAG = 'studio.sql.schema_extract';
const STUDIO_SQL_QUERY_FLAG = 'studio.sql.query';
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
  const withoutComments = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim();
  const match = withoutComments.match(/^([A-Za-z]+)/);
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

export function createStudioSqlTools(conversationId: number) {
  const schemaExtractEnabled = isToolEnabled(STUDIO_SQL_SCHEMA_EXTRACT_FLAG);
  const queryEnabled = isToolEnabled(STUDIO_SQL_QUERY_FLAG);
  if (!schemaExtractEnabled && !queryEnabled) {
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

          const filteredTables = filterSchemaTables(
            Array.isArray(schema?.tables) ? schema.tables : [],
            tableFilter,
          );

          const payload = {
            connectionId: context.connectionId,
            tables: filteredTables,
            tableCount: filteredTables.length,
          };

          const raw = JSON.stringify(payload);
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

          // Step 3 — Delegate actual execution to the frontend SQL Editor
          AgentService.requestSqlEditorRun(conversationId, sql);

          return {
            ok: true,
            output:
              'Query submitted to the UI for execution. Wait for the user to confirm the results.',
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

  return tools;
}
