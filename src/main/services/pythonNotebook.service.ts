import { app } from 'electron';
import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import type {
  PythonNotebookPackageStatus,
  PythonNotebookRuntimeStatus,
} from '../../types/notebooks';
import SettingsService from './settings.service';

const RUNTIME_VERSION = '1';
const MINIMUM_PYTHON_VERSION = '3.9';
const MAX_DIAGNOSTIC_LENGTH = 500;
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

export class PythonNotebookService {
  private static activeSessionCount = 0;

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
