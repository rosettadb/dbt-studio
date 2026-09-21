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
import NotebookEnvService from './notebookEnv.service';
import NotebookKernelService from './notebookKernel.service';
import type {
  CreatePythonNotebookInput,
  ExecuteCellResult,
  PythonCellOutput,
  PythonNotebook,
  PythonNotebookCell,
  UpdatePythonNotebookInput,
} from '../../types/pythonNotebooks';

const NBFORMAT = 4;
const NBFORMAT_MINOR = 5;
const MAX_STREAM_CHARS = 200_000;
const MAX_OUTPUTS_PER_CELL = 500;
const MAX_MIME_VALUE_CHARS = 8_000_000; // ~6MB base64 image

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

function fromIpynbCell(raw: IpynbCell): PythonNotebookCell {
  const cellType = raw.cell_type === 'markdown' ? 'markdown' : 'code';
  return {
    id: raw.id && /^[A-Za-z0-9_-]{1,64}$/.test(raw.id) ? raw.id : uuidv4(),
    cell_type: cellType,
    source: joinMultiline(raw.source),
    outputs:
      cellType === 'code'
        ? (raw.outputs ?? [])
            .map(normaliseOutput)
            .filter((o): o is PythonCellOutput => o !== null)
        : [],
    execution_count:
      cellType === 'code' && typeof raw.execution_count === 'number'
        ? raw.execution_count
        : null,
    metadata: raw.metadata ?? {},
  };
}

function toIpynbCell(cell: PythonNotebookCell): IpynbCell {
  const base: IpynbCell = {
    id: cell.id,
    cell_type: cell.cell_type,
    metadata: cell.metadata ?? {},
    source: splitMultiline(cell.source),
  };
  if (cell.cell_type === 'code') {
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
  ): Promise<ExecuteCellResult> {
    const result = await NotebookKernelService.execute(
      notebookId,
      cellId,
      code,
    );
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
