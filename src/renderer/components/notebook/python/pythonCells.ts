/**
 * Python notebook cells
 *
 * Pure helpers shared by the editor and the Notebooks agent ops: creating
 * cells, SQL result variables, the run precondition check, and the prompts
 * behind "Explain error", "Fix with AI" and "Explain with AI".
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  NotebookRuntime,
  PythonCellType,
  PythonNotebookCell,
} from '../../../../types/pythonNotebooks';

export const PYTHON_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** checkRunnable's reason for an empty cell; the user path runs it as a no-op. */
export const EMPTY_CELL_REASON = 'The cell is empty.';

/** First of df, df_2, df_3… not used by another SQL cell. */
export function nextSqlVariable(cells: PythonNotebookCell[]): string {
  const taken = new Set(
    cells
      .filter((c) => c.cell_type === 'sql')
      .map((c) => c.metadata.rosetta?.variable),
  );
  if (!taken.has('df')) return 'df';
  let n = 2;
  while (taken.has(`df_${n}`)) n += 1;
  return `df_${n}`;
}

/** Cell metadata for `type`: sql cells carry the language + result variable. */
export function metadataForType(
  type: PythonCellType,
  metadata: PythonNotebookCell['metadata'],
  cells: PythonNotebookCell[],
): PythonNotebookCell['metadata'] {
  const { rosetta, ...rest } = metadata;
  if (type !== 'sql') return rest;
  return {
    ...rest,
    rosetta: {
      ...rosetta,
      language: 'sql',
      variable: rosetta?.variable || nextSqlVariable(cells),
    },
  };
}

export function newCell(
  type: PythonCellType,
  cells: PythonNotebookCell[],
): PythonNotebookCell {
  return {
    id: uuidv4(),
    cell_type: type,
    source: '',
    outputs: [],
    execution_count: null,
    metadata: metadataForType(type, {}, cells),
  };
}

/**
 * Why a code or SQL cell can't run now, or null. A null runtime (not loaded
 * yet) doesn't block, as in the editor.
 */
export function checkRunnable(
  cell: PythonNotebookCell,
  runtime: NotebookRuntime | null,
): string | null {
  const variable = cell.metadata.rosetta?.variable ?? '';
  if (cell.cell_type === 'sql' && !PYTHON_IDENTIFIER.test(variable)) {
    return `"${variable}" is not a valid Python variable name.`;
  }
  if (runtime && runtime.status !== 'ready') {
    return runtime.status === 'creating'
      ? 'The environment is still being created.'
      : 'The environment is not ready. Recreate it from the kernel bar.';
  }
  if (!cell.source.trim()) return EMPTY_CELL_REASON;
  return null;
}

/* ------------------------------------------------------------------ */
/* Ask-agent prompts                                                    */
/* ------------------------------------------------------------------ */

export type AskAgentErrorRequest = {
  kind: 'explain-error' | 'fix-error';
  ename: string;
  evalue: string;
};

export type AskAgentRequest = AskAgentErrorRequest | { kind: 'explain-cell' };

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

function cellLabel(cell: PythonNotebookCell, index: number): string {
  const position = `cell ${index + 1}`;
  const id = `id \`${cell.id}\``;
  if (cell.cell_type === 'sql') {
    const variable = cell.metadata.rosetta?.variable;
    return `${position} (SQL${variable ? ` → \`${variable}\`` : ''}, ${id})`;
  }
  return `${position} (${cell.cell_type === 'markdown' ? 'Markdown' : 'Python'}, ${id})`;
}

function errorLabel({ ename, evalue }: AskAgentErrorRequest): string {
  const value =
    evalue
      .replace(ANSI_PATTERN, '')
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? '';
  const text = value ? `${ename}: ${value}` : ename;
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

/**
 * The chat message for an ask-agent entry point. It names the cell and its
 * id so the agent goes straight to its tools; the agent reads the source and
 * the traceback itself, which keeps the chat history small.
 * `index` is the cell's 0-based position.
 */
export function buildAskAgentPrompt(
  cell: PythonNotebookCell,
  index: number,
  request: AskAgentRequest,
): string {
  const label = cellLabel(cell, index);
  switch (request.kind) {
    case 'fix-error':
      return `Fix the error in ${label}: ${errorLabel(request)}. Read the cell and its output, update the cell, and run it again to confirm.`;
    case 'explain-error':
      return `Explain the error in ${label}: ${errorLabel(request)}. Read the cell and its output, then explain what went wrong and how to fix it.`;
    default:
      return `Explain what ${label} does. Read the cell and its output first.`;
  }
}
