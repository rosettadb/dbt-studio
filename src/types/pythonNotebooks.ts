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

export type PythonCellType = 'code' | 'markdown';

export interface PythonNotebookCell {
  id: string;
  cell_type: PythonCellType;
  source: string;
  /** Only meaningful for code cells */
  outputs: PythonCellOutput[];
  execution_count: number | null;
  metadata: Record<string, unknown>;
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

export interface ExecuteCellResult {
  cellId: string;
  status: 'ok' | 'error' | 'abort';
  execution_count: number | null;
  outputs: PythonCellOutput[];
}
