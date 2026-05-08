import { tool } from 'ai';
import { z } from 'zod';

import AgentService from '../../../agent.service';
import ConnectorsService from '../../../connectors.service';
import DuckLakeService from '../../../duckLake.service';
import { AgentEditorBridgeService } from '../../agentEditorBridge.service';
import { truncateToolResult } from '../../tokenEstimator';
import { TerminalConfirmGate } from '../terminalConfirmGate';
import { isToolEnabled } from '../toolRegistry';

const STUDIO_DUCKLAKE_SCHEMA_EXTRACT_FLAG = 'studio.ducklake.schema_extract';
const STUDIO_DUCKLAKE_QUERY_FLAG = 'studio.ducklake.query';
const DEFAULT_MAX_OUTPUT_TOKENS = 3_000;

async function resolveDuckLakeInstanceId(
  conversationId: number,
  explicitInstanceId?: string,
): Promise<string> {
  if (explicitInstanceId?.trim()) {
    return explicitInstanceId.trim();
  }

  const context = AgentService.getAgentContext(conversationId);
  if (!context?.connectionId) {
    throw new Error(
      'DuckLake instanceId is required when no DuckLake connection is bound to this conversation',
    );
  }

  // If the connectionId is in 'ducklake-{instanceId}' format (set by SQL screen)
  // extract the instanceId directly without a DB lookup
  if (context.connectionId.startsWith('ducklake-')) {
    return context.connectionId.replace(/^ducklake-/, '');
  }

  const connectionModel = await ConnectorsService.getConnectionById(
    context.connectionId,
  );
  const connection = connectionModel?.connection as
    | {
        type?: string;
        instanceId?: string;
      }
    | undefined;

  if (connection?.type !== 'ducklake' || !connection.instanceId) {
    throw new Error(
      'Active connection is not a DuckLake connection. Provide instanceId explicitly.',
    );
  }

  return connection.instanceId;
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
    'RENAME',
    'GRANT',
    'REVOKE',
    'COPY',
    'VACUUM',
    'CALL',
    'CHECKPOINT',
  ].includes(verb);
}

export function createStudioDuckLakeTools(conversationId: number) {
  const schemaExtractEnabled = isToolEnabled(
    STUDIO_DUCKLAKE_SCHEMA_EXTRACT_FLAG,
  );
  const queryEnabled = isToolEnabled(STUDIO_DUCKLAKE_QUERY_FLAG);
  if (!schemaExtractEnabled && !queryEnabled) {
    return {};
  }

  const tools: Record<string, any> = {};

  if (schemaExtractEnabled) {
    tools.studio_ducklake_schema_extract = tool({
      description:
        'Extract DuckLake schema (schemas, tables, columns, and views) for the active DuckLake instance.',
      inputSchema: z.object({
        instanceId: z
          .string()
          .optional()
          .describe(
            'Optional DuckLake instance ID. If omitted, the tool uses the current conversation DuckLake connection.',
          ),
      }),
      execute: async ({ instanceId }) => {
        const startedAt = Date.now();
        try {
          const resolvedInstanceId = await resolveDuckLakeInstanceId(
            conversationId,
            instanceId,
          );
          const schema =
            await DuckLakeService.extractSchema(resolvedInstanceId);

          const schemaCount = Array.isArray((schema as any)?.schemas)
            ? (schema as any).schemas.length
            : 0;
          const tableCount = Array.isArray((schema as any)?.schemas)
            ? (schema as any).schemas.reduce((acc: number, s: any) => {
                const tables = Array.isArray(s?.tables) ? s.tables.length : 0;
                return acc + tables;
              }, 0)
            : 0;

          const payload = {
            instanceId: resolvedInstanceId,
            schema,
            schemaCount,
            tableCount,
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
              instanceId: resolvedInstanceId,
              schemaCount,
              tableCount,
              truncated,
            },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to extract DuckLake schema',
            meta: {
              duration: Date.now() - startedAt,
            },
          };
        }
      },
    });
  }

  if (queryEnabled) {
    tools.studio_ducklake_query = tool({
      description:
        'Write a SQL query to the active DuckLake SQL editor and trigger execution (equivalent to pressing the Run button). ' +
        'The query runs in the UI — results appear in the Query Result panel instantly. ' +
        'DML/DDL statements require explicit user approval before execution. ' +
        'Do NOT use this tool to fetch data into context — use studio_ducklake_schema_extract to inspect schema.',
      inputSchema: z.object({
        sql: z
          .string()
          .min(1)
          .describe(
            'SQL statement to write and execute in the DuckLake SQL editor',
          ),
        instanceId: z
          .string()
          .optional()
          .describe(
            'Optional DuckLake instance ID. If omitted, resolved from active conversation connection.',
          ),
      }),
      execute: async ({ sql, instanceId }) => {
        const startedAt = Date.now();
        try {
          const resolvedInstanceId = await resolveDuckLakeInstanceId(
            conversationId,
            instanceId,
          );

          const context = AgentService.getAgentContext(conversationId);

          // Step 1 — Write the SQL to the Monaco editor so the user can see it
          try {
            const readRes =
              await AgentService.requestSqlEditorRead(conversationId);
            const currentContent = readRes.content || '';
            // Strip trailing semicolons to avoid chaining errors
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
              '[AgentService][DuckLakeQuery] Failed to write query to Monaco Editor:',
              e,
            );
          }

          // Step 2 — For destructive/mutating statements, ask the user before executing
          if (isMutationSql(sql)) {
            if (!context) {
              return {
                ok: false,
                error:
                  'Agent context lost — cannot request approval for mutating DuckLake query.',
                meta: {
                  duration: Date.now() - startedAt,
                  instanceId: resolvedInstanceId,
                },
              };
            }
            const allowed = await TerminalConfirmGate.request({
              event: context.event,
              conversationId,
              toolName: 'studio_ducklake_query',
              command: `⚠️ This is a DML/DDL operation that will modify your DuckLake database.\n\n${sql}`,
              cwd: `ducklake:${resolvedInstanceId}`,
            });
            if (!allowed) {
              return {
                ok: false,
                error: 'Query denied by user',
                meta: {
                  duration: Date.now() - startedAt,
                  instanceId: resolvedInstanceId,
                  requiresApproval: true,
                },
              };
            }
          }

          // Step 3 — Delegate actual execution to the frontend SQL Editor.
          // recordQueryFired() must be called BEFORE requestSqlEditorRun so the
          // push timestamp from the renderer is guaranteed to be > lastQueryFiredAt.
          AgentEditorBridgeService.recordQueryFired();
          AgentService.requestSqlEditorRun(conversationId, sql);

          return {
            ok: true,
            message:
              'Query written to the SQL editor and execution triggered. ' +
              'Now call studio_sql_get_agent_run_result to read the outcome (rows returned, rows affected, or error).',
            meta: {
              duration: Date.now() - startedAt,
              instanceId: resolvedInstanceId,
              sql,
            },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to dispatch query to editor',
            meta: { duration: Date.now() - startedAt },
          };
        }
      },
    });
  }

  return tools;
}
