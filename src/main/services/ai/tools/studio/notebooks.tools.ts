import { tool } from 'ai';
import { z } from 'zod';
import AgentService from '../../../agent.service';
import { truncateToolResult } from '../../tokenEstimator';
import { TerminalConfirmGate } from '../terminalConfirmGate';
import { isMutationSql } from './sql.tools';

const DEFAULT_MAX_OUTPUT_TOKENS = 4000;

export function createStudioNotebooksTools(conversationId: number) {
  return {
    notebooks_get_state: tool({
      description:
        'Get the current state of the notebook, including all cell IDs and types.',
      inputSchema: z.object({}),
      execute: async () => {
        const startedAt = Date.now();
        try {
          const response =
            await AgentService.requestNotebookState(conversationId);
          // Strip internal IPC wrapper fields from the LLM's view
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { requestId, success, ...cleanState } = response as any;
          return {
            ok: true,
            data: cleanState,
            meta: { duration: Date.now() - startedAt },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to get notebook state',
            meta: { duration: Date.now() - startedAt },
          };
        }
      },
    }),

    notebooks_cell_read: tool({
      description: 'Read the content of a specific notebook cell.',
      inputSchema: z.object({
        cellId: z.string().describe('The ID of the cell to read'),
      }),
      execute: async ({ cellId }) => {
        const startedAt = Date.now();
        try {
          const response = await AgentService.requestNotebookCellRead(
            conversationId,
            cellId,
          );
          const content = response.content ?? '';
          return {
            ok: true,
            data: { content, length: content.length },
            output: truncateToolResult(content, DEFAULT_MAX_OUTPUT_TOKENS),
            meta: { duration: Date.now() - startedAt },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error ? error.message : 'Failed to read cell',
            meta: { duration: Date.now() - startedAt },
          };
        }
      },
    }),

    notebooks_cell_add: tool({
      description:
        'Create a new SQL cell at the end of the notebook with the given content.',
      inputSchema: z.object({
        content: z.string().describe('The SQL content for the new cell'),
      }),
      execute: async ({ content }) => {
        const startedAt = Date.now();
        try {
          const { cellId } = await AgentService.requestNotebookCellAdd(
            conversationId,
            content,
          );
          return {
            ok: true,
            data: { cellId },
            meta: { duration: Date.now() - startedAt },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error ? error.message : 'Failed to add cell',
            meta: { duration: Date.now() - startedAt },
          };
        }
      },
    }),

    notebooks_cell_update: tool({
      description: 'Update the content of a specific notebook cell.',
      inputSchema: z.object({
        cellId: z.string().describe('The ID of the cell to update'),
        content: z.string().describe('The new content for the cell'),
      }),
      execute: async ({ cellId, content }) => {
        const startedAt = Date.now();
        try {
          const response = await AgentService.requestNotebookCellUpdate(
            conversationId,
            cellId,
            content,
          );
          return {
            ok: true,
            data: { applied: response.applied },
            meta: { duration: Date.now() - startedAt },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error ? error.message : 'Failed to update cell',
            meta: { duration: Date.now() - startedAt },
          };
        }
      },
    }),

    notebooks_cell_run: tool({
      description:
        'Run/Execute a specific notebook cell. This triggers execution in the frontend.',
      inputSchema: z.object({
        cellId: z.string().describe('The ID of the cell to run'),
      }),
      execute: async ({ cellId }) => {
        const startedAt = Date.now();
        try {
          const context = AgentService.getAgentContext(conversationId);
          if (!context) {
            return {
              ok: false,
              error: 'No active connection found',
              meta: { duration: Date.now() - startedAt },
            };
          }

          // Step 1: Read the cell content to check if it's a mutation
          const readRes = await AgentService.requestNotebookCellRead(
            conversationId,
            cellId,
          );

          if (readRes.content && isMutationSql(readRes.content)) {
            const allowed = await TerminalConfirmGate.request({
              event: context.event,
              conversationId,
              toolName: 'notebooks_cell_run',
              command: `⚠️ This is a DML/DDL operation that will modify your database.\n\n${readRes.content}`,
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

          await AgentService.requestNotebookCellRun(conversationId, cellId);
          return {
            ok: true,
            data: { status: 'triggered' },
            meta: { duration: Date.now() - startedAt },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error ? error.message : 'Failed to run cell',
            meta: { duration: Date.now() - startedAt },
          };
        }
      },
    }),

    notebooks_cell_result: tool({
      description: 'Get the last execution result of a specific notebook cell.',
      inputSchema: z.object({
        cellId: z.string().describe('The ID of the cell to get results for'),
      }),
      execute: async ({ cellId }) => {
        const startedAt = Date.now();
        try {
          const response = await AgentService.requestNotebookCellResult(
            conversationId,
            cellId,
          );
          const { result } = response;
          const raw = JSON.stringify(result);
          return {
            ok: true,
            data: result,
            output: truncateToolResult(raw, DEFAULT_MAX_OUTPUT_TOKENS),
            meta: { duration: Date.now() - startedAt },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to get cell result',
            meta: { duration: Date.now() - startedAt },
          };
        }
      },
    }),
  };
}
