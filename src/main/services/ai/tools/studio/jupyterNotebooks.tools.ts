import { tool } from 'ai';
import { z } from 'zod';
import AgentService from '../../../agent.service';
import { PythonNotebookService } from '../../../pythonNotebook.service';
import { truncateToolResult } from '../../tokenEstimator';

const DEFAULT_MAX_OUTPUT_TOKENS = 4000;

/**
 * Phase 10 — Jupyter (Python) notebook tools for the Notebooks Agent.
 *
 * These mirror the SQL `notebooks_*` tool family but operate on the active
 * Jupyter notebook through the separate `agent:jupyter:*` renderer bridge.
 * Distinct names make the notebook kind explicit in every tool call.
 *
 * There is intentionally NO cell-run/execution tool in this phase: the agent
 * proposes cell changes and the user runs them in the notebook UI (Plan 65
 * §8 / Phase 10.4).
 */
export function createJupyterNotebooksTools(conversationId: number) {
  const kindMismatch = (toolName: string) => ({
    ok: false,
    error:
      `"${toolName}" requires an active Jupyter notebook. ` +
      `The current tab is a SQL-connection notebook — use the notebooks_* tools there instead.`,
  });

  const isJupyterContext = () =>
    AgentService.getAgentContext(conversationId)?.notebookKind === 'jupyter';

  return {
    jupyter_environment_status: tool({
      description:
        'Get the active Jupyter Python environment and installed package availability (Python version, kernel readiness, data packages). Call this before writing imports for third-party packages.',
      inputSchema: z.object({}),
      execute: async () => {
        const startedAt = Date.now();
        try {
          if (!isJupyterContext()) {
            return {
              ...kindMismatch('jupyter_environment_status'),
              meta: { duration: Date.now() - startedAt },
            };
          }
          const summary = await PythonNotebookService.getEnvironmentSummary();
          const raw = JSON.stringify(summary);
          return {
            ok: true,
            data: summary,
            output: truncateToolResult(raw, DEFAULT_MAX_OUTPUT_TOKENS),
            meta: { duration: Date.now() - startedAt },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to read Jupyter environment status',
            meta: { duration: Date.now() - startedAt },
          };
        }
      },
    }),

    jupyter_notebook_get_state: tool({
      description:
        'Get the current state of the active Jupyter (Python) notebook, including notebook ID, name, and all cell IDs with their types (code, markdown, raw). Use this first before reading or editing cells.',
      inputSchema: z.object({}),
      execute: async () => {
        const startedAt = Date.now();
        try {
          if (!isJupyterContext()) {
            return {
              ...kindMismatch('jupyter_notebook_get_state'),
              meta: { duration: Date.now() - startedAt },
            };
          }
          const response =
            await AgentService.requestJupyterState(conversationId);
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
                : 'Failed to get Jupyter notebook state',
            meta: { duration: Date.now() - startedAt },
          };
        }
      },
    }),

    jupyter_cell_read: tool({
      description:
        'Read the Python/Markdown source of a specific Jupyter notebook cell.',
      inputSchema: z.object({
        cellId: z.string().describe('The ID of the cell to read'),
      }),
      execute: async ({ cellId }) => {
        const startedAt = Date.now();
        try {
          if (!isJupyterContext()) {
            return {
              ...kindMismatch('jupyter_cell_read'),
              meta: { duration: Date.now() - startedAt },
            };
          }
          const response = await AgentService.requestJupyterCellRead(
            conversationId,
            cellId,
          );
          const source = response.source ?? '';
          return {
            ok: true,
            data: {
              source,
              cellType: response.cellType,
              length: source.length,
            },
            output: truncateToolResult(source, DEFAULT_MAX_OUTPUT_TOKENS),
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

    jupyter_cell_add: tool({
      description:
        'Create a new Python code cell or Markdown cell at the end of the active Jupyter notebook with the given source. Raw cells cannot be created.',
      inputSchema: z.object({
        cellType: z
          .enum(['code', 'markdown'])
          .describe('The type of cell to create'),
        source: z
          .string()
          .describe('The Python/Markdown source for the new cell'),
      }),
      execute: async ({ cellType, source }) => {
        const startedAt = Date.now();
        try {
          if (!isJupyterContext()) {
            return {
              ...kindMismatch('jupyter_cell_add'),
              meta: { duration: Date.now() - startedAt },
            };
          }
          const { cellId } = await AgentService.requestJupyterCellAdd(
            conversationId,
            cellType,
            source,
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

    jupyter_cell_update: tool({
      description:
        'Replace the source of a specific Jupyter notebook cell. The user runs the cell afterwards — never claim execution happened.',
      inputSchema: z.object({
        cellId: z.string().describe('The ID of the cell to update'),
        source: z.string().describe('The new source for the cell'),
      }),
      execute: async ({ cellId, source }) => {
        const startedAt = Date.now();
        try {
          if (!isJupyterContext()) {
            return {
              ...kindMismatch('jupyter_cell_update'),
              meta: { duration: Date.now() - startedAt },
            };
          }
          const response = await AgentService.requestJupyterCellUpdate(
            conversationId,
            cellId,
            source,
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

    jupyter_cell_result: tool({
      description:
        'Get a bounded snapshot of the last execution result of a specific Jupyter cell (status, truncated text/error, output-kind flags). Does not expose live kernel variables.',
      inputSchema: z.object({
        cellId: z.string().describe('The ID of the cell to get results for'),
      }),
      execute: async ({ cellId }) => {
        const startedAt = Date.now();
        try {
          if (!isJupyterContext()) {
            return {
              ...kindMismatch('jupyter_cell_result'),
              meta: { duration: Date.now() - startedAt },
            };
          }
          const response = await AgentService.requestJupyterCellResult(
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
