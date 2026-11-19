/* eslint-disable no-restricted-syntax, no-await-in-loop */
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';
import { execFile } from 'child_process';
import AdmZip from 'adm-zip';
import { downloadForInstall } from '../utils/installTask';
import {
  InstallResult,
  RunnerRequirementStatus,
  SettingsType,
} from '../../types/backend';
import SettingsService from './settings.service';
import { getRunnerToolEnvironment } from './runnerEnvironment';
import { loadPluginDefinitions } from './pluginManifest.service';
import {
  collectRequirements,
  type RequirementWithPlugins,
} from '../../shared/pluginManifest';

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

// The runner files each dbt Studio release carries, per platform and arch.
const RUNNER_ASSET_NAMES: Record<string, Record<string, string>> = {
  darwin: {
    arm64: 'rosetta-runner-darwin-arm64',
    x64: 'rosetta-runner-darwin-amd64',
  },
  linux: { x64: 'rosetta-runner-linux-amd64' },
  win32: { x64: 'rosetta-runner-windows-amd64.exe' },
};

const LATEST_RUNNER_RELEASE_URL =
  'https://github.com/rosettadb/dbt-studio/releases/latest/download';

// The publish workflow puts the runner binary and its unzipped plugins into
// resources/runner, which electron-builder ships inside the installed app.
// Under npm start the same folder is read from the project itself (it is
// git-ignored); downloadRunnerForDevelopment fills it the first time.
function getBundledRunnerDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'runner')
    : path.join(app.getAppPath(), 'resources', 'runner');
}

function getRunnerRoot(): string {
  return path.join(app.getPath('userData'), 'runner');
}

// Tools Studio installs itself (Settings has their own pages or buttons):
// where each one's path and version are kept. Which plugins need a tool, how
// it is checked and how it is installed all come from the runner's plugin
// manifest (`requires`); this only says where Studio's own installs are.
const STUDIO_INSTALLED_TOOLS: Record<
  string,
  (settings: SettingsType) => { path?: string; version?: string }
> = {
  dbt: (settings) => ({
    path: settings.dbtPath,
    version: settings.dbtVersion,
  }),
  rosetta: (settings) => ({
    path: settings.rosettaPath,
    version: settings.rosettaVersion,
  }),
  kisql: (settings) => ({
    path: settings.kisqlPath,
    version: settings.kisqlVersion,
  }),
};

function runTool(
  command: string,
  args: string[],
  env: Record<string, string>,
): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 5000, env }, (error, stdout, stderr) => {
      resolve(error ? null : `${stdout}${stderr}`.trim());
    });
  });
}

export default class RunnerService {
  // npm start has no runner inside the app, so - like Rosetta and Python - the
  // first start downloads the latest released runner into the project's
  // resources/runner, and copyBundledRunnerToUserData sets it up from there.
  // Later starts (and factory resets) reuse that folder without downloading.
  static async downloadRunnerForDevelopment(
    onDownloadStart: () => Promise<void>,
  ): Promise<void> {
    if (app.isPackaged) return;
    const runnerDir = getBundledRunnerDir();
    const assetName = RUNNER_ASSET_NAMES[process.platform]?.[process.arch];
    if (
      !assetName ||
      (await fs.pathExists(path.join(runnerDir, getRunnerBinaryFileName())))
    ) {
      return;
    }

    await onDownloadStart();
    const [binaryResponse, pluginsResponse] = await Promise.all([
      downloadForInstall(`${LATEST_RUNNER_RELEASE_URL}/${assetName}`, {
        responseType: 'arraybuffer',
      }),
      downloadForInstall(
        `${LATEST_RUNNER_RELEASE_URL}/rosetta-runner-plugins.zip`,
        { responseType: 'arraybuffer' },
      ),
    ]);

    // Fill a staging folder and rename it into place, so a failed download
    // never leaves a half-filled resources/runner that later starts trust.
    const stagingDir = `${runnerDir}.partial`;
    await fs.remove(stagingDir);
    const binaryPath = path.join(stagingDir, getRunnerBinaryFileName());
    await fs.outputFile(binaryPath, Buffer.from(binaryResponse.data));
    await fs.chmod(binaryPath, 0o755);
    new AdmZip(Buffer.from(pluginsResponse.data)).extractAllTo(
      path.join(stagingDir, 'plugins-home'),
      true,
    );
    await fs.move(stagingDir, runnerDir, { overwrite: true });
  }

  // Copies the runner that ships inside the app into userData/runner/<app
  // version> and points settings at it. It is copied rather than run in place
  // because the install folder is read-only on macOS and Linux. Runs on every
  // start but only copies after an app update (or when the copy is missing).
  // Without a bundled runner (unsupported platforms, or npm start when the
  // download failed) whatever runner is already saved is kept.
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

    // Copy into a staging folder and rename it into place only once the whole
    // copy succeeded, so installDir is either complete or missing. A failed
    // copy then leaves no binary behind, and the next start copies again.
    const stagingDir = `${installDir}.partial`;
    await fs.remove(stagingDir);
    await fs.copy(bundledDir, stagingDir);
    await fs.move(stagingDir, installDir, { overwrite: true });

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

  // The tools the runner's plugins need (the manifest's `requires`), each
  // with whether it is installed on this machine. Shown in Settings only:
  // running a pipeline checks nothing, a step fails when its tool is missing.
  static async checkRequirements(): Promise<RunnerRequirementStatus[]> {
    const requirements = collectRequirements(await loadPluginDefinitions());
    if (requirements.length === 0) return [];
    const settings = await SettingsService.loadSettings();
    // The environment the runner itself is started with, so a tool counts
    // as installed exactly when a pipeline step would find it.
    const env = await getRunnerToolEnvironment(settings);
    return Promise.all(
      requirements.map((requirement) =>
        this.checkRequirement(requirement, settings, env),
      ),
    );
  }

  private static async checkRequirement(
    requirement: RequirementWithPlugins,
    settings: SettingsType,
    env: Record<string, string>,
  ): Promise<RunnerRequirementStatus> {
    const { check, install } = requirement;

    if (install.type === 'auto') {
      const installed = STUDIO_INSTALLED_TOOLS[requirement.id]?.(settings);
      if (installed?.path && installed.version) {
        return {
          ...requirement,
          available: true,
          version: installed.version,
          path: installed.path,
          managedInStudio: true,
        };
      }
      // A pip package is installed into Studio's own Python.
      if (install.method === 'pip' && settings.pythonPath) {
        const managedCommand = path.join(
          path.dirname(settings.pythonPath),
          process.platform === 'win32' ? `${check.command}.cmd` : check.command,
        );
        if (await fs.pathExists(managedCommand)) {
          return {
            ...requirement,
            available: true,
            path: managedCommand,
            managedInStudio: true,
          };
        }
      }
    }

    // Without arguments only the command's presence is checked: running an
    // unknown tool bare could start something interactive.
    const output = check.args
      ? await runTool(check.command, check.args, env)
      : await runTool(
          process.platform === 'win32' ? 'where' : 'which',
          [check.command],
          env,
        );
    if (output === null) return { ...requirement, available: false };

    const version = check.args
      ? (output.match(/(\d+(?:\.\d+)+)/)?.[1] ??
        output.match(/version "?(\d+)/i)?.[1])
      : undefined;
    const oldEnough =
      !check.minVersion ||
      (version !== undefined &&
        this.compareVersions(version, check.minVersion) >= 0);
    return {
      ...requirement,
      available: oldEnough,
      version,
      path: check.args ? check.command : output.split(/\r?\n/)[0],
    };
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
