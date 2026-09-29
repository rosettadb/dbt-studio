/**
 * Notebook Environment Service
 *
 * One virtualenv per Python notebook, rooted at
 * `userData/notebook-venvs/<notebookId>/`. Environments are created from a
 * managed interpreter (PythonRuntimesService) and get `ipykernel` installed so
 * the kernel bridge can launch a real Jupyter kernel inside them.
 *
 * The studio's global venv (`userData/venv`) is never read or written here.
 *
 * Follows BE-03 (one cohesive service).
 */

import { app } from 'electron';
import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import PythonRuntimesService from './pythonRuntimes.service';
import { broadcastToRenderers } from '../utils/rendererBroadcast';
import type {
  NotebookEnvEvent,
  NotebookEnvPackage,
  NotebookEnvStatus,
  NotebookRuntime,
} from '../../types/pythonNotebooks';

const ENV_MARKER_FILE = '.rosetta-notebook-env.json';
const KERNEL_PACKAGES = ['ipykernel>=6.29', 'jupyter_client>=8'];
const PIP_TIMEOUT_MS = 15 * 60 * 1000;
const VENV_TIMEOUT_MS = 5 * 60 * 1000;

// Accept "name", "name[extra]", "name==1.2", "name>=1,<2" ... Reject anything
// that could be interpreted by pip as a flag or a path/URL.
const PACKAGE_SPEC_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9,._ -]+\])?\s*((~=|==|!=|<=|>=|<|>|===)\s*[A-Za-z0-9.*+!-]+(\s*,\s*(~=|==|!=|<=|>=|<|>|===)\s*[A-Za-z0-9.*+!-]+)*)?$/;

const PACKAGE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

interface EnvMarker {
  pythonVersion: string;
  createdAt: string;
}

// ANSI CSI / OSC sequences (colours, cursor moves, "erase line") plus the
// box-drawing characters pip's rich progress bar paints with.
const CONTROL_SEQUENCE_PATTERN =
  // eslint-disable-next-line no-control-regex
  /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007|[\u2500-\u257f]/g;

export function stripControlSequences(text: string): string {
  return text.replace(CONTROL_SEQUENCE_PATTERN, '');
}

export interface RunProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export function runProcess(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
    onLine?: (line: string) => void;
  } = {},
): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(
        new Error(
          `Process timed out after ${Math.round((options.timeoutMs ?? PIP_TIMEOUT_MS) / 1000)}s: ${command} ${args.join(' ')}`,
        ),
      );
    }, options.timeoutMs ?? PIP_TIMEOUT_MS);

    const forward = (chunk: Buffer) => {
      if (!options.onLine) return;
      chunk
        .toString()
        .split(/\r?\n|\r/)
        .map((line) => stripControlSequences(line).trim())
        .filter(Boolean)
        .forEach((line) => options.onLine?.(line));
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      forward(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      forward(chunk);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export default class NotebookEnvService {
  private static locks = new Map<string, Promise<unknown>>();

  private static creating = new Set<string>();

  static getVenvsRoot(): string {
    return path.join(app.getPath('userData'), 'notebook-venvs');
  }

  static getVenvDir(notebookId: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(notebookId)) {
      throw new Error(`Invalid notebook id: "${notebookId}"`);
    }
    const dir = path.resolve(this.getVenvsRoot(), notebookId);
    const base = `${path.resolve(this.getVenvsRoot())}${path.sep}`;
    if (!dir.startsWith(base)) {
      throw new Error('Invalid venv path - path traversal detected');
    }
    return dir;
  }

  /** Per-notebook working directory the kernel runs in (user files land here). */
  static getWorkDir(notebookId: string): string {
    return path.join(this.getVenvDir(notebookId), 'workspace');
  }

  static resolveVenvPython(venvDir: string): string {
    return process.platform === 'win32'
      ? path.join(venvDir, 'Scripts', 'python.exe')
      : path.join(venvDir, 'bin', 'python3');
  }

  static getVenvPython(notebookId: string): string {
    return this.resolveVenvPython(this.getVenvDir(notebookId));
  }

  private static withLock<T>(
    notebookId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(notebookId) ?? Promise.resolve();
    const run = previous.then(task, task);
    this.locks.set(
      notebookId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  private static emit(event: NotebookEnvEvent) {
    broadcastToRenderers('pythonNotebooks:env:event', event);
  }

  private static async readMarker(
    notebookId: string,
  ): Promise<EnvMarker | null> {
    try {
      return await fs.readJson(
        path.join(this.getVenvDir(notebookId), ENV_MARKER_FILE),
      );
    } catch {
      return null;
    }
  }

  static async getStatus(
    notebookId: string,
    fallbackVersion = '',
  ): Promise<NotebookRuntime> {
    const venvPath = this.getVenvDir(notebookId);
    if (this.creating.has(notebookId)) {
      return {
        pythonVersion: fallbackVersion,
        venvPath,
        status: 'creating',
      };
    }
    const marker = await this.readMarker(notebookId);
    const pythonExists = await fs.pathExists(this.getVenvPython(notebookId));
    const status: NotebookEnvStatus =
      marker && pythonExists ? 'ready' : 'missing';
    return {
      pythonVersion: marker?.pythonVersion ?? fallbackVersion,
      venvPath,
      status,
    };
  }

  /**
   * Create (or recreate) the notebook's venv from the given managed Python
   * version and install the kernel packages. Progress is broadcast as
   * `pythonNotebooks:env:event`.
   */
  static async createEnv(
    notebookId: string,
    pythonVersion: string,
  ): Promise<NotebookRuntime> {
    return this.withLock(notebookId, async () => {
      const venvDir = this.getVenvDir(notebookId);

      this.creating.add(notebookId);
      this.emit({
        notebookId,
        status: 'creating',
        message: `Preparing Python ${pythonVersion}…`,
      });

      try {
        const binary = await this.ensureInterpreter(notebookId, pythonVersion);
        this.emit({
          notebookId,
          status: 'creating',
          message: `Creating virtualenv with Python ${pythonVersion}…`,
        });
        await fs.remove(venvDir);
        await fs.mkdirp(this.getVenvsRoot());

        const venvResult = await runProcess(binary, ['-m', 'venv', venvDir], {
          timeoutMs: VENV_TIMEOUT_MS,
        });
        if (venvResult.code !== 0) {
          throw new Error(
            venvResult.stderr.trim() ||
              venvResult.stdout.trim() ||
              `python -m venv exited with code ${venvResult.code}`,
          );
        }

        const venvPython = this.resolveVenvPython(venvDir);
        this.emit({
          notebookId,
          status: 'creating',
          message: 'Installing ipykernel…',
        });
        const pipResult = await runProcess(
          venvPython,
          [
            '-m',
            'pip',
            'install',
            '--disable-pip-version-check',
            '--no-input',
            '--progress-bar',
            'off',
            ...KERNEL_PACKAGES,
          ],
          {
            onLine: (line) =>
              this.emit({ notebookId, status: 'creating', message: line }),
          },
        );
        if (pipResult.code !== 0) {
          throw new Error(
            pipResult.stderr.trim() ||
              pipResult.stdout.trim() ||
              `pip install exited with code ${pipResult.code}`,
          );
        }

        await fs.mkdirp(this.getWorkDir(notebookId));
        const marker: EnvMarker = {
          pythonVersion,
          createdAt: new Date().toISOString(),
        };
        await fs.writeJson(path.join(venvDir, ENV_MARKER_FILE), marker, {
          spaces: 2,
        });

        this.creating.delete(notebookId);
        this.emit({
          notebookId,
          status: 'ready',
          message: 'Environment ready',
        });
        return { pythonVersion, venvPath: venvDir, status: 'ready' };
      } catch (error) {
        this.creating.delete(notebookId);
        const message = error instanceof Error ? error.message : String(error);
        this.emit({ notebookId, status: 'error', error: message });
        return {
          pythonVersion,
          venvPath: venvDir,
          status: 'error',
          error: message,
        };
      }
    });
  }

  /**
   * Resolve the managed interpreter binary, downloading the runtime first when
   * it is not installed yet (e.g. notebooks converted from SQL notebooks use
   * the recommended version, which may not be on disk).
   */
  private static async ensureInterpreter(
    notebookId: string,
    pythonVersion: string,
  ): Promise<string> {
    if (!PythonRuntimesService.describe(pythonVersion).installed) {
      this.emit({
        notebookId,
        status: 'creating',
        message: `Downloading Python ${pythonVersion}…`,
      });
      await PythonRuntimesService.installRuntime(pythonVersion);
    }
    return PythonRuntimesService.requireBinary(pythonVersion);
  }

  static async deleteEnv(notebookId: string): Promise<void> {
    return this.withLock(notebookId, async () => {
      await fs.remove(this.getVenvDir(notebookId));
    });
  }

  private static async requireReadyPython(notebookId: string): Promise<string> {
    const status = await this.getStatus(notebookId);
    if (status.status !== 'ready') {
      throw new Error(
        status.status === 'creating'
          ? 'The notebook environment is still being created.'
          : 'The notebook environment is missing. Recreate it from the kernel bar.',
      );
    }
    return this.getVenvPython(notebookId);
  }

  static async listPackages(notebookId: string): Promise<NotebookEnvPackage[]> {
    const python = await this.requireReadyPython(notebookId);
    const result = await runProcess(
      python,
      ['-m', 'pip', 'list', '--format', 'json', '--disable-pip-version-check'],
      { timeoutMs: 60_000 },
    );
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'pip list failed');
    }
    const parsed = JSON.parse(result.stdout) as Array<{
      name: string;
      version: string;
    }>;
    return parsed
      .map((p) => ({ name: p.name, version: p.version }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  static async freeze(notebookId: string): Promise<string[]> {
    const python = await this.requireReadyPython(notebookId);
    const result = await runProcess(
      python,
      ['-m', 'pip', 'freeze', '--disable-pip-version-check'],
      { timeoutMs: 60_000 },
    );
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'pip freeze failed');
    }
    return result.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  }

  static async installPackages(
    notebookId: string,
    specs: string[],
  ): Promise<string> {
    const cleaned = specs.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      throw new Error('No packages specified');
    }
    cleaned.forEach((spec) => {
      if (!PACKAGE_SPEC_PATTERN.test(spec)) {
        throw new Error(`Invalid package specifier: "${spec}"`);
      }
    });

    return this.withLock(notebookId, async () => {
      const python = await this.requireReadyPython(notebookId);
      const result = await runProcess(
        python,
        [
          '-m',
          'pip',
          'install',
          '--disable-pip-version-check',
          '--no-input',
          '--progress-bar',
          'off',
          ...cleaned,
        ],
        {
          onLine: (line) =>
            this.emit({ notebookId, status: 'ready', message: line }),
        },
      );
      const log = `${result.stdout}\n${result.stderr}`.trim();
      if (result.code !== 0) {
        throw new Error(log || `pip install exited with code ${result.code}`);
      }
      return log;
    });
  }

  static async uninstallPackage(
    notebookId: string,
    name: string,
  ): Promise<string> {
    const cleaned = name.trim();
    if (!PACKAGE_NAME_PATTERN.test(cleaned)) {
      throw new Error(`Invalid package name: "${name}"`);
    }
    const lower = cleaned.toLowerCase();
    if (
      ['pip', 'ipykernel', 'jupyter-client', 'jupyter_client'].includes(lower)
    ) {
      throw new Error(`"${cleaned}" is required by the notebook kernel`);
    }

    return this.withLock(notebookId, async () => {
      const python = await this.requireReadyPython(notebookId);
      const result = await runProcess(
        python,
        [
          '-m',
          'pip',
          'uninstall',
          '-y',
          '--disable-pip-version-check',
          cleaned,
        ],
        { timeoutMs: 5 * 60 * 1000 },
      );
      const log = `${result.stdout}\n${result.stderr}`.trim();
      if (result.code !== 0) {
        throw new Error(log || `pip uninstall exited with code ${result.code}`);
      }
      return log;
    });
  }
}
