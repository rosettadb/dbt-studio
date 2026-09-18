import { app, WebContents } from 'electron';
import axios from 'axios';
import { createHash } from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import type {
  PythonNotebookDataPackageStatus,
  PythonNotebookEnvironmentKind,
  PythonNotebookEnvironmentStatus,
  PythonNotebookEnvironmentSummary,
  PythonNotebookEvent,
  PythonNotebookExecuteRequest,
  PythonNotebookExecuteResponse,
  PythonNotebookPackageActionRequest,
  PythonNotebookPackageInstallRequest,
  PythonNotebookPackageVersionListResponse,
  PythonNotebookRemoveEnvironmentRequest,
  PythonNotebookRunAllRequest,
  PythonNotebookRuntimeState,
  PythonNotebookSelectEnvironmentRequest,
  PythonNotebookSelectedEnvironment,
  PythonNotebookSessionSnapshot,
  PythonNotebookCustomInterpreterRequest,
  PythonNotebookPackageStatus,
  PythonNotebookRuntimeStatus,
  PythonNotebookUserPackageActionRequest,
  PythonNotebookUserPackageRequest,
  PythonNotebookUserPackageStatus,
  PythonNotebookUserPackageVersionListResponse,
} from '../../types/notebooks';
import SettingsService from './settings.service';
import { PythonLanguageServerService } from './pythonLanguageServer.service';
import { NotebooksService } from './notebooks.service';

const RUNTIME_VERSION = '1';
const MINIMUM_PYTHON_VERSION = '3.9';
const MAX_DIAGNOSTIC_LENGTH = 500;
const MAX_LIVE_SESSIONS = 2;
const MAX_EVENT_LINE_BYTES = 128 * 1024;
const MAX_EVENT_TEXT_LENGTH = 64 * 1024;
const MAX_OUTPUT_DATA_LENGTH = 5 * 1024 * 1024;
const MAX_BRIDGE_FRAME_BYTES = 8 * 1024 * 1024;
const MAX_RETRY_IDS = 100;
const MAINTENANCE_SHUTDOWN_TIMEOUT_MS = 5000;
const PACKAGE_VERSION_LIST_LIMIT = 4;
const REQUIRED_PACKAGES = [
  { name: 'ipykernel', version: '6.30.1' },
  { name: 'jupyter_client', version: '8.6.3' },
  { name: 'nbformat', version: '5.10.4' },
] as const;
// Phase 11: curated quick-install profile for common notebook/data packages.
// A convenience selection, not an allowlist boundary.
const DATA_PROFILE_PACKAGES = [
  'numpy',
  'pandas',
  'matplotlib',
  'polars',
  'pyarrow',
  'pyspark',
] as const;
const CATALOG_PACKAGES = [
  ...DATA_PROFILE_PACKAGES,
  'duckdb',
  'seaborn',
  'plotly',
  'scipy',
  'scikit-learn',
  'sqlalchemy',
  'psycopg',
  'requests',
  'boto3',
  'fsspec',
  's3fs',
  'pyiceberg',
  'deltalake',
  'openpyxl',
] as const;
const ENVIRONMENT_METADATA_FILENAME = 'environment.json';
const USER_PACKAGES_FILENAME = 'user-packages.json';
const MAX_TRACKED_USER_PACKAGES = 100;
const MAX_ENVIRONMENT_LABEL_LENGTH = 120;
const PACKAGE_NAME_MAX_LENGTH = 128;
const USER_PACKAGE_NAME_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/;

type PackageName = (typeof REQUIRED_PACKAGES)[number]['name'];
type OperationState = PythonNotebookRuntimeStatus['operation']['state'];
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

const VERSION_PATTERN =
  /^[0-9]+(?:\.[0-9]+)*(?:(?:a|b|rc)[0-9]+)?(?:\.post[0-9]+)?(?:\.dev[0-9]+)?$/i;

const normalizeVersion = (version: string): string =>
  version.trim().replace(/-/g, '').replace(/alpha/i, 'a').replace(/beta/i, 'b');

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
  const parsed = parseVersionTriple(version);
  return parsed ? parsed.preRank < 3 : false;
};

const isValidPackageVersion = (version: string): boolean =>
  VERSION_PATTERN.test(normalizeVersion(version));

type NotebookSession = {
  notebookId: string;
  ownerWebContentsId: number;
  sender: WebContents;
  process: ChildProcessWithoutNullStreams;
  pendingLine: string;
  retries: Map<string, string>;
  state: PythonNotebookSessionSnapshot['state'];
  generation: number;
  events: PythonNotebookEvent[];
  activeExecution: { cellId: string; executionId: string } | null;
  runAll: {
    revision: number;
    cells: Array<{ cellId: string; code: string }>;
  } | null;
  /** Phase 11: environment backing this kernel; selection cannot change while set. */
  environmentId: string;
};

type EnvironmentSelection = {
  selectedId: string;
  /** Absolute project path backing a selected project environment. */
  selectedProjectPath?: string;
  customPaths: string[];
};

type TrackedUserPackage = {
  name: string;
  extras: string[];
  version: string | null;
};

type ResolvedEnvironment = {
  selection: EnvironmentSelection;
  environments: PythonNotebookEnvironmentStatus[];
  selected: PythonNotebookSelectedEnvironment | null;
  /** Present when the stored selection cannot be resolved to a live interpreter. */
  unavailableReason: string | null;
};

export class PythonNotebookService {
  private static activeSessionCount = 0;

  private static sessions = new Map<string, NotebookSession>();

  private static operation: PythonNotebookRuntimeStatus['operation'] = {
    state: 'idle',
  };

  private static operationPromise: Promise<void> | null = null;

  private static editorServer: PythonLanguageServerService | null = null;

  static getLanguageServer(): PythonLanguageServerService {
    if (!this.editorServer) {
      this.editorServer = new PythonLanguageServerService(
        this.getPythonPath(),
        this.getRuntimeDirectory(),
      );
      if (this.operationPromise) this.editorServer.stop(true);
    }
    return this.editorServer;
  }

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

  // ─── Phase 11: IDE-style environment selection ──────────────────────────

  private static getNotebooksRoot(): string {
    return path.join(app.getPath('userData'), 'python-notebooks');
  }

  private static environmentMetadataPath(): string {
    return path.join(this.getNotebooksRoot(), ENVIRONMENT_METADATA_FILENAME);
  }

  private static userPackagesPath(): string {
    return path.join(this.getNotebooksRoot(), USER_PACKAGES_FILENAME);
  }

  private static hashSegment(value: string): string {
    return createHash('sha1').update(value).digest('hex').slice(0, 10);
  }

  private static async loadEnvironmentSelection(): Promise<EnvironmentSelection> {
    // Phase 12: all notebook operations use the dedicated Studio runtime.
    // Keep legacy metadata on disk for rollback; it no longer controls execution.
    return { selectedId: 'managed', customPaths: [] };
  }

  private static async saveEnvironmentSelection(
    selection: EnvironmentSelection,
  ): Promise<void> {
    await fs.ensureDir(this.getNotebooksRoot());
    await fs.writeJson(this.environmentMetadataPath(), selection, {
      spaces: 2,
    });
  }

  private static async loadTrackedUserPackages(): Promise<
    Record<string, TrackedUserPackage[]>
  > {
    try {
      const raw = (await fs.readJson(this.userPackagesPath())) as Record<
        string,
        unknown
      > | null;
      if (!raw || typeof raw !== 'object') return {};
      const result: Record<string, TrackedUserPackage[]> = {};
      Object.entries(raw).forEach(([key, value]) => {
        if (!Array.isArray(value)) return;
        result[key] = value
          .filter(
            (item): item is TrackedUserPackage =>
              Boolean(item) &&
              typeof (item as TrackedUserPackage).name === 'string',
          )
          .map((item) => ({
            name: item.name,
            extras: Array.isArray(item.extras)
              ? item.extras.filter(
                  (extra): extra is string => typeof extra === 'string',
                )
              : [],
            version:
              typeof item.version === 'string' && item.version.length > 0
                ? item.version
                : null,
          }))
          .slice(0, MAX_TRACKED_USER_PACKAGES);
      });
      return result;
    } catch {
      return {};
    }
  }

  private static async saveTrackedUserPackages(
    tracked: Record<string, TrackedUserPackage[]>,
  ): Promise<void> {
    await fs.ensureDir(this.getNotebooksRoot());
    await fs.writeJson(this.userPackagesPath(), tracked, { spaces: 2 });
  }

  private static async resolvePythonVersion(
    pythonPath: string,
  ): Promise<string | null> {
    try {
      const result = await this.runProcess(
        pythonPath,
        [
          '-c',
          'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}")',
        ],
        undefined,
        64,
      );
      if (result.exitCode !== 0) return null;
      const version = result.stdout.trim();
      return /^\d+\.\d+\.\d+$/.test(version) ? version : null;
    } catch {
      return null;
    }
  }

  private static async checkEnvironmentWritable(
    pythonPath: string,
  ): Promise<boolean> {
    try {
      const result = await this.runProcess(
        pythonPath,
        [
          '-c',
          'import os, sys, sysconfig; print(os.access(sysconfig.get_paths().get("purelib", sys.prefix), os.W_OK))',
        ],
        undefined,
        16,
      );
      return result.exitCode === 0 && result.stdout.trim() === 'True';
    } catch {
      return false;
    }
  }

  private static async checkKernelReady(pythonPath: string): Promise<boolean> {
    try {
      const result = await this.runProcess(
        pythonPath,
        ['-c', 'import ipykernel, jupyter_client'],
        undefined,
        64,
      );
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  private static async readNamedPackageVersions(
    pythonPath: string,
    names: string[],
  ): Promise<Record<string, string | null>> {
    const unique = [...new Set(names)].slice(0, 32);
    const script = [
      'import importlib.metadata as metadata',
      'import json',
      `names = ${JSON.stringify(unique)}`,
      'def version(name):',
      '    try:',
      '        return metadata.version(name)',
      '    except metadata.PackageNotFoundError:',
      '        return None',
      'print(json.dumps({name: version(name) for name in names}))',
    ].join('\n');
    const result = await this.runProcess(
      pythonPath,
      ['-c', script],
      undefined,
      8192,
    );
    if (result.exitCode !== 0) {
      throw new Error('Unable to inspect packages in the Python environment.');
    }
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const versions: Record<string, string | null> = {};
    unique.forEach((name) => {
      const value = parsed[name];
      versions[name] = typeof value === 'string' ? value : null;
    });
    return versions;
  }

  private static async venvPythonPath(
    environmentDir: string,
  ): Promise<string | null> {
    const candidate = path.join(
      environmentDir,
      process.platform === 'win32' ? 'Scripts' : 'bin',
      process.platform === 'win32' ? 'python.exe' : 'python',
    );
    try {
      const stat = await fs.stat(candidate);
      return stat.isFile() ? candidate : null;
    } catch {
      return null;
    }
  }

  private static normalizeUserPackageName(value: unknown): string {
    const name = String(value ?? '').trim();
    if (
      !name ||
      name.length > PACKAGE_NAME_MAX_LENGTH ||
      !USER_PACKAGE_NAME_PATTERN.test(name)
    ) {
      throw new Error(
        `Invalid Python package name "${this.sanitizeDiagnostic(name || String(value ?? ''))}".`,
      );
    }
    if (
      REQUIRED_PACKAGES.some(
        (item) =>
          item.name.replace(/[-_.]/g, '-').toLowerCase() ===
          name.replace(/[-_.]/g, '-').toLowerCase(),
      )
    ) {
      throw new Error(
        `${name} is a required Jupyter package. Change its version from the required package controls instead.`,
      );
    }
    return name;
  }

  private static normalizeUserPackageExtras(value: unknown): string[] {
    if (value === undefined || value === null) return [];
    const list = Array.isArray(value) ? value : [value];
    const extras = list
      .map((item) =>
        String(item ?? '')
          .trim()
          .toLowerCase(),
      )
      .filter(
        (item) =>
          item.length > 0 &&
          item.length <= PACKAGE_NAME_MAX_LENGTH &&
          USER_PACKAGE_NAME_PATTERN.test(item),
      );
    if (extras.length !== list.length) {
      throw new Error('Invalid Python package extras.');
    }
    return [...new Set(extras)].slice(0, 5);
  }

  private static normalizeUserPackageVersion(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    const version = String(value).trim();
    if (!version) return null;
    if (!isValidPackageVersion(version)) {
      throw new Error(`Invalid Python package version "${version}".`);
    }
    return version;
  }

  private static buildUserPackageSpec(
    name: string,
    extras: string[],
    version: string | null,
  ): string {
    const extrasPart = extras.length > 0 ? `[${extras.join(',')}]` : '';
    const versionPart = version ? `==${version}` : '';
    return `${name}${extrasPart}${versionPart}`;
  }

  private static requireNoActiveOperation(): void {
    if (this.operationPromise) {
      throw new Error(
        'Wait for the current Jupyter runtime operation to finish and try again.',
      );
    }
  }

  private static describeEnvironmentKind(
    kind: PythonNotebookEnvironmentKind,
  ): string {
    switch (kind) {
      case 'managed':
        return 'Studio managed environment';
      case 'base':
        return 'Managed Python (base interpreter)';
      case 'project':
        return 'Project environment';
      case 'custom':
        return 'Custom interpreter';
      default:
        return 'Python environment';
    }
  }

  private static async buildEnvironmentEntry(
    id: string,
    kind: PythonNotebookEnvironmentKind,
    label: string,
    pythonPath: string | null,
    rootPath: string | null,
    isSelected: boolean,
    probeKernel: boolean,
  ): Promise<PythonNotebookEnvironmentStatus> {
    if (!pythonPath) {
      return {
        id,
        kind,
        label,
        pythonPath: null,
        pythonVersion: null,
        rootPath,
        exists: false,
        writable: false,
        kernelReady: null,
        isSelected,
      };
    }
    const [pythonVersion, writable, kernelReady] = await Promise.all([
      this.resolvePythonVersion(pythonPath),
      this.checkEnvironmentWritable(pythonPath),
      probeKernel ? this.checkKernelReady(pythonPath) : Promise.resolve(null),
    ]);
    return {
      id,
      kind,
      label:
        label.length > MAX_ENVIRONMENT_LABEL_LENGTH
          ? `${label.slice(0, MAX_ENVIRONMENT_LABEL_LENGTH - 1)}…`
          : label,
      pythonPath,
      pythonVersion,
      rootPath,
      exists: pythonVersion !== null,
      writable,
      kernelReady,
      isSelected,
    };
  }

  private static async resolveEnvironments(
    projectPath?: string,
  ): Promise<ResolvedEnvironment> {
    const selection = await this.loadEnvironmentSelection();
    const settings = await SettingsService.loadSettings();
    const runtimeDirectory = this.getRuntimeDirectory();
    const { selectedId } = selection;

    type PendingEntry = {
      id: string;
      kind: PythonNotebookEnvironmentKind;
      label: string;
      pythonPath: string | null;
      rootPath: string | null;
    };
    const pending: PendingEntry[] = [];
    const seenPythonPaths = new Set<string>();

    const managedPythonPath = (await fs.pathExists(
      this.getPythonPath(runtimeDirectory),
    ))
      ? this.getPythonPath(runtimeDirectory)
      : null;
    pending.push({
      id: 'managed',
      kind: 'managed',
      label: this.describeEnvironmentKind('managed'),
      pythonPath: managedPythonPath,
      rootPath: runtimeDirectory,
    });
    if (managedPythonPath) {
      seenPythonPaths.add(path.normalize(managedPythonPath).toLowerCase());
    }

    if (settings.pythonBinary && (await fs.pathExists(settings.pythonBinary))) {
      pending.push({
        id: 'base',
        kind: 'base',
        label: this.describeEnvironmentKind('base'),
        pythonPath: settings.pythonBinary,
        rootPath: path.dirname(settings.pythonBinary),
      });
      seenPythonPaths.add(path.normalize(settings.pythonBinary).toLowerCase());
    }

    const projectRoots = [
      ...(projectPath ? [projectPath] : []),
      ...(selection.selectedProjectPath &&
      selection.selectedProjectPath !== projectPath
        ? [selection.selectedProjectPath]
        : []),
    ];
    type DiscoveredProjectEnv = {
      root: string;
      dirname: string;
      environmentDir: string;
      venvPython: string;
    };
    const discoveredProjectEnvs = (
      await Promise.all(
        projectRoots.slice(0, 3).map(async (root) => {
          let stat: { isDirectory(): boolean } | null = null;
          try {
            stat = await fs.stat(root);
          } catch {
            stat = null;
          }
          if (!stat || !stat.isDirectory()) return [];
          const found = await Promise.all(
            ['.venv', 'venv'].map(async (dirname) => {
              const environmentDir = path.join(root, dirname);
              const venvPython = await this.venvPythonPath(environmentDir);
              if (!venvPython) return null;
              const discovered: DiscoveredProjectEnv = {
                root,
                dirname,
                environmentDir,
                venvPython,
              };
              return discovered;
            }),
          );
          return found.filter(
            (item): item is DiscoveredProjectEnv => item !== null,
          );
        }),
      )
    ).flat();
    discoveredProjectEnvs.forEach(
      ({ root, dirname, environmentDir, venvPython }) => {
        const normalized = path.normalize(venvPython).toLowerCase();
        if (seenPythonPaths.has(normalized)) return;
        seenPythonPaths.add(normalized);
        pending.push({
          id: `project:${this.hashSegment(root)}:${dirname}`,
          kind: 'project',
          label: `Project environment (${dirname})`,
          pythonPath: venvPython,
          rootPath: environmentDir,
        });
      },
    );

    const customPathStats = await Promise.all(
      selection.customPaths.map(async (customPath) => {
        try {
          return {
            customPath,
            isFile: (await fs.stat(customPath)).isFile(),
          };
        } catch {
          return { customPath, isFile: false };
        }
      }),
    );
    customPathStats.forEach(({ customPath, isFile }) => {
      const normalized = path.normalize(customPath);
      if (seenPythonPaths.has(normalized.toLowerCase())) return;
      seenPythonPaths.add(normalized.toLowerCase());
      pending.push({
        id: `custom:${this.hashSegment(normalized.toLowerCase())}`,
        kind: 'custom',
        label: `Custom interpreter (${path.basename(path.dirname(normalized)) || normalized})`,
        pythonPath: isFile ? customPath : null,
        rootPath: isFile ? path.dirname(customPath) : null,
      });
    });

    const environments = await Promise.all(
      pending
        .filter((entry) => entry.id === 'managed')
        .map((entry) =>
          this.buildEnvironmentEntry(
            entry.id,
            entry.kind,
            entry.label,
            entry.pythonPath,
            entry.rootPath,
            entry.id === selectedId,
            entry.id === selectedId,
          ),
        ),
    );

    const selectedEntry =
      environments.find((entry) => entry.id === selectedId) ?? null;
    if (!selectedEntry || !selectedEntry.exists || !selectedEntry.pythonPath) {
      const reason =
        selectedId === 'managed'
          ? null
          : 'Set up the Studio notebook environment to run notebooks.';
      return {
        selection,
        environments,
        selected: null,
        unavailableReason: reason,
      };
    }
    return {
      selection,
      environments,
      selected: {
        id: selectedEntry.id,
        kind: selectedEntry.kind,
        label: selectedEntry.label,
        pythonPath: selectedEntry.pythonPath,
        pythonVersion: selectedEntry.pythonVersion,
        rootPath: selectedEntry.rootPath,
        writable: selectedEntry.writable,
      },
      unavailableReason: null,
    };
  }

  private static buildRequirementsSnippet(
    dataPackages: PythonNotebookDataPackageStatus[],
    userPackages: PythonNotebookUserPackageStatus[],
  ): string {
    const specs: string[] = [];
    userPackages.forEach((pkg) => {
      if (!pkg.installedVersion && !pkg.requestedVersion) return;
      const version = pkg.requestedVersion ?? pkg.installedVersion;
      const extras = pkg.extras.length > 0 ? `[${pkg.extras.join(',')}]` : '';
      specs.push(`${pkg.name}${extras}${version ? `==${version}` : ''}`);
    });
    dataPackages.forEach((pkg) => {
      if (!pkg.installedVersion) return;
      if (
        specs.some((spec) =>
          spec.toLowerCase().startsWith(pkg.name.toLowerCase()),
        )
      ) {
        return;
      }
      specs.push(`${pkg.name}==${pkg.installedVersion}`);
    });
    if (specs.length === 0) {
      return '# No Studio-tracked data packages in this environment yet.';
    }
    return `pip install ${specs.join(' ')}`;
  }

  private static isNotebookPackageName(value: string): value is PackageName {
    return REQUIRED_PACKAGES.some((item) => item.name === value);
  }

  private static async fetchPypiProjectJson(
    packageName: string,
  ): Promise<PypiProjectJson> {
    const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;
    const res = await axios.get(url, { timeout: 15000 });
    return res.data as PypiProjectJson;
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
    maxStdoutLength = MAX_DIAGNOSTIC_LENGTH,
  ): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { shell: false });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout = (stdout + chunk.toString()).slice(-maxStdoutLength);
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

  private static async readInstalledPackageList(
    pythonPath: string,
  ): Promise<{ name: string; version: string }[]> {
    const script = [
      'import importlib.metadata as metadata',
      'import json',
      'items = sorted((d.metadata.get("Name", ""), d.version) for d in metadata.distributions())',
      'print(json.dumps(items[:200]))',
    ].join('\n');
    const result = await this.runProcess(
      pythonPath,
      ['-c', script],
      undefined,
      32768,
    );
    if (result.exitCode !== 0) return [];
    const entries = JSON.parse(result.stdout) as unknown;
    if (!Array.isArray(entries)) return [];
    return entries
      .filter(
        (item): item is [string, string] =>
          Array.isArray(item) &&
          item.length === 2 &&
          typeof item[0] === 'string' &&
          typeof item[1] === 'string',
      )
      .map(([name, version]) => ({
        name: name.slice(0, 128),
        version: version.slice(0, 64),
      }));
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
    this.editorServer?.stop(true);
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
      this.editorServer?.resume();
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

  private static async requireRuntimePython(): Promise<string> {
    await this.requireManagedPython();
    const pythonPath = this.getPythonPath();
    if (!(await fs.pathExists(pythonPath))) {
      throw new Error('Install Jupyter packages before changing a package.');
    }
    return pythonPath;
  }

  private static emit(session: NotebookSession, event: PythonNotebookEvent) {
    session.events.push(event);
    session.events = session.events.slice(-200);
    if (!session.sender.isDestroyed()) {
      session.sender.send('notebooks:python:event', event);
    }
  }

  private static normalizeBridgeEvent(
    session: NotebookSession,
    event: Record<string, unknown>,
  ): PythonNotebookEvent | null {
    if (
      event.type === 'session' &&
      (event.status === 'idle' || event.status === 'dead')
    ) {
      return {
        type: 'session',
        notebookId: session.notebookId,
        status: event.status,
        message:
          typeof event.message === 'string'
            ? event.message.slice(0, MAX_DIAGNOSTIC_LENGTH)
            : undefined,
      };
    }
    const executionId =
      typeof event.executionId === 'string' ? event.executionId : null;
    const cellId = typeof event.cellId === 'string' ? event.cellId : null;
    if (!executionId || !cellId) return null;

    if (
      event.type === 'stream' ||
      event.type === 'result' ||
      event.type === 'display' ||
      event.type === 'display-update'
    ) {
      return {
        type: event.type,
        notebookId: session.notebookId,
        cellId,
        executionId,
        text: String(event.text ?? '').slice(0, MAX_EVENT_TEXT_LENGTH),
        truncated: Boolean(event.truncated),
        mime:
          event.mime === 'image/png' ||
          event.mime === 'image/jpeg' ||
          event.mime === 'text/html' ||
          event.mime === 'text/plain'
            ? event.mime
            : undefined,
        data:
          typeof event.data === 'string'
            ? event.data.slice(0, MAX_OUTPUT_DATA_LENGTH)
            : undefined,
      };
    }
    if (event.type === 'clear-output') {
      return {
        type: 'clear-output',
        notebookId: session.notebookId,
        cellId,
        executionId,
        wait: Boolean(event.wait),
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
        if (!event) return;
        // A final bridge reply must not revive a session being shut down.
        if (session.state === 'stopped' && event.type === 'session') return;
        this.emit(session, event);
        if (event.type === 'session') {
          session.state = event.status;
          if (event.status === 'idle') session.activeExecution = null;
          return;
        }
        if (
          event.type === 'status' &&
          (event.status === 'success' || event.status === 'error')
        ) {
          session.activeExecution = null;
          if (session.state === 'stopped') return;
          session.state = 'idle';
          this.emit(session, {
            type: 'session',
            notebookId: session.notebookId,
            status: 'idle',
          });
          if (session.runAll) {
            if (event.status === 'error') {
              session.runAll = null;
            } else {
              this.continueRunAll(session).catch(() => {
                session.runAll = null;
              });
            }
          }
        }
      } catch {
        // The bridge's stdout protocol is deliberately fail-closed.
      }
    });
  }

  private static async startSession(
    notebookId: string,
    sender: WebContents,
  ): Promise<NotebookSession> {
    if (this.operation.state !== 'idle') {
      throw new Error(
        this.operation.message ||
          'Jupyter runtime maintenance is currently in progress.',
      );
    }
    const existing = this.sessions.get(notebookId);
    if (existing) {
      if (existing.environmentId !== 'managed') {
        throw new Error(
          'Close the previous kernel before using the Studio notebook environment.',
        );
      }
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
    const selected = status.selectedEnvironment;
    if (!selected) {
      throw new Error('Set up the notebook environment before running cells.');
    }

    const child = spawn(
      selected.pythonPath,
      [this.getResourcePath('notebook_bridge.py'), '--serve'],
      {
        shell: false,
        stdio: 'pipe',
        // Spark launches Python workers separately from the notebook driver.
        // Pin both sides to the exact Studio-managed interpreter so PySpark
        // does not fall back to the macOS system Python.
        env: {
          ...process.env,
          PYSPARK_PYTHON: selected.pythonPath,
          PYSPARK_DRIVER_PYTHON: selected.pythonPath,
        },
      },
    );
    const session: NotebookSession = {
      notebookId,
      ownerWebContentsId: sender.id,
      sender,
      process: child,
      pendingLine: '',
      retries: new Map(),
      state: 'idle',
      generation: 1,
      events: [],
      activeExecution: null,
      runAll: null,
      environmentId: selected.id,
    };
    child.stdout.on('data', (chunk: Buffer) =>
      this.consumeBridgeOutput(session, chunk),
    );
    child.stderr.on('data', () => undefined);
    child.on('error', () => this.sessions.delete(notebookId));
    child.on('exit', () => {
      if (this.sessions.get(notebookId) !== session) return;
      const stopped = session.state === 'stopped';
      session.state = stopped ? 'stopped' : 'dead';
      this.emit(session, {
        type: 'session',
        notebookId,
        status: session.state,
        message: stopped
          ? 'The Python kernel was shut down.'
          : 'The Python kernel stopped unexpectedly.',
      });
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
    if (session.activeExecution || session.runAll) {
      throw new Error('The Python kernel is already running a cell.');
    }
    const retryExecutionId = session.retries.get(request.requestId);
    if (retryExecutionId) return { executionId: retryExecutionId };

    const executionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    session.retries.set(request.requestId, executionId);
    if (session.retries.size > MAX_RETRY_IDS) {
      session.retries.delete(session.retries.keys().next().value as string);
    }
    this.dispatchExecution(session, request.cellId, cell.source, executionId);
    return { executionId };
  }

  private static dispatchExecution(
    session: NotebookSession,
    cellId: string,
    code: string,
    executionId: string,
  ) {
    session.activeExecution = { cellId, executionId };
    session.state = 'running';
    this.emit(session, {
      type: 'status',
      notebookId: session.notebookId,
      cellId,
      executionId,
      status: 'running',
    });
    this.emit(session, {
      type: 'session',
      notebookId: session.notebookId,
      status: 'running',
    });
    session.process.stdin.write(
      `${JSON.stringify({
        operation: 'execute',
        cellId,
        executionId,
        code,
      })}\n`,
    );
  }

  private static async continueRunAll(session: NotebookSession) {
    const { runAll } = session;
    if (!runAll) return;
    const notebook = await NotebooksService.getPythonNotebook(
      session.notebookId,
    );
    if (!notebook || notebook.revision !== runAll.revision) {
      session.runAll = null;
      this.emit(session, {
        type: 'session',
        notebookId: session.notebookId,
        status: 'idle',
        message: 'Run All stopped because the notebook changed.',
      });
      return;
    }
    const next = runAll.cells.shift();
    if (!next) {
      session.runAll = null;
      return;
    }
    const executionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    this.dispatchExecution(session, next.cellId, next.code, executionId);
  }

  static async runAll(
    request: PythonNotebookRunAllRequest,
    sender: WebContents,
  ): Promise<PythonNotebookExecuteResponse> {
    const notebook = await NotebooksService.getPythonNotebook(
      request.notebookId,
    );
    if (!notebook || notebook.revision !== request.revision) {
      throw new Error(
        'Save the latest notebook changes before running all cells.',
      );
    }
    const session = await this.startSession(request.notebookId, sender);
    if (session.activeExecution || session.runAll) {
      throw new Error('The Python kernel is already running.');
    }
    const cells = notebook.cells
      .filter((cell) => cell.cellType === 'code')
      .map((cell) => ({ cellId: cell.id, code: cell.source }));
    if (cells.length === 0)
      throw new Error('There are no Python code cells to run.');
    session.runAll = { revision: notebook.revision, cells };
    const executionId = request.requestId;
    await this.continueRunAll(session);
    return { executionId };
  }

  private static requireOwnedSession(notebookId: string, sender: WebContents) {
    const session = this.sessions.get(notebookId);
    if (!session)
      throw new Error('This notebook does not have a running kernel.');
    if (session.ownerWebContentsId !== sender.id) {
      throw new Error('This notebook kernel belongs to another window.');
    }
    return session;
  }

  static async interrupt(
    notebookId: string,
    sender: WebContents,
  ): Promise<void> {
    const session = this.requireOwnedSession(notebookId, sender);
    session.runAll = null;
    session.state = 'interrupting';
    this.emit(session, { type: 'session', notebookId, status: 'interrupting' });
    session.process.stdin.write(
      `${JSON.stringify({ operation: 'interrupt' })}\n`,
    );
  }

  static async restart(notebookId: string, sender: WebContents): Promise<void> {
    const existing = this.sessions.get(notebookId);
    if (!existing) {
      const session = await this.startSession(notebookId, sender);
      this.emit(session, { type: 'session', notebookId, status: 'idle' });
      return;
    }
    const session = this.requireOwnedSession(notebookId, sender);
    session.runAll = null;
    session.state = 'restarting';
    session.generation += 1;
    this.emit(session, {
      type: 'session',
      notebookId,
      status: 'restarting',
      message: 'Restarting clears all Python variables.',
    });
    session.process.stdin.write(
      `${JSON.stringify({ operation: 'restart' })}\n`,
    );
  }

  static async sessionSnapshot(
    notebookId: string,
    sender: WebContents,
  ): Promise<PythonNotebookSessionSnapshot> {
    const session = this.sessions.get(notebookId);
    if (!session)
      return { notebookId, state: 'stopped', generation: 0, events: [] };
    if (session.ownerWebContentsId !== sender.id) {
      throw new Error('This notebook kernel belongs to another window.');
    }
    return {
      notebookId,
      state: session.state,
      generation: session.generation,
      events: session.events,
    };
  }

  static async shutdown(
    notebookId: string,
    sender: WebContents,
  ): Promise<void> {
    const session = this.sessions.get(notebookId);
    if (!session) return;
    if (session.ownerWebContentsId !== sender.id)
      throw new Error('This notebook kernel belongs to another window.');
    session.runAll = null;
    session.state = 'stopped';
    session.process.stdin.end(`${JSON.stringify({ operation: 'shutdown' })}\n`);
  }

  static async deleteDocument(notebookId: string): Promise<void> {
    const session = this.sessions.get(notebookId);
    if (session) {
      session.runAll = null;
      session.state = 'stopped';
      session.process.stdin.end(
        `${JSON.stringify({ operation: 'shutdown' })}\n`,
      );
    }
    await NotebooksService.deletePythonNotebook(notebookId);
  }

  static async shutdownAll(): Promise<void> {
    this.editorServer?.stop(true);
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

  private static async stopSessionsForMaintenance(
    expectedActiveSessionCount: number,
  ): Promise<void> {
    if (this.sessions.size !== expectedActiveSessionCount) {
      throw new Error(
        'Active notebook kernels changed. Review the current session count and try again.',
      );
    }
    if (this.sessions.size === 0) return;

    const sessions = [...this.sessions.values()];
    const waitForShutdown = sessions.map(
      (session) =>
        new Promise<boolean>((resolve) => {
          let settled = false;
          let timeout: ReturnType<typeof setTimeout> | undefined;
          const finish = (value: boolean) => {
            if (settled) return;
            settled = true;
            if (timeout) clearTimeout(timeout);
            resolve(value);
          };
          session.process.once('exit', () => finish(true));
          timeout = setTimeout(
            () => finish(false),
            MAINTENANCE_SHUTDOWN_TIMEOUT_MS,
          );
        }),
    );

    sessions.forEach((session) => {
      session.runAll = null;
      session.state = 'stopped';
      this.emit(session, {
        type: 'session',
        notebookId: session.notebookId,
        status: 'stopped',
        message: 'Jupyter runtime maintenance stopped this kernel.',
      });
      session.process.stdin.end(
        `${JSON.stringify({ operation: 'shutdown' })}\n`,
      );
    });

    const stopped = await Promise.all(waitForShutdown);
    if (stopped.some((value) => !value)) {
      throw new Error(
        'Could not stop every active Python kernel. Shut them down and try again.',
      );
    }
    this.sessions.clear();
    this.activeSessionCount = 0;
  }

  private static async installRuntimeIntoStaging(
    state: Exclude<OperationState, 'idle'>,
  ): Promise<void> {
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
        throw new Error('Could not create the dedicated Jupyter environment.');
      }

      this.operation = {
        state,
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
        state,
        message: 'Verifying the Jupyter kernel…',
      };
      const versions = await this.runHealthProbe(
        this.getPythonPath(stageDirectory),
      );
      if (
        !REQUIRED_PACKAGES.every((item) => versions[item.name] === item.version)
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
  }

  private static async buildStatusEnvironmentBlock(
    projectPath?: string,
  ): Promise<{
    selectedEnvironment: PythonNotebookSelectedEnvironment | null;
    environments: PythonNotebookEnvironmentStatus[];
    requiredVersions: Record<string, string | null>;
    inspectionFailed: boolean;
    dataPackages: PythonNotebookDataPackageStatus[];
    userPackages: PythonNotebookUserPackageStatus[];
    installedPackages: { name: string; version: string }[];
    requirementsSnippet: string;
    kernelReady: boolean;
  }> {
    const env = await this.resolveEnvironments(projectPath);
    const { selected } = env;
    const tracked = await this.loadTrackedUserPackages();
    const selectedTracked = selected ? (tracked[selected.id] ?? []) : [];
    const inspectedNames = [
      ...REQUIRED_PACKAGES.map((item) => item.name),
      ...CATALOG_PACKAGES,
      ...selectedTracked.map((item) => item.name),
    ];
    let inspected: Record<string, string | null> = {};
    let inspectionFailed = false;
    if (selected) {
      try {
        inspected = await this.readNamedPackageVersions(
          selected.pythonPath,
          inspectedNames,
        );
      } catch {
        inspectionFailed = true;
      }
    }
    let installedPackages: { name: string; version: string }[] = [];
    if (selected && !inspectionFailed) {
      try {
        installedPackages = await this.readInstalledPackageList(
          selected.pythonPath,
        );
      } catch {
        // The curated package versions and runtime health remain authoritative.
      }
    }
    const dataPackages: PythonNotebookDataPackageStatus[] =
      CATALOG_PACKAGES.map((name) => ({
        name,
        installedVersion: inspected[name] ?? null,
      }));
    const userPackages: PythonNotebookUserPackageStatus[] = selectedTracked.map(
      (item) => ({
        name: item.name,
        extras: item.extras,
        requestedVersion: item.version,
        installedVersion: inspected[item.name] ?? null,
      }),
    );
    const selectedEntry = selected
      ? (env.environments.find((entry) => entry.id === selected.id) ?? null)
      : null;
    return {
      selectedEnvironment: selected,
      environments: env.environments,
      inspectionFailed,
      requiredVersions: Object.fromEntries(
        REQUIRED_PACKAGES.map((item) => [
          item.name,
          inspected[item.name] ?? null,
        ]),
      ),
      dataPackages,
      userPackages,
      installedPackages,
      requirementsSnippet: this.buildRequirementsSnippet(
        dataPackages,
        userPackages,
      ),
      kernelReady: selectedEntry?.kernelReady ?? false,
    };
  }

  static async getRuntimeStatus(
    projectPath?: string,
  ): Promise<PythonNotebookRuntimeStatus> {
    const safeProjectPath =
      typeof projectPath === 'string' &&
      projectPath.length > 0 &&
      projectPath.length <= 1024
        ? projectPath
        : undefined;
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
    const envBlock = await this.buildStatusEnvironmentBlock(safeProjectPath);
    const selected = envBlock.selectedEnvironment;
    const baseStatus = {
      managedPython: {
        available: managedPythonAvailable,
        version: settings.pythonVersion || null,
        minimumVersion: MINIMUM_PYTHON_VERSION,
      },
      environmentPath: selected?.rootPath ?? runtimeDirectory,
      packages,
      activeSessionCount: this.activeSessionCount,
      operation: this.operation,
      selectedEnvironment: envBlock.selectedEnvironment,
      environments: envBlock.environments,
      dataPackages: envBlock.dataPackages,
      userPackages: envBlock.userPackages,
      installedPackages: envBlock.installedPackages,
      requirementsSnippet: envBlock.requirementsSnippet,
      kernelReady: envBlock.kernelReady,
    };

    if (
      this.operation.state === 'installing' ||
      this.operation.state === 'updating' ||
      this.operation.state === 'uninstalling'
    ) {
      return {
        ...baseStatus,
        state: this.operation.state,
        message: this.operation.message,
      };
    }
    if (!selected) {
      const selectedEntry = envBlock.environments.find(
        (entry) => entry.isSelected,
      );
      if (!selectedEntry || selectedEntry.id !== 'managed') {
        return {
          ...baseStatus,
          state: 'needs-attention',
          message: 'Set up the Studio notebook environment to run notebooks.',
        };
      }
    }
    if (!selected || selected.kind === 'managed') {
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
    } else {
      return this.describeExternalEnvironmentStatus(baseStatus, selected);
    }

    const resolvedPackages = packages.map((item) => ({
      ...item,
      installedVersion: envBlock.requiredVersions[item.name] ?? null,
    }));
    const hasRequiredPackages = resolvedPackages.every(
      (item) => item.installedVersion,
    );
    const usesDefaultVersions = resolvedPackages.every(
      (item) => item.installedVersion === item.requiredVersion,
    );
    return {
      ...baseStatus,
      packages: resolvedPackages,
      state:
        hasRequiredPackages &&
        envBlock.kernelReady &&
        !envBlock.inspectionFailed &&
        !this.operation.error
          ? 'ready'
          : 'needs-attention',
      message:
        this.operation.error ||
        (envBlock.inspectionFailed
          ? 'Could not inspect notebook packages. Retry the runtime check or repair the environment.'
          : undefined) ||
        (!envBlock.kernelReady && hasRequiredPackages
          ? 'Notebook kernel is unavailable. Repair the environment.'
          : undefined) ||
        (hasRequiredPackages
          ? this.operation.message
          : 'One or more required Jupyter packages are missing.') ||
        (!usesDefaultVersions
          ? 'Jupyter package versions differ from the app-supported defaults. Check Runtime before relying on execution.'
          : undefined),
    };
  }

  private static describeExternalEnvironmentStatus(
    baseStatus: Omit<PythonNotebookRuntimeStatus, 'state' | 'message'> & {
      state?: PythonNotebookRuntimeState;
      message?: string;
    },
    selected: PythonNotebookSelectedEnvironment,
  ): PythonNotebookRuntimeStatus {
    if (!selected.pythonVersion) {
      return {
        ...baseStatus,
        state: 'needs-attention',
        message:
          'The selected Python environment could not be inspected. Choose another environment.',
      };
    }
    if (!this.isAtLeastMinimumVersion(selected.pythonVersion)) {
      return {
        ...baseStatus,
        state: 'needs-attention',
        message: `Jupyter notebooks require Python ${MINIMUM_PYTHON_VERSION} or later in the selected environment.`,
      };
    }
    if (!baseStatus.kernelReady) {
      return {
        ...baseStatus,
        state: 'needs-attention',
        message:
          this.operation.error ||
          `"${selected.label}" is missing kernel support. Install kernel support to run notebooks.`,
      };
    }
    return {
      ...baseStatus,
      state: this.operation.error ? 'needs-attention' : 'ready',
      message: this.operation.error || this.operation.message,
    };
  }

  static async installRuntime(): Promise<PythonNotebookRuntimeStatus> {
    return this.withOperation(
      'installing',
      'Creating dedicated Jupyter environment…',
      async () => {
        if (this.sessions.size > 0) {
          throw new Error(
            'Close running notebook kernels before setting up the Studio environment. Saved notebooks are preserved.',
          );
        }
        await this.installRuntimeIntoStaging('installing');
      },
    );
  }

  static async updateRuntime(
    expectedActiveSessionCount = 0,
  ): Promise<PythonNotebookRuntimeStatus> {
    return this.withOperation(
      'updating',
      'Preparing to update Jupyter packages…',
      async () => {
        await this.stopSessionsForMaintenance(expectedActiveSessionCount);
        await this.requireManagedPython();
        const pythonPath = this.getPythonPath();
        if (await fs.pathExists(pythonPath)) {
          const installed = await this.readInstalledPackages(pythonPath);
          const alreadyCurrent = REQUIRED_PACKAGES.every(
            (item) => installed[item.name] === item.version,
          );
          if (alreadyCurrent) {
            this.operation = {
              state: 'updating',
              message: 'Verifying the current Jupyter runtime…',
            };
            await this.runHealthProbe(pythonPath);
            return;
          }
        }

        this.operation = {
          state: 'updating',
          message: 'Creating updated Jupyter environment…',
        };
        await this.installRuntimeIntoStaging('updating');
      },
    );
  }

  static async uninstallRuntime(
    expectedActiveSessionCount = 0,
  ): Promise<PythonNotebookRuntimeStatus> {
    return this.withOperation(
      'uninstalling',
      'Preparing to uninstall Jupyter packages…',
      async () => {
        await this.stopSessionsForMaintenance(expectedActiveSessionCount);
        await fs.remove(this.getRuntimeRoot());
      },
    );
  }

  static async listPackageVersions(
    packageName: string,
  ): Promise<PythonNotebookPackageVersionListResponse> {
    if (!this.isNotebookPackageName(packageName)) {
      throw new Error('Unsupported Jupyter package.');
    }

    try {
      const projectJson = await this.fetchPypiProjectJson(packageName);
      const versions = Object.entries(projectJson.releases ?? {})
        .filter(([, files]) =>
          files.some((releaseFile) => releaseFile.yanked !== true),
        )
        .map(([version]) => version)
        .filter((version) => parseVersionTriple(version) !== null)
        .filter((version) => !isPrerelease(version))
        .sort((a, b) => compareVersions(b, a));

      return {
        packageName,
        latestStable: versions[0] ?? null,
        versions: versions
          .slice(0, PACKAGE_VERSION_LIST_LIMIT)
          .map((version) => ({ version, isPrerelease: false })),
      };
    } catch {
      return { packageName, latestStable: null, versions: [] };
    }
  }

  static async installPackage(
    request: PythonNotebookPackageInstallRequest,
  ): Promise<PythonNotebookRuntimeStatus> {
    const packageName = String(request.packageName ?? '').trim();
    const version = String(request.version ?? '').trim();
    if (!this.isNotebookPackageName(packageName)) {
      throw new Error('Unsupported Jupyter package.');
    }
    if (!isValidPackageVersion(version)) {
      throw new Error('Invalid Jupyter package version.');
    }

    return this.withOperation(
      'updating',
      `Installing ${packageName} ${version}…`,
      async () => {
        await this.stopSessionsForMaintenance(
          request.expectedActiveSessionCount,
        );
        const pythonPath = await this.requireRuntimePython();
        const result = await this.runProcess(pythonPath, [
          '-m',
          'pip',
          'install',
          '--upgrade',
          '--force-reinstall',
          '--no-cache-dir',
          `${packageName}==${version}`,
        ]);
        if (result.exitCode !== 0) {
          throw new Error(`Could not install ${packageName} ${version}.`);
        }
        const installed = await this.readInstalledPackages(pythonPath);
        if (installed[packageName] !== version) {
          throw new Error(
            `Installed package verification failed for ${packageName}.`,
          );
        }
      },
    );
  }

  static async uninstallPackage(
    request: PythonNotebookPackageActionRequest,
  ): Promise<PythonNotebookRuntimeStatus> {
    const packageName = String(request.packageName ?? '').trim();
    if (!this.isNotebookPackageName(packageName)) {
      throw new Error('Unsupported Jupyter package.');
    }

    return this.withOperation(
      'uninstalling',
      `Uninstalling ${packageName}…`,
      async () => {
        await this.stopSessionsForMaintenance(
          request.expectedActiveSessionCount,
        );
        const pythonPath = await this.requireRuntimePython();
        const result = await this.runProcess(pythonPath, [
          '-m',
          'pip',
          'uninstall',
          '--yes',
          packageName,
        ]);
        if (result.exitCode !== 0) {
          throw new Error(`Could not uninstall ${packageName}.`);
        }
        const installed = await this.readInstalledPackages(pythonPath);
        if (installed[packageName]) {
          throw new Error(
            `Package uninstall verification failed for ${packageName}.`,
          );
        }
      },
    );
  }

  private static async runPip(
    pythonPath: string,
    pipArgs: string[],
    action: string,
  ): Promise<void> {
    const result = await this.runProcess(
      pythonPath,
      ['-m', 'pip', ...pipArgs],
      undefined,
      8192,
    );
    if (result.exitCode !== 0) {
      const detail = this.sanitizeDiagnostic(
        result.stderr.trim() ||
          result.stdout.trim() ||
          'No additional details.',
      );
      throw new Error(`${action} ${detail}`);
    }
  }

  private static async trackUserPackages(
    environmentId: string,
    items: TrackedUserPackage[],
  ): Promise<void> {
    const tracked = await this.loadTrackedUserPackages();
    const current = tracked[environmentId] ?? [];
    const merged = [...current];
    items.forEach((item) => {
      const index = merged.findIndex(
        (entry) => entry.name.toLowerCase() === item.name.toLowerCase(),
      );
      if (index >= 0) {
        merged[index] = item;
      } else {
        merged.push(item);
      }
    });
    tracked[environmentId] = merged.slice(0, MAX_TRACKED_USER_PACKAGES);
    await this.saveTrackedUserPackages(tracked);
  }

  private static async untrackUserPackage(
    environmentId: string,
    name: string,
  ): Promise<void> {
    const tracked = await this.loadTrackedUserPackages();
    const current = tracked[environmentId];
    if (!current) return;
    tracked[environmentId] = current.filter(
      (entry) => entry.name.toLowerCase() !== name.toLowerCase(),
    );
    await this.saveTrackedUserPackages(tracked);
  }

  private static async requireSelectedWritableEnvironment(): Promise<PythonNotebookSelectedEnvironment> {
    const env = await this.resolveEnvironments();
    if (!env.selected) {
      throw new Error(
        env.unavailableReason ?? 'Set up the notebook environment first.',
      );
    }
    if (!env.selected.writable) {
      throw new Error(
        `"${env.selected.label}" is read-only. Install packages manually with ${env.selected.pythonPath} -m pip install <package>, or repair the Studio notebook environment.`,
      );
    }
    return env.selected;
  }

  static async selectEnvironment(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _request: PythonNotebookSelectEnvironmentRequest,
  ): Promise<PythonNotebookRuntimeStatus> {
    throw new Error('Notebook environments are managed by Studio.');
  }

  static async addCustomInterpreter(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _request: PythonNotebookCustomInterpreterRequest,
  ): Promise<PythonNotebookRuntimeStatus> {
    throw new Error('Notebook environments are managed by Studio.');
  }

  static async removeEnvironment(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _request: PythonNotebookRemoveEnvironmentRequest,
  ): Promise<PythonNotebookRuntimeStatus> {
    throw new Error('Notebook environments are managed by Studio.');
  }

  static async ensureKernelSupport(
    expectedActiveSessionCount = 0,
  ): Promise<PythonNotebookRuntimeStatus> {
    return this.withOperation(
      'updating',
      'Installing kernel support…',
      async () => {
        await this.stopSessionsForMaintenance(expectedActiveSessionCount);
        const selected = await this.requireSelectedWritableEnvironment();
        this.operation = {
          state: 'updating',
          message: `Installing kernel support into "${selected.label}"…`,
        };
        await this.runPip(
          selected.pythonPath,
          [
            'install',
            '--disable-pip-version-check',
            '--no-input',
            'ipykernel',
            'nbformat',
          ],
          'Could not install kernel support.',
        );
        if (!(await this.checkKernelReady(selected.pythonPath))) {
          throw new Error(
            'Kernel support verification failed. Check the environment and try again.',
          );
        }
      },
    );
  }

  static async installDataProfile(
    expectedActiveSessionCount = 0,
  ): Promise<PythonNotebookRuntimeStatus> {
    return this.withOperation(
      'updating',
      'Installing data packages…',
      async () => {
        await this.stopSessionsForMaintenance(expectedActiveSessionCount);
        const selected = await this.requireSelectedWritableEnvironment();
        this.operation = {
          state: 'updating',
          message: `Installing data packages into "${selected.label}"…`,
        };
        await this.runPip(
          selected.pythonPath,
          [
            'install',
            '--disable-pip-version-check',
            '--no-input',
            ...DATA_PROFILE_PACKAGES,
          ],
          'Could not install data packages.',
        );
        const installed = await this.readNamedPackageVersions(
          selected.pythonPath,
          [...DATA_PROFILE_PACKAGES],
        );
        const missing = DATA_PROFILE_PACKAGES.filter(
          (name) => !installed[name],
        );
        if (missing.length > 0) {
          throw new Error(
            `Installed package verification failed for ${missing.join(', ')}.`,
          );
        }
        await this.trackUserPackages(
          selected.id,
          DATA_PROFILE_PACKAGES.map((name) => ({
            name,
            extras: [],
            version: null,
          })),
        );
      },
    );
  }

  static async installUserPackage(
    request: PythonNotebookUserPackageRequest,
  ): Promise<PythonNotebookRuntimeStatus> {
    const name = this.normalizeUserPackageName(request.name);
    const extras = this.normalizeUserPackageExtras(request.extras);
    const version = this.normalizeUserPackageVersion(request.version);
    const spec = this.buildUserPackageSpec(name, extras, version);
    return this.withOperation('updating', `Installing ${spec}…`, async () => {
      await this.stopSessionsForMaintenance(request.expectedActiveSessionCount);
      const selected = await this.requireSelectedWritableEnvironment();
      this.operation = {
        state: 'updating',
        message: `Installing ${spec} into "${selected.label}"…`,
      };
      await this.runPip(
        selected.pythonPath,
        ['install', '--disable-pip-version-check', '--no-input', spec],
        `Could not install ${spec}.`,
      );
      const installed = await this.readNamedPackageVersions(
        selected.pythonPath,
        [name],
      );
      if (!installed[name]) {
        throw new Error(`Installed package verification failed for ${name}.`);
      }
      if (version && installed[name] !== version) {
        throw new Error(
          `Installed package verification failed for ${name}: expected ${version}, found ${installed[name]}.`,
        );
      }
      await this.trackUserPackages(selected.id, [{ name, extras, version }]);
    });
  }

  static async uninstallUserPackage(
    request: PythonNotebookUserPackageActionRequest,
  ): Promise<PythonNotebookRuntimeStatus> {
    const name = this.normalizeUserPackageName(request.name);
    return this.withOperation(
      'uninstalling',
      `Uninstalling ${name}…`,
      async () => {
        await this.stopSessionsForMaintenance(
          request.expectedActiveSessionCount,
        );
        const selected = await this.requireSelectedWritableEnvironment();
        await this.runPip(
          selected.pythonPath,
          ['uninstall', '--yes', name],
          `Could not uninstall ${name}.`,
        );
        const installed = await this.readNamedPackageVersions(
          selected.pythonPath,
          [name],
        );
        if (installed[name]) {
          throw new Error(`Package uninstall verification failed for ${name}.`);
        }
        await this.untrackUserPackage(selected.id, name);
      },
    );
  }

  static async listUserPackageVersions(
    packageName: string,
  ): Promise<PythonNotebookUserPackageVersionListResponse> {
    const name = String(packageName ?? '').trim();
    if (
      !name ||
      name.length > PACKAGE_NAME_MAX_LENGTH ||
      !USER_PACKAGE_NAME_PATTERN.test(name)
    ) {
      throw new Error('Invalid Python package name.');
    }
    try {
      const projectJson = await this.fetchPypiProjectJson(name);
      const versions = Object.entries(projectJson.releases ?? {})
        .filter(([, files]) =>
          files.some((releaseFile) => releaseFile.yanked !== true),
        )
        .map(([version]) => version)
        .filter((version) => parseVersionTriple(version) !== null)
        .filter((version) => !isPrerelease(version))
        .sort((a, b) => compareVersions(b, a));
      return {
        packageName: name,
        latestStable: versions[0] ?? null,
        versions: versions
          .slice(0, PACKAGE_VERSION_LIST_LIMIT)
          .map((version) => ({ version, isPrerelease: false })),
      };
    } catch {
      return { packageName: name, latestStable: null, versions: [] };
    }
  }

  static async getEnvironmentSummary(): Promise<PythonNotebookEnvironmentSummary> {
    const status = await this.getRuntimeStatus();
    const selected = status.selectedEnvironment;
    return {
      environmentId: selected?.id ?? 'none',
      environmentKind: selected?.kind ?? 'managed',
      environmentLabel: selected?.label ?? 'No Python environment selected',
      pythonVersion: selected?.pythonVersion ?? null,
      kernelReady: status.kernelReady,
      requiredPackages: status.packages.map((item) => ({
        name: item.name,
        installedVersion: item.installedVersion,
      })),
      dataPackages: status.dataPackages,
      userPackages: status.userPackages,
      installHint:
        'Install missing packages from Settings → Jupyter Notebooks.',
    };
  }

  static async handleManagedPythonWillChange(): Promise<void> {
    if (this.operationPromise) {
      throw new Error(
        'Wait for the current Jupyter runtime operation to finish before changing managed Python.',
      );
    }
    this.operation = {
      state: 'uninstalling',
      message: 'Stopping Python notebooks before changing managed Python…',
    };
    this.operationPromise = (async () => {
      await this.stopSessionsForMaintenance(this.sessions.size);
      await fs.remove(this.getRuntimeRoot());
    })();
    try {
      await this.operationPromise;
      this.operation = { state: 'idle' };
    } catch (error) {
      this.operation = {
        state: 'idle',
        error: this.sanitizeDiagnostic(
          error instanceof Error
            ? error.message
            : 'Could not prepare notebooks for the managed Python change.',
        ),
      };
      throw error;
    } finally {
      this.operationPromise = null;
    }
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
        await this.runHealthProbe(pythonPath);
      },
    );
  }

  /** Validates and normalizes an ipynb payload inside the dedicated runtime. */
  static async convertIpynb(
    operation: 'import' | 'export',
    document: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const status = await this.getRuntimeStatus();
    if (status.state !== 'ready') {
      throw new Error(
        'Set up Jupyter packages before importing or exporting notebooks.',
      );
    }
    const result = await this.runProcess(
      this.getPythonPath(),
      [this.getResourcePath('notebook_bridge.py')],
      JSON.stringify({ operation, document }),
      MAX_BRIDGE_FRAME_BYTES,
    );
    if (result.exitCode !== 0) {
      throw new Error('Jupyter could not validate the notebook document.');
    }
    try {
      const response = JSON.parse(result.stdout) as {
        ok?: boolean;
        document?: Record<string, unknown>;
      };
      if (response.ok && response.document) return response.document;
    } catch {
      // Use the same safe setup error below.
    }
    throw new Error('Jupyter could not validate the notebook document.');
  }
}
