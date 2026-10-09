/**
 * Python notebook agent tools
 *
 * The Notebooks agent's tools for Python notebooks. The open editor owns the
 * cells, so reads, edits and runs go through the editor bridge; variables and
 * packages go to the kernel and env services. Dependencies are injected
 * (`createPythonNotebookToolDeps` builds the real ones) so tests pass fakes.
 *
 * Approval (classifyAgentRun): read-only SQL runs without asking; SQL that
 * changes data and Python with shell commands ask every time; other Python
 * asks once per chat ("Allow for this chat"). Package installs always ask.
 */

import { tool } from 'ai';
import { z } from 'zod';
import AgentService from '../../../agent.service';
import NotebookEnvService from '../../../notebookEnv.service';
import NotebookKernelService from '../../../notebookKernel.service';
import { truncateToolResult } from '../../tokenEstimator';
import { TerminalConfirmGate } from '../terminalConfirmGate';
import { isMutationSql } from './sql.tools';
import type {
  AgentCellSource,
  PythonCellType,
  PythonNotebookAgentArgs,
  PythonNotebookAgentOp,
  PythonNotebookAgentResult,
} from '../../../../../types/pythonNotebooks';

/** "Allow for this chat" scope for plain Python runs. */
export const PYTHON_RUN_ALLOW_SCOPE = 'notebook-python';

const DEFAULT_WAIT_SECONDS = 120;
const MAX_WAIT_SECONDS = 600;
/** Extra time for the bridge round trip on top of the run wait. */
const BRIDGE_GRACE_MS = 15_000;
const NAME_LOOKUP_TIMEOUT_MS = 3_000;
const APPROVAL_PREVIEW_LINES = 40;
const DEFAULT_MAX_OUTPUT_TOKENS = 4000;
const RESULT_MAX_OUTPUT_TOKENS = 5000;
const INSTALL_LOG_TAIL_CHARS = 1_500;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface PythonNotebookToolDeps {
  /** One op on the open editor of this chat's notebook. */
  request<K extends PythonNotebookAgentOp>(
    op: K,
    args: PythonNotebookAgentArgs<K>,
    timeoutMs?: number,
  ): Promise<PythonNotebookAgentResult<K>>;
  /** Ask the user to allow a command; resolves true when allowed. */
  confirm(opts: {
    toolName: string;
    command: string;
    cwd: string;
    allowScope?: string;
  }): Promise<boolean>;
  /** This chat's notebook id, from the agent context. */
  notebookId(): string | null;
  kernel: Pick<
    typeof NotebookKernelService,
    'inspect' | 'getStatus' | 'interrupt'
  >;
  env: Pick<typeof NotebookEnvService, 'listPackages' | 'installPackages'>;
}

export function createPythonNotebookToolDeps(
  conversationId: number,
): PythonNotebookToolDeps {
  return {
    request<K extends PythonNotebookAgentOp>(
      op: K,
      args: PythonNotebookAgentArgs<K>,
      timeoutMs?: number,
    ) {
      return AgentService.requestPythonNotebook(
        conversationId,
        op,
        args,
        timeoutMs,
      );
    },
    async confirm({ toolName, command, cwd, allowScope }) {
      const context = AgentService.getAgentContext(conversationId);
      if (!context) return false;
      return TerminalConfirmGate.request({
        event: context.event,
        conversationId,
        toolName,
        command,
        cwd,
        allowScope,
      });
    },
    notebookId: () =>
      AgentService.getAgentContext(conversationId)?.notebookId ?? null,
    kernel: NotebookKernelService,
    env: NotebookEnvService,
  };
}

/* ------------------------------------------------------------------ */
/* Run approval                                                         */
/* ------------------------------------------------------------------ */

const LINE_MAGIC = /^%(pip|conda|system|sx|sc|run)\b/;
const CELL_MAGIC = /^%%(bash|sh|script|system|writefile)\b/;
const ASSIGNED_SHELL = /=\s*(!(?!=)|%(sx|sc|system)\b)/;
const IPYTHON_SYSTEM = /get_ipython\(\)\s*\.\s*(system|getoutput)\s*\(/;

/**
 * Lines of a Python cell that run shell commands. Catches the obvious forms
 * (`!cmd`, `x = !cmd`, shell magics, get_ipython().system); the per-chat
 * approval is the real control.
 */
export function findShellCommands(source: string): string[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || line.startsWith('#')) return false;
      if (line.startsWith('!') && !line.startsWith('!=')) return true;
      return (
        LINE_MAGIC.test(line) ||
        CELL_MAGIC.test(line) ||
        ASSIGNED_SHELL.test(line) ||
        IPYTHON_SYSTEM.test(line)
      );
    });
}

export interface AgentRunApproval {
  ask: 'never' | 'always' | 'once-per-chat';
  reason: 'markdown' | 'read-only-sql' | 'mutation-sql' | 'shell' | 'python';
  shellLines: string[];
}

export function classifyAgentRun(cell: {
  type: PythonCellType;
  source: string;
}): AgentRunApproval {
  if (cell.type === 'markdown') {
    return { ask: 'never', reason: 'markdown', shellLines: [] };
  }
  if (cell.type === 'sql') {
    return isMutationSql(cell.source)
      ? { ask: 'always', reason: 'mutation-sql', shellLines: [] }
      : { ask: 'never', reason: 'read-only-sql', shellLines: [] };
  }
  const shellLines = findShellCommands(cell.source);
  return shellLines.length > 0
    ? { ask: 'always', reason: 'shell', shellLines }
    : { ask: 'once-per-chat', reason: 'python', shellLines: [] };
}

function sourcePreview(source: string): string {
  const lines = source.split('\n');
  const shown = lines.slice(0, APPROVAL_PREVIEW_LINES).join('\n');
  const more = lines.length - APPROVAL_PREVIEW_LINES;
  return more > 0 ? `${shown}\n… ${more} more lines` : shown;
}

function approvalCommand(
  cell: AgentCellSource,
  approval: AgentRunApproval,
): string {
  const where = `cell ${cell.index} in "${cell.notebookName}"`;
  const preview = sourcePreview(cell.source);
  if (approval.reason === 'mutation-sql') {
    return `⚠️ Run SQL ${where}. It modifies your database:\n\n${preview}`;
  }
  if (approval.reason === 'shell') {
    return `Run Python ${where}. It runs shell commands:\n${approval.shellLines.join('\n')}\n\nCell source:\n${preview}`;
  }
  return `Run Python ${where}:\n\n${preview}`;
}

/* ------------------------------------------------------------------ */
/* Result envelopes                                                     */
/* ------------------------------------------------------------------ */

type Meta = Record<string, unknown>;

function ok(
  data: unknown,
  startedAt: number,
  maxTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  meta: Meta = {},
) {
  const raw = JSON.stringify(data);
  const output = truncateToolResult(raw, maxTokens);
  const duration = Date.now() - startedAt;
  return output === raw
    ? { ok: true, data, meta: { duration, ...meta } }
    : { ok: true, output, meta: { duration, truncated: true, ...meta } };
}

function fail(
  error: unknown,
  startedAt: number,
  fallback: string,
  meta: Meta = {},
) {
  let message = fallback;
  if (error instanceof Error) message = error.message;
  else if (typeof error === 'string' && error) message = error;
  return {
    ok: false,
    error: message,
    meta: { duration: Date.now() - startedAt, ...meta },
  };
}

type RaceOutcome<T> = { aborted: true } | { aborted: false; value: T };

function raceAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<RaceOutcome<T>> {
  if (!signal) return promise.then((value) => ({ aborted: false, value }));
  if (signal.aborted) return Promise.resolve({ aborted: true });
  return new Promise<RaceOutcome<T>>((resolve, reject) => {
    const onAbort = () => resolve({ aborted: true });
    signal.addEventListener('abort', onAbort, { once: true });
    promise
      .then((value) => {
        signal.removeEventListener('abort', onAbort);
        resolve({ aborted: false, value });
        return undefined;
      })
      .catch((error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      });
  });
}

const NO_NOTEBOOK = 'No notebook is open in this chat.';

/* ------------------------------------------------------------------ */
/* Tools                                                                */
/* ------------------------------------------------------------------ */

export function createPythonNotebookTools(
  conversationId: number,
  deps: PythonNotebookToolDeps = createPythonNotebookToolDeps(conversationId),
) {
  const notebookName = async (): Promise<string> => {
    try {
      const state = await deps.request('state', {}, NAME_LOOKUP_TIMEOUT_MS);
      return state.name;
    } catch {
      return 'this notebook';
    }
  };

  return {
    notebooks_get_state: tool({
      description:
        'Get the live state of the open Python notebook: name, Python version, environment and kernel status, and every cell with its id, 1-based position, type (code, sql, markdown), SQL result variable, first line, run status and a one-line output label. Call this first; the other notebook tools take cell ids from it.',
      inputSchema: z.object({}),
      execute: async () => {
        const startedAt = Date.now();
        try {
          return ok(await deps.request('state', {}), startedAt);
        } catch (error) {
          return fail(error, startedAt, 'Failed to get notebook state');
        }
      },
    }),

    notebooks_cell_read: tool({
      description:
        "Read one cell's full source by cell id, with its type, position and, for SQL cells, the DataFrame variable that receives the result.",
      inputSchema: z.object({
        cellId: z.string().describe('Cell id from notebooks_get_state'),
      }),
      execute: async ({ cellId }) => {
        const startedAt = Date.now();
        try {
          return ok(await deps.request('cell-read', { cellId }), startedAt);
        } catch (error) {
          return fail(error, startedAt, 'Failed to read cell');
        }
      },
    }),

    notebooks_cell_result: tool({
      description:
        "Get a cell's run status and outputs: stdout and stderr, errors with traceback, DataFrame previews (columns, dtypes, first 10 rows and total size) and text results. Images are reported but not included. Use it to check a cell that notebooks_cell_run reported as finished: false.",
      inputSchema: z.object({
        cellId: z.string().describe('Cell id from notebooks_get_state'),
      }),
      execute: async ({ cellId }) => {
        const startedAt = Date.now();
        try {
          return ok(
            await deps.request('cell-result', { cellId }),
            startedAt,
            RESULT_MAX_OUTPUT_TOKENS,
          );
        } catch (error) {
          return fail(error, startedAt, 'Failed to get cell result');
        }
      },
    }),

    notebooks_variables: tool({
      description:
        "List the variables in the notebook's running kernel with their type and size (DataFrame rows × cols, Series length, …), or pass `name` for one variable's detail: DataFrame columns, dtypes, null counts and 5 head rows. Use it before guessing column names. It never adds cells and never starts a kernel.",
      inputSchema: z.object({
        name: z
          .string()
          .regex(IDENTIFIER, 'Must be a Python identifier')
          .optional()
          .describe('Variable to describe, e.g. "df". Omit to list all.'),
      }),
      execute: async ({ name }) => {
        const startedAt = Date.now();
        const notebookId = deps.notebookId();
        if (!notebookId) return fail(NO_NOTEBOOK, startedAt, NO_NOTEBOOK);
        try {
          const result = await deps.kernel.inspect(notebookId, name);
          if (!result.kernelRunning) {
            return ok(
              {
                kernelRunning: false,
                message:
                  "The kernel isn't running, so no variables exist yet. Running a cell starts it.",
              },
              startedAt,
            );
          }
          if (result.error) return fail(result.error, startedAt, result.error);
          const data = (result.data ?? {}) as Record<string, unknown>;
          if (typeof data.error === 'string') {
            return fail(data.error, startedAt, data.error);
          }
          return ok({ kernelRunning: true, ...data }, startedAt);
        } catch (error) {
          return fail(error, startedAt, 'Failed to inspect variables');
        }
      },
    }),

    notebooks_packages_list: tool({
      description:
        "List the packages installed in the notebook's Python environment (pip list), as name==version.",
      inputSchema: z.object({}),
      execute: async () => {
        const startedAt = Date.now();
        const notebookId = deps.notebookId();
        if (!notebookId) return fail(NO_NOTEBOOK, startedAt, NO_NOTEBOOK);
        try {
          const packages = await deps.env.listPackages(notebookId);
          return ok(
            {
              total: packages.length,
              packages: packages.map((p) => `${p.name}==${p.version}`),
            },
            startedAt,
          );
        } catch (error) {
          return fail(error, startedAt, 'Failed to list packages');
        }
      },
    }),

    notebooks_cell_add: tool({
      description:
        "Add a cell to the notebook without running it. cellType: 'code' (Python), 'sql' (one statement in the connection's dialect; its result becomes a pandas DataFrame named by `variable`, by default df, df_2, …) or 'markdown'. Inserted right after `afterCellId`, or at the end.",
      inputSchema: z.object({
        cellType: z.enum(['code', 'sql', 'markdown']),
        source: z.string().max(100_000),
        afterCellId: z
          .string()
          .optional()
          .describe('Insert after this cell. Omit to append at the end.'),
        variable: z
          .string()
          .regex(IDENTIFIER, 'Must be a Python identifier')
          .optional()
          .describe('SQL cells only: the DataFrame variable for the result'),
      }),
      execute: async (input) => {
        const startedAt = Date.now();
        try {
          return ok(await deps.request('cell-add', input), startedAt);
        } catch (error) {
          return fail(error, startedAt, 'Failed to add cell');
        }
      },
    }),

    notebooks_cell_update: tool({
      description:
        "Change a cell's source, type or SQL result variable. Fix a broken cell in place with this instead of adding a copy. Changing the type clears the cell's outputs. Fails while the cell is running or while the user is editing it.",
      inputSchema: z.object({
        cellId: z.string().describe('Cell id from notebooks_get_state'),
        source: z.string().max(100_000).optional(),
        cellType: z.enum(['code', 'sql', 'markdown']).optional(),
        variable: z
          .string()
          .regex(IDENTIFIER, 'Must be a Python identifier')
          .optional()
          .describe('SQL cells only: the DataFrame variable for the result'),
      }),
      execute: async (input) => {
        const startedAt = Date.now();
        if (
          input.source === undefined &&
          input.cellType === undefined &&
          input.variable === undefined
        ) {
          const message = 'Pass at least one of source, cellType or variable.';
          return fail(message, startedAt, message);
        }
        try {
          return ok(await deps.request('cell-update', input), startedAt);
        } catch (error) {
          return fail(error, startedAt, 'Failed to update cell');
        }
      },
    }),

    notebooks_cell_run: tool({
      description:
        "Run a cell in the notebook's kernel and wait up to waitSeconds (default 120) for it to finish. Returns the status and outputs like notebooks_cell_result, with finished: false when the cell is still running. Read-only SQL runs right away; SQL that changes data, shell commands and the first Python run in this chat ask the user first.",
      inputSchema: z.object({
        cellId: z.string().describe('Cell id from notebooks_get_state'),
        waitSeconds: z
          .number()
          .int()
          .min(1)
          .max(MAX_WAIT_SECONDS)
          .optional()
          .describe(
            `Seconds to wait for the run (1-${MAX_WAIT_SECONDS}, default ${DEFAULT_WAIT_SECONDS})`,
          ),
      }),
      execute: async ({ cellId, waitSeconds }, options) => {
        const startedAt = Date.now();
        // Read now: stopping the chat deletes the agent context before the
        // abort handler below runs.
        const notebookId = deps.notebookId();
        try {
          const cell = await deps.request('cell-read', { cellId });
          const approval = classifyAgentRun(cell);
          if (approval.reason === 'markdown') {
            return ok(
              {
                cellId,
                index: cell.index,
                message: 'Markdown cells have nothing to run.',
              },
              startedAt,
            );
          }
          if (approval.ask !== 'never') {
            const allowed = await deps.confirm({
              toolName: 'notebooks_cell_run',
              command: approvalCommand(cell, approval),
              cwd: `notebook:${cell.notebookName}`,
              allowScope:
                approval.ask === 'once-per-chat'
                  ? PYTHON_RUN_ALLOW_SCOPE
                  : undefined,
            });
            if (!allowed) {
              return fail(
                'The user denied running this cell.',
                startedAt,
                'The user denied running this cell.',
                { requiresApproval: true },
              );
            }
          }

          const waitMs = (waitSeconds ?? DEFAULT_WAIT_SECONDS) * 1000;
          const run = deps.request(
            'cell-run',
            { cellId, expectedSource: cell.source, waitMs },
            waitMs + BRIDGE_GRACE_MS,
          );
          const outcome = await raceAbort(run, options?.abortSignal);
          if (outcome.aborted) {
            run.catch(() => undefined);
            if (
              notebookId &&
              deps.kernel.getStatus(notebookId).queue[0] === cellId
            ) {
              await deps.kernel.interrupt(notebookId).catch(() => undefined);
              return fail(
                'Stopped. The cell was interrupted.',
                startedAt,
                'Stopped.',
              );
            }
            return fail('Stopped waiting for the cell.', startedAt, 'Stopped.');
          }

          const result = outcome.value;
          if (result.blocked) {
            return fail(result.blocked, startedAt, result.blocked, {
              blocked: true,
            });
          }
          return ok(
            result.finished
              ? result
              : {
                  ...result,
                  note: 'The cell is still running. Check it later with notebooks_cell_result.',
                },
            startedAt,
            RESULT_MAX_OUTPUT_TOKENS,
          );
        } catch (error) {
          return fail(error, startedAt, 'Failed to run cell');
        }
      },
    }),

    notebooks_packages_install: tool({
      description:
        "pip install packages into the notebook's Python environment. Always asks the user first. Takes pip specs such as 'pandas' or 'plotly>=5'. New packages import without a kernel restart; upgrading an already imported package needs a restart, which only the user can do.",
      inputSchema: z.object({
        packages: z
          .array(z.string().min(1).max(200))
          .min(1)
          .max(20)
          .describe('pip requirement specs, e.g. ["pandas", "plotly>=5"]'),
      }),
      execute: async ({ packages }) => {
        const startedAt = Date.now();
        const notebookId = deps.notebookId();
        if (!notebookId) return fail(NO_NOTEBOOK, startedAt, NO_NOTEBOOK);
        try {
          const allowed = await deps.confirm({
            toolName: 'notebooks_packages_install',
            command: `pip install ${packages.join(' ')}`,
            cwd: `notebook env: ${await notebookName()}`,
          });
          if (!allowed) {
            return fail(
              'The user denied installing these packages.',
              startedAt,
              'The user denied installing these packages.',
              { requiresApproval: true },
            );
          }
          const log = await deps.env.installPackages(notebookId, packages);
          return ok(
            {
              installed: packages,
              logTail: log.slice(-INSTALL_LOG_TAIL_CHARS),
            },
            startedAt,
          );
        } catch (error) {
          return fail(error, startedAt, 'Failed to install packages');
        }
      },
    }),
  };
}
