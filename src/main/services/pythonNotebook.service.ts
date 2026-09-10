import { app, WebContents } from 'electron';
import fs from 'fs-extra';
import path from 'path';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import type {
  PythonNotebookEvent,
  PythonNotebookExecuteRequest,
  PythonNotebookExecuteResponse,
  PythonNotebookPackageStatus,
  PythonNotebookRuntimeStatus,
} from '../../types/notebooks';
import SettingsService from './settings.service';
import { NotebooksService } from './notebooks.service';

const RUNTIME_VERSION = '1';
const MINIMUM_PYTHON_VERSION = '3.9';
const MAX_DIAGNOSTIC_LENGTH = 500;
const MAX_LIVE_SESSIONS = 2;
const MAX_EVENT_LINE_BYTES = 128 * 1024;
const MAX_EVENT_TEXT_LENGTH = 64 * 1024;
const MAX_RETRY_IDS = 100;
const REQUIRED_PACKAGES = [
  { name: 'ipykernel', version: '6.30.1' },
  { name: 'jupyter_client', version: '8.6.3' },
  { name: 'nbformat', version: '5.10.4' },
] as const;

type PackageName = (typeof REQUIRED_PACKAGES)[number]['name'];
type OperationState = PythonNotebookRuntimeStatus['operation']['state'];
type ProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type NotebookSession = {
  notebookId: string;
  ownerWebContentsId: number;
  sender: WebContents;
  process: ChildProcessWithoutNullStreams;
  pendingLine: string;
  retries: Map<string, string>;
};

export class PythonNotebookService {
  private static activeSessionCount = 0;

  private static sessions = new Map<string, NotebookSession>();

  private static operation: PythonNotebookRuntimeStatus['operation'] = {
    state: 'idle',
  };

  private static operationPromise: Promise<void> | null = null;

  private static getRuntimeRoot(): string {
    return path.join(app.getPath('userData'), 'python-notebooks', 'runtime');
  }

  private static getRuntimeDirectory(): string {
    return path.join(this.getRuntimeRoot(), RUNTIME_VERSION);
  }

  private static getPythonPath(
    runtimeDirectory = this.getRuntimeDirectory(),
  ): string {
    return path.join(
      runtimeDirectory,
      process.platform === 'win32' ? 'Scripts' : 'bin',
      process.platform === 'win32' ? 'python.exe' : 'python',
    );
  }

  private static getResourcePath(filename: string): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'resources', 'python', filename);
    }
    return path.join(__dirname, '..', '..', 'resources', 'python', filename);
  }

  private static isAtLeastMinimumVersion(version: string | null): boolean {
    if (!version) return false;
    const [major = 0, minor = 0] = version
      .split('.')
      .slice(0, 2)
      .map((part) => Number.parseInt(part, 10));
    return major > 3 || (major === 3 && minor >= 9);
  }

  private static sanitizeDiagnostic(message: string): string {
    return message
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_DIAGNOSTIC_LENGTH);
  }

  private static async runProcess(
    command: string,
    args: string[],
    input?: string,
  ): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { shell: false });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout = (stdout + chunk.toString()).slice(-MAX_DIAGNOSTIC_LENGTH);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-MAX_DIAGNOSTIC_LENGTH);
      });
      child.on('error', reject);
      if (input !== undefined) {
        child.stdin.write(input);
        child.stdin.end();
      }
      child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
    });
  }

  private static async readInstalledPackages(
    pythonPath: string,
  ): Promise<Record<PackageName, string | null>> {
    const names = REQUIRED_PACKAGES.map((item) => item.name);
    const script = [
      'import importlib.metadata as metadata',
      'import json',
      `names = ${JSON.stringify(names)}`,
      'def version(name):',
      '    try:',
      '        return metadata.version(name)',
      '    except metadata.PackageNotFoundError:',
      '        return None',
      'print(json.dumps({name: version(name) for name in names}))',
    ].join('\n');
    const result = await this.runProcess(pythonPath, ['-c', script]);
    if (result.exitCode !== 0) {
      throw new Error('Unable to inspect the dedicated Jupyter environment.');
    }
    return JSON.parse(result.stdout) as Record<PackageName, string | null>;
  }

  private static async runHealthProbe(
    pythonPath: string,
  ): Promise<Record<PackageName, string>> {
    const result = await this.runProcess(
      pythonPath,
      [this.getResourcePath('notebook_bridge.py')],
      JSON.stringify({ operation: 'check' }),
    );
    if (result.exitCode !== 0) {
      throw new Error('The Jupyter kernel health check did not complete.');
    }
    try {
      const response = JSON.parse(result.stdout) as {
        ok?: boolean;
        versions?: Record<PackageName, string>;
      };
      if (response.ok && response.versions) return response.versions;
    } catch {
      // Return the same non-sensitive setup error below.
    }
    throw new Error('The Jupyter kernel health check failed.');
  }

  private static async withOperation(
    state: Exclude<OperationState, 'idle'>,
    message: string,
    action: () => Promise<void>,
  ): Promise<PythonNotebookRuntimeStatus> {
    if (this.operationPromise) return this.getRuntimeStatus();

    this.operation = { state, message };
    this.operationPromise = action();
    try {
      await this.operationPromise;
      this.operation = { state: 'idle' };
    } catch (error) {
      this.operation = {
        state: 'idle',
        error: this.sanitizeDiagnostic(
          error instanceof Error
            ? error.message
            : 'Jupyter runtime operation failed.',
        ),
      };
    } finally {
      this.operationPromise = null;
    }
    return this.getRuntimeStatus();
  }

  private static async requireManagedPython(): Promise<string> {
    const settings = await SettingsService.loadSettings();
    if (
      !settings.pythonBinary ||
      !(await fs.pathExists(settings.pythonBinary))
    ) {
      throw new Error(
        'Install managed Python before setting up Jupyter packages.',
      );
    }
    if (!this.isAtLeastMinimumVersion(settings.pythonVersion || null)) {
      throw new Error(
        `Jupyter packages require Python ${MINIMUM_PYTHON_VERSION} or later.`,
      );
    }
    return settings.pythonBinary;
  }

  private static emit(session: NotebookSession, event: PythonNotebookEvent) {
    if (!session.sender.isDestroyed()) {
      session.sender.send('notebooks:python:event', event);
    }
  }

  private static normalizeBridgeEvent(
    session: NotebookSession,
    event: Record<string, unknown>,
  ): PythonNotebookEvent | null {
    const executionId =
      typeof event.executionId === 'string' ? event.executionId : null;
    const cellId = typeof event.cellId === 'string' ? event.cellId : null;
    if (!executionId || !cellId) return null;

    if (event.type === 'stream' || event.type === 'result') {
      return {
        type: event.type,
        notebookId: session.notebookId,
        cellId,
        executionId,
        text: String(event.text ?? '').slice(0, MAX_EVENT_TEXT_LENGTH),
        truncated: Boolean(event.truncated),
      };
    }
    if (event.type === 'error') {
      return {
        type: 'error',
        notebookId: session.notebookId,
        cellId,
        executionId,
        name: String(event.name ?? 'PythonError').slice(0, 120),
        text: String(event.text ?? '').slice(0, MAX_EVENT_TEXT_LENGTH),
        truncated: Boolean(event.truncated),
      };
    }
    if (
      event.type === 'status' &&
      (event.status === 'success' || event.status === 'error')
    ) {
      return {
        type: 'status',
        notebookId: session.notebookId,
        cellId,
        executionId,
        status: event.status,
      };
    }
    return null;
  }

  private static consumeBridgeOutput(session: NotebookSession, chunk: Buffer) {
    session.pendingLine = (session.pendingLine + chunk.toString()).slice(
      -MAX_EVENT_LINE_BYTES,
    );
    const lines = session.pendingLine.split('\n');
    session.pendingLine = lines.pop() ?? '';
    lines.forEach((line) => {
      if (!line || line.length > MAX_EVENT_LINE_BYTES) return;
      try {
        const event = this.normalizeBridgeEvent(
          session,
          JSON.parse(line) as Record<string, unknown>,
        );
        if (event) this.emit(session, event);
      } catch {
        // The bridge's stdout protocol is deliberately fail-closed.
      }
    });
  }

  private static async startSession(
    notebookId: string,
    sender: WebContents,
  ): Promise<NotebookSession> {
    const existing = this.sessions.get(notebookId);
    if (existing) {
      if (existing.ownerWebContentsId !== sender.id) {
        throw new Error('This notebook kernel belongs to another window.');
      }
      return existing;
    }
    if (this.sessions.size >= MAX_LIVE_SESSIONS) {
      throw new Error(
        'Close a running Python notebook before starting another kernel.',
      );
    }
    const status = await this.getRuntimeStatus();
    if (status.state !== 'ready') {
      throw new Error(
        status.message || 'Set up Jupyter packages before running Python.',
      );
    }

    const child = spawn(
      this.getPythonPath(),
      [this.getResourcePath('notebook_bridge.py'), '--serve'],
      {
        shell: false,
        stdio: 'pipe',
      },
    );
    const session: NotebookSession = {
      notebookId,
      ownerWebContentsId: sender.id,
      sender,
      process: child,
      pendingLine: '',
      retries: new Map(),
    };
    child.stdout.on('data', (chunk: Buffer) =>
      this.consumeBridgeOutput(session, chunk),
    );
    child.stderr.on('data', () => undefined);
    child.on('error', () => this.sessions.delete(notebookId));
    child.on('exit', () => {
      this.sessions.delete(notebookId);
      this.activeSessionCount = this.sessions.size;
    });
    this.sessions.set(notebookId, session);
    this.activeSessionCount = this.sessions.size;
    sender.once('destroyed', () => {
      const ownedSession = this.sessions.get(notebookId);
      if (ownedSession?.ownerWebContentsId === sender.id) {
        ownedSession.process.stdin.end(
          `${JSON.stringify({ operation: 'shutdown' })}\n`,
        );
      }
    });
    return session;
  }

  static async execute(
    request: PythonNotebookExecuteRequest,
    sender: WebContents,
  ): Promise<PythonNotebookExecuteResponse> {
    if (!request.requestId || request.requestId.length > 128) {
      throw new Error('Invalid Python execution request.');
    }
    const notebook = await NotebooksService.getPythonNotebook(
      request.notebookId,
    );
    if (!notebook || notebook.revision !== request.revision) {
      throw new Error(
        'Save the latest notebook changes before running a cell.',
      );
    }
    const cell = notebook.cells.find((item) => item.id === request.cellId);
    if (!cell || cell.cellType !== 'code') {
      throw new Error('Only Python code cells can be run.');
    }

    const session = await this.startSession(request.notebookId, sender);
    const retryExecutionId = session.retries.get(request.requestId);
    if (retryExecutionId) return { executionId: retryExecutionId };

    const executionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    session.retries.set(request.requestId, executionId);
    if (session.retries.size > MAX_RETRY_IDS) {
      session.retries.delete(session.retries.keys().next().value as string);
    }
    this.emit(session, {
      type: 'status',
      notebookId: request.notebookId,
      cellId: request.cellId,
      executionId,
      status: 'running',
    });
    session.process.stdin.write(
      `${JSON.stringify({
        operation: 'execute',
        cellId: request.cellId,
        executionId,
        code: cell.source,
      })}\n`,
    );
    return { executionId };
  }

  static async shutdown(
    notebookId: string,
    sender: WebContents,
  ): Promise<void> {
    const session = this.sessions.get(notebookId);
    if (!session) return;
    if (session.ownerWebContentsId !== sender.id) {
      throw new Error('This notebook kernel belongs to another window.');
    }
    session.process.stdin.end(`${JSON.stringify({ operation: 'shutdown' })}\n`);
  }

  static async shutdownAll(): Promise<void> {
    await Promise.all(
      [...this.sessions.values()].map(
        async (session) =>
          new Promise<void>((resolve) => {
            session.process.once('exit', () => resolve());
            session.process.stdin.end(
              `${JSON.stringify({ operation: 'shutdown' })}\n`,
            );
            setTimeout(() => {
              if (!session.process.killed) session.process.kill();
              resolve();
            }, 3000);
          }),
      ),
    );
    this.sessions.clear();
    this.activeSessionCount = 0;
  }

  static async getRuntimeStatus(): Promise<PythonNotebookRuntimeStatus> {
    const settings = await SettingsService.loadSettings();
    const managedPythonAvailable = Boolean(
      settings.pythonBinary && (await fs.pathExists(settings.pythonBinary)),
    );
    const runtimeDirectory = this.getRuntimeDirectory();
    const packages: PythonNotebookPackageStatus[] = REQUIRED_PACKAGES.map(
      (item) => ({
        name: item.name,
        requiredVersion: item.version,
        installedVersion: null,
      }),
    );
    const baseStatus = {
      managedPython: {
        available: managedPythonAvailable,
        version: settings.pythonVersion || null,
        minimumVersion: MINIMUM_PYTHON_VERSION,
      },
      environmentPath: runtimeDirectory,
      packages,
      activeSessionCount: this.activeSessionCount,
      operation: this.operation,
    };

    if (this.operation.state === 'installing') {
      return {
        ...baseStatus,
        state: 'installing',
        message: this.operation.message,
      };
    }
    if (!managedPythonAvailable) {
      return {
        ...baseStatus,
        state: 'not-installed',
        message: 'Install managed Python before setting up Jupyter packages.',
      };
    }
    if (!this.isAtLeastMinimumVersion(settings.pythonVersion || null)) {
      return {
        ...baseStatus,
        state: 'needs-attention',
        message: `Jupyter packages require Python ${MINIMUM_PYTHON_VERSION} or later.`,
      };
    }
    if (!(await fs.pathExists(this.getPythonPath(runtimeDirectory)))) {
      return {
        ...baseStatus,
        state: 'not-installed',
        message:
          this.operation.error || 'Jupyter packages have not been installed.',
      };
    }

    try {
      const installed = await this.readInstalledPackages(
        this.getPythonPath(runtimeDirectory),
      );
      const resolvedPackages = packages.map((item) => ({
        ...item,
        installedVersion: installed[item.name],
      }));
      const isReady = resolvedPackages.every(
        (item) => item.installedVersion === item.requiredVersion,
      );
      return {
        ...baseStatus,
        packages: resolvedPackages,
        state: isReady && !this.operation.error ? 'ready' : 'needs-attention',
        message:
          this.operation.error ||
          (isReady
            ? this.operation.message
            : 'One or more required Jupyter packages are missing or incompatible.'),
      };
    } catch {
      return {
        ...baseStatus,
        state: 'needs-attention',
        message: 'The Jupyter runtime could not be inspected.',
      };
    }
  }

  static async installRuntime(): Promise<PythonNotebookRuntimeStatus> {
    return this.withOperation(
      'installing',
      'Creating dedicated Jupyter environment…',
      async () => {
        const basePython = await this.requireManagedPython();
        const runtimeRoot = this.getRuntimeRoot();
        const runtimeDirectory = this.getRuntimeDirectory();
        const timestamp = Date.now();
        const stageDirectory = path.join(
          runtimeRoot,
          `${RUNTIME_VERSION}.staging-${timestamp}`,
        );
        const previousDirectory = path.join(
          runtimeRoot,
          `${RUNTIME_VERSION}.previous-${timestamp}`,
        );

        await fs.ensureDir(runtimeRoot);
        try {
          let result = await this.runProcess(basePython, [
            '-m',
            'venv',
            stageDirectory,
          ]);
          if (result.exitCode !== 0) {
            throw new Error(
              'Could not create the dedicated Jupyter environment.',
            );
          }

          this.operation = {
            state: 'installing',
            message: 'Installing Jupyter packages…',
          };
          result = await this.runProcess(this.getPythonPath(stageDirectory), [
            '-m',
            'pip',
            'install',
            '--disable-pip-version-check',
            '--no-input',
            '--requirement',
            this.getResourcePath('notebook-requirements.txt'),
          ]);
          if (result.exitCode !== 0) {
            throw new Error('Could not install the required Jupyter packages.');
          }

          this.operation = {
            state: 'installing',
            message: 'Verifying the Jupyter kernel…',
          };
          const versions = await this.runHealthProbe(
            this.getPythonPath(stageDirectory),
          );
          if (
            !REQUIRED_PACKAGES.every(
              (item) => versions[item.name] === item.version,
            )
          ) {
            throw new Error(
              'The dedicated Jupyter environment has incompatible package versions.',
            );
          }

          if (await fs.pathExists(runtimeDirectory)) {
            await fs.move(runtimeDirectory, previousDirectory);
          }
          try {
            await fs.move(stageDirectory, runtimeDirectory);
          } catch (error) {
            if (await fs.pathExists(previousDirectory)) {
              await fs.move(previousDirectory, runtimeDirectory);
            }
            throw error;
          }
          await fs.remove(previousDirectory);
        } finally {
          await fs.remove(stageDirectory);
        }
      },
    );
  }

  static async checkRuntime(): Promise<PythonNotebookRuntimeStatus> {
    return this.withOperation(
      'checking',
      'Checking the Jupyter kernel…',
      async () => {
        await this.requireManagedPython();
        const pythonPath = this.getPythonPath();
        if (!(await fs.pathExists(pythonPath))) {
          throw new Error(
            'Install Jupyter packages before checking the runtime.',
          );
        }
        const versions = await this.runHealthProbe(pythonPath);
        if (
          !REQUIRED_PACKAGES.every(
            (item) => versions[item.name] === item.version,
          )
        ) {
          throw new Error(
            'The dedicated Jupyter environment has incompatible package versions.',
          );
        }
      },
    );
  }
}
