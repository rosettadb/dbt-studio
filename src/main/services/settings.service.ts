/* eslint-disable no-restricted-syntax, no-await-in-loop */
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';
import type { Session } from 'electron';
import os from 'os';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import {
  loadDatabaseFile,
  loadDefaultSettings,
  updateDatabase,
} from '../utils/fileHelper';
import {
  CliUpdateResponseType,
  SettingsType,
  RosettaVersionInfo,
  InstallResult,
  DuckDBMetadataPayload,
  DuckDBDiagnostics,
  PythonInstallInfo,
  PythonVersionInfo,
} from '../../types/backend';
import { CliAdapter } from '../adapters';
import { DB_FILE } from '../utils/setupHelpers';
import DuckDBBootstrap from './duckdb.service';
import SecureStorageService from './secureStorage.service';

const FACTORY_RESET_SHUTDOWN_TIMEOUT_MS = 10_000;

// All built from the same python-build-standalone release tag; verified to
// exist for macOS (arm64/x64), Linux (x64), and Windows (x64) at that tag.
const PYTHON_BUILD_TAG = '20250409';
const RECOMMENDED_PYTHON_VERSION = '3.10.17';
const SUPPORTED_PYTHON_VERSIONS = [
  '3.9.22',
  '3.10.17',
  '3.11.12',
  '3.12.10',
  '3.13.3',
] as const;

const cliConfig: Record<
  keyof CliUpdateResponseType,
  {
    name: string;
    githubRepo: string;
    binaryName: string;
    settingsKey: keyof SettingsType;
  }
> = {
  dbt: {
    name: 'dbt',
    githubRepo: 'yourorg/dbt',
    binaryName: process.platform === 'win32' ? 'rosetta.exe' : 'rosetta',
    settingsKey: 'rosettaVersion',
  },
  rosetta: {
    name: 'rosetta',
    githubRepo: 'yourorg/rosetta',
    binaryName: process.platform === 'win32' ? 'cli2.exe' : 'cli2',
    settingsKey: 'dbtVersion',
  },
};

export default class SettingsService {
  private static factoryResetPromise: Promise<void> | null = null;

  static async loadSettings(): Promise<SettingsType> {
    const dataBase = await loadDatabaseFile();
    const defaultSettings = loadDefaultSettings();

    return {
      ...defaultSettings,
      ...dataBase.settings,
      projectsDirectory:
        dataBase.settings.projectsDirectory ||
        defaultSettings.projectsDirectory,
      sampleRosettaMainConf:
        dataBase.settings.sampleRosettaMainConf ||
        defaultSettings.sampleRosettaMainConf,
    };
  }

  static async loadSettingsWithDatabaseInfo(): Promise<SettingsType> {
    const settings = await this.loadSettings();
    let enrichedSettings = { ...settings };

    try {
      // Import MainDatabaseService dynamically to avoid circular dependencies
      const { default: MainDatabaseService } = await import(
        './mainDatabase.service'
      );
      const dbInfo = await MainDatabaseService.getDatabaseInfo();

      enrichedSettings = {
        ...enrichedSettings,
        mainDatabasePath: dbInfo.path,
        mainDatabaseSize: dbInfo.size,
        sqliteVersion: dbInfo.sqliteVersion,
        mainDatabaseStatus: dbInfo.status,
      };
    } catch (error) {
      // Failed to load database info, returning settings without DB info
    }

    try {
      const metadata = await this.getDuckDbMetadata();
      enrichedSettings = {
        ...enrichedSettings,
        duckdbPath: metadata.path,
        duckdbSize: metadata.sizeHumanReadable,
        duckdbStatus: metadata.status,
        duckdbVersion: metadata.duckdbVersion,
        duckdbLockStatus: metadata.lockStatus,
        duckdbLastCheckedAt: metadata.lastCheckedAt,
        duckdbActiveConnections: metadata.activeConnections,
        duckdbPoolSize: metadata.poolSize,
        duckdbMaxConnections: metadata.maxConnections,
      };
    } catch (error) {
      // Failed to load DuckDB metadata, continue without it
    }

    return enrichedSettings;
  }

  static async getDuckDbMetadata(): Promise<DuckDBMetadataPayload> {
    return DuckDBBootstrap.getMetadata();
  }

  static async refreshDuckDbMetadata(): Promise<DuckDBMetadataPayload> {
    return DuckDBBootstrap.refreshMetadata();
  }

  static async reinitializeDuckDb(options?: {
    dropExisting?: boolean;
  }): Promise<DuckDBMetadataPayload> {
    return DuckDBBootstrap.reinitialize(options);
  }

  static async diagnoseDuckDb(): Promise<DuckDBDiagnostics> {
    return DuckDBBootstrap.diagnose();
  }

  static async saveSettings(settings: SettingsType) {
    await updateDatabase<'settings'>('settings', settings);
  }

  static async getDbtExePath(): Promise<string> {
    const settings = await this.loadSettings();
    const pythonDir = path.dirname(settings.pythonPath);

    if (process.platform === 'win32') {
      return path.join(pythonDir, 'dbt.exe');
    }
    return path.join(pythonDir, 'dbt');
  }

  static async usePathJoin(pathChunks: string[]) {
    return path.join(...pathChunks);
  }

  static async getFileName(pathChunks: string[]) {
    const p = path.join(...pathChunks);
    return path.parse(p).name;
  }

  static async getBasename(filePath: string) {
    return path.basename(filePath);
  }

  static async getDirname(filePath: string) {
    return path.dirname(filePath);
  }

  static async checkCliUpdates(): Promise<CliUpdateResponseType> {
    const settings = await this.loadSettings();
    const results: CliUpdateResponseType = {
      dbt: {
        currentVersion: 'latest',
        latestVersion: 'latest',
        needsUpdate: false,
        releaseInfo: {},
      },
      rosetta: {
        currentVersion: 'latest',
        latestVersion: 'latest',
        needsUpdate: false,
        releaseInfo: {},
      },
    };

    for (const [key, cli] of Object.entries(cliConfig)) {
      try {
        const currentVersion = String(settings[cli.settingsKey] ?? '0.0.0');
        const latestRelease = await axios.get(
          `https://api.github.com/repos/cli/cli/releases/latest`,
        );
        results[key as keyof CliUpdateResponseType] = {
          currentVersion,
          latestVersion: latestRelease.data.tag_name,
          needsUpdate: latestRelease.data.tag_name !== currentVersion,
          releaseInfo: latestRelease.data,
          error: undefined,
        };
      } catch (error) {
        const currentItem = results[key as keyof CliUpdateResponseType];
        results[key as keyof CliUpdateResponseType] = {
          ...currentItem,
          error: `Failed to check updates for ${cli.name}`,
        };
      }
    }
    return results;
  }

  static async updateRosetta() {
    if (process.env.E2E_TESTING === 'true') {
      const settings = await this.loadSettings();
      const dummyName =
        process.platform === 'win32' ? 'dummy-rosetta.exe' : 'dummy-rosetta';
      const dummyPath = path.join(os.tmpdir(), dummyName);
      fs.ensureFileSync(dummyPath);

      if (process.platform !== 'win32') {
        fs.chmodSync(dummyPath, 0o755);
      }

      settings.rosettaVersion = '0.0.0-test';
      settings.rosettaPath = dummyPath;
      await this.saveSettings(settings);

      return {
        binaryPath: dummyPath,
        version: '0.0.0-test',
        binDirectory: path.dirname(dummyPath),
        status: 'installed',
      };
    }
    const settings = await this.loadSettings();

    const { platform, arch } = process;

    const osMap: Record<string, string> = {
      darwin: 'mac',
      win32: 'win',
      linux: 'linux',
    };

    const archMap: Record<string, string> = {
      arm64: 'aarch64',
      x64: 'x64',
    };

    const osName = osMap[platform];
    const archName = archMap[arch];

    if (!osName || !archName) {
      throw new Error(`Unsupported OS or architecture: ${platform}-${arch}`);
    }

    const latestRelease = await axios.get(
      'https://api.github.com/repos/rosettadb/rosetta/releases/latest',
    );
    const version = latestRelease.data.tag_name.replace(/^v/, '');

    const zipName = `rosetta-${version}-${osName}_${archName}-with-drivers.zip`;
    const downloadUrl = `https://github.com/rosettadb/rosetta/releases/download/v${version}/${zipName}`;

    let rosettaBasePath: string;
    switch (platform) {
      case 'darwin':
      case 'linux':
        rosettaBasePath = path.join(os.homedir(), '.rosetta');
        break;
      case 'win32':
        rosettaBasePath = 'C:/rosetta';
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    const extractPath = path.join(
      rosettaBasePath,
      `rosetta-${version}-${osName}_${archName}`,
    );
    const binPath = path.join(
      extractPath,
      `rosetta-${version}-${osName}_${archName}`,
      'bin',
    );
    const binaryPath = path.join(binPath, 'rosetta');

    const alreadyInstalled =
      fs.existsSync(settings.rosettaPath || '') &&
      settings.rosettaVersion === version;

    if (alreadyInstalled) {
      return {
        binaryPath: settings.rosettaPath,
        version,
        binDirectory: path.dirname(settings.rosettaPath),
        status: 'up-to-date',
      };
    }

    if (settings.rosettaPath && fs.existsSync(settings.rosettaPath)) {
      const oldRoot = path.resolve(settings.rosettaPath, '../../');
      await fs.remove(oldRoot);
    }

    await fs.mkdirp(rosettaBasePath);
    const zipPath = path.join(rosettaBasePath, zipName);

    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
    });
    await fs.writeFile(zipPath, response.data);

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractPath, true);

    const binFiles = await fs.readdir(binPath);
    await Promise.all(
      binFiles.map(async (file) => {
        const filePath = path.join(binPath, file);
        await fs.chmod(filePath, 0o755);
      }),
    );

    settings.rosettaVersion = version;
    settings.rosettaPath = binaryPath;
    await this.saveSettings(settings);

    await fs.remove(zipPath);

    return {
      binaryPath,
      version,
      binDirectory: binPath,
      status: 'installed',
    };
  }

  private static async performPythonInstall(version: string) {
    if (process.env.E2E_TESTING === 'true') {
      const settings = await this.loadSettings();

      // Create a dummy venv structure
      const venvPath = path.join(os.tmpdir(), 'dummy-venv');
      const binDir =
        process.platform === 'win32'
          ? path.join(venvPath, 'Scripts')
          : path.join(venvPath, 'bin');
      const dummyBinaryPath = path.join(
        binDir,
        process.platform === 'win32' ? 'python.exe' : 'python3',
      );

      await fs.ensureDir(binDir);
      await fs.ensureFile(dummyBinaryPath);
      await fs.chmod(dummyBinaryPath, 0o755);

      settings.pythonVersion = version;
      settings.pythonPath = dummyBinaryPath;
      settings.pythonBinary = dummyBinaryPath;
      await this.saveSettings(settings);

      return {
        binaryPath: dummyBinaryPath,
        version,
        status: 'installed',
      };
    }
    const settings = await this.loadSettings();

    const buildTag = PYTHON_BUILD_TAG;
    const { platform, arch } = process;

    const platformMap: Record<string, Record<string, string>> = {
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

    const platformInfo = platformMap[platform]?.[arch];
    if (!platformInfo) {
      throw new Error(`Unsupported platform or arch: ${platform}-${arch}`);
    }

    const fileName = `cpython-${version}+${buildTag}-${platformInfo}-install_only.tar.gz`;
    const baseUrl =
      'https://github.com/astral-sh/python-build-standalone/releases/download';
    const downloadUrl = `${baseUrl}/${buildTag}/${fileName}`;

    const userDataPath = app.getPath('userData');
    const installBase = path.join(userDataPath, 'python');
    const extractDir = path.join(
      installBase,
      `cpython-${version}-${platformInfo}`,
    );
    const binaryPath = path.join(
      extractDir,
      platform === 'win32' ? 'python.exe' : 'bin/python3',
    );
    const venvDir = path.join(userDataPath, 'venv');

    if (fs.existsSync(binaryPath) && settings.pythonVersion === version) {
      return {
        binaryPath,
        version,
        status: 'up-to-date',
      };
    }

    if (settings.pythonPath && fs.existsSync(settings.pythonPath)) {
      // Switching (or repairing) the managed Python install wipes the venv,
      // which also removes anything pip-installed into it (dbt-core,
      // Flowfile, sqlglot), so clear their settings to avoid stale state.
      await this.clearManagedVenvDependents(settings);
      await fs.remove(venvDir);
    }

    await fs.mkdirp(installBase);
    const archivePath = path.join(installBase, fileName);

    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
    });
    await fs.writeFile(archivePath, response.data);

    await fs.mkdirp(extractDir);
    await tar.x({
      file: archivePath,
      cwd: extractDir,
      strip: 1,
    });

    if (platform !== 'win32') {
      await fs.chmod(binaryPath, 0o755);
    }

    settings.pythonVersion = version;
    settings.pythonPath = binaryPath;
    settings.pythonBinary = binaryPath;
    const cliAdapter = new CliAdapter();
    await cliAdapter.runCommandWithoutStreaming(
      `cd "${userDataPath}" && "${binaryPath}" -m venv venv`,
    );
    settings.pythonPath = path.join(
      venvDir,
      platform === 'win32' ? 'Scripts/python.exe' : 'bin/python3',
    );
    await this.saveSettings(settings);
    await fs.remove(archivePath);

    return {
      binaryPath,
      version,
      status: 'installed',
    };
  }

  static async updatePython() {
    return this.performPythonInstall(RECOMMENDED_PYTHON_VERSION);
  }

  // Managed Python installation status/lifecycle (separate from dbt install)
  static async checkPythonInstall(): Promise<PythonInstallInfo> {
    const settings = await this.loadSettings();
    const installed = Boolean(
      settings.pythonPath && fs.existsSync(settings.pythonPath),
    );
    return {
      installed,
      version: installed ? settings.pythonVersion : null,
      path: installed ? settings.pythonPath : null,
    };
  }

  static async checkPythonVersions(): Promise<PythonVersionInfo> {
    const settings = await this.loadSettings();
    const currentVersion = settings.pythonVersion || null;
    const currentPath = settings.pythonPath || null;

    return {
      currentVersion,
      currentPath,
      recommendedVersion: RECOMMENDED_PYTHON_VERSION,
      availableVersions: [...SUPPORTED_PYTHON_VERSIONS]
        .sort((a, b) => this.compareVersions(b, a))
        .map((version) => ({
          version,
          isRecommended: version === RECOMMENDED_PYTHON_VERSION,
          isNewer: currentVersion
            ? this.compareVersions(version, currentVersion) > 0
            : false,
          isOlder: currentVersion
            ? this.compareVersions(version, currentVersion) < 0
            : false,
        })),
    };
  }

  static async installPython(): Promise<InstallResult> {
    return this.installPythonVersion(RECOMMENDED_PYTHON_VERSION);
  }

  static async installPythonVersion(version: string): Promise<InstallResult> {
    if (!(SUPPORTED_PYTHON_VERSIONS as readonly string[]).includes(version)) {
      return {
        success: false,
        version,
        path: '',
        error: `Unsupported Python version: ${version}`,
      };
    }

    try {
      const result = await this.performPythonInstall(version);
      return {
        success: true,
        version: result.version,
        path: result.binaryPath,
      };
    } catch (error) {
      return {
        success: false,
        version: '',
        path: '',
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private static async clearManagedVenvDependents(
    settings: SettingsType,
  ): Promise<void> {
    try {
      const { FlowfileService } = await import('./flowfile.service');
      await FlowfileService.stop();
    } catch {
      // Best effort; continue even if Flowfile could not be stopped cleanly.
    }

    // dbt-core (v1 and v2), Flowfile, and sqlglot are all pip-installed into
    // the same managed venv, so removing it also removes their executables.
    // eslint-disable-next-line no-param-reassign
    settings.dbtPath = '';
    // eslint-disable-next-line no-param-reassign
    settings.dbtVersion = '';
    // eslint-disable-next-line no-param-reassign
    settings.flowfileVersion = '';
  }

  static async uninstallPython(): Promise<void> {
    const settings = await this.loadSettings();
    const userDataPath = app.getPath('userData');

    await this.clearManagedVenvDependents(settings);

    await fs.remove(path.join(userDataPath, 'python'));
    await fs.remove(path.join(userDataPath, 'venv'));

    settings.pythonVersion = '';
    settings.pythonPath = '';
    settings.pythonBinary = '';
    await this.saveSettings(settings);
  }

  static async resetFactorySettings(session: Session): Promise<void> {
    if (this.factoryResetPromise) return this.factoryResetPromise;

    this.factoryResetPromise = this.performFactoryReset(session).catch(
      (error) => {
        this.factoryResetPromise = null;
        throw error;
      },
    );
    return this.factoryResetPromise;
  }

  private static async performFactoryReset(session: Session): Promise<void> {
    let stage = 'preparing cleanup';
    let teardownStarted = false;

    try {
      const dataBase = await loadDatabaseFile();
      const projectPaths = await this.resolveProjectPaths(
        (dataBase.projects ?? []).map((project) => project.path),
      );
      const managedRosettaPath = await this.resolveManagedRosettaPath(
        dataBase.settings?.rosettaPath,
      );

      stage = 'stopping active resources';
      teardownStarted = true;
      await this.stopFactoryResetResources();

      stage = 'clearing browser data';
      await session.clearStorageData();
      await session.clearCache();
      await session.closeAllConnections();

      stage = 'clearing secure credentials';
      await SecureStorageService.clearAllCredentials();

      stage = 'deleting application data';
      const userDataPath = path.resolve(app.getPath('userData'));
      const ownedTargets = [
        { category: 'legacy settings', target: DB_FILE },
        {
          category: 'main application database',
          target: path.join(userDataPath, 'main-database.db'),
        },
        {
          category: 'main application database',
          target: path.join(userDataPath, 'main-database.db-wal'),
        },
        {
          category: 'main application database',
          target: path.join(userDataPath, 'main-database.db-shm'),
        },
        {
          category: 'persistent DuckDB',
          target: path.join(userDataPath, 'main.duckdb'),
        },
        {
          category: 'persistent DuckDB',
          target: path.join(userDataPath, 'main.duckdb.wal'),
        },
        {
          category: 'DuckLake state',
          target: path.join(userDataPath, 'datalake'),
        },
        {
          category: 'notebooks',
          target: path.join(userDataPath, 'notebooks'),
        },
        {
          category: 'AI settings',
          target: path.join(userDataPath, 'ai-settings.json'),
        },
        {
          category: 'MCP configuration',
          target: path.join(userDataPath, 'mcp.config.json'),
        },
        {
          category: 'Agent Skills',
          target: path.join(userDataPath, 'skills'),
        },
        {
          category: 'managed Python',
          target: path.join(userDataPath, 'python'),
        },
        {
          category: 'managed Python',
          target: path.join(userDataPath, 'venv'),
        },
        {
          category: 'managed DuckDB extensions',
          target: path.join(userDataPath, 'duckdb'),
        },
        {
          category: 'setup assets',
          target: path.join(userDataPath, 'dbt_sample'),
        },
        {
          category: 'setup assets',
          target: path.join(userDataPath, 'main.conf'),
        },
        ...projectPaths.map((target) => ({
          category: 'registered projects',
          target,
        })),
        ...(managedRosettaPath
          ? [{ category: 'managed Rosetta', target: managedRosettaPath }]
          : []),
      ];

      const removalResults = await Promise.allSettled(
        ownedTargets.map(({ target }) => fs.remove(target)),
      );
      const failedCategories = Array.from(
        new Set(
          removalResults.flatMap((result, index) =>
            result.status === 'rejected' ? [ownedTargets[index].category] : [],
          ),
        ),
      );
      if (failedCategories.length > 0) {
        throw new Error(
          `Could not remove: ${failedCategories.sort().join(', ')}`,
        );
      }

      stage = 'verifying cleanup';
      const remainingCategories = Array.from(
        new Set(
          (
            await Promise.all(
              ownedTargets.map(async ({ category, target }) => ({
                category,
                exists: await fs.pathExists(target),
              })),
            )
          ).flatMap(({ category, exists }) => (exists ? [category] : [])),
        ),
      );
      if (remainingCategories.length > 0) {
        throw new Error(
          `Data remains for: ${remainingCategories.sort().join(', ')}`,
        );
      }

      stage = 'scheduling restart';
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 50);
    } catch (error: unknown) {
      await this.resumeAfterFailedFactoryReset();
      const detail = this.getSanitizedResetDetail(error);
      const restartInstruction = teardownStarted
        ? ' Restart Rosetta DBT Studio before continuing.'
        : '';
      throw new Error(
        `Factory reset failed while ${stage}.${detail}${restartInstruction}`,
      );
    }
  }

  private static async resumeAfterFailedFactoryReset(): Promise<void> {
    try {
      const { default: MainDatabaseService } = await import(
        './mainDatabase.service'
      );
      DuckDBBootstrap.cancelFactoryReset();
      MainDatabaseService.cancelFactoryReset();
    } catch {
      // Preserve the original reset failure.
    }
  }

  private static getSanitizedResetDetail(error: unknown): string {
    if (!(error instanceof Error)) return '';
    const safePrefixes = [
      'A registered project ',
      'The managed Rosetta ',
      'Could not remove:',
      'Data remains for:',
      'Could not stop ',
      'Failed to delete ',
      'Failed to verify removal ',
      'Failed to verify secure credential account removal',
      'Timed out while ',
    ];
    return safePrefixes.some((prefix) => error.message.startsWith(prefix))
      ? ` ${error.message}`
      : '';
  }

  private static async resolveProjectPaths(
    paths: Array<string | undefined>,
  ): Promise<string[]> {
    const userDataPath = path.resolve(app.getPath('userData'));
    const homePath = path.resolve(app.getPath('home'));
    const unsafePaths = new Set([
      path.parse(userDataPath).root,
      path.parse(homePath).root,
      userDataPath,
      homePath,
      path.dirname(userDataPath),
      path.dirname(homePath),
    ]);
    const resolved = await Promise.all(
      paths
        .filter((projectPath): projectPath is string =>
          Boolean(projectPath?.trim()),
        )
        .map(async (projectPath) => {
          const target = path.resolve(projectPath);
          const targetRoot = path.parse(target).root;
          const isBroadTopLevelPath = path.dirname(target) === targetRoot;
          const containsProtectedRoot = [userDataPath, homePath].some(
            (protectedPath) => {
              const relative = path.relative(target, protectedPath);
              return (
                relative !== '' &&
                !relative.startsWith('..') &&
                !path.isAbsolute(relative)
              );
            },
          );
          if (
            unsafePaths.has(target) ||
            isBroadTopLevelPath ||
            containsProtectedRoot
          ) {
            throw new Error('A registered project has an unsafe location');
          }
          if (await fs.pathExists(target)) {
            const stats = await fs.lstat(target);
            if (stats.isSymbolicLink()) {
              throw new Error('A registered project uses an unsafe symlink');
            }
          }
          return target;
        }),
    );
    return Array.from(new Set(resolved));
  }

  private static async resolveManagedRosettaPath(
    rosettaPath?: string,
  ): Promise<string | null> {
    if (!rosettaPath?.trim()) return null;

    const managedRoot =
      process.platform === 'win32'
        ? path.resolve('C:/rosetta')
        : path.resolve(app.getPath('home'), '.rosetta');
    // The Rosetta installer stores a binary file path. Its packaged layout is
    // <managed-root>/<version>/<version>/bin/rosetta, so climb from the
    // binary through bin and the nested archive directory to the owned
    // version directory.
    const installPath = path.resolve(rosettaPath, '../../..');
    const relative = path.relative(managedRoot, installPath);
    const isManagedChild =
      relative !== '' &&
      !relative.startsWith('..') &&
      !path.isAbsolute(relative) &&
      path.basename(installPath).startsWith('rosetta-');

    if (!isManagedChild) return null;
    if (
      (await fs.pathExists(installPath)) &&
      (await fs.lstat(installPath)).isSymbolicLink()
    ) {
      throw new Error(
        'The managed Rosetta installation uses an unsafe symlink',
      );
    }
    return installPath;
  }

  private static async stopFactoryResetResources(): Promise<void> {
    const [
      { default: AgentService },
      { AgentEditorBridgeService },
      { TaskManagerService },
      { FlowfileService },
      { MCPClientManager },
      { default: ConnectorsService },
      { default: DuckLakeConnectionManager },
      { CatalogAdapterFactory },
      { default: MainDatabaseService },
    ] = await Promise.all([
      import('./agent.service'),
      import('./ai/agentEditorBridge.service'),
      import('./taskManager.service'),
      import('./flowfile.service'),
      import('./ai/mcp/mcpClientManager'),
      import('./connectors.service'),
      import('./duckLake/connectionManager.service'),
      import('./duckLake/adapters'),
      import('./mainDatabase.service'),
    ]);

    AgentService.cancelAllForFactoryReset();
    AgentEditorBridgeService.resetForFactoryReset();
    const uncancelledTaskCount = TaskManagerService.cancelAll();
    if (uncancelledTaskCount > 0) {
      throw new Error(
        `Could not stop ${uncancelledTaskCount} background task(s)`,
      );
    }

    const flowfileResult = await this.withFactoryResetTimeout(
      'stopping Flowfile',
      FlowfileService.stop(),
    );
    if (!flowfileResult.ok) {
      throw new Error('Could not stop Flowfile');
    }

    await this.withFactoryResetTimeout(
      'disconnecting MCP clients',
      MCPClientManager.disconnectAll(),
    );
    ConnectorsService.cleanupBigQueryKeyFiles();
    await this.withFactoryResetTimeout(
      'disconnecting DuckLake connections',
      DuckLakeConnectionManager.disconnectAll(),
    );
    await this.withFactoryResetTimeout(
      'disconnecting catalog adapters',
      CatalogAdapterFactory.disconnectAll(),
    );
    await this.withFactoryResetTimeout(
      'stopping DuckDB',
      DuckDBBootstrap.beginFactoryReset(),
    );
    await this.withFactoryResetTimeout(
      'stopping the main database',
      MainDatabaseService.beginFactoryReset(),
    );
  }

  private static async withFactoryResetTimeout<T>(
    description: string,
    operation: Promise<T>,
  ): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_resolve, reject) => {
          timeout = setTimeout(() => {
            reject(new Error(`Timed out while ${description}`));
          }, FACTORY_RESET_SHUTDOWN_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  // Rosetta version management
  static async checkRosettaVersions(): Promise<RosettaVersionInfo> {
    const settings = await this.loadSettings();
    const currentVersion = settings.rosettaVersion;
    const currentPath = settings.rosettaPath;

    try {
      // Get all available versions from GitHub releases
      const response = await axios.get(
        'https://api.github.com/repos/rosettadb/rosetta/releases',
      );
      const releases = response.data;

      const availableVersions = releases.map((release: any) => {
        const version = release.tag_name.replace(/^v/, '');
        return {
          version,
          releaseDate: release.published_at,
          isPrerelease: release.prerelease,
          downloadUrl: this.getRosettaDownloadUrl(release),
          isNewer: this.compareVersions(version, currentVersion || '0.0.0') > 0,
          isOlder: this.compareVersions(version, currentVersion || '0.0.0') < 0,
          releaseNotes: release.body,
        };
      });

      const latestStable = releases
        .find((r: any) => !r.prerelease)
        ?.tag_name.replace(/^v/, '');
      const latestPrerelease = releases
        .find((r: any) => r.prerelease)
        ?.tag_name.replace(/^v/, '');

      return {
        currentVersion,
        currentPath,
        availableVersions,
        latestStable,
        latestPrerelease,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      return {
        currentVersion,
        currentPath,
        availableVersions: [],
        latestStable: '',
        latestPrerelease: undefined,
      };
    }
  }

  static async installRosettaVersion(version: string): Promise<InstallResult> {
    try {
      const settings = await this.loadSettings();
      const { platform, arch } = process;

      const osMap: Record<string, string> = {
        darwin: 'mac',
        win32: 'win',
        linux: 'linux',
      };

      const archMap: Record<string, string> = {
        arm64: 'aarch64',
        x64: 'x64',
      };

      const osName = osMap[platform];
      const archName = archMap[arch];

      if (!osName || !archName) {
        throw new Error(`Unsupported OS or architecture: ${platform}-${arch}`);
      }

      const zipName = `rosetta-${version}-${osName}_${archName}-with-drivers.zip`;
      const downloadUrl = `https://github.com/rosettadb/rosetta/releases/download/v${version}/${zipName}`;

      let rosettaBasePath: string;
      switch (platform) {
        case 'darwin':
        case 'linux':
          rosettaBasePath = path.join(os.homedir(), '.rosetta');
          break;
        case 'win32':
          rosettaBasePath = 'C:/rosetta';
          break;
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      const extractPath = path.join(
        rosettaBasePath,
        `rosetta-${version}-${osName}_${archName}`,
      );
      const binPath = path.join(
        extractPath,
        `rosetta-${version}-${osName}_${archName}`,
        'bin',
      );
      const binaryPath = path.join(binPath, 'rosetta');

      // Remove old installation if exists
      if (settings.rosettaPath && fs.existsSync(settings.rosettaPath)) {
        const oldRoot = path.resolve(settings.rosettaPath, '../../');
        await fs.remove(oldRoot);
      }

      await fs.mkdirp(rosettaBasePath);
      const zipPath = path.join(rosettaBasePath, zipName);

      // Download the release
      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
      });
      await fs.writeFile(zipPath, response.data);

      // Extract the archive
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(extractPath, true);

      // Set executable permissions
      const binFiles = await fs.readdir(binPath);
      await Promise.all(
        binFiles.map(async (file) => {
          const filePath = path.join(binPath, file);
          await fs.chmod(filePath, 0o755);
        }),
      );

      // Update settings
      settings.rosettaVersion = version;
      settings.rosettaPath = binaryPath;
      await this.saveSettings(settings);

      // Clean up download file
      await fs.remove(zipPath);

      return {
        success: true,
        version,
        path: binaryPath,
      };
    } catch (error) {
      return {
        success: false,
        version,
        path: '',
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  static async uninstallRosetta(): Promise<void> {
    const settings = await this.loadSettings();
    if (settings.rosettaPath && fs.existsSync(settings.rosettaPath)) {
      const rosettaRoot = path.resolve(settings.rosettaPath, '../../');
      await fs.remove(rosettaRoot);
    }

    settings.rosettaVersion = '';
    settings.rosettaPath = '';
    await this.saveSettings(settings);
  }

  private static getRosettaDownloadUrl(release: any): string {
    const { platform, arch } = process;
    const osMap: Record<string, string> = {
      darwin: 'mac',
      win32: 'win',
      linux: 'linux',
    };

    const archMap: Record<string, string> = {
      arm64: 'aarch64',
      x64: 'x64',
    };

    const osName = osMap[platform];
    const archName = archMap[arch];
    const version = release.tag_name.replace(/^v/, '');

    if (!osName || !archName) {
      return '';
    }

    return `https://github.com/rosettadb/rosetta/releases/download/v${version}/rosetta-${version}-${osName}_${archName}-with-drivers.zip`;
  }

  static async installPackage(packageName: string): Promise<void> {
    let settings = await this.loadSettings();

    const safeName = packageName.trim();
    const allowedPackages = new Set(['sqlglot']);
    const isValidPackageName = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i.test(
      safeName,
    );

    if (!isValidPackageName) {
      throw new Error(`Invalid package name: ${packageName}`);
    }

    if (!allowedPackages.has(safeName)) {
      throw new Error(`Package not allowed: ${packageName}`);
    }

    if (!settings.pythonPath || !fs.existsSync(settings.pythonPath)) {
      const pythonResult = await this.installPython();
      if (!pythonResult.success) {
        throw new Error(`Failed to install Python: ${pythonResult.error}`);
      }
      settings = await this.loadSettings();
    }

    // Derive pip path from pythonPath (which points to venv python binary)
    const binDir = path.dirname(settings.pythonPath);
    const pipExecutable = process.platform === 'win32' ? 'pip.exe' : 'pip';
    const pipPath = path.join(binDir, pipExecutable);

    if (!fs.existsSync(pipPath)) {
      throw new Error(`pip not found at ${pipPath}`);
    }

    const cliAdapter = new CliAdapter();
    // Using --no-cache-dir to avoid potential cache issues in packaged app
    await cliAdapter.runCommandWithoutStreaming(
      `"${pipPath}" install ${safeName} --no-cache-dir`,
    );
  }

  static async installSqlGlot(): Promise<void> {
    return this.installPackage('sqlglot');
  }

  private static compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    const maxLength = Math.max(v1Parts.length, v2Parts.length);

    for (let i = 0; i < maxLength; i += 1) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }

    return 0;
  }
}
