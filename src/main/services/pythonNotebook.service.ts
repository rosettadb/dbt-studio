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
const REQUIRED_PACKAGES = [
  { name: 'ipykernel', version: '6.30.1' },
  { name: 'jupyter_client', version: '8.6.3' },
  { name: 'nbformat', version: '5.10.4' },
] as const;

type PackageName = (typeof REQUIRED_PACKAGES)[number]['name'];

export class PythonNotebookService {
  private static activeSessionCount = 0;

  private static getRuntimePythonPath(): string {
    const binDirectory = process.platform === 'win32' ? 'Scripts' : 'bin';
    const executable = process.platform === 'win32' ? 'python.exe' : 'python';
    return path.join(
      app.getPath('userData'),
      'python-notebooks',
      'runtime',
      RUNTIME_VERSION,
      binDirectory,
      executable,
    );
  }

  private static isAtLeastMinimumVersion(version: string | null): boolean {
    if (!version) return false;
    const [major = 0, minor = 0] = version
      .split('.')
      .slice(0, 2)
      .map((part) => Number.parseInt(part, 10));
    return major > 3 || (major === 3 && minor >= 9);
  }

  private static async readInstalledPackages(
    pythonPath: string,
  ): Promise<Record<PackageName, string | null>> {
    const packageNames = REQUIRED_PACKAGES.map((item) => item.name);
    const script = [
      'import importlib.metadata as metadata',
      'import json',
      `names = ${JSON.stringify(packageNames)}`,
      'def self_version(name):',
      '    try:',
      '        return metadata.version(name)',
      '    except metadata.PackageNotFoundError:',
      '        return None',
      '',
      'print(json.dumps({name: self_version(name) for name in names}))',
    ].join('\n');

    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(pythonPath, ['-c', script], { shell: false });
      let output = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(output);
        else
          reject(new Error(stderr || 'Unable to inspect notebook packages.'));
      });
    });

    return JSON.parse(stdout) as Record<PackageName, string | null>;
  }

  static async getRuntimeStatus(): Promise<PythonNotebookRuntimeStatus> {
    const settings = await SettingsService.loadSettings();
    const managedPythonAvailable = Boolean(
      settings.pythonBinary && (await fs.pathExists(settings.pythonBinary)),
    );
    const runtimePythonPath = this.getRuntimePythonPath();
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
      environmentPath: path.dirname(path.dirname(runtimePythonPath)),
      packages,
      activeSessionCount: this.activeSessionCount,
    };

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

    if (!(await fs.pathExists(runtimePythonPath))) {
      return {
        ...baseStatus,
        state: 'not-installed',
        message: 'Jupyter packages have not been installed.',
      };
    }

    try {
      const installed = await this.readInstalledPackages(runtimePythonPath);
      const resolvedPackages = packages.map((item) => ({
        ...item,
        installedVersion: installed[item.name],
      }));
      const hasRequiredVersions = resolvedPackages.every(
        (item) => item.installedVersion === item.requiredVersion,
      );

      return {
        ...baseStatus,
        packages: resolvedPackages,
        state: hasRequiredVersions ? 'ready' : 'needs-attention',
        message: hasRequiredVersions
          ? undefined
          : 'One or more required Jupyter packages are missing or incompatible.',
      };
    } catch {
      return {
        ...baseStatus,
        state: 'needs-attention',
        message:
          'The Jupyter runtime could not be inspected. Check Runtime will be available after setup.',
      };
    }
  }
}
