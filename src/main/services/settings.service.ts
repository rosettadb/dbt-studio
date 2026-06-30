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
