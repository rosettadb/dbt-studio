/**
 * Python Notebooks Service
 *
 * Storage for Python notebooks as Jupyter `.ipynb` files (nbformat 4.5) in
 * the same per-connection directory SQL notebooks use
 * (`userData/notebooks/<connectionKey>/<id>.ipynb`). The SQL notebook service
 * only reads `*.json`, so the two coexist without touching each other.
 *
 * Studio fields (name, description, timestamps, runtime) live under
 * `metadata.rosetta`; everything else is plain nbformat so the file opens in
 * Jupyter / Colab / VS Code unchanged.
 *
 * Follows BE-03 (one cohesive service).
 */

import { dialog } from 'electron';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getConnectionDir, normalizeConnectionKey } from './notebooks.service';
import { RECOMMENDED_PYTHON_VERSION } from './settings.service';
import ConnectorsService from './connectors.service';
import DuckLakeService from './duckLake.service';
import NotebookEnvService from './notebookEnv.service';
import NotebookKernelService from './notebookKernel.service';
import { SQL_FALLBACK_MIME } from '../../types/pythonNotebooks';
import type {
  CreatePythonNotebookInput,
  ExecuteCellOptions,
  ExecuteCellResult,
  NotebookRuntime,
  PythonCellOutput,
  PythonCellType,
  PythonNotebook,
  PythonNotebookCell,
  UpdatePythonNotebookInput,
} from '../../types/pythonNotebooks';
import type { Notebook as LegacySqlNotebook } from '../../types/notebooks';

const NBFORMAT = 4;
const NBFORMAT_MINOR = 5;
const MAX_STREAM_CHARS = 200_000;
const MAX_OUTPUTS_PER_CELL = 500;
const MAX_MIME_VALUE_CHARS = 8_000_000; // ~6MB base64 image
/** Rows handed to the kernel per SQL cell run. */
const MAX_SQL_ROWS = 100_000;
/** Rows shown in the fallback HTML table when pandas is unavailable. */
const SQL_FALLBACK_PREVIEW_ROWS = 100;
const DEFAULT_SQL_VARIABLE = 'df';
const PYTHON_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** `%%sql` magic line as written by Studio / JupySQL: `%%sql [var <<]`. */
const SQL_MAGIC_LINE = /^%%sql(?:\s+([A-Za-z_][A-Za-z0-9_]*)\s*<<)?\s*$/;

/* ------------------------------------------------------------------ */
/* nbformat (de)serialisation                                           */
/* ------------------------------------------------------------------ */

type MultilineString = string | string[];

interface IpynbCell {
  id?: string;
  cell_type: 'code' | 'markdown' | 'raw';
  source: MultilineString;
  metadata?: Record<string, unknown>;
  outputs?: Array<Record<string, any>>;
  execution_count?: number | null;
}

interface IpynbFile {
  nbformat: number;
  nbformat_minor: number;
  metadata: Record<string, any>;
  cells: IpynbCell[];
}

function joinMultiline(value: MultilineString | undefined): string {
  if (Array.isArray(value)) return value.join('');
  return value ?? '';
}

function splitMultiline(value: string): string[] {
  if (!value) return [];
  const lines = value.split('\n');
  return lines.map((line, index) =>
    index < lines.length - 1 ? `${line}\n` : line,
  );
}

function normaliseMimeBundle(
  data: Record<string, unknown> | undefined,
): Record<string, any> {
  const result: Record<string, any> = {};
  Object.entries(data ?? {}).forEach(([mime, value]) => {
    result[mime] = Array.isArray(value) ? value.join('') : value;
  });
  return result;
}

function normaliseOutput(raw: Record<string, any>): PythonCellOutput | null {
  switch (raw.output_type) {
    case 'stream':
      return {
        output_type: 'stream',
        name: raw.name === 'stderr' ? 'stderr' : 'stdout',
        text: joinMultiline(raw.text),
      };
    case 'error':
      return {
        output_type: 'error',
        ename: String(raw.ename ?? ''),
        evalue: String(raw.evalue ?? ''),
        traceback: Array.isArray(raw.traceback)
          ? raw.traceback.map(String)
          : [],
      };
    case 'display_data':
      return {
        output_type: 'display_data',
        data: normaliseMimeBundle(raw.data),
        metadata: raw.metadata ?? {},
      };
    case 'execute_result':
      return {
        output_type: 'execute_result',
        execution_count:
          typeof raw.execution_count === 'number' ? raw.execution_count : null,
        data: normaliseMimeBundle(raw.data),
        metadata: raw.metadata ?? {},
      };
    default:
      return null;
  }
}

/**
 * Detect a SQL cell in an nbformat code cell: either Studio's metadata flag or
 * a leading `%%sql` magic line (JupySQL / ipython-sql notebooks). Returns the
 * query without the magic line and the target variable, if any.
 */
function parseSqlCodeCell(
  raw: IpynbCell,
): { source: string; variable?: string } | null {
  if (raw.cell_type !== 'code') return null;
  const source = joinMultiline(raw.source);
  const newline = source.indexOf('\n');
  const firstLine = newline === -1 ? source : source.slice(0, newline);
  const magic = SQL_MAGIC_LINE.exec(firstLine.trim());
  const rosetta = (raw.metadata as PythonNotebookCell['metadata'] | undefined)
    ?.rosetta;
  if (!magic && rosetta?.language !== 'sql') return null;
  let query = source;
  if (magic) query = newline === -1 ? '' : source.slice(newline + 1);
  return {
    source: query,
    variable:
      typeof rosetta?.variable === 'string' && rosetta.variable
        ? rosetta.variable
        : magic?.[1],
  };
}

function fromIpynbCell(raw: IpynbCell): PythonNotebookCell {
  const sql = parseSqlCodeCell(raw);
  let cellType: PythonCellType = 'code';
  if (raw.cell_type === 'markdown') cellType = 'markdown';
  else if (sql) cellType = 'sql';
  const executable = cellType !== 'markdown';
  const metadata: PythonNotebookCell['metadata'] = { ...(raw.metadata ?? {}) };
  if (sql) {
    metadata.rosetta = {
      ...(metadata.rosetta ?? {}),
      language: 'sql',
      variable: sql.variable ?? DEFAULT_SQL_VARIABLE,
    };
  }
  return {
    id: raw.id && /^[A-Za-z0-9_-]{1,64}$/.test(raw.id) ? raw.id : uuidv4(),
    cell_type: cellType,
    source: sql ? sql.source : joinMultiline(raw.source),
    outputs: executable
      ? (raw.outputs ?? [])
          .map(normaliseOutput)
          .filter((o): o is PythonCellOutput => o !== null)
      : [],
    execution_count:
      executable && typeof raw.execution_count === 'number'
        ? raw.execution_count
        : null,
    metadata,
  };
}

function toIpynbCell(cell: PythonNotebookCell): IpynbCell {
  const isSql = cell.cell_type === 'sql';
  const metadata: PythonNotebookCell['metadata'] = { ...(cell.metadata ?? {}) };
  let { source } = cell;
  if (isSql) {
    const variable = metadata.rosetta?.variable || DEFAULT_SQL_VARIABLE;
    metadata.rosetta = {
      ...(metadata.rosetta ?? {}),
      language: 'sql',
      variable,
    };
    // JupySQL syntax so the cell is runnable in Jupyter with jupysql installed.
    source = `%%sql ${variable} <<\n${cell.source}`;
  }
  const base: IpynbCell = {
    id: cell.id,
    cell_type: cell.cell_type === 'markdown' ? 'markdown' : 'code',
    metadata,
    source: splitMultiline(source),
  };
  if (cell.cell_type !== 'markdown') {
    base.execution_count = cell.execution_count ?? null;
    base.outputs = cell.outputs ?? [];
  }
  return base;
}

function fromIpynb(
  file: IpynbFile,
  fallbackId: string,
  runtimeStatus: PythonNotebook['runtime'],
): PythonNotebook {
  const meta = file.metadata?.rosetta ?? {};
  const now = new Date().toISOString();
  const cells = (file.cells ?? []).map(fromIpynbCell);
  return {
    id: typeof meta.id === 'string' ? meta.id : fallbackId,
    kind: 'python',
    name: typeof meta.name === 'string' && meta.name ? meta.name : fallbackId,
    description:
      typeof meta.description === 'string' ? meta.description : undefined,
    cells,
    createdAt: meta.createdAt ?? now,
    updatedAt: meta.updatedAt ?? now,
    lastExecutedAt: meta.lastExecutedAt,
    cellCount: cells.length,
    runtime: runtimeStatus,
  };
}

function toIpynb(notebook: PythonNotebook, existing?: IpynbFile): IpynbFile {
  const metadata = { ...(existing?.metadata ?? {}) };
  metadata.kernelspec = {
    display_name: `Python ${notebook.runtime.pythonVersion}`,
    language: 'python',
    name: 'python3',
  };
  metadata.language_info = {
    ...(metadata.language_info ?? {}),
    name: 'python',
    version: notebook.runtime.pythonVersion,
  };
  metadata.rosetta = {
    id: notebook.id,
    kind: 'python',
    name: notebook.name,
    description: notebook.description,
    createdAt: notebook.createdAt,
    updatedAt: notebook.updatedAt,
    lastExecutedAt: notebook.lastExecutedAt,
    runtime: {
      pythonVersion: notebook.runtime.pythonVersion,
    },
  };
  return {
    nbformat: NBFORMAT,
    nbformat_minor: NBFORMAT_MINOR,
    metadata,
    cells: notebook.cells.map(toIpynbCell),
  };
}

/* ------------------------------------------------------------------ */
/* Output limits                                                         */
/* ------------------------------------------------------------------ */

function limitOutputs(outputs: PythonCellOutput[]): PythonCellOutput[] {
  const limited: PythonCellOutput[] = [];
  outputs.slice(0, MAX_OUTPUTS_PER_CELL).forEach((output) => {
    if (output.output_type === 'stream') {
      const previous = limited[limited.length - 1];
      // Merge consecutive stream chunks of the same name (as nbclient does)
      if (
        previous &&
        previous.output_type === 'stream' &&
        previous.name === output.name
      ) {
        previous.text = `${previous.text}${output.text}`.slice(
          0,
          MAX_STREAM_CHARS,
        );
        return;
      }
      limited.push({ ...output, text: output.text.slice(0, MAX_STREAM_CHARS) });
      return;
    }
    if (
      output.output_type === 'display_data' ||
      output.output_type === 'execute_result'
    ) {
      const data: Record<string, any> = {};
      Object.entries(output.data).forEach(([mime, value]) => {
        if (typeof value === 'string' && value.length > MAX_MIME_VALUE_CHARS) {
          data['text/plain'] =
            `[output of ${value.length} characters truncated for notebook storage]`;
          return;
        }
        data[mime] = value;
      });
      limited.push({ ...output, data });
      return;
    }
    limited.push(output);
  });
  return limited;
}

/* ------------------------------------------------------------------ */
/* SQL cells                                                            */
/* ------------------------------------------------------------------ */

/** Make a driver row value JSON-serialisable (bigint, Date, Buffer). */
function toJsonValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value)) ? Number(value) : String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  return value;
}

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? toJsonValue(value) : value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value, bigIntReplacer);
  return String(value);
}

/** Plain HTML table used when pandas is not available in the kernel. */
function renderFallbackTable(
  columns: string[],
  rows: Record<string, unknown>[],
): string {
  const preview = rows.slice(0, SQL_FALLBACK_PREVIEW_ROWS);
  const head = columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const body = preview
    .map(
      (row) =>
        `<tr>${columns
          .map((c) => `<td>${escapeHtml(cellText(row[c]))}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  const note =
    rows.length > preview.length
      ? `<p>Showing the first ${preview.length} of ${rows.length} rows.</p>`
      : '';
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${note}`;
}

/** A Python string literal holding `value` (JSON escapes are valid in Python). */
function pyString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Code executed on the kernel to expose a query result as `variable`: a
 * pandas DataFrame when pandas is importable, otherwise a list of dicts plus
 * a display output tagged with SQL_FALLBACK_MIME so the UI can offer to
 * install pandas.
 */
function buildSqlInjectionCode(
  variable: string,
  columns: string[],
  rows: Record<string, unknown>[],
): string {
  const rowsJson = JSON.stringify(rows, bigIntReplacer);
  const fallback = {
    'text/html': renderFallbackTable(columns, rows),
    [SQL_FALLBACK_MIME]: { variable, rowCount: rows.length },
  };
  return [
    'import json as _rs_json, importlib as _rs_importlib',
    '_rs_importlib.invalidate_caches()',
    `_rs_rows = _rs_json.loads(${pyString(rowsJson)})`,
    `_rs_columns = _rs_json.loads(${pyString(JSON.stringify(columns))})`,
    'try:',
    '    import pandas as _rs_pd',
    'except ImportError:',
    '    _rs_pd = None',
    'if _rs_pd is not None:',
    `    ${variable} = _rs_pd.DataFrame(_rs_rows, columns=_rs_columns)`,
    `    _rs_result = ${variable}`,
    'else:',
    `    ${variable} = _rs_rows`,
    '    from IPython.display import display as _rs_display',
    `    _rs_display(_rs_json.loads(${pyString(JSON.stringify(fallback))}), raw=True)`,
    '    del _rs_display',
    '    _rs_result = None',
    'del _rs_rows, _rs_columns, _rs_json, _rs_importlib, _rs_pd',
    '_rs_result',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Legacy SQL notebooks                                                  */
/* ------------------------------------------------------------------ */

/**
 * Convert a legacy SQL notebook (`<id>.json`, see types/notebooks.ts) into a
 * Python notebook with the same id. SQL cells become `sql` cells targeting the
 * default variable, markdown cells map directly. Stored table results are
 * kept as static HTML display outputs and stored errors as error outputs;
 * anything else is dropped.
 *
 * SQL notebooks are deprecated, but this must stay convertible indefinitely
 * so installs upgrading from old versions can still bring their notebooks
 * over.
 */
export function fromLegacySqlNotebook(
  legacy: LegacySqlNotebook,
  runtime: NotebookRuntime,
): PythonNotebook {
  const now = new Date().toISOString();
  const cells = [...(legacy.cells ?? [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map<PythonNotebookCell>((cell) => {
      const isMarkdown = cell.type === 'markdown';
      const outputs: PythonCellOutput[] = [];
      if (!isMarkdown && cell.output?.type === 'table' && cell.output.columns) {
        const rows = (cell.output.data ?? []) as Record<string, unknown>[];
        outputs.push({
          output_type: 'display_data',
          data: { 'text/html': renderFallbackTable(cell.output.columns, rows) },
          metadata: {},
        });
      } else if (!isMarkdown && cell.output?.type === 'error') {
        outputs.push({
          output_type: 'error',
          ename: 'Error',
          evalue: cell.output.error ?? cell.error ?? '',
          traceback: [],
        });
      }
      return {
        id: /^[A-Za-z0-9_-]{1,64}$/.test(cell.id ?? '') ? cell.id : uuidv4(),
        cell_type: isMarkdown ? 'markdown' : 'sql',
        source: cell.content ?? '',
        outputs,
        execution_count: null,
        metadata: isMarkdown
          ? {}
          : { rosetta: { language: 'sql', variable: DEFAULT_SQL_VARIABLE } },
      };
    });
  return {
    id: legacy.id,
    kind: 'python',
    name: legacy.name,
    description: legacy.description,
    cells,
    createdAt: legacy.createdAt ?? now,
    updatedAt: now,
    lastExecutedAt: legacy.lastExecutedAt,
    cellCount: cells.length,
    runtime,
  };
}

interface SqlQueryResult {
  success: boolean;
  data?: Record<string, unknown>[];
  fields?: Array<{ name: string }>;
  rowCount?: number;
  error?: string;
  isCommand?: boolean;
}

/** Run a query on the notebook's connection (regular connection or DuckLake). */
async function runSqlQuery(
  connectionId: string,
  query: string,
): Promise<SqlQueryResult> {
  if (connectionId.startsWith('ducklake-')) {
    return DuckLakeService.executeQuery({
      instanceId: connectionId.replace('ducklake-', ''),
      query,
    }) as Promise<SqlQueryResult>;
  }
  return ConnectorsService.executeQueryForConnection({
    connectionId,
    query,
  }) as Promise<SqlQueryResult>;
}

/* ------------------------------------------------------------------ */
/* Files                                                                */
/* ------------------------------------------------------------------ */

const writeQueues = new Map<string, Promise<unknown>>();

function withWriteLock<T>(
  filePath: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = writeQueues.get(filePath) ?? Promise.resolve();
  const run = previous.then(task, task);
  writeQueues.set(
    filePath,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

function assertSafeId(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid notebook id: "${id}"`);
  }
  return id;
}

function getNotebookPath(connectionId: string, notebookId: string): string {
  const dir = getConnectionDir(normalizeConnectionKey(connectionId));
  return path.join(dir, `${assertSafeId(notebookId)}.ipynb`);
}

async function readIpynb(filePath: string): Promise<IpynbFile> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.cells)) {
    throw new Error('Invalid .ipynb file: missing cells array');
  }
  return parsed as IpynbFile;
}

async function writeIpynb(filePath: string, file: IpynbFile): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(file, null, 1), 'utf-8');
  await fs.rename(tempPath, filePath);
}

export default class PythonNotebooksService {
  private static async load(
    connectionId: string,
    notebookId: string,
  ): Promise<{ notebook: PythonNotebook; file: IpynbFile; filePath: string }> {
    const filePath = getNotebookPath(connectionId, notebookId);
    const file = await readIpynb(filePath);
    const declaredVersion =
      file.metadata?.rosetta?.runtime?.pythonVersion ?? '';
    const runtime = await NotebookEnvService.getStatus(
      notebookId,
      declaredVersion,
    );
    return { notebook: fromIpynb(file, notebookId, runtime), file, filePath };
  }

  private static async save(
    connectionId: string,
    notebook: PythonNotebook,
    existing?: IpynbFile,
  ): Promise<void> {
    const filePath = getNotebookPath(connectionId, notebook.id);
    await fs.mkdirp(path.dirname(filePath));
    await writeIpynb(filePath, toIpynb(notebook, existing));
  }

  static async listNotebooks(connectionId: string): Promise<PythonNotebook[]> {
    const dir = getConnectionDir(normalizeConnectionKey(connectionId));
    if (!(await fs.pathExists(dir))) return [];

    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.ipynb'));
    const notebooks = await Promise.all(
      files.map(async (file) => {
        const id = file.replace(/\.ipynb$/, '');
        try {
          const { notebook } = await this.load(connectionId, id);
          return notebook;
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`Failed to read python notebook ${file}:`, error);
          return null;
        }
      }),
    );

    return notebooks
      .filter((n): n is PythonNotebook => n !== null)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }

  static async getNotebook(
    connectionId: string,
    notebookId: string,
  ): Promise<PythonNotebook | null> {
    try {
      const { notebook } = await this.load(connectionId, notebookId);
      return notebook;
    } catch {
      return null;
    }
  }

  static async createNotebook(
    connectionId: string,
    input: CreatePythonNotebookInput,
  ): Promise<PythonNotebook> {
    const name = input.name.trim();
    if (!name) throw new Error('Notebook name is required');

    const now = new Date().toISOString();
    const id = uuidv4();
    const notebook: PythonNotebook = {
      id,
      kind: 'python',
      name,
      description: input.description?.trim() || undefined,
      cells: [
        {
          id: uuidv4(),
          cell_type: 'code',
          source: '',
          outputs: [],
          execution_count: null,
          metadata: {},
        },
      ],
      createdAt: now,
      updatedAt: now,
      cellCount: 1,
      runtime: {
        pythonVersion: input.pythonVersion,
        venvPath: NotebookEnvService.getVenvDir(id),
        status: 'creating',
      },
    };

    await this.save(connectionId, notebook);
    // Environment creation runs in the background; progress is broadcast via
    // pythonNotebooks:env:event and the status is re-derived from disk.
    NotebookEnvService.createEnv(id, input.pythonVersion).catch(
      () => undefined,
    );
    return notebook;
  }

  /**
   * Convert a legacy SQL notebook (`<id>.json`) in place into a Python
   * notebook with the same id, on the recommended interpreter. The `.json`
   * is removed once the `.ipynb` is written; the environment is then built in
   * the background (downloading the interpreter first if needed).
   */
  static async convertSqlNotebook(
    connectionId: string,
    notebookId: string,
  ): Promise<PythonNotebook> {
    const dir = getConnectionDir(normalizeConnectionKey(connectionId));
    const legacyPath = path.join(dir, `${assertSafeId(notebookId)}.json`);
    const targetPath = getNotebookPath(connectionId, notebookId);
    if (await fs.pathExists(targetPath)) {
      throw new Error('This notebook has already been converted');
    }
    const legacy = JSON.parse(
      await fs.readFile(legacyPath, 'utf-8'),
    ) as LegacySqlNotebook;
    if (!legacy || !Array.isArray(legacy.cells)) {
      throw new Error('Invalid SQL notebook file: missing cells array');
    }

    const notebook = fromLegacySqlNotebook(
      { ...legacy, id: notebookId },
      {
        pythonVersion: RECOMMENDED_PYTHON_VERSION,
        venvPath: NotebookEnvService.getVenvDir(notebookId),
        status: 'creating',
      },
    );
    await this.save(connectionId, notebook);
    await fs.remove(legacyPath);
    NotebookEnvService.createEnv(notebookId, RECOMMENDED_PYTHON_VERSION).catch(
      () => undefined,
    );
    return notebook;
  }

  static async updateNotebook(
    connectionId: string,
    notebookId: string,
    updates: UpdatePythonNotebookInput,
  ): Promise<PythonNotebook> {
    const filePath = getNotebookPath(connectionId, notebookId);
    return withWriteLock(filePath, async () => {
      const { notebook, file } = await this.load(connectionId, notebookId);
      const updated: PythonNotebook = {
        ...notebook,
        ...(updates.name !== undefined && { name: updates.name.trim() }),
        ...(updates.description !== undefined && {
          description: updates.description,
        }),
        ...(updates.cells !== undefined && {
          cells: updates.cells.map((cell) => ({
            ...cell,
            outputs: limitOutputs(cell.outputs ?? []),
          })),
        }),
        updatedAt: new Date().toISOString(),
      };
      updated.cellCount = updated.cells.length;
      await this.save(connectionId, updated, file);
      return updated;
    });
  }

  static async renameNotebook(
    connectionId: string,
    notebookId: string,
    newName: string,
  ): Promise<PythonNotebook> {
    if (!newName.trim()) throw new Error('Notebook name is required');
    return this.updateNotebook(connectionId, notebookId, { name: newName });
  }

  static async duplicateNotebook(
    connectionId: string,
    notebookId: string,
    newName?: string,
  ): Promise<PythonNotebook> {
    const { notebook: source } = await this.load(connectionId, notebookId);
    const now = new Date().toISOString();
    const id = uuidv4();
    const duplicate: PythonNotebook = {
      ...source,
      id,
      name: newName?.trim() || `${source.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
      lastExecutedAt: undefined,
      cells: source.cells.map((cell) => ({
        ...cell,
        id: uuidv4(),
        outputs: [],
        execution_count: null,
      })),
      runtime: {
        pythonVersion: source.runtime.pythonVersion,
        venvPath: NotebookEnvService.getVenvDir(id),
        status: 'creating',
      },
    };
    await this.save(connectionId, duplicate);

    // Recreate the environment with the same interpreter and, best effort,
    // the same installed packages.
    (async () => {
      let requirements: string[] = [];
      try {
        if (source.runtime.status === 'ready') {
          requirements = await NotebookEnvService.freeze(notebookId);
        }
      } catch {
        requirements = [];
      }
      const created = await NotebookEnvService.createEnv(
        id,
        source.runtime.pythonVersion,
      );
      if (created.status === 'ready' && requirements.length > 0) {
        try {
          await NotebookEnvService.installPackages(id, requirements);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('Failed to restore packages into duplicate:', error);
        }
      }
    })().catch(() => undefined);

    return duplicate;
  }

  static async deleteNotebook(
    connectionId: string,
    notebookId: string,
  ): Promise<void> {
    await NotebookKernelService.shutdown(notebookId).catch(() => undefined);
    const filePath = getNotebookPath(connectionId, notebookId);
    await fs.remove(filePath);
    await NotebookEnvService.deleteEnv(notebookId);
  }

  /** Persist a code cell's outputs after execution. */
  static async setCellOutputs(
    connectionId: string,
    notebookId: string,
    cellId: string,
    outputs: PythonCellOutput[],
    executionCount: number | null,
  ): Promise<void> {
    const filePath = getNotebookPath(connectionId, notebookId);
    await withWriteLock(filePath, async () => {
      const { notebook, file } = await this.load(connectionId, notebookId);
      const now = new Date().toISOString();
      const updated: PythonNotebook = {
        ...notebook,
        cells: notebook.cells.map((cell) =>
          cell.id === cellId
            ? {
                ...cell,
                outputs: limitOutputs(outputs),
                execution_count: executionCount,
              }
            : cell,
        ),
        updatedAt: now,
        lastExecutedAt: now,
      };
      await this.save(connectionId, updated, file);
    });
  }

  /**
   * Execute a code cell on the notebook's kernel and persist the outputs.
   * The cell source is taken from the request (not from disk) so unsaved
   * edits run as typed.
   */
  static async executeCell(
    connectionId: string,
    notebookId: string,
    cellId: string,
    code: string,
    options: ExecuteCellOptions = {},
  ): Promise<ExecuteCellResult> {
    const result =
      options.cellType === 'sql'
        ? await this.runSqlCell(
            connectionId,
            notebookId,
            cellId,
            code,
            options.variable || DEFAULT_SQL_VARIABLE,
          )
        : await NotebookKernelService.execute(notebookId, cellId, code);
    await this.setCellOutputs(
      connectionId,
      notebookId,
      cellId,
      result.outputs,
      result.execution_count,
    ).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to persist cell outputs:', error);
    });
    return result;
  }

  /**
   * SQL cell: run the query on the notebook's connection in the main process
   * (credentials never reach the kernel), then hand the rows to the kernel as
   * `variable`. Row-less statements (DDL / DML) only report a summary.
   */
  private static async runSqlCell(
    connectionId: string,
    notebookId: string,
    cellId: string,
    query: string,
    variable: string,
  ): Promise<ExecuteCellResult> {
    const fail = (message: string): ExecuteCellResult => ({
      cellId,
      status: 'error',
      execution_count: null,
      outputs: [
        {
          output_type: 'error',
          ename: 'QueryError',
          evalue: message,
          traceback: [],
        },
      ],
    });

    if (!PYTHON_IDENTIFIER.test(variable)) {
      return fail(`"${variable}" is not a valid Python variable name`);
    }

    let result: SqlQueryResult;
    try {
      result = await runSqlQuery(connectionId, query);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
    if (!result.success || result.error) {
      return fail(result.error || 'Query execution failed');
    }

    const allRows = result.data ?? [];
    const columns =
      result.fields && result.fields.length > 0
        ? result.fields.map((f) => f.name)
        : Object.keys(allRows[0] ?? {});

    if (columns.length === 0) {
      const affected =
        typeof result.rowCount === 'number'
          ? ` ${result.rowCount} row(s) affected.`
          : '';
      return {
        cellId,
        status: 'ok',
        execution_count: null,
        outputs: [
          {
            output_type: 'stream',
            name: 'stdout',
            text: `Statement executed.${affected}\n`,
          },
        ],
      };
    }

    const rows = allRows.slice(0, MAX_SQL_ROWS).map((row) => {
      const clean: Record<string, unknown> = {};
      columns.forEach((c) => {
        clean[c] = toJsonValue(row[c]);
      });
      return clean;
    });

    const kernelResult = await NotebookKernelService.execute(
      notebookId,
      cellId,
      buildSqlInjectionCode(variable, columns, rows),
    );
    if (allRows.length > rows.length) {
      kernelResult.outputs.unshift({
        output_type: 'stream',
        name: 'stderr',
        text: `Result truncated to the first ${MAX_SQL_ROWS} of ${allRows.length} rows.\n`,
      });
    }
    return kernelResult;
  }

  static async recreateEnv(
    connectionId: string,
    notebookId: string,
    pythonVersion?: string,
  ) {
    const { notebook, file } = await this.load(connectionId, notebookId);
    const version = pythonVersion ?? notebook.runtime.pythonVersion;
    await NotebookKernelService.shutdown(notebookId).catch(() => undefined);
    if (version !== notebook.runtime.pythonVersion) {
      const filePath = getNotebookPath(connectionId, notebookId);
      await withWriteLock(filePath, () =>
        this.save(
          connectionId,
          {
            ...notebook,
            runtime: { ...notebook.runtime, pythonVersion: version },
          },
          file,
        ),
      );
    }
    NotebookEnvService.createEnv(notebookId, version).catch(() => undefined);
    return { pythonVersion: version };
  }

  /* ---------------------------------------------------------------- */
  /* Export / import (.ipynb files as-is)                                */
  /* ---------------------------------------------------------------- */

  static async exportNotebook(
    connectionId: string,
    notebookId: string,
  ): Promise<string | null> {
    const { notebook, file } = await this.load(connectionId, notebookId);
    const result = await dialog.showSaveDialog({
      title: 'Export Python Notebook',
      defaultPath: `${notebook.name.replace(/[\\/:*?"<>|]/g, '_')}.ipynb`,
      filters: [{ name: 'Jupyter Notebook', extensions: ['ipynb'] }],
    });
    if (result.canceled || !result.filePath) return null;

    // Include the frozen requirements so the environment can be rebuilt on
    // import.
    let requirements: string[] = [];
    try {
      if (notebook.runtime.status === 'ready') {
        requirements = await NotebookEnvService.freeze(notebookId);
      }
    } catch {
      requirements = [];
    }
    const exported = toIpynb(notebook, file);
    exported.metadata.rosetta = {
      ...exported.metadata.rosetta,
      requirements,
    };
    await fs.writeFile(result.filePath, JSON.stringify(exported, null, 1));
    return result.filePath;
  }

  static async selectImportFile(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: 'Import Jupyter Notebook',
      filters: [{ name: 'Jupyter Notebook', extensions: ['ipynb'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }

  static async importNotebook(
    connectionId: string,
    filePath: string,
    pythonVersion: string,
  ): Promise<PythonNotebook> {
    const stat = await fs.stat(filePath);
    if (stat.size > 100 * 1024 * 1024) {
      throw new Error('File is too large (max 100MB)');
    }
    const file = await readIpynb(filePath);
    const id = uuidv4();
    const now = new Date().toISOString();
    const baseName = path.basename(filePath, '.ipynb');
    const parsed = fromIpynb(file, id, {
      pythonVersion,
      venvPath: NotebookEnvService.getVenvDir(id),
      status: 'creating',
    });
    const notebook: PythonNotebook = {
      ...parsed,
      id,
      name:
        typeof file.metadata?.rosetta?.name === 'string'
          ? file.metadata.rosetta.name
          : baseName,
      createdAt: now,
      updatedAt: now,
      lastExecutedAt: undefined,
      cells: parsed.cells.map((cell) => ({ ...cell, id: uuidv4() })),
    };
    notebook.cellCount = notebook.cells.length;

    // Drop foreign studio metadata but keep the rest of the notebook metadata.
    const { rosetta, ...foreignMetadata } = file.metadata ?? {};
    await this.save(connectionId, notebook, {
      ...file,
      metadata: foreignMetadata,
    });

    const requirements: string[] = Array.isArray(rosetta?.requirements)
      ? rosetta.requirements.filter((r: unknown) => typeof r === 'string')
      : [];
    (async () => {
      const created = await NotebookEnvService.createEnv(id, pythonVersion);
      if (created.status === 'ready' && requirements.length > 0) {
        try {
          await NotebookEnvService.installPackages(id, requirements);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('Failed to install imported requirements:', error);
        }
      }
    })().catch(() => undefined);

    return notebook;
  }
}
