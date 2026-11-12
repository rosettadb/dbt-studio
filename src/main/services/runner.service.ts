/* eslint-disable no-restricted-syntax, no-await-in-loop */
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';
import { execFile } from 'child_process';
import { downloadForInstall } from '../utils/installTask';
import {
  InstallResult,
  RunnerPluginId,
  RunnerPluginStatus,
} from '../../types/backend';
import SettingsService from './settings.service';
import {
  getRunnerJavaCommand,
  getRunnerToolEnvironment,
} from './runnerEnvironment';

const KISQL_GITHUB_REPO = 'kineticadb/kisql';
const KISQL_UNIX_ASSET = 'kisql';
const KISQL_WIN_ASSET = 'kisql.exe';

function getKisqlAssetName(): string {
  return process.platform === 'win32' ? KISQL_WIN_ASSET : KISQL_UNIX_ASSET;
}

function getKisqlDownloadUrl(): string {
  const asset = getKisqlAssetName();
  return `https://raw.githubusercontent.com/${KISQL_GITHUB_REPO}/master/${asset}`;
}

async function getKisqlLatestSha(): Promise<string> {
  const response = await axios.get(
    `https://api.github.com/repos/${KISQL_GITHUB_REPO}/commits/master`,
    { headers: { Accept: 'application/vnd.github.sha' }, responseType: 'text' },
  );
  return String(response.data).trim().slice(0, 7);
}

function getRunnerBinaryFileName(): string {
  return process.platform === 'win32' ? 'rosetta-runner.exe' : 'rosetta-runner';
}

// The publish workflow puts the runner binary and its unzipped plugins into
// resources/runner, which electron-builder ships inside the installed app.
// Under npm start the same folder is read from the project itself, where a
// developer copies a runner by hand (it is git-ignored).
function getBundledRunnerDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'runner')
    : path.join(app.getAppPath(), 'resources', 'runner');
}

function getRunnerRoot(): string {
  return path.join(app.getPath('userData'), 'runner');
}

// Plugins the runner binary executes, and the external tool (if any) they
// shell out to. dbt/rosetta are already managed elsewhere in Studio, so
// their status is read from existing settings rather than re-detected here.
const PLUGIN_DEFINITIONS: {
  id: RunnerPluginId;
  label: string;
  plugin: string;
  command?: string;
  versionArgs?: string[];
  downloadUrl?: string;
}[] = [
  { id: 'dbt', label: 'dbt', plugin: 'dbt@v1' },
  { id: 'rosetta', label: 'Rosetta CLI', plugin: 'rosetta@v1' },
  {
    id: 'git',
    label: 'Git',
    plugin: 'git_clone@v1',
    command: 'git',
    versionArgs: ['--version'],
    downloadUrl: 'https://git-scm.com/downloads',
  },
  {
    id: 'terraform',
    label: 'Terraform',
    plugin: 'terraform@v1',
    command: 'terraform',
    versionArgs: ['-version'],
    downloadUrl: 'https://developer.hashicorp.com/terraform/install',
  },
  {
    id: 's3',
    label: 'AWS CLI',
    plugin: 's3@v1',
    command: 'aws',
    versionArgs: ['--version'],
    downloadUrl: 'https://aws.amazon.com/cli/',
  },
  {
    id: 'pyspark',
    label: 'PySpark (spark-submit)',
    plugin: 'pyspark@v1',
    command: 'spark-submit',
    versionArgs: ['--version'],
    downloadUrl:
      'https://spark.apache.org/docs/latest/api/python/getting_started/install.html',
  },
  {
    id: 'kinetica_cli',
    label: 'Kinetica CLI (KiSQL)',
    plugin: 'kinetica_cli@v1',
    // No `command` here — managed by Studio, detected from settings like dbt/rosetta
  },
  { id: 'command', label: 'Shell command', plugin: 'command@v1' },
];

export default class RunnerService {
  static supportsPySpark(version?: string | null): boolean {
    return Boolean(
      version && this.compareVersions(version.replace(/^v/, ''), '1.7.6') >= 0,
    );
  }

  static async checkJavaRuntime(
    runnerEnv?: Record<string, string | undefined>,
  ): Promise<{
    available: boolean;
    version?: string;
    requiredVersion: number;
  }> {
    const requiredVersion = 17;
    const env =
      runnerEnv ||
      (await getRunnerToolEnvironment(await SettingsService.loadSettings()));
    const java = getRunnerJavaCommand(env);

    return new Promise((resolve) => {
      execFile(
        java,
        ['-version'],
        { timeout: 5000, env },
        (error, stdout, stderr) => {
          if (error) {
            resolve({ available: false, requiredVersion });
            return;
          }
          const version = `${stdout}${stderr}`.match(/version "([\d.]+)/)?.[1];
          const major = Number(
            version?.split('.')[0] === '1'
              ? version?.split('.')[1]
              : version?.split('.')[0],
          );
          resolve({
            available: Number.isFinite(major) && major >= requiredVersion,
            version,
            requiredVersion,
          });
        },
      );
    });
  }

  // Copies the runner that ships inside the app into userData/runner/<app
  // version> and points settings at it. It is copied rather than run in place
  // because the install folder is read-only on macOS and Linux. Runs on every
  // start but only copies after an app update (or when the copy is missing).
  // Without a bundled runner (unsupported platforms, or npm start with an
  // empty project resources/runner) whatever runner is already saved is kept.
  static async copyBundledRunnerToUserData(): Promise<void> {
    const bundledDir = getBundledRunnerDir();
    if (
      !(await fs.pathExists(path.join(bundledDir, getRunnerBinaryFileName())))
    ) {
      return;
    }

    const version = app.getVersion();
    const settings = await SettingsService.loadSettings();
    const installDir = path.join(getRunnerRoot(), version);
    const binaryPath = path.join(installDir, getRunnerBinaryFileName());
    if (
      settings.runnerVersion === version &&
      settings.runnerPath === binaryPath &&
      (await fs.pathExists(binaryPath))
    ) {
      return;
    }

    await fs.remove(installDir);
    await fs.copy(bundledDir, installDir);

    settings.runnerVersion = version;
    settings.runnerPath = binaryPath;
    settings.runnerHome =
      (await this.locateRunnerHome(path.join(installDir, 'plugins-home'))) ||
      '';
    await SettingsService.saveSettings(settings);

    // Settings now point at the new copy, so every other runner folder
    // (the previous version, older downloads) is unused.
    const runnerFolderNames = await fs.readdir(getRunnerRoot());
    await Promise.all(
      runnerFolderNames
        .filter((folderName) => folderName !== version)
        .map((folderName) => fs.remove(path.join(getRunnerRoot(), folderName))),
    );
  }

  // Returns the RUNNER_HOME path - the directory that directly contains
  // plugins.json. GitHub zip exports commonly wrap contents in a single
  // top-level folder, so this checks the root and its immediate children
  // rather than assuming a fixed layout.
  private static async locateRunnerHome(root: string): Promise<string | null> {
    if (await fs.pathExists(path.join(root, 'plugins.json'))) {
      return root;
    }
    const entries = await fs.readdir(root);
    for (const entry of entries) {
      const candidate = path.join(root, entry);
      const stat = await fs.stat(candidate);
      if (
        stat.isDirectory() &&
        (await fs.pathExists(path.join(candidate, 'plugins.json')))
      ) {
        return candidate;
      }
    }
    return null;
  }

  static async checkPluginDependencies(): Promise<RunnerPluginStatus[]> {
    const settings = await SettingsService.loadSettings();

    return Promise.all(
      PLUGIN_DEFINITIONS.map(async (def) => {
        if (def.id === 'dbt') {
          return {
            id: def.id,
            label: def.label,
            plugin: def.plugin,
            available: Boolean(settings.dbtPath && settings.dbtVersion),
            version: settings.dbtVersion,
            path: settings.dbtPath,
            managedInStudio: true,
          };
        }
        if (def.id === 'rosetta') {
          return {
            id: def.id,
            label: def.label,
            plugin: def.plugin,
            available: Boolean(settings.rosettaPath && settings.rosettaVersion),
            version: settings.rosettaVersion,
            path: settings.rosettaPath,
            managedInStudio: true,
          };
        }
        if (def.id === 'kinetica_cli') {
          return {
            id: def.id,
            label: def.label,
            plugin: def.plugin,
            available: Boolean(settings.kisqlPath && settings.kisqlVersion),
            version: settings.kisqlVersion,
            path: settings.kisqlPath,
            managedInStudio: true,
          };
        }
        if (def.id === 'pyspark') {
          const java = await this.checkJavaRuntime();
          const managedSparkSubmit = settings.pythonPath
            ? path.join(
                path.dirname(settings.pythonPath),
                process.platform === 'win32'
                  ? 'spark-submit.cmd'
                  : 'spark-submit',
              )
            : '';
          if (managedSparkSubmit && (await fs.pathExists(managedSparkSubmit))) {
            return {
              id: def.id,
              label: def.label,
              plugin: def.plugin,
              available: true,
              path: managedSparkSubmit,
              managedInStudio: true,
              downloadUrl: def.downloadUrl,
              java,
            };
          }
        }
        if (!def.command) {
          // command@v1: no external dependency, always usable
          return {
            id: def.id,
            label: def.label,
            plugin: def.plugin,
            available: true,
          };
        }
        const detected = await this.detectBinary(
          def.command,
          def.versionArgs || ['--version'],
          def.id === 'pyspark'
            ? await getRunnerToolEnvironment(settings)
            : undefined,
        );
        return {
          id: def.id,
          label: def.label,
          plugin: def.plugin,
          available: detected.available,
          version: detected.version,
          path: detected.path,
          downloadUrl: def.downloadUrl,
          ...(def.id === 'pyspark'
            ? {
                java: await this.checkJavaRuntime(
                  await getRunnerToolEnvironment(settings),
                ),
              }
            : {}),
        };
      }),
    );
  }

  private static detectBinary(
    command: string,
    versionArgs: string[],
    runnerEnv?: Record<string, string>,
  ): Promise<{ available: boolean; version?: string; path?: string }> {
    // On macOS, Electron's PATH often omits Homebrew directories because
    // the app is launched via launchd rather than a login shell.  Ensure
    // the standard Homebrew prefixes are present so that tools installed
    // via Homebrew (terraform, git, aws, etc.) are discoverable.
    const homebrewDirs =
      process.platform === 'darwin'
        ? ['/opt/homebrew/bin', '/usr/local/bin']
        : [];
    const extraPath =
      homebrewDirs.length > 0 ? homebrewDirs.join(path.delimiter) : undefined;

    return new Promise((resolve) => {
      execFile(
        command,
        versionArgs,
        {
          timeout: 5000,
          env: runnerEnv || {
            ...process.env,
            ...(extraPath
              ? { PATH: `${extraPath}:${process.env.PATH ?? ''}` }
              : {}),
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            resolve({ available: false });
            return;
          }
          const output = `${stdout}${stderr}`.trim();
          const versionMatch = output.match(/(\d+\.\d+(?:\.\d+)?)/);
          resolve({
            available: true,
            version: versionMatch?.[1],
            path: command,
          });
        },
      );
    });
  }

  // ---------------------------------------------------------------------------
  // KiSQL (Kinetica CLI) managed installation
  // ---------------------------------------------------------------------------

  static async checkKisqlVersion(): Promise<{
    installed: boolean;
    version?: string;
    path?: string;
    latestSha?: string;
    updateAvailable?: boolean;
  }> {
    const settings = await SettingsService.loadSettings();
    let latestSha: string | undefined;
    try {
      latestSha = await getKisqlLatestSha();
    } catch {
      // network unavailable — still report current state
    }
    const installed = Boolean(
      settings.kisqlPath &&
        settings.kisqlVersion &&
        fs.existsSync(settings.kisqlPath),
    );
    const updateAvailable =
      installed && latestSha ? latestSha !== settings.kisqlVersion : undefined;
    return {
      installed,
      version: settings.kisqlVersion,
      path: settings.kisqlPath,
      latestSha,
      updateAvailable,
    };
  }

  static async installKisql(): Promise<InstallResult> {
    try {
      const downloadUrl = getKisqlDownloadUrl();
      const assetName = getKisqlAssetName();

      // Resolve latest commit SHA for version tracking
      let sha = 'unknown';
      try {
        sha = await getKisqlLatestSha();
      } catch {
        // proceed without SHA if network fails for the API call
      }

      const installDir = path.join(app.getPath('userData'), 'kisql');
      const binaryPath = path.join(installDir, assetName);
      const tempPath = path.join(installDir, `${assetName}.download`);

      await fs.mkdirp(installDir);

      const response = await downloadForInstall(downloadUrl, {
        responseType: 'arraybuffer',
      });
      await fs.writeFile(tempPath, response.data);

      if (process.platform !== 'win32') {
        await fs.chmod(tempPath, 0o755);
      }

      // Only replace the active binary once the download has fully
      // succeeded, so a failed download never leaves kisqlPath pointing at
      // a binary that was already deleted.
      await fs.move(tempPath, binaryPath, { overwrite: true });

      const settings = await SettingsService.loadSettings();
      settings.kisqlPath = binaryPath;
      settings.kisqlVersion = sha;
      await SettingsService.saveSettings(settings);

      return { success: true, version: sha, path: binaryPath };
    } catch (error) {
      return {
        success: false,
        version: '',
        path: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async uninstallKisql(): Promise<void> {
    const settings = await SettingsService.loadSettings();
    const installDir = path.join(app.getPath('userData'), 'kisql');
    if (fs.existsSync(installDir)) {
      await fs.remove(installDir);
    }
    settings.kisqlPath = '';
    settings.kisqlVersion = '';
    await SettingsService.saveSettings(settings);
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
