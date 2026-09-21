/**
 * Notebook Kernel Service
 *
 * One Jupyter kernel per Python notebook. Each kernel is an `ipykernel`
 * launched inside the notebook's own venv by `notebook_kernel_bridge.py`
 * (shipped in resources/python). The bridge relays the Jupyter messaging
 * protocol as newline-delimited JSON over stdin / stdout, so this service
 * only deals with a child process and JSON lines.
 *
 * Events are pushed to renderers on `pythonNotebooks:kernel:event`.
 *
 * Follows BE-03 (one cohesive service).
 */

import { app } from 'electron';
import { ChildProcess, spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import NotebookEnvService from './notebookEnv.service';
import { broadcastToRenderers } from '../utils/rendererBroadcast';
import type {
  ExecuteCellResult,
  KernelEvent,
  KernelState,
  KernelStatus,
  PythonCellOutput,
} from '../../types/pythonNotebooks';

const START_TIMEOUT_MS = 120_000;
const SHUTDOWN_GRACE_MS = 5_000;

interface PendingExecution {
  requestId: string;
  cellId: string;
  outputs: PythonCellOutput[];
  resolve: (result: ExecuteCellResult) => void;
  reject: (error: Error) => void;
}

interface Kernel {
  notebookId: string;
  child: ChildProcess;
  status: KernelStatus;
  error?: string;
  ready: Promise<void>;
  resolveReady: () => void;
  rejectReady: (error: Error) => void;
  pending: Map<string, PendingExecution>;
  order: string[];
  exited: Promise<void>;
}

const BRIDGE_RELATIVE = ['resources', 'python', 'notebook_kernel_bridge.py'];

function getBridgePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...BRIDGE_RELATIVE);
  }
  // Dev: the main bundle lives in .erb/dll (two levels below the repo root);
  // unbundled runs (ts-node / tests) start from src/main/services.
  const candidates = [
    path.join(__dirname, '..', '..', ...BRIDGE_RELATIVE),
    path.join(__dirname, '..', '..', '..', ...BRIDGE_RELATIVE),
    path.join(process.cwd(), ...BRIDGE_RELATIVE),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

export default class NotebookKernelService {
  private static kernels = new Map<string, Kernel>();

  private static starting = new Map<string, Promise<Kernel>>();

  private static emit(event: KernelEvent) {
    broadcastToRenderers('pythonNotebooks:kernel:event', event);
  }

  private static stateOf(
    kernel: Kernel | undefined,
    notebookId: string,
  ): KernelState {
    if (!kernel) {
      return { notebookId, status: 'stopped', queue: [] };
    }
    return {
      notebookId,
      status: kernel.status,
      error: kernel.error,
      queue: kernel.order.map(
        (requestId) => kernel.pending.get(requestId)?.cellId ?? '',
      ),
    };
  }

  private static setStatus(
    kernel: Kernel,
    status: KernelStatus,
    error?: string,
  ) {
    kernel.status = status;
    kernel.error = error;
    this.emit({
      type: 'status',
      notebookId: kernel.notebookId,
      state: this.stateOf(kernel, kernel.notebookId),
    });
  }

  static getStatus(notebookId: string): KernelState {
    return this.stateOf(this.kernels.get(notebookId), notebookId);
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                          */
  /* ---------------------------------------------------------------- */

  static async start(notebookId: string): Promise<KernelState> {
    const kernel = await this.ensureKernel(notebookId);
    return this.stateOf(kernel, notebookId);
  }

  private static async ensureKernel(notebookId: string): Promise<Kernel> {
    const existing = this.kernels.get(notebookId);
    if (existing && existing.status !== 'error') {
      await existing.ready;
      return existing;
    }
    const inFlight = this.starting.get(notebookId);
    if (inFlight) return inFlight;

    const run = this.spawnKernel(notebookId).finally(() => {
      this.starting.delete(notebookId);
    });
    this.starting.set(notebookId, run);
    return run;
  }

  private static async spawnKernel(notebookId: string): Promise<Kernel> {
    const stale = this.kernels.get(notebookId);
    if (stale) {
      await this.shutdown(notebookId).catch(() => undefined);
    }

    const env = await NotebookEnvService.getStatus(notebookId);
    if (env.status !== 'ready') {
      throw new Error(
        env.status === 'creating'
          ? 'The notebook environment is still being created.'
          : 'The notebook environment is missing. Recreate it from the kernel bar.',
      );
    }

    const python = NotebookEnvService.getVenvPython(notebookId);
    const bridge = getBridgePath();
    if (!(await fs.pathExists(bridge))) {
      throw new Error(`Kernel bridge script not found at ${bridge}`);
    }
    const workDir = NotebookEnvService.getWorkDir(notebookId);
    await fs.mkdirp(workDir);
    const jupyterDir = path.join(env.venvPath, '.jupyter');
    await fs.mkdirp(jupyterDir);

    const child = spawn(python, [bridge], {
      cwd: workDir,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        JUPYTER_RUNTIME_DIR: path.join(jupyterDir, 'runtime'),
        JUPYTER_DATA_DIR: path.join(jupyterDir, 'data'),
        JUPYTER_CONFIG_DIR: path.join(jupyterDir, 'config'),
        MPLBACKEND: 'module://matplotlib_inline.backend_inline',
        // Make sure the venv's own tools win over anything on PATH
        VIRTUAL_ENV: env.venvPath,
        PATH: `${path.dirname(python)}${path.delimiter}${process.env.PATH ?? ''}`,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    // Avoid unhandled rejection noise if nobody awaits `ready` after failure.
    ready.catch(() => undefined);

    let resolveExited!: () => void;
    const exited = new Promise<void>((resolve) => {
      resolveExited = resolve;
    });

    const kernel: Kernel = {
      notebookId,
      child,
      status: 'starting',
      ready,
      resolveReady,
      rejectReady,
      pending: new Map(),
      order: [],
      exited,
    };
    this.kernels.set(notebookId, kernel);
    this.setStatus(kernel, 'starting');

    const startTimer = setTimeout(() => {
      if (kernel.status === 'starting') {
        const error = new Error('Kernel did not become ready in time');
        this.setStatus(kernel, 'error', error.message);
        kernel.rejectReady(error);
        child.kill('SIGKILL');
      }
    }, START_TIMEOUT_MS);

    const rl = readline.createInterface({ input: child.stdout! });
    rl.on('line', (line) => this.handleLine(kernel, line));

    let stderrTail = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = `${stderrTail}${chunk.toString()}`.slice(-4000);
    });

    child.on('error', (error) => {
      clearTimeout(startTimer);
      this.setStatus(kernel, 'error', error.message);
      kernel.rejectReady(error);
      this.failPending(kernel, error);
    });

    child.on('close', (code, signal) => {
      clearTimeout(startTimer);
      rl.close();
      const wasStopping = kernel.status === 'stopped';
      if (!wasStopping) {
        const message = `Kernel process exited unexpectedly (code ${code ?? 'null'}, signal ${signal ?? 'null'})${
          stderrTail.trim() ? `\n${stderrTail.trim()}` : ''
        }`;
        kernel.error = message;
        kernel.status = 'error';
        this.emit({
          type: 'status',
          notebookId,
          state: this.stateOf(kernel, notebookId),
        });
        kernel.rejectReady(new Error(message));
        this.failPending(kernel, new Error(message));
      }
      if (this.kernels.get(notebookId) === kernel) {
        this.kernels.delete(notebookId);
      }
      resolveExited();
    });

    await ready;
    clearTimeout(startTimer);
    return kernel;
  }

  private static failPending(kernel: Kernel, error: Error) {
    kernel.pending.forEach((pending) => {
      this.emit({
        type: 'execute_done',
        notebookId: kernel.notebookId,
        cellId: pending.cellId,
        status: 'abort',
        execution_count: null,
      });
      pending.reject(error);
    });
    kernel.pending.clear();
    kernel.order = [];
  }

  private static handleLine(kernel: Kernel, line: string) {
    let message: any;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const { notebookId } = kernel;

    switch (message.type) {
      case 'ready':
        this.setStatus(kernel, 'idle');
        kernel.resolveReady();
        break;
      case 'status':
        if (kernel.status === 'idle' || kernel.status === 'busy') {
          this.setStatus(kernel, message.status === 'busy' ? 'busy' : 'idle');
        }
        break;
      case 'output': {
        const pending = kernel.pending.get(message.id);
        if (!pending || !message.output) break;
        pending.outputs.push(message.output);
        this.emit({
          type: 'output',
          notebookId,
          cellId: pending.cellId,
          output: message.output,
        });
        break;
      }
      case 'clear_output': {
        const pending = kernel.pending.get(message.id);
        if (!pending) break;
        pending.outputs = [];
        this.emit({ type: 'clear_output', notebookId, cellId: pending.cellId });
        break;
      }
      case 'execute_done': {
        const pending = kernel.pending.get(message.id);
        if (!pending) break;
        kernel.pending.delete(message.id);
        kernel.order = kernel.order.filter((id) => id !== message.id);
        const status: ExecuteCellResult['status'] =
          message.status === 'error' || message.status === 'abort'
            ? message.status
            : 'ok';
        const executionCount =
          typeof message.execution_count === 'number'
            ? message.execution_count
            : null;
        this.emit({
          type: 'execute_done',
          notebookId,
          cellId: pending.cellId,
          status,
          execution_count: executionCount,
        });
        pending.resolve({
          cellId: pending.cellId,
          status,
          execution_count: executionCount,
          outputs: pending.outputs,
        });
        break;
      }
      case 'fatal': {
        const error = new Error(String(message.message ?? 'Kernel failed'));
        this.setStatus(kernel, 'error', error.message);
        kernel.rejectReady(error);
        this.failPending(kernel, error);
        break;
      }
      case 'log':
        // eslint-disable-next-line no-console
        console.log(`[kernel ${notebookId}] ${message.message}`);
        break;
      default:
        break;
    }
  }

  private static send(kernel: Kernel, command: Record<string, unknown>) {
    if (!kernel.child.stdin || kernel.child.stdin.destroyed) {
      throw new Error('Kernel stdin is closed');
    }
    kernel.child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  /* ---------------------------------------------------------------- */
  /* Execution                                                          */
  /* ---------------------------------------------------------------- */

  static async execute(
    notebookId: string,
    cellId: string,
    code: string,
  ): Promise<ExecuteCellResult> {
    const kernel = await this.ensureKernel(notebookId);
    const requestId = uuidv4();

    this.emit({ type: 'execute_start', notebookId, cellId });

    return new Promise<ExecuteCellResult>((resolve, reject) => {
      kernel.pending.set(requestId, {
        requestId,
        cellId,
        outputs: [],
        resolve,
        reject,
      });
      kernel.order.push(requestId);
      try {
        this.send(kernel, { op: 'execute', id: requestId, code });
      } catch (error) {
        kernel.pending.delete(requestId);
        kernel.order = kernel.order.filter((id) => id !== requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  static async interrupt(notebookId: string): Promise<KernelState> {
    const kernel = this.kernels.get(notebookId);
    if (kernel && kernel.status !== 'stopped') {
      this.send(kernel, { op: 'interrupt' });
    }
    return this.getStatus(notebookId);
  }

  static async shutdown(notebookId: string): Promise<KernelState> {
    const kernel = this.kernels.get(notebookId);
    if (!kernel) return this.getStatus(notebookId);

    kernel.status = 'stopped';
    this.failPending(kernel, new Error('Kernel was shut down'));
    try {
      this.send(kernel, { op: 'shutdown' });
      kernel.child.stdin?.end();
    } catch {
      // stdin already closed
    }

    const timer = setTimeout(() => {
      if (kernel.child.exitCode === null && !kernel.child.killed) {
        kernel.child.kill('SIGKILL');
      }
    }, SHUTDOWN_GRACE_MS);
    await kernel.exited;
    clearTimeout(timer);

    this.kernels.delete(notebookId);
    this.emit({
      type: 'status',
      notebookId,
      state: { notebookId, status: 'stopped', queue: [] },
    });
    return this.getStatus(notebookId);
  }

  static async restart(notebookId: string): Promise<KernelState> {
    this.emit({
      type: 'status',
      notebookId,
      state: { notebookId, status: 'restarting', queue: [] },
    });
    await this.shutdown(notebookId);
    return this.start(notebookId);
  }

  static async shutdownAll(): Promise<void> {
    await Promise.all(
      Array.from(this.kernels.keys()).map((id) =>
        this.shutdown(id).catch(() => undefined),
      ),
    );
  }
}
