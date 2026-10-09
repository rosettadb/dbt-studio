/**
 * Python Notebook Types
 *
 * Python notebooks are stored as Jupyter `.ipynb` files (nbformat 4) so they
 * open in Jupyter, Colab and VS Code. Studio-specific fields live under the
 * `rosetta` key of the notebook / cell metadata. Each Python notebook owns a
 * dedicated virtualenv (never the studio's global managed venv).
 */

export type NotebookKind = 'sql' | 'python';

/** A managed python-build-standalone interpreter known to the studio. */
export interface PythonRuntimeInfo {
  version: string;
  installed: boolean;
  isRecommended: boolean;
  binaryPath: string;
}

export type PythonRuntimeInstallPhase =
  | 'downloading'
  | 'extracting'
  | 'done'
  | 'error';

export interface PythonRuntimeInstallEvent {
  version: string;
  phase: PythonRuntimeInstallPhase;
  /** 0..100 when known */
  percentage?: number;
  error?: string;
}

export type NotebookEnvStatus = 'creating' | 'ready' | 'error' | 'missing';

export interface NotebookRuntime {
  pythonVersion: string;
  venvPath: string;
  status: NotebookEnvStatus;
  error?: string;
}

export interface NotebookEnvEvent {
  notebookId: string;
  status: NotebookEnvStatus;
  /** Latest line of pip / venv output, for progress display. */
  message?: string;
  error?: string;
}

export interface NotebookEnvPackage {
  name: string;
  version: string;
}

/* ------------------------------------------------------------------ */
/* nbformat-shaped cell outputs                                         */
/* ------------------------------------------------------------------ */

/** Mime bundle. Text values are always normalised to a single string. */
export type MimeBundle = Record<string, string | number | boolean | object>;

export interface StreamOutput {
  output_type: 'stream';
  name: 'stdout' | 'stderr';
  text: string;
}

export interface ErrorOutput {
  output_type: 'error';
  ename: string;
  evalue: string;
  traceback: string[];
}

export interface DisplayDataOutput {
  output_type: 'display_data';
  data: MimeBundle;
  metadata: Record<string, unknown>;
}

export interface ExecuteResultOutput {
  output_type: 'execute_result';
  execution_count: number | null;
  data: MimeBundle;
  metadata: Record<string, unknown>;
}

export type PythonCellOutput =
  | StreamOutput
  | ErrorOutput
  | DisplayDataOutput
  | ExecuteResultOutput;

/**
 * `sql` cells run against the notebook's connection in the main process and
 * push the rows into the kernel as a variable. On disk they are stored as
 * nbformat `code` cells with a `%%sql <variable> <<` magic line (JupySQL
 * convention) and `metadata.rosetta.language = 'sql'`.
 */
export type PythonCellType = 'code' | 'markdown' | 'sql';

/** Studio-specific per-cell metadata, stored under `metadata.rosetta`. */
export interface PythonCellRosettaMetadata {
  language?: 'sql';
  /** Python variable that receives the SQL result (sql cells only). */
  variable?: string;
}

export interface PythonNotebookCell {
  id: string;
  cell_type: PythonCellType;
  source: string;
  /** Only meaningful for code / sql cells */
  outputs: PythonCellOutput[];
  execution_count: number | null;
  metadata: Record<string, unknown> & { rosetta?: PythonCellRosettaMetadata };
}

/**
 * Mime type attached (alongside `text/html`) to the display output of a SQL
 * cell whose result could not be turned into a DataFrame because pandas is
 * not installed in the notebook environment.
 */
export const SQL_FALLBACK_MIME = 'application/vnd.rosetta.sql-fallback+json';

export interface SqlFallbackInfo {
  variable: string;
  rowCount: number;
}

/**
 * Mime type the kernel bridge's DataFrame formatter adds (next to pandas'
 * `text/html`) to every displayed pandas DataFrame. The app renders it as an
 * interactive table. See KERNEL_SETUP_CODE in
 * resources/python/notebook_kernel_bridge.py.
 */
export const DATAFRAME_MIME = 'application/vnd.rosetta.dataframe+json';

/** A JSON-safe cell value: numbers and booleans stay typed, the rest is text. */
export type DataFrameCellValue = string | number | boolean | null;

export interface DataFrameTableInfo {
  version: 1;
  columns: string[];
  dtypes: string[];
  indexName: string;
  index: DataFrameCellValue[];
  /** Row-major cell values, in `columns` order. */
  data: DataFrameCellValue[][];
  /** Rows included in `data`. */
  rowCount: number;
  /** Rows in the DataFrame. */
  totalRows: number;
  totalColumns: number;
}

export interface PythonNotebook {
  id: string;
  kind: 'python';
  name: string;
  description?: string;
  cells: PythonNotebookCell[];
  createdAt: string;
  updatedAt: string;
  lastExecutedAt?: string;
  cellCount: number;
  runtime: NotebookRuntime;
}

export interface CreatePythonNotebookInput {
  name: string;
  description?: string;
  pythonVersion: string;
}

export interface UpdatePythonNotebookInput {
  name?: string;
  description?: string;
  cells?: PythonNotebookCell[];
}

/* ------------------------------------------------------------------ */
/* Kernel                                                               */
/* ------------------------------------------------------------------ */

export type KernelStatus =
  | 'stopped'
  | 'starting'
  | 'idle'
  | 'busy'
  | 'restarting'
  | 'error';

export interface KernelState {
  notebookId: string;
  status: KernelStatus;
  error?: string;
  /** ids of cells queued or running, in order */
  queue: string[];
}

export type KernelEvent =
  | { type: 'status'; notebookId: string; state: KernelState }
  | {
      type: 'output';
      notebookId: string;
      cellId: string;
      output: PythonCellOutput;
    }
  | { type: 'clear_output'; notebookId: string; cellId: string }
  | {
      type: 'execute_start';
      notebookId: string;
      cellId: string;
    }
  | {
      type: 'execute_done';
      notebookId: string;
      cellId: string;
      status: 'ok' | 'error' | 'abort';
      execution_count: number | null;
    };

export interface ExecuteCellOptions {
  /** Defaults to `code`. `sql` runs the source as a query first. */
  cellType?: PythonCellType;
  /** Target variable for sql cells (defaults to `df`). */
  variable?: string;
}

export interface ExecuteCellResult {
  cellId: string;
  status: 'ok' | 'error' | 'abort';
  execution_count: number | null;
  outputs: PythonCellOutput[];
}

/* ------------------------------------------------------------------ */
/* Notebooks agent (Python notebooks)                                   */
/* ------------------------------------------------------------------ */

/**
 * What the agent sees of a notebook. Built by src/shared/notebookAgentSummary
 * from the editor's live cells (bridge answers) or the saved file (prompt).
 */
export type AgentCellStatus =
  | 'never_run'
  | 'queued'
  | 'running'
  | 'ok'
  | 'error';

export interface AgentCellEntry {
  id: string;
  /** 1-based position in the notebook */
  index: number;
  type: PythonCellType;
  /** sql cells: the DataFrame variable that receives the result */
  variable?: string;
  /** First non-empty line, at most 100 chars */
  preview: string;
  lines: number;
  status: AgentCellStatus;
  executionCount: number | null;
  /** One label: "KeyError: 'region'", "DataFrame 1,204 × 7", "image/png", "stdout (12 lines)" or "" */
  output: string;
}

export interface AgentNotebookState {
  notebookId: string;
  name: string;
  pythonVersion: string;
  envStatus: NotebookEnvStatus;
  kernelStatus: KernelStatus;
  selectedCellId: string | null;
  runningAll: boolean;
  cells: AgentCellEntry[];
}

export interface AgentCellSource {
  cellId: string;
  index: number;
  type: PythonCellType;
  variable?: string;
  source: string;
  notebookName: string;
}

export interface AgentCellRef {
  cellId: string;
  index: number;
  variable?: string;
}

export type AgentOutput =
  | {
      kind: 'stream';
      name: 'stdout' | 'stderr';
      text: string;
      truncated: boolean;
    }
  | { kind: 'error'; ename: string; evalue: string; traceback: string }
  | {
      kind: 'dataframe';
      columns: { name: string; dtype: string }[];
      totalRows: number;
      totalColumns: number;
      rows: DataFrameCellValue[][];
      truncated: boolean;
    }
  | { kind: 'sql_without_pandas'; variable: string; rowCount: number }
  | { kind: 'image'; mime: string }
  | { kind: 'text'; mime: string; text: string; truncated: boolean };

export interface AgentCellResult {
  cellId: string;
  index: number;
  type: PythonCellType;
  status: AgentCellStatus;
  executionCount: number | null;
  outputs: AgentOutput[];
  omittedOutputs: number;
}

export interface AgentRunResult extends AgentCellResult {
  /** false: still running after the wait (check notebooks_cell_result later) */
  finished: boolean;
  /** Set when the run didn't start: env not ready, invalid variable, empty cell */
  blocked?: string;
}

/**
 * Agent bridge ops (main → open PythonNotebookEditor). Each op maps its
 * arguments to its result, so both sides of the IPC seam are type-checked.
 */
export interface PythonNotebookAgentOps {
  state: { args: Record<string, never>; result: AgentNotebookState };
  'cell-read': { args: { cellId: string }; result: AgentCellSource };
  'cell-add': {
    args: {
      cellType: PythonCellType;
      source: string;
      afterCellId?: string;
      variable?: string;
    };
    result: AgentCellRef;
  };
  'cell-update': {
    args: {
      cellId: string;
      source?: string;
      cellType?: PythonCellType;
      variable?: string;
    };
    result: AgentCellRef;
  };
  'cell-run': {
    args: { cellId: string; expectedSource: string; waitMs: number };
    result: AgentRunResult;
  };
  'cell-result': { args: { cellId: string }; result: AgentCellResult };
}

export type PythonNotebookAgentOp = keyof PythonNotebookAgentOps;

export type PythonNotebookAgentArgs<K extends PythonNotebookAgentOp> =
  PythonNotebookAgentOps[K]['args'];

export type PythonNotebookAgentResult<K extends PythonNotebookAgentOp> =
  PythonNotebookAgentOps[K]['result'];

/** Renderer-side implementation of every op. Throw to fail the request. */
export type PythonNotebookAgentHandlers = {
  [K in PythonNotebookAgentOp]: (
    args: PythonNotebookAgentArgs<K>,
  ) => Promise<PythonNotebookAgentResult<K>>;
};

export interface PythonNotebookAgentRequest<
  K extends PythonNotebookAgentOp = PythonNotebookAgentOp,
> {
  requestId: string;
  conversationId: number;
  /** From the agent context, never from tool input */
  notebookId: string;
  op: K;
  args: PythonNotebookAgentArgs<K>;
}

export interface PythonNotebookAgentResponse {
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Result of a silent kernel variable inspection (notebooks_variables). */
export interface KernelInspectResult {
  /** false: no kernel is running, so no variables exist yet */
  kernelRunning: boolean;
  /** true: the request queued behind a running cell and timed out */
  busy?: boolean;
  data?: unknown;
  error?: string;
}
