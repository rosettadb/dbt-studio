/* eslint-disable no-restricted-syntax, no-await-in-loop */
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';
import os from 'os';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import {
  loadDatabaseFile,
  loadDefaultSettings,
  updateDatabase,
  deleteDirectory,
} from '../utils/fileHelper';
import {
  CliUpdateResponseType,
  SettingsType,
  RosettaVersionInfo,
  DbtFusionVersionInfo,
  InstallResult,
  DuckDBMetadataPayload,
  DuckDBDiagnostics,
} from '../../types/backend';
import { CliAdapter } from '../adapters';
import { DB_FILE, initializeDataStorage } from '../utils/setupHelpers';
import DuckDBBootstrap from './duckdb.service';
import SecureStorageService from './secureStorage.service';

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
  static async loadSettings(): Promise<SettingsType> {
    const dataBase = await loadDatabaseFile();
    if (!dataBase.settings) {
      const defaultSettings = loadDefaultSettings();
      await updateDatabase<'settings'>('settings', defaultSettings);
      return defaultSettings;
    }
    return dataBase.settings;
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

    if (settings.dbtRuntime === 'dbt-fusion' && settings.dbtFusionPath) {
      return settings.dbtFusionPath;
    }

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

  static async updatePython() {
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

      settings.pythonVersion = '0.0.0-test';
      settings.pythonPath = dummyBinaryPath;
      settings.pythonBinary = dummyBinaryPath;
      await this.saveSettings(settings);

      return {
        binaryPath: dummyBinaryPath,
        version: '0.0.0-test',
        status: 'installed',
      };
    }
    const settings = await this.loadSettings();

    const version = '3.10.17';
    const buildTag = '20250409';
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

    if (fs.existsSync(binaryPath) && settings.pythonVersion === version) {
      return {
        binaryPath,
        version,
        status: 'up-to-date',
      };
    }

    if (settings.pythonPath && fs.existsSync(settings.pythonPath)) {
      const oldRoot = path.resolve(
        settings.pythonPath,
        platform === 'win32' ? '..' : '../../',
      );
      await fs.remove(oldRoot);
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
      userDataPath,
      'venv',
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

  static async resetFactorySettings(): Promise<void> {
    try {
      // 1. Load current database to get project paths
      const dataBase = await loadDatabaseFile();

      // 2. Delete all project directories
      for (const project of dataBase.projects) {
        if (project.path && fs.existsSync(project.path)) {
          try {
            deleteDirectory(project.path);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(
              `Failed to delete project directory ${project.path}:`,
              error,
            );
          }
        }
      }

      // 3. Clear all secure storage credentials
      await this.clearAllSecureCredentials();

      // 4. Delete database.json
      if (fs.existsSync(DB_FILE)) {
        await fs.remove(DB_FILE);
      }

      // 5. Reinitialize with default settings
      initializeDataStorage();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to reset factory settings: ${errorMessage}`);
    }
  }

  private static async clearAllSecureCredentials(): Promise<void> {
    try {
      // Get all stored credentials from keytar
      const accounts = await SecureStorageService.findCredentials();

      // Delete all found credentials
      await Promise.all(
        accounts.map(async (account) => {
          try {
            await SecureStorageService.deleteCredential(account);
          } catch (error) {
            // eslint-disable-next-line no-console
          }
        }),
      );
    } catch (error) {
      // eslint-disable-next-line no-console
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

  // dbt-fusion version management
  // dbt-fusion is distributed via dbt Labs CDN, not GitHub releases.
  // Version manifest: https://public.cdn.getdbt.com/fs/versions.json
  // Download pattern: https://public.cdn.getdbt.com/fs/cli/fs-v{version}-{target}.tar.gz

  private static async resolveDbtFusionVersion(
    version?: string,
  ): Promise<string> {
    if (version) return version;
    const manifest = await axios.get(
      'https://public.cdn.getdbt.com/fs/versions.json',
    );
    const tag: string = manifest.data?.latest?.tag ?? '';
    return tag.replace(/^v/, '');
  }

  private static getDbtFusionTarget(): string {
    const { platform, arch } = process;
    const targetMap: Record<string, Record<string, string>> = {
      darwin: {
        arm64: 'aarch64-apple-darwin',
        x64: 'x86_64-apple-darwin',
      },
      linux: {
        arm64: 'aarch64-unknown-linux-gnu',
        x64: 'x86_64-unknown-linux-gnu',
      },
    };
    const target = targetMap[platform]?.[arch];
    if (!target) {
      throw new Error(
        `dbt-fusion does not support ${platform}-${arch} yet. ` +
          `Windows support is not available. See https://docs.getdbt.com/docs/fusion/install-fusion-cli`,
      );
    }
    return target;
  }

  static async checkDbtFusionVersions(): Promise<DbtFusionVersionInfo> {
    const settings = await this.loadSettings();
    const currentVersion = settings.dbtFusionVersion || null;
    const currentPath = settings.dbtFusionPath || null;

    try {
      const manifest = await axios.get(
        'https://public.cdn.getdbt.com/fs/versions.json',
      );
      const latestTag: string = manifest.data?.latest?.tag ?? '';
      const latestVersion = latestTag.replace(/^v/, '');

      let target = '';
      try {
        target = this.getDbtFusionTarget();
      } catch {
        // unsupported platform — still return version info
      }

      const downloadUrl = target
        ? `https://public.cdn.getdbt.com/fs/cli/fs-v${latestVersion}-${target}.tar.gz`
        : '';

      const availableVersions = latestVersion
        ? [
            {
              version: latestVersion,
              releaseDate: '',
              isPrerelease: false,
              downloadUrl,
              isNewer:
                this.compareVersions(latestVersion, currentVersion || '0.0.0') >
                0,
              isOlder:
                this.compareVersions(latestVersion, currentVersion || '0.0.0') <
                0,
            },
          ]
        : [];

      return {
        currentVersion,
        currentPath,
        availableVersions,
        latestStable: latestVersion,
      };
    } catch (error) {
      return {
        currentVersion,
        currentPath,
        availableVersions: [],
        latestStable: '',
      };
    }
  }

  static async installDbtFusion(version?: string): Promise<InstallResult> {
    try {
      const settings = await this.loadSettings();

      const target = this.getDbtFusionTarget(); // throws for unsupported platforms
      const targetVersion = await this.resolveDbtFusionVersion(version);

      if (!targetVersion) {
        throw new Error('Could not resolve dbt-fusion version from manifest');
      }

      const archiveName = `fs-v${targetVersion}-${target}.tar.gz`;
      const downloadUrl = `https://public.cdn.getdbt.com/fs/cli/${archiveName}`;

      const userDataPath = app.getPath('userData');
      const fusionBaseDir = path.join(
        userDataPath,
        'dbt-fusion',
        targetVersion,
      );
      const binaryPath = path.join(fusionBaseDir, 'dbt');

      if (settings.dbtFusionPath && fs.existsSync(settings.dbtFusionPath)) {
        const oldVersionDir = path.dirname(settings.dbtFusionPath);
        await fs.remove(oldVersionDir);
      }

      await fs.mkdirp(fusionBaseDir);
      const archivePath = path.join(fusionBaseDir, archiveName);

      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
      });

      if (response.status !== 200) {
        throw new Error(
          `Failed to download dbt-fusion: HTTP ${response.status}`,
        );
      }

      if (!response.data || response.data.byteLength === 0) {
        throw new Error('Downloaded dbt-fusion archive is empty');
      }

      await fs.writeFile(archivePath, response.data);

      const stats = await fs.stat(archivePath);
      if (stats.size === 0) {
        throw new Error('Written dbt-fusion archive file is empty');
      }

      try {
        await tar.x({
          file: archivePath,
          cwd: fusionBaseDir,
        });
      } catch (extractError) {
        throw new Error(
          `Failed to extract dbt-fusion archive: ${extractError instanceof Error ? extractError.message : String(extractError)}`,
        );
      }

      await fs.remove(archivePath);

      if (!fs.existsSync(binaryPath)) {
        const allFiles: string[] = [];
        const walk = async (dir: string, prefix = '') => {
          const files = await fs.readdir(dir);
          for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = await fs.stat(filePath);
            if (stat.isDirectory()) {
              allFiles.push(`${prefix}${file}/`);
              await walk(filePath, `${prefix}${file}/`);
            } else {
              allFiles.push(`${prefix}${file}`);
            }
          }
        };
        await walk(fusionBaseDir);

        throw new Error(
          `dbt binary not found at ${binaryPath} after extraction. ` +
            `Expected path: ${binaryPath}\n` +
            `Files in ${fusionBaseDir}:\n${allFiles.join('\n')}`,
        );
      }

      await fs.chmod(binaryPath, 0o755);

      settings.dbtFusionVersion = targetVersion;
      settings.dbtFusionPath = binaryPath;
      await this.saveSettings(settings);

      return {
        success: true,
        version: targetVersion,
        path: binaryPath,
      };
    } catch (error) {
      return {
        success: false,
        version: version || '',
        path: '',
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  static async uninstallDbtFusion(): Promise<void> {
    const settings = await this.loadSettings();

    if (settings.dbtFusionPath && fs.existsSync(settings.dbtFusionPath)) {
      const versionDir = path.dirname(settings.dbtFusionPath);
      await fs.remove(versionDir);
    }

    settings.dbtFusionVersion = '';
    settings.dbtFusionPath = '';
    if (settings.dbtRuntime === 'dbt-fusion') {
      settings.dbtRuntime = 'dbt-core';
    }
    await this.saveSettings(settings);
  }

  static async setDbtRuntime(
    runtime: 'dbt-core' | 'dbt-fusion',
  ): Promise<void> {
    const settings = await this.loadSettings();

    if (runtime === 'dbt-fusion' && !settings.dbtFusionPath) {
      throw new Error(
        'dbt-fusion is not installed. Please install it first before switching.',
      );
    }

    settings.dbtRuntime = runtime;
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
    const settings = await this.loadSettings();

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
      throw new Error(
        'Python environment not found. Please install Python first.',
      );
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
