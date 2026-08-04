import axios from 'axios';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import SettingsService from './settings.service';
import {
  DbtAdapterCapability,
  DbtAdapterCapabilityResponse,
  DbtAdapterCompatibility,
  DbtProjectAdapterCheck,
  DbtProjectCompatibilityResult,
  DbtCoreVersionListItem,
  DbtVersionChangePlan,
  DbtVersionChangePlanRequest,
  DbtVersionChangeRequest,
  DbtVersionListOptions,
  DbtVersionListResponse,
  InstalledDbtCoreInfo,
  InstalledPythonPackagesResponse,
  PythonPackageActionRequest,
  PythonPackageInstallVersionRequest,
  PythonPackageInstallVersionResponse,
  PythonPackageVersionListItem,
  PythonPackageVersionListResponse,
} from '../../types/backend';

type VersionTriple = {
  major: number;
  minor: number;
  patch: number;
  preRank: number;
  preNumber: number;
};

type PypiProjectJson = {
  releases?: Record<string, { yanked?: boolean }[]>;
};

type ProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type ProcessOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
};

const PROCESS_TIMEOUT_MS = 5 * 60 * 1000;

const ADAPTER_PACKAGES = [
  'dbt-postgres',
  'dbt-snowflake',
  'dbt-bigquery',
  'dbt-redshift',
  'dbt-databricks',
  'dbt-duckdb',
  'dbt-fabricspark',
] as const;

const V2_ADAPTERS: Record<
  string,
  Omit<DbtAdapterCapability, 'adapter' | 'displayName' | 'source'>
> = {
  snowflake: {
    status: 'preview',
    driver: 'adbc',
    requiresNetworkOnFirstUse: true,
    canExecute: true,
    notes:
      'v2 preview adapter. Validate authentication and project behavior before production use.',
  },
  bigquery: {
    status: 'preview',
    driver: 'adbc',
    requiresNetworkOnFirstUse: true,
    canExecute: true,
    notes:
      'v2 preview adapter. Validate authentication and project behavior before production use.',
  },
  redshift: {
    status: 'preview',
    driver: 'adbc',
    requiresNetworkOnFirstUse: true,
    canExecute: true,
    notes:
      'v2 preview adapter. Validate authentication and project behavior before production use.',
  },
  databricks: {
    status: 'preview',
    driver: 'adbc',
    requiresNetworkOnFirstUse: true,
    canExecute: true,
    notes:
      'v2 preview adapter. Validate authentication and project behavior before production use.',
  },
  duckdb: {
    status: 'preview',
    driver: 'native',
    requiresNetworkOnFirstUse: false,
    canExecute: true,
    notes:
      'v2 preview adapter. Validate project behavior before production use.',
  },
};

const adapterDisplayName = (adapter: string | null): string => {
  if (!adapter) return 'Unknown adapter';
  const labels: Record<string, string> = {
    bigquery: 'BigQuery',
    databricks: 'Databricks',
    duckdb: 'DuckDB',
    fabricspark: 'Microsoft Fabric Lakehouse',
    postgres: 'PostgreSQL',
    redshift: 'Redshift',
    snowflake: 'Snowflake',
  };
  return labels[adapter] ?? adapter;
};

const normalizeAdapter = (value: string | undefined | null): string | null => {
  const adapter = value?.trim().toLowerCase();
  if (!adapter) return null;
  return adapter === 'ducklake' ? 'duckdb' : adapter;
};

const ALLOWED_PYTHON_PACKAGES = new Set([
  'dbt-core',
  ...ADAPTER_PACKAGES,
  'sqlglot',
]);

const buildInstallRequirement = (
  packageName: string,
  version?: string,
): string => {
  const distribution =
    packageName === 'dbt-fabricspark' ? 'dbt-fabricspark[cli]' : packageName;
  return version ? `${distribution}==${version}` : distribution;
};

const VERSION_PATTERN =
  /^[0-9]+(?:\.[0-9]+)*(?:(?:a|b|rc)[0-9]+)?(?:\.post[0-9]+)?(?:\.dev[0-9]+)?$/i;

const normalizeVersion = (version: string): string =>
  version
    .trim()
    .toLowerCase()
    .replace(/^v/, '')
    .replace(/-alpha[.-]?/, 'a')
    .replace(/-beta[.-]?/, 'b')
    .replace(/-rc[.-]?/, 'rc');

const parseVersionTriple = (version: string): VersionTriple | null => {
  const cleaned = normalizeVersion(version);
  const match = cleaned.match(
    /^([0-9]+)(?:\.([0-9]+))?(?:\.([0-9]+))?(?:(a|b|rc)([0-9]+))?/,
  );
  if (!match) return null;

  const major = Number(match[1] ?? 0);
  const minor = Number(match[2] ?? 0);
  const patch = Number(match[3] ?? 0);
  const preLabel = match[4] ?? null;
  let preRank = 3;
  if (preLabel === 'a') preRank = 0;
  if (preLabel === 'b') preRank = 1;
  if (preLabel === 'rc') preRank = 2;
  const preNumber = Number(match[5] ?? 0);

  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
    return null;
  }

  return { major, minor, patch, preRank, preNumber };
};

const compareVersions = (a: string, b: string): number => {
  const va = parseVersionTriple(a);
  const vb = parseVersionTriple(b);
  if (!va || !vb) return a.localeCompare(b);

  if (va.major !== vb.major) return va.major > vb.major ? 1 : -1;
  if (va.minor !== vb.minor) return va.minor > vb.minor ? 1 : -1;
  if (va.patch !== vb.patch) return va.patch > vb.patch ? 1 : -1;

  if (va.preRank !== vb.preRank) return va.preRank > vb.preRank ? 1 : -1;
  if (va.preNumber !== vb.preNumber) {
    return va.preNumber > vb.preNumber ? 1 : -1;
  }
  return 0;
};

const isPrerelease = (version: string): boolean => {
  const v = parseVersionTriple(version);
  return v ? v.preRank < 3 : false;
};

const parsePipShowVersion = (output: string): string | null => {
  const versionMatch = output.match(/^Version:\s*(.+)$/m);
  return versionMatch ? versionMatch[1].trim() : null;
};

const isValidPackageVersion = (version: string): boolean =>
  VERSION_PATTERN.test(normalizeVersion(version));

const outputReportsVersion = (output: string, expected: string): boolean => {
  const expectedNormalized = normalizeVersion(expected);
  const reportedVersions =
    output.match(
      /\bv?[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:-(?:alpha|beta|rc)[.-]?[0-9]+|(?:a|b|rc)[0-9]+)?\b/gi,
    ) ?? [];

  return reportedVersions.some(
    (reported) => normalizeVersion(reported) === expectedNormalized,
  );
};

const classifyVersionChange = (
  preview: boolean,
  comparison: number,
): DbtVersionChangePlan['direction'] => {
  if (preview) return 'preview-install';
  if (comparison > 0) return 'upgrade';
  if (comparison < 0) return 'downgrade';
  return 'reinstall';
};

const summarizeProcessResult = (
  command: 'parse' | 'compile',
  result: ProcessResult,
): string => {
  const output = (result.stderr || result.stdout || '').trim();
  if (output) return output.slice(-12000);
  if (result.exitCode === 0) return `${command} completed successfully.`;
  return `${command} failed without diagnostic output.`;
};

const getDbtExecutableForPython = (python: string): string => {
  return path.join(
    path.dirname(python),
    process.platform === 'win32' ? 'dbt.exe' : 'dbt',
  );
};

const runProcess = (
  command: string,
  args: string[],
  options?: ProcessOptions,
): Promise<ProcessResult> => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      ...(options?.cwd ? { cwd: options.cwd } : {}),
      ...(options?.env ? { env: options.env } : {}),
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // The process may have exited before the timeout callback ran.
      }
      reject(
        new Error(
          `Process timed out after ${PROCESS_TIMEOUT_MS}ms: ${command}`,
        ),
      );
    }, PROCESS_TIMEOUT_MS);

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    child.stdout.on('data', (data) => {
      stdout += String(data);
    });

    child.stderr.on('data', (data) => {
      stderr += String(data);
    });

    child.on('error', (error) => {
      finish(() => reject(error));
    });

    child.on('close', (exitCode) => {
      finish(() => resolve({ exitCode, stdout, stderr }));
    });
  });
};

const getPythonExecutable = async (pythonPath?: string): Promise<string> => {
  const settings = await SettingsService.loadSettings();
  const configuredPython = settings.pythonPath?.trim();

  if (!configuredPython || !(await fs.pathExists(configuredPython))) {
    throw new Error(
      'Managed Python environment not found. Install Python from Settings first.',
    );
  }

  if (
    pythonPath &&
    path.resolve(pythonPath) !== path.resolve(configuredPython)
  ) {
    throw new Error(
      'The requested Python executable is not the app-managed environment.',
    );
  }

  return configuredPython;
};

export class DbtCoreVersionService {
  private static async installedPackageVersion(
    python: string,
    packageName: string,
  ): Promise<string | null> {
    const shown = await runProcess(python, ['-m', 'pip', 'show', packageName]);
    return shown.exitCode === 0 ? parsePipShowVersion(shown.stdout) : null;
  }

  private static async previewPackageInstall(
    python: string,
    requirement: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'dbt-studio-pip-preview-'),
    );
    try {
      const result = await runProcess(python, [
        '-m',
        'pip',
        'install',
        '--dry-run',
        '--report',
        path.join(root, 'report.json'),
        requirement,
      ]);
      return result.exitCode === 0
        ? { ok: true }
        : {
            ok: false,
            error:
              'Package dependency resolution failed before installation. Choose a version compatible with the managed dbt Core runtime.',
          };
    } finally {
      await fs.remove(root);
    }
  }

  private static async rollbackPackageInstall(
    python: string,
    packageName: string,
    previousPackageVersion: string | null,
    previousDbtVersion: string | null,
  ): Promise<void> {
    if (previousPackageVersion) {
      await runProcess(python, [
        '-m',
        'pip',
        'install',
        '--force-reinstall',
        '--no-cache-dir',
        buildInstallRequirement(packageName, previousPackageVersion),
      ]);
    } else {
      await runProcess(python, [
        '-m',
        'pip',
        'uninstall',
        '--yes',
        packageName,
      ]);
    }
    const currentDbtVersion = await this.installedPackageVersion(
      python,
      'dbt-core',
    );
    if (previousDbtVersion && currentDbtVersion !== previousDbtVersion) {
      await runProcess(python, [
        '-m',
        'pip',
        'install',
        '--force-reinstall',
        '--no-cache-dir',
        `dbt-core==${previousDbtVersion}`,
      ]);
    } else if (!previousDbtVersion && currentDbtVersion) {
      await runProcess(python, ['-m', 'pip', 'uninstall', '--yes', 'dbt-core']);
    }
  }

  static async listDbtCoreVersions(
    options?: DbtVersionListOptions,
  ): Promise<DbtVersionListResponse> {
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

    const includePrerelease = options?.includePrerelease ?? false;
    const limit = Math.min(Math.max(Math.floor(options?.limit ?? 5), 1), 100);

    const allVersions = Object.entries(projectJson.releases ?? {})
      .filter(([, files]) =>
        files.some((releaseFile) => releaseFile.yanked !== true),
      )
      .map(([version]) => version)
      .filter((v) => parseVersionTriple(v) !== null)
      .sort((a, b) => compareVersions(b, a));

    const stableVersions = allVersions.filter((v) => !isPrerelease(v));
    const versions = (includePrerelease ? allVersions : stableVersions).slice(
      0,
      limit,
    );

    const latestStable = stableVersions.length > 0 ? stableVersions[0] : null;
    const settings = await SettingsService.loadSettings();

    const out: DbtCoreVersionListItem[] = versions.map((v) => ({
      version: v,
      isPrerelease: isPrerelease(v),
      isLatestStable: v === latestStable,
      isInstalled: v === settings.dbtVersion,
      channel: isPrerelease(v) ? 'preview' : 'stable',
    }));

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
    if (!ALLOWED_PYTHON_PACKAGES.has(safeName)) {
      return {
        packageName: safeName,
        versions: [],
        latestStable: null,
      };
    }

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

    const versions = Object.entries(projectJson.releases ?? {})
      .filter(([, files]) =>
        files.some((releaseFile) => releaseFile.yanked !== true),
      )
      .map(([version]) => version)
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

  static async getInstalledPackages(): Promise<InstalledPythonPackagesResponse> {
    const python = await getPythonExecutable();
    const entries = await Promise.all(
      [...ALLOWED_PYTHON_PACKAGES].map(async (packageName) => {
        const result = await runProcess(python, [
          '-m',
          'pip',
          'show',
          packageName,
        ]);
        const version =
          result.exitCode === 0 ? parsePipShowVersion(result.stdout) : null;
        return version ? ([packageName, version] as const) : null;
      }),
    );
    const packages = Object.fromEntries(
      entries.filter((entry): entry is readonly [string, string] => !!entry),
    );

    return { packages };
  }

  static async runManagedDbtDebug(options: {
    projectDir: string;
    profilesDir: string;
    env: Record<string, string | undefined>;
  }): Promise<{ ok: boolean; error?: string }> {
    const installed = await this.getInstalledDbtCore();
    if (
      !installed.isExecutableVerified ||
      !installed.dbtPath ||
      !installed.version
    ) {
      return {
        ok: false,
        error:
          installed.error ?? 'The managed dbt Core runtime is unavailable.',
      };
    }
    const parsedVersion = parseVersionTriple(installed.version);
    if (!parsedVersion || parsedVersion.major !== 1) {
      return {
        ok: false,
        error:
          'Microsoft Fabric Lakehouse requires the managed dbt Core v1 runtime.',
      };
    }
    const packages = await this.getInstalledPackages();
    if (!packages.packages['dbt-fabricspark']) {
      return {
        ok: false,
        error:
          'dbt-fabricspark is not installed. Install it from Settings and retry.',
      };
    }
    const result = await runProcess(
      installed.dbtPath,
      [
        'debug',
        '--project-dir',
        options.projectDir,
        '--profiles-dir',
        options.profilesDir,
        '--no-use-colors',
      ],
      {
        cwd: options.projectDir,
        env: { ...process.env, ...options.env },
      },
    );
    if (result.exitCode === 0) return { ok: true };
    const combined = `${result.stderr}\n${result.stdout}`.toLowerCase();
    let error = 'Managed dbt debug could not connect to Microsoft Fabric.';
    if (/az login|azure cli|credential|authentication/.test(combined)) {
      error =
        'Microsoft Fabric authentication failed. Check Azure CLI login or the service-principal credentials.';
    } else if (
      /permission|forbidden|not authorized|access denied/.test(combined)
    ) {
      error =
        'The Microsoft Fabric principal does not have the required workspace or Lakehouse permissions.';
    } else if (
      /no module named|could not find profile|adapter/.test(combined)
    ) {
      error =
        'The managed dbt-fabricspark adapter is missing or incompatible with dbt Core v1.';
    } else if (/timeout|timed out|capacity/.test(combined)) {
      error =
        'Microsoft Fabric did not start the Spark session before the connection-test timeout.';
    }
    return {
      ok: false,
      error,
    };
  }

  static async installLatestPackage(
    req: PythonPackageActionRequest,
  ): Promise<PythonPackageInstallVersionResponse> {
    const packageName = String(req.packageName ?? '').trim();
    if (
      !ALLOWED_PYTHON_PACKAGES.has(packageName) ||
      packageName === 'dbt-core'
    ) {
      return { ok: false, error: `Package not allowed: ${packageName}` };
    }

    try {
      const python = await getPythonExecutable(req.pythonPath);
      const previousPackageVersion = await this.installedPackageVersion(
        python,
        packageName,
      );
      const previousDbtVersion = await this.installedPackageVersion(
        python,
        'dbt-core',
      );
      const preview = await this.previewPackageInstall(
        python,
        buildInstallRequirement(packageName),
      );
      if (!preview.ok) return preview;
      const install = await runProcess(python, [
        '-m',
        'pip',
        'install',
        '--upgrade',
        '--no-cache-dir',
        buildInstallRequirement(packageName),
      ]);
      if (install.exitCode !== 0) {
        await this.rollbackPackageInstall(
          python,
          packageName,
          previousPackageVersion,
          previousDbtVersion,
        );
        return {
          ok: false,
          error:
            'Package installation failed. The managed Python environment was restored.',
        };
      }

      const shown = await runProcess(python, [
        '-m',
        'pip',
        'show',
        packageName,
      ]);
      const installedVersion = parsePipShowVersion(shown.stdout);
      const installedDbtVersion = await this.installedPackageVersion(
        python,
        'dbt-core',
      );
      if (
        packageName === 'dbt-fabricspark' &&
        parseVersionTriple(installedDbtVersion ?? '')?.major !== 1
      ) {
        await this.rollbackPackageInstall(
          python,
          packageName,
          previousPackageVersion,
          previousDbtVersion,
        );
        return {
          ok: false,
          error:
            'dbt-fabricspark requires a compatible dbt Core v1 runtime. The managed environment was restored.',
        };
      }
      if (!installedVersion) {
        await this.rollbackPackageInstall(
          python,
          packageName,
          previousPackageVersion,
          previousDbtVersion,
        );
        return {
          ok: false,
          error: `Unable to verify ${packageName}. The managed environment was restored.`,
        };
      }
      return { ok: true, installedVersion };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async uninstallPackage(
    req: PythonPackageActionRequest,
  ): Promise<PythonPackageInstallVersionResponse> {
    const packageName = String(req.packageName ?? '').trim();
    if (!ALLOWED_PYTHON_PACKAGES.has(packageName)) {
      return { ok: false, error: `Package not allowed: ${packageName}` };
    }

    try {
      const python = await getPythonExecutable(req.pythonPath);
      const uninstall = await runProcess(python, [
        '-m',
        'pip',
        'uninstall',
        '--yes',
        packageName,
      ]);
      if (uninstall.exitCode !== 0) {
        return {
          ok: false,
          error:
            uninstall.stderr || uninstall.stdout || 'Package uninstall failed.',
        };
      }

      if (packageName === 'dbt-core') {
        const settings = await SettingsService.loadSettings();
        await SettingsService.saveSettings({
          ...settings,
          dbtPath: '',
          dbtVersion: '',
        });
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async planVersionChange(
    request: DbtVersionChangePlanRequest,
  ): Promise<DbtVersionChangePlan> {
    const targetVersion = String(request.targetVersion ?? '').trim();
    if (!isValidPackageVersion(targetVersion)) {
      throw new Error(`Invalid dbt-core version: ${targetVersion}`);
    }

    const settings = await SettingsService.loadSettings();
    const currentVersion = settings.dbtVersion || null;
    const preview = isPrerelease(targetVersion);
    const comparison = currentVersion
      ? compareVersions(targetVersion, currentVersion)
      : 1;
    const direction = classifyVersionChange(preview, comparison);
    const currentParsed = currentVersion
      ? parseVersionTriple(currentVersion)
      : null;
    const targetParsed = parseVersionTriple(targetVersion);
    const isMajorVersionChange =
      !!currentParsed &&
      !!targetParsed &&
      currentParsed.major !== targetParsed.major;
    const adapters =
      request.includeAdapters === false
        ? []
        : await this.inspectAdapterCompatibility(targetVersion);
    const warnings = [
      ...(isMajorVersionChange
        ? [
            'This is a major dbt-core version change. Project parsing, CLI flags, packages, and adapters may require migration.',
          ]
        : []),
      ...(preview
        ? [
            'Preview releases can change without notice and should be tested before production use.',
            'Apache dbt-core package provenance is required for this v2/preview installation.',
          ]
        : []),
    ];

    return {
      currentVersion,
      targetVersion,
      direction,
      channel: preview ? 'preview' : 'stable',
      isMajorVersionChange,
      globalImpactWarning:
        'This changes the global dbt-core version used by all local projects. Projects that require another version may fail until you switch back.',
      warnings,
      adapters,
      rollbackVersion: currentVersion,
    };
  }

  static async installVersionChange(
    request: DbtVersionChangeRequest,
  ): Promise<PythonPackageInstallVersionResponse> {
    const previousSettings = await SettingsService.loadSettings();
    const plan = await this.planVersionChange(request);
    const result = await this.installDbtCoreVersion({
      pythonPath: request.pythonPath,
      packageName: 'dbt-core',
      version: request.targetVersion,
    });
    return {
      ...result,
      previousVersion: plan.currentVersion,
      previousDbtPath: previousSettings.dbtPath || null,
      adapterWarnings: plan.adapters,
    };
  }

  static async installPackageVersion(
    req: PythonPackageInstallVersionRequest,
  ): Promise<PythonPackageInstallVersionResponse> {
    const safeName = String(req.packageName ?? '').trim();

    if (safeName === 'dbt-core') {
      return this.installDbtCoreVersion(req);
    }

    return this.installGenericPythonPackageVersion(req);
  }

  static async installDbtCoreVersion(
    req: PythonPackageInstallVersionRequest,
  ): Promise<PythonPackageInstallVersionResponse> {
    const safeVersion = String(req.version ?? '').trim();

    if (!safeVersion) {
      return { ok: false, error: 'version is required' };
    }
    if (!isValidPackageVersion(safeVersion)) {
      return { ok: false, error: `Invalid dbt-core version: ${safeVersion}` };
    }

    try {
      const python = await getPythonExecutable(req.pythonPath);
      const installResult = await runProcess(python, [
        '-m',
        'pip',
        'install',
        '--upgrade',
        '--force-reinstall',
        '--no-cache-dir',
        `dbt-core==${safeVersion}`,
      ]);

      if (installResult.exitCode !== 0) {
        return {
          ok: false,
          error:
            installResult.stderr ||
            installResult.stdout ||
            `pip install failed with exit code ${installResult.exitCode}`,
        };
      }

      const installed = await this.verifyDbtInstall(python);
      if (
        !installed.isDbtCorePackage ||
        !installed.isExecutableVerified ||
        installed.version !== safeVersion
      ) {
        return {
          ok: false,
          error:
            `Installed dbt-core verification failed. Expected ${safeVersion}, found ${
              installed.version || 'unknown'
            }. ${installed.error ?? ''}`.trim(),
        };
      }

      if (installed.hasProprietaryDbtPackage) {
        return {
          ok: false,
          error:
            'Unsupported dbt distribution detected. Rosetta supports Apache dbt-core only.',
        };
      }

      const settings = await SettingsService.loadSettings();
      const { dbtPath } = installed;
      if (!dbtPath) {
        return {
          ok: false,
          error: 'Installed dbt-core executable was not found.',
        };
      }
      await SettingsService.saveSettings({
        ...settings,
        dbtPath,
        dbtVersion: installed.version,
      });

      return {
        ok: true,
        installedVersion: installed.version,
        dbtPath,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async verifyDbtInstall(
    pythonPath?: string,
  ): Promise<InstalledDbtCoreInfo> {
    const python = await getPythonExecutable(pythonPath);
    const pipShow = await runProcess(python, ['-m', 'pip', 'show', 'dbt-core']);
    const proprietaryDbt = await runProcess(python, [
      '-m',
      'pip',
      'show',
      'dbt',
    ]);
    const version =
      pipShow.exitCode === 0 ? parsePipShowVersion(pipShow.stdout) : null;

    const dbtExecutable = getDbtExecutableForPython(python);
    let dbtVersionOutput: string | undefined;
    let isExecutableVerified = false;
    let verificationError: string | undefined;

    if (await fs.pathExists(dbtExecutable)) {
      try {
        const dbtVersion = await runProcess(dbtExecutable, ['--version']);
        dbtVersionOutput = [dbtVersion.stdout, dbtVersion.stderr]
          .filter(Boolean)
          .join('\n')
          .trim();
        isExecutableVerified =
          dbtVersion.exitCode === 0 &&
          !!version &&
          outputReportsVersion(dbtVersionOutput, version);
        if (!isExecutableVerified) {
          verificationError =
            'The managed dbt executable did not report the installed dbt-core version.';
        }
      } catch (error) {
        verificationError =
          error instanceof Error
            ? error.message
            : 'Unable to run dbt --version.';
      }
    } else {
      verificationError = `dbt executable not found at ${dbtExecutable}`;
    }

    return {
      version,
      pythonPath: python,
      dbtPath: (await fs.pathExists(dbtExecutable)) ? dbtExecutable : null,
      dbtVersionOutput,
      isDbtCorePackage: pipShow.exitCode === 0 && !!version,
      isExecutableVerified,
      hasProprietaryDbtPackage: proprietaryDbt.exitCode === 0,
      error: verificationError,
    };
  }

  static async getInstalledDbtCore(): Promise<InstalledDbtCoreInfo> {
    try {
      return await this.verifyDbtInstall();
    } catch (error) {
      const settings = await SettingsService.loadSettings();
      return {
        version: null,
        pythonPath: settings.pythonPath || '',
        dbtPath: null,
        isDbtCorePackage: false,
        isExecutableVerified: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async checkCurrentProjectCompatibility(): Promise<DbtProjectCompatibilityResult> {
    const { default: ProjectService } = await import('./projects.service');
    const project = await ProjectService.getSelectedProject();
    if (!project) {
      return {
        ok: false,
        diagnostics: [],
        recommendations: [],
        error: 'No current project is selected.',
      };
    }

    const installed = await this.getInstalledDbtCore();
    if (!installed.isExecutableVerified || !installed.dbtPath) {
      return {
        ok: false,
        projectName: project.name,
        projectPath: project.path,
        diagnostics: [],
        recommendations: [],
        error:
          installed.error ||
          'The active dbt-core installation is not verified.',
      };
    }

    const adapterCheck = await this.checkProjectAdapterCompatibility(
      project.path,
      installed.version,
      project.connection?.type,
    );
    if (!adapterCheck.adapter.canExecute) {
      return {
        ok: false,
        projectName: project.name,
        projectPath: project.path,
        diagnostics: [],
        recommendations: [
          'Switch the global dbt runtime to a stable v1 release in Settings before running this project.',
        ],
        error: `${adapterCheck.adapter.displayName}: ${adapterCheck.adapter.notes}`,
      };
    }

    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'rosetta-dbt-compatibility-'),
    );
    const commandEnvironment = {
      ...process.env,
      DBT_TARGET_PATH: path.join(temporaryRoot, 'target'),
      DBT_LOG_PATH: path.join(temporaryRoot, 'logs'),
    };
    const diagnostics: DbtProjectCompatibilityResult['diagnostics'] = [];

    try {
      const parseResult = await runProcess(
        installed.dbtPath,
        ['parse', '--project-dir', project.path],
        { cwd: project.path, env: commandEnvironment },
      );
      diagnostics.push({
        command: 'parse',
        ok: parseResult.exitCode === 0,
        exitCode: parseResult.exitCode,
        summary: summarizeProcessResult('parse', parseResult),
      });

      if (parseResult.exitCode === 0) {
        const compileResult = await runProcess(
          installed.dbtPath,
          ['compile', '--project-dir', project.path],
          { cwd: project.path, env: commandEnvironment },
        );
        diagnostics.push({
          command: 'compile',
          ok: compileResult.exitCode === 0,
          exitCode: compileResult.exitCode,
          summary: summarizeProcessResult('compile', compileResult),
        });
      }

      return {
        ok: diagnostics.length === 2 && diagnostics.every((item) => item.ok),
        projectName: project.name,
        projectPath: project.path,
        diagnostics,
        recommendations: [
          'Run dbt deps manually if package dependencies need refreshing; it can modify dependency artifacts and require network access.',
          ...(installed.version?.startsWith('2.')
            ? [
                'Treat parse or compile failures as v2 migration diagnostics and resolve deprecated flags, macros, packages, and behavior changes before production use.',
              ]
            : []),
        ],
      };
    } catch (error) {
      return {
        ok: false,
        projectName: project.name,
        projectPath: project.path,
        diagnostics,
        recommendations: [],
        error:
          error instanceof Error
            ? error.message
            : 'Compatibility check failed.',
      };
    } finally {
      await fs.remove(temporaryRoot);
    }
  }

  private static async installGenericPythonPackageVersion(
    req: PythonPackageInstallVersionRequest,
  ): Promise<PythonPackageInstallVersionResponse> {
    const safeName = String(req.packageName ?? '').trim();
    const safeVersion = String(req.version ?? '').trim();

    if (!ALLOWED_PYTHON_PACKAGES.has(safeName)) {
      return {
        ok: false,
        error: `Package not allowed: ${safeName || '(empty)'}`,
      };
    }

    if (!safeName) {
      return { ok: false, error: 'packageName is required' };
    }
    if (!safeVersion) {
      return { ok: false, error: 'version is required' };
    }
    if (!isValidPackageVersion(safeVersion)) {
      return { ok: false, error: `Invalid package version: ${safeVersion}` };
    }

    try {
      const python = await getPythonExecutable(req.pythonPath);
      const previousPackageVersion = await this.installedPackageVersion(
        python,
        safeName,
      );
      const previousDbtVersion = await this.installedPackageVersion(
        python,
        'dbt-core',
      );
      const preview = await this.previewPackageInstall(
        python,
        buildInstallRequirement(safeName, safeVersion),
      );
      if (!preview.ok) return preview;
      const result = await runProcess(python, [
        '-m',
        'pip',
        'install',
        '--upgrade',
        '--force-reinstall',
        '--no-cache-dir',
        buildInstallRequirement(safeName, safeVersion),
      ]);

      if (result.exitCode !== 0) {
        await this.rollbackPackageInstall(
          python,
          safeName,
          previousPackageVersion,
          previousDbtVersion,
        );
        return {
          ok: false,
          error:
            'Package installation failed. The managed Python environment was restored.',
        };
      }

      const shown = await runProcess(python, ['-m', 'pip', 'show', safeName]);
      const installedVersion =
        shown.exitCode === 0 ? parsePipShowVersion(shown.stdout) : null;
      if (installedVersion !== safeVersion) {
        await this.rollbackPackageInstall(
          python,
          safeName,
          previousPackageVersion,
          previousDbtVersion,
        );
        return {
          ok: false,
          error: `Installed package verification failed. Expected ${safeVersion}, found ${installedVersion || 'unknown'}.`,
        };
      }

      const installedDbtVersion = await this.installedPackageVersion(
        python,
        'dbt-core',
      );
      if (
        safeName === 'dbt-fabricspark' &&
        parseVersionTriple(installedDbtVersion ?? '')?.major !== 1
      ) {
        await this.rollbackPackageInstall(
          python,
          safeName,
          previousPackageVersion,
          previousDbtVersion,
        );
        return {
          ok: false,
          error:
            'dbt-fabricspark requires a compatible dbt Core v1 runtime. The managed environment was restored.',
        };
      }

      return { ok: true, installedVersion };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private static async resolveProjectAdapter(
    projectPath?: string,
    adapterHint?: string,
  ): Promise<{
    adapter: string | null;
    source: DbtAdapterCapability['source'];
    projectPath?: string;
  }> {
    if (adapterHint) {
      return {
        adapter: normalizeAdapter(adapterHint),
        source: 'connection',
        projectPath,
      };
    }
    const selected = projectPath
      ? undefined
      : await (await import('./projects.service')).default.getSelectedProject();
    const resolvedPath = projectPath || selected?.path;
    if (selected && selected.path === resolvedPath && selected.connection?.type)
      return {
        adapter: normalizeAdapter(selected.connection.type),
        source: 'connection',
        projectPath: resolvedPath,
      };
    if (!resolvedPath) return { adapter: null, source: 'unresolved' };
    try {
      const projectConfig = yaml.load(
        await fs.readFile(path.join(resolvedPath, 'dbt_project.yml'), 'utf8'),
      ) as { profile?: string } | undefined;
      const profiles = yaml.load(
        await fs.readFile(path.join(resolvedPath, 'profiles.yml'), 'utf8'),
      ) as Record<string, any> | undefined;
      const profile =
        projectConfig?.profile && profiles?.[projectConfig.profile];
      const output = profile?.target
        ? profile?.outputs?.[profile.target]
        : Object.values(profile?.outputs ?? {})[0];
      return {
        adapter: normalizeAdapter(output?.type),
        source: output?.type ? 'profiles.yml' : 'unresolved',
        projectPath: resolvedPath,
      };
    } catch {
      return { adapter: null, source: 'unresolved', projectPath: resolvedPath };
    }
  }

  private static capabilityFor(
    adapter: string | null,
    source: DbtAdapterCapability['source'],
    isV2: boolean,
  ): DbtAdapterCapability {
    if (!isV2)
      return {
        adapter,
        displayName: adapterDisplayName(adapter),
        status: adapter ? 'supported' : 'unknown',
        driver: 'unknown',
        requiresNetworkOnFirstUse: false,
        canExecute: true,
        source,
        notes: adapter
          ? 'dbt Core v1 uses separately installed Python adapter packages. Confirm the matching package is installed.'
          : 'Could not determine the project adapter. Verify profiles.yml before running.',
      };
    if (!adapter)
      return {
        adapter: null,
        displayName: adapterDisplayName(null),
        status: 'unknown',
        driver: 'unknown',
        requiresNetworkOnFirstUse: false,
        canExecute: false,
        source,
        notes:
          'Rosetta could not determine this project adapter. v2 execution is blocked until the connection or profiles.yml identifies it.',
      };
    const capability = V2_ADAPTERS[adapter];
    if (capability)
      return {
        adapter,
        displayName: adapterDisplayName(adapter),
        source,
        ...capability,
      };
    return {
      adapter,
      displayName: adapterDisplayName(adapter),
      status: 'unsupported',
      driver: 'unknown',
      requiresNetworkOnFirstUse: false,
      canExecute: false,
      source,
      notes: `${adapterDisplayName(adapter)} is not available in Rosetta's dbt Core v2 compatibility table. Switch to dbt Core v1 for this project.`,
    };
  }

  static async getActiveAdapterCapabilities(
    projectPath?: string,
    detectedDbtCoreVersion?: string | null,
    adapterHint?: string,
  ): Promise<DbtAdapterCapabilityResponse> {
    const dbtCoreVersion =
      detectedDbtCoreVersion === undefined
        ? ((await SettingsService.loadSettings()).dbtVersion ?? null)
        : detectedDbtCoreVersion;
    let runtime: DbtAdapterCapabilityResponse['runtime'] = 'unknown';
    if (dbtCoreVersion?.startsWith('2.')) runtime = 'v2';
    if (dbtCoreVersion?.startsWith('1.')) runtime = 'v1';
    const resolved = await this.resolveProjectAdapter(projectPath, adapterHint);
    const adapter = this.capabilityFor(
      resolved.adapter,
      resolved.source,
      runtime === 'v2',
    );
    return {
      dbtCoreVersion,
      runtime,
      packageProvenance:
        runtime === 'unknown' ? 'unverified' : 'apache-dbt-core',
      projectPath: resolved.projectPath,
      adapters: [adapter],
    };
  }

  static async checkProjectAdapterCompatibility(
    projectPath?: string,
    detectedDbtCoreVersion?: string | null,
    adapterHint?: string,
  ): Promise<DbtProjectAdapterCheck> {
    const result = await this.getActiveAdapterCapabilities(
      projectPath,
      detectedDbtCoreVersion,
      adapterHint,
    );
    return { ...result, adapter: result.adapters[0] };
  }

  private static async inspectAdapterCompatibility(
    targetVersion: string,
  ): Promise<DbtAdapterCompatibility[]> {
    const python = await getPythonExecutable();
    const target = parseVersionTriple(targetVersion);
    const adapters: (DbtAdapterCompatibility | null)[] = await Promise.all(
      ADAPTER_PACKAGES.map(async (packageName) => {
        const result = await runProcess(python, [
          '-m',
          'pip',
          'show',
          packageName,
        ]);
        const installedVersion =
          result.exitCode === 0 ? parsePipShowVersion(result.stdout) : null;
        if (!installedVersion) return null;

        const adapter = parseVersionTriple(installedVersion);
        if (target && adapter && target.major === adapter.major) {
          return {
            packageName,
            installedVersion,
            status: 'likely-compatible' as const,
            message: `Installed major version matches dbt-core ${targetVersion}; verify the adapter's published compatibility range.`,
          };
        }
        if (target && target.major >= 2) {
          const message =
            packageName === 'dbt-postgres'
              ? `Postgres is not supported safely by dbt-core ${targetVersion}. Rosetta blocks v2 Postgres execution; use a stable dbt-core v1 release for Postgres projects.`
              : `Compatibility with dbt-core ${targetVersion} is not proven. A v2-capable adapter may be required.`;
          return {
            packageName,
            installedVersion,
            status: 'warning' as const,
            message,
          };
        }
        return {
          packageName,
          installedVersion,
          status: 'unknown' as const,
          message: `Confirm this adapter supports dbt-core ${targetVersion} after the version change.`,
        };
      }),
    );

    return adapters.filter(
      (adapter): adapter is DbtAdapterCompatibility => adapter !== null,
    );
  }

  private static async fetchPypiProjectJson(
    packageName: string,
  ): Promise<PypiProjectJson> {
    const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;
    const res = await axios.get(url, { timeout: 15000 });
    return res.data as PypiProjectJson;
  }
}
