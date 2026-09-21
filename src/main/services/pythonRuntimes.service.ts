/**
 * Python Runtimes Service
 *
 * Registry of managed python-build-standalone interpreters that Python
 * notebooks can base their virtualenvs on. Interpreters are extracted to the
 * same version-scoped directory the global install uses
 * (`userData/python/cpython-<version>-<platform>`), so an interpreter already
 * downloaded for dbt is reused as-is.
 *
 * This service NEVER touches the studio's global venv (`userData/venv`) or
 * the `pythonPath` / `pythonVersion` / `pythonBinary` settings. Those belong
 * to dbt-core / Flowfile / sqlglot and are managed by SettingsService only.
 *
 * Follows BE-03 (one cohesive service).
 */

import { app } from 'electron';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import * as tar from 'tar';
import {
  PYTHON_BUILD_TAG,
  RECOMMENDED_PYTHON_VERSION,
  SUPPORTED_PYTHON_VERSIONS,
} from './settings.service';
import { broadcastToRenderers } from '../utils/rendererBroadcast';
import type {
  PythonRuntimeInfo,
  PythonRuntimeInstallEvent,
} from '../../types/pythonNotebooks';

const PLATFORM_MAP: Record<string, Record<string, string>> = {
  darwin: {
    arm64: 'aarch64-apple-darwin',
    x64: 'x86_64-apple-darwin',
  },
  linux: {
    x64: 'x86_64-unknown-linux-gnu',
  },
  win32: {
    x64: 'x86_64-pc-windows-msvc',
  },
};

const DOWNLOAD_BASE_URL =
  'https://github.com/astral-sh/python-build-standalone/releases/download';

function getPlatformInfo(): string {
  const { platform, arch } = process;
  const platformInfo = PLATFORM_MAP[platform]?.[arch];
  if (!platformInfo) {
    throw new Error(`Unsupported platform or arch: ${platform}-${arch}`);
  }
  return platformInfo;
}

function getInstallBase(): string {
  return path.join(app.getPath('userData'), 'python');
}

export function isSupportedPythonVersion(version: string): boolean {
  return (SUPPORTED_PYTHON_VERSIONS as readonly string[]).includes(version);
}

export default class PythonRuntimesService {
  /** Dedupe concurrent installs of the same version. */
  private static installs = new Map<string, Promise<PythonRuntimeInfo>>();

  static getExtractDir(version: string): string {
    return path.join(
      getInstallBase(),
      `cpython-${version}-${getPlatformInfo()}`,
    );
  }

  static getBinaryPath(version: string): string {
    return path.join(
      this.getExtractDir(version),
      process.platform === 'win32' ? 'python.exe' : path.join('bin', 'python3'),
    );
  }

  static describe(version: string): PythonRuntimeInfo {
    const binaryPath = this.getBinaryPath(version);
    return {
      version,
      installed: fs.existsSync(binaryPath),
      isRecommended: version === RECOMMENDED_PYTHON_VERSION,
      binaryPath,
    };
  }

  static async listRuntimes(): Promise<PythonRuntimeInfo[]> {
    return SUPPORTED_PYTHON_VERSIONS.map((version) => this.describe(version));
  }

  /**
   * Resolve the interpreter binary for a version, throwing if it is not
   * installed. Used by NotebookEnvService when creating a venv.
   */
  static async requireBinary(version: string): Promise<string> {
    if (!isSupportedPythonVersion(version)) {
      throw new Error(`Unsupported Python version: ${version}`);
    }
    const binaryPath = this.getBinaryPath(version);
    if (!(await fs.pathExists(binaryPath))) {
      throw new Error(
        `Python ${version} is not installed. Install it from the notebook runtime picker first.`,
      );
    }
    return binaryPath;
  }

  static async installRuntime(version: string): Promise<PythonRuntimeInfo> {
    if (!isSupportedPythonVersion(version)) {
      throw new Error(`Unsupported Python version: ${version}`);
    }

    const existing = this.installs.get(version);
    if (existing) return existing;

    const run = this.performInstall(version).finally(() => {
      this.installs.delete(version);
    });
    this.installs.set(version, run);
    return run;
  }

  private static emit(event: PythonRuntimeInstallEvent) {
    broadcastToRenderers('pythonRuntimes:event', event);
  }

  private static async performInstall(
    version: string,
  ): Promise<PythonRuntimeInfo> {
    const info = this.describe(version);
    if (info.installed) {
      this.emit({ version, phase: 'done', percentage: 100 });
      return info;
    }

    const platformInfo = getPlatformInfo();
    const fileName = `cpython-${version}+${PYTHON_BUILD_TAG}-${platformInfo}-install_only.tar.gz`;
    const downloadUrl = `${DOWNLOAD_BASE_URL}/${PYTHON_BUILD_TAG}/${fileName}`;
    const installBase = getInstallBase();
    const extractDir = this.getExtractDir(version);
    const archivePath = path.join(installBase, `${fileName}.notebook.download`);

    try {
      await fs.mkdirp(installBase);
      this.emit({ version, phase: 'downloading', percentage: 0 });

      const response = await axios.get(downloadUrl, {
        responseType: 'stream',
      });
      const total = Number(response.headers['content-length'] ?? 0);
      let loaded = 0;
      let lastEmit = 0;

      await new Promise<void>((resolve, reject) => {
        const out = fs.createWriteStream(archivePath);
        response.data.on('data', (chunk: Buffer) => {
          loaded += chunk.length;
          const now = Date.now();
          if (total > 0 && now - lastEmit > 250) {
            lastEmit = now;
            this.emit({
              version,
              phase: 'downloading',
              percentage: Math.round((loaded / total) * 100),
            });
          }
        });
        response.data.on('error', reject);
        out.on('error', reject);
        out.on('finish', () => resolve());
        response.data.pipe(out);
      });

      this.emit({ version, phase: 'extracting' });
      await fs.remove(extractDir);
      await fs.mkdirp(extractDir);
      await tar.x({ file: archivePath, cwd: extractDir, strip: 1 });

      const binaryPath = this.getBinaryPath(version);
      if (process.platform !== 'win32') {
        await fs.chmod(binaryPath, 0o755);
      }
      if (!(await fs.pathExists(binaryPath))) {
        throw new Error('Interpreter binary missing after extraction');
      }

      this.emit({ version, phase: 'done', percentage: 100 });
      return this.describe(version);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit({ version, phase: 'error', error: message });
      await fs.remove(extractDir).catch(() => undefined);
      throw new Error(`Failed to install Python ${version}: ${message}`);
    } finally {
      await fs.remove(archivePath).catch(() => undefined);
    }
  }
}
