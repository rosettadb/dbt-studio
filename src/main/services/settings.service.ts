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
import { CliUpdateResponseType, SettingsType } from '../../types/backend';
import { CliAdapter } from '../adapters';
import { DB_FILE, initializeDataStorage } from '../utils/setupHelpers';
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
        const currentVersion = settings[cli.settingsKey] ?? '0.0.0';
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
      'https://api.github.com/repos/adaptivescale/rosetta/releases/latest',
    );
    const version = latestRelease.data.tag_name.replace(/^v/, '');

    const zipName = `rosetta-${version}-${osName}_${archName}-with-drivers.zip`;
    const downloadUrl = `https://github.com/adaptivescale/rosetta/releases/download/v${version}/${zipName}`;

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
            console.error(`Failed to delete credential ${account}:`, error);
          }
        }),
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to clear secure credentials:', error);
    }
  }
}
