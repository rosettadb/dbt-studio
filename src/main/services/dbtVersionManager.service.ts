import axios from 'axios';
import fs from 'fs-extra';
import { CliAdapter } from '../adapters';
import SettingsService from './settings.service';
import {
  DbtCoreVersionListItem,
  DbtVersionListResponse,
  PythonPackageInstallVersionRequest,
  PythonPackageInstallVersionResponse,
  PythonPackageVersionListItem,
  PythonPackageVersionListResponse,
} from '../../types/backend';

type VersionTriple = {
  major: number;
  minor: number;
  patch: number;
  pre: string | null;
};

const parseVersionTriple = (version: string): VersionTriple | null => {
  // Accepts: 1.8.2, 1.8, 1.8.0rc1, 1.8.0b2
  const cleaned = version.trim().replace(/^v/, '');
  const match = cleaned.match(
    /^([0-9]+)(?:\.([0-9]+))?(?:\.([0-9]+))?([a-zA-Z].*)?$/,
  );
  if (!match) return null;

  const major = Number(match[1] ?? 0);
  const minor = Number(match[2] ?? 0);
  const patch = Number(match[3] ?? 0);
  const pre = match[4] ? match[4] : null;

  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
    return null;
  }

  return { major, minor, patch, pre };
};

const compareVersions = (a: string, b: string): number => {
  const va = parseVersionTriple(a);
  const vb = parseVersionTriple(b);
  if (!va || !vb) return a.localeCompare(b);

  if (va.major !== vb.major) return va.major > vb.major ? 1 : -1;
  if (va.minor !== vb.minor) return va.minor > vb.minor ? 1 : -1;
  if (va.patch !== vb.patch) return va.patch > vb.patch ? 1 : -1;

  // Stable > prerelease
  if (va.pre && !vb.pre) return -1;
  if (!va.pre && vb.pre) return 1;

  if (va.pre === vb.pre) return 0;
  return String(va.pre).localeCompare(String(vb.pre));
};

const isPrerelease = (version: string): boolean => {
  const v = parseVersionTriple(version);
  return !!v?.pre;
};

const getPythonExecutable = async (pythonPath?: string): Promise<string> => {
  if (pythonPath) {
    return `"${pythonPath}"`;
  }

  const settings = await SettingsService.loadSettings();
  if (settings.pythonPath && (await fs.pathExists(settings.pythonPath))) {
    return `"${settings.pythonPath}"`;
  }

  return 'python';
};

type PypiProjectJson = {
  releases?: Record<string, any[]>;
};

export class DbtVersionManagerService {
  static async listDbtCoreVersions(): Promise<DbtVersionListResponse> {
    let projectJson: PypiProjectJson;

    try {
      projectJson = await this.fetchPypiProjectJson('dbt-core');
    } catch {
      return {
        versions: [],
        latestStable: null,
        currentVersion:
          (await SettingsService.loadSettings()).dbtVersion || null,
      };
    }

    const versions = Object.keys(projectJson.releases ?? {})
      .filter((v) => parseVersionTriple(v) !== null)
      .filter((v) => !isPrerelease(v))
      .sort((a, b) => compareVersions(b, a));

    const latestStable = versions.length > 0 ? versions[0] : null;
    const latestFive = versions.slice(0, 5);

    const out: DbtCoreVersionListItem[] = latestFive.map((v) => ({
      version: v,
      isPrerelease: false,
    }));

    const settings = await SettingsService.loadSettings();

    return {
      versions: out,
      latestStable,
      currentVersion: settings.dbtVersion || null,
    };
  }

  static async listPackageVersions(
    packageName: string | undefined,
  ): Promise<PythonPackageVersionListResponse> {
    const safeName = String(packageName ?? '').trim();
    if (!safeName) {
      return {
        packageName: '',
        versions: [],
        latestStable: null,
      };
    }

    let projectJson: PypiProjectJson;

    try {
      projectJson = await this.fetchPypiProjectJson(safeName);
    } catch {
      return {
        packageName: safeName,
        versions: [],
        latestStable: null,
      };
    }

    const versions = Object.keys(projectJson.releases ?? {})
      .filter((v) => parseVersionTriple(v) !== null)
      .filter((v) => !isPrerelease(v))
      .sort((a, b) => compareVersions(b, a));

    const latestStable = versions.length > 0 ? versions[0] : null;
    const latestFive = versions.slice(0, 5);

    const out: PythonPackageVersionListItem[] = latestFive.map((v) => ({
      version: v,
      isPrerelease: false,
    }));

    return {
      packageName: safeName,
      versions: out,
      latestStable,
    };
  }

  static async installPackageVersion(
    req: PythonPackageInstallVersionRequest,
  ): Promise<PythonPackageInstallVersionResponse> {
    const python = await getPythonExecutable(req.pythonPath);
    const safeName = String(req.packageName ?? '').trim();
    const safeVersion = String(req.version ?? '').trim();

    if (!safeName) {
      return { ok: false, error: 'packageName is required' };
    }
    if (!safeVersion) {
      return { ok: false, error: 'version is required' };
    }

    const cliAdapter = new CliAdapter();
    try {
      await cliAdapter.runCommandWithoutStreaming(
        `${python} -m pip install --upgrade --force-reinstall --no-cache-dir ${safeName}==${safeVersion}`,
      );
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private static async fetchPypiProjectJson(
    packageName: string,
  ): Promise<PypiProjectJson> {
    const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;
    const res = await axios.get(url, { timeout: 15000 });
    return res.data as PypiProjectJson;
  }
}
