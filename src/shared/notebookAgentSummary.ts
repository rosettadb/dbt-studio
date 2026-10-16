/**
 * Notebook agent summaries
 *
 * How the Notebooks agent sees a Python notebook: compact, size-capped views
 * of cells and their outputs. Pure, so both processes share it: the renderer
 * answers bridge requests from the live editor with it, and main describes the
 * saved notebook in the prompt with it. The agent sees the same shapes in both
 * places.
 *
 * Interface: `buildAgentNotebookState` and `summarizeCell`.
 */

import { DATAFRAME_MIME, SQL_FALLBACK_MIME } from '../types/pythonNotebooks';
import type {
  AgentCellEntry,
  AgentCellResult,
  AgentCellStatus,
  AgentNotebookState,
  AgentOutput,
  DataFrameCellValue,
  DataFrameTableInfo,
  KernelStatus,
  MimeBundle,
  NotebookRuntime,
  PythonCellOutput,
  PythonNotebookCell,
  SqlFallbackInfo,
} from '../types/pythonNotebooks';

const PREVIEW_CHARS = 100;
const LABEL_CHARS = 100;
const DATAFRAME_ROWS = 10;
const DATAFRAME_COLUMNS = 50;
const VALUE_CHARS = 200;
const TEXT_HEAD_CHARS = 500;
const TEXT_TAIL_CHARS = 2_500;
const TRACEBACK_LINES = 40;
const TRACEBACK_CHARS = 4_000;
/** Cap for all outputs of one cell, measured as JSON. Errors are always kept. */
const RESULT_BUDGET_CHARS = 12_000;

/** The editor's run state for a cell: queued behind another cell, or running. */
export type CellRunPhase = 'queued' | 'running';

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

const stripAnsi = (text: string): string => text.replace(ANSI_PATTERN, '');

const formatCount = (n: number): string => n.toLocaleString('en-US');

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? ''
  );
}

/** Keep the head and the tail of long text, with a marker in between. */
function clip(text: string): { text: string; truncated: boolean } {
  const max = TEXT_HEAD_CHARS + TEXT_TAIL_CHARS;
  if (text.length <= max) return { text, truncated: false };
  const omitted = text.length - max;
  return {
    text: `${text.slice(0, TEXT_HEAD_CHARS)}\n… ${formatCount(omitted)} chars omitted …\n${text.slice(-TEXT_TAIL_CHARS)}`,
    truncated: true,
  };
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntity(match: string, body: string): string {
  if (body.startsWith('#')) {
    const hex = body[1] === 'x' || body[1] === 'X';
    const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : match;
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? match;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, decodeEntity)
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n[\s]*/g, '\n')
    .trim();
}

function dataFrameInfo(value: unknown): DataFrameTableInfo | null {
  let info = value;
  if (typeof info === 'string') {
    try {
      info = JSON.parse(info);
    } catch {
      return null;
    }
  }
  if (!info || typeof info !== 'object') return null;
  const frame = info as DataFrameTableInfo;
  if (!Array.isArray(frame.columns) || !Array.isArray(frame.data)) return null;
  return frame;
}

function sqlFallbackInfo(value: unknown): SqlFallbackInfo | null {
  if (!value || typeof value !== 'object') return null;
  const info = value as SqlFallbackInfo;
  return typeof info.variable === 'string' ? info : null;
}

const imageMime = (data: MimeBundle): string | undefined =>
  Object.keys(data).find((mime) => mime.startsWith('image/'));

function cutValue(value: DataFrameCellValue): DataFrameCellValue {
  return typeof value === 'string' ? cut(value, VALUE_CHARS) : value;
}

function textOutput(mime: string, text: string): AgentOutput {
  return { kind: 'text', mime, ...clip(text) };
}

/**
 * One display bundle → one agent output, by the first match. The SQL
 * fallback bundle also carries a DataFrame table, so it is checked first.
 */
function summarizeBundle(data: MimeBundle): AgentOutput | null {
  const fallback = sqlFallbackInfo(data[SQL_FALLBACK_MIME]);
  if (fallback) {
    return {
      kind: 'sql_without_pandas',
      variable: fallback.variable,
      rowCount: fallback.rowCount,
    };
  }
  const frame = dataFrameInfo(data[DATAFRAME_MIME]);
  if (frame) {
    const columns = frame.columns.slice(0, DATAFRAME_COLUMNS);
    return {
      kind: 'dataframe',
      columns: columns.map((name, i) => ({
        name,
        dtype: frame.dtypes?.[i] ?? '',
      })),
      totalRows: frame.totalRows,
      totalColumns: frame.totalColumns,
      rows: frame.data
        .slice(0, DATAFRAME_ROWS)
        .map((row) => row.slice(0, DATAFRAME_COLUMNS).map(cutValue)),
      truncated:
        frame.totalRows > DATAFRAME_ROWS || frame.totalColumns > columns.length,
    };
  }
  const image = imageMime(data);
  if (image) return { kind: 'image', mime: image };
  if (data['text/html'] !== undefined) {
    return textOutput('text/html', htmlToText(asString(data['text/html'])));
  }
  if (data['application/json'] !== undefined) {
    return textOutput(
      'application/json',
      JSON.stringify(data['application/json']),
    );
  }
  if (data['text/plain'] !== undefined) {
    return textOutput('text/plain', stripAnsi(asString(data['text/plain'])));
  }
  const other = Object.keys(data)[0];
  return other ? textOutput(other, asString(data[other])) : null;
}

function summarizeTraceback(traceback: string[]): string {
  const lines = stripAnsi(traceback.join('\n')).split('\n');
  const kept = lines.slice(-TRACEBACK_LINES).join('\n');
  return kept.length > TRACEBACK_CHARS
    ? `…${kept.slice(-(TRACEBACK_CHARS - 1))}`
    : kept;
}

function summarizeOutput(output: PythonCellOutput): AgentOutput | null {
  switch (output.output_type) {
    case 'stream':
      return {
        kind: 'stream',
        name: output.name,
        ...clip(stripAnsi(output.text)),
      };
    case 'error':
      return {
        kind: 'error',
        ename: output.ename,
        evalue: stripAnsi(output.evalue),
        traceback: summarizeTraceback(output.traceback ?? []),
      };
    case 'display_data':
    case 'execute_result':
      return summarizeBundle(output.data ?? {});
    default:
      return null;
  }
}

function summarizeOutputs(outputs: PythonCellOutput[]): {
  outputs: AgentOutput[];
  omitted: number;
} {
  const kept: AgentOutput[] = [];
  let used = 0;
  let omitted = 0;
  outputs.forEach((output) => {
    const summary = summarizeOutput(output);
    if (!summary) return;
    const size = JSON.stringify(summary).length;
    if (summary.kind === 'error' || used + size <= RESULT_BUDGET_CHARS) {
      kept.push(summary);
      used += size;
    } else {
      omitted += 1;
    }
  });
  return { outputs: kept, omitted };
}

function labelBundle(data: MimeBundle): string {
  const fallback = sqlFallbackInfo(data[SQL_FALLBACK_MIME]);
  if (fallback) {
    return `SQL result, ${formatCount(fallback.rowCount)} rows (pandas missing)`;
  }
  const frame = dataFrameInfo(data[DATAFRAME_MIME]);
  if (frame) {
    return `DataFrame ${formatCount(frame.totalRows)} × ${formatCount(frame.totalColumns)}`;
  }
  const image = imageMime(data);
  if (image) return image;
  if (data['text/plain'] !== undefined) {
    return `result: ${firstLine(stripAnsi(asString(data['text/plain'])))}`;
  }
  return Object.keys(data)[0] ?? '';
}

function streamLabel(
  outputs: PythonCellOutput[],
  name: 'stdout' | 'stderr',
): string {
  const text = outputs
    .filter((o) => o.output_type === 'stream' && o.name === name)
    .map((o) => (o.output_type === 'stream' ? o.text : ''))
    .join('');
  if (!text) return '';
  const lines = text.replace(/\n$/, '').split('\n').length;
  return `${name} (${formatCount(lines)} line${lines === 1 ? '' : 's'})`;
}

/** One short label for a cell's outputs, for the cell list. */
function outputLabel(outputs: PythonCellOutput[]): string {
  const error = outputs.find((o) => o.output_type === 'error');
  if (error && error.output_type === 'error') {
    const evalue = firstLine(stripAnsi(error.evalue));
    return cut(evalue ? `${error.ename}: ${evalue}` : error.ename, LABEL_CHARS);
  }
  const display = [...outputs]
    .reverse()
    .find(
      (o) =>
        o.output_type === 'display_data' || o.output_type === 'execute_result',
    );
  if (
    display &&
    (display.output_type === 'display_data' ||
      display.output_type === 'execute_result')
  ) {
    return cut(labelBundle(display.data ?? {}), LABEL_CHARS);
  }
  return streamLabel(outputs, 'stdout') || streamLabel(outputs, 'stderr');
}

function cellStatus(
  cell: PythonNotebookCell,
  run?: CellRunPhase,
): AgentCellStatus {
  if (run) return run;
  if (cell.outputs.some((o) => o.output_type === 'error')) return 'error';
  // SQL statements without rows print "Statement executed." with a null count
  if (cell.outputs.length > 0 || cell.execution_count !== null) return 'ok';
  return 'never_run';
}

function sqlVariable(cell: PythonNotebookCell): string | undefined {
  return cell.cell_type === 'sql'
    ? (cell.metadata.rosetta?.variable ?? undefined)
    : undefined;
}

function cellEntry(
  cell: PythonNotebookCell,
  index: number,
  run?: CellRunPhase,
): AgentCellEntry {
  const variable = sqlVariable(cell);
  return {
    id: cell.id,
    index: index + 1,
    type: cell.cell_type,
    ...(variable ? { variable } : {}),
    preview: cut(firstLine(cell.source), PREVIEW_CHARS),
    lines: cell.source ? cell.source.split('\n').length : 0,
    status: cellStatus(cell, run),
    executionCount: cell.execution_count,
    output: cell.cell_type === 'markdown' ? '' : outputLabel(cell.outputs),
  };
}

/** Run phase of each active cell: the first is running, the rest queued. */
function runPhases(activeCellIds: string[]): Map<string, CellRunPhase> {
  return new Map(
    activeCellIds.map((id, i) => [id, i === 0 ? 'running' : 'queued']),
  );
}

/**
 * The notebook as a list of cells with one-line summaries.
 * `index` in the entries is 1-based.
 */
export function buildAgentNotebookState(input: {
  notebookId: string;
  name: string;
  runtime: NotebookRuntime | null;
  kernelStatus: KernelStatus;
  cells: PythonNotebookCell[];
  activeCellIds: string[];
  selectedCellId: string | null;
  runningAll: boolean;
}): AgentNotebookState {
  const phases = runPhases(input.activeCellIds);
  return {
    notebookId: input.notebookId,
    name: input.name,
    pythonVersion: input.runtime?.pythonVersion ?? '',
    envStatus: input.runtime?.status ?? 'missing',
    kernelStatus: input.kernelStatus,
    selectedCellId: input.selectedCellId,
    runningAll: input.runningAll,
    cells: input.cells.map((cell, i) =>
      cellEntry(cell, i, phases.get(cell.id)),
    ),
  };
}

/**
 * One cell's status and outputs, size-capped for a tool result.
 * `index` is the cell's 0-based position; the result reports it 1-based.
 */
export function summarizeCell(
  cell: PythonNotebookCell,
  index: number,
  run?: CellRunPhase,
): AgentCellResult {
  const { outputs, omitted } = summarizeOutputs(cell.outputs);
  return {
    cellId: cell.id,
    index: index + 1,
    type: cell.cell_type,
    status: cellStatus(cell, run),
    executionCount: cell.execution_count,
    outputs,
    omittedOutputs: omitted,
  };
}
