/* eslint-disable no-restricted-syntax, no-await-in-loop */
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';
import { execFile } from 'child_process';
import AdmZip from 'adm-zip';
import {
  InstallResult,
  RunnerVersionInfo,
  RunnerPluginId,
  RunnerPluginStatus,
} from '../../types/backend';
import SettingsService from './settings.service';

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

const RUNNER_RELEASES_API =
  'https://api.github.com/repos/rosettadb/dbt-studio/releases';

const RUNNER_ASSET_NAMES: Record<string, Record<string, string>> = {
  darwin: {
    arm64: 'rosetta-runner-darwin-arm64',
    x64: 'rosetta-runner-darwin-amd64',
  },
  linux: {
    x64: 'rosetta-runner-linux-amd64',
  },
  win32: {
    x64: 'rosetta-runner-windows-amd64.exe',
  },
};

function getRunnerAssetName(): string {
  const { platform, arch } = process;
  const assetName = RUNNER_ASSET_NAMES[platform]?.[arch];
  if (!assetName) {
    throw new Error(
      `Unsupported OS or architecture for the local runner: ${platform}-${arch}`,
    );
  }
  return assetName;
}

function getRunnerBinaryFileName(): string {
  return process.platform === 'win32' ? 'rosetta-runner.exe' : 'rosetta-runner';
}

const RUNNER_PLUGINS_ASSET_NAME = 'rosetta-runner-plugins.zip';

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
    id: 'kinetica_cli',
    label: 'Kinetica CLI (KiSQL)',
    plugin: 'kinetica_cli@v1',
    // No `command` here — managed by Studio, detected from settings like dbt/rosetta
  },
  { id: 'command', label: 'Shell command', plugin: 'command@v1' },
];

export default class RunnerService {
  static async checkRunnerVersions(): Promise<RunnerVersionInfo> {
    const settings = await SettingsService.loadSettings();
    const currentVersion = settings.runnerVersion || null;
    const currentPath = settings.runnerPath || null;

    try {
      const assetName = getRunnerAssetName();
      const response = await axios.get(RUNNER_RELEASES_API);
      const releases: any[] = response.data;

      const releasesWithRunner = releases.filter((release) =>
        (release.assets || []).some((a: any) => a.name === assetName),
      );

      const availableVersions = releasesWithRunner.map((release) => {
        const version = release.tag_name.replace(/^v/, '');
        const asset = release.assets.find((a: any) => a.name === assetName);
        return {
          version,
          releaseDate: release.published_at,
          isPrerelease: release.prerelease,
          downloadUrl: asset?.browser_download_url || '',
          isNewer: this.compareVersions(version, currentVersion || '0.0.0') > 0,
          isOlder: this.compareVersions(version, currentVersion || '0.0.0') < 0,
          releaseNotes: release.body,
        };
      });

      const latestStable =
        releasesWithRunner
          .find((r) => !r.prerelease)
          ?.tag_name.replace(/^v/, '') || '';
      const latestPrerelease = releasesWithRunner
        .find((r) => r.prerelease)
        ?.tag_name.replace(/^v/, '');

      return {
        currentVersion,
        currentPath,
        availableVersions,
        latestStable,
        latestPrerelease,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to check runner versions: ${message}`);
    }
  }

  static async installRunnerVersion(version: string): Promise<InstallResult> {
    try {
      const assetName = getRunnerAssetName();
      const downloadUrl = `https://github.com/rosettadb/dbt-studio/releases/download/${version}/${assetName}`;

      const settings = await SettingsService.loadSettings();
      if (settings.runnerPath && fs.existsSync(settings.runnerPath)) {
        await fs.remove(path.dirname(settings.runnerPath));
      }

      const installDir = path.join(app.getPath('userData'), 'runner', version);
      const binaryPath = path.join(installDir, getRunnerBinaryFileName());

      await fs.mkdirp(installDir);
      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
      });
      await fs.writeFile(binaryPath, response.data);

      if (process.platform !== 'win32') {
        await fs.chmod(binaryPath, 0o755);
      }

      settings.runnerVersion = version;
      settings.runnerPath = binaryPath;

      const warnings: string[] = [];
      try {
        settings.runnerHome = await this.installRunnerPlugins(
          version,
          installDir,
        );
      } catch (pluginsError) {
        settings.runnerHome = '';
        warnings.push(
          `Runner installed, but plugin scripts could not be downloaded: ${
            pluginsError instanceof Error
              ? pluginsError.message
              : 'Unknown error'
          }`,
        );
      }

      await SettingsService.saveSettings(settings);

      return {
        success: true,
        version,
        path: binaryPath,
        warnings: warnings.length ? warnings : undefined,
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

  // Downloads and extracts rosetta-runner-plugins.zip (shipped as a separate
  // release asset alongside the platform binaries) and returns the RUNNER_HOME
  // path - the directory that directly contains plugins.json - so it can be
  // passed to the runner binary. GitHub zip exports commonly wrap contents in
  // a single top-level folder, so this checks the extraction root and its
  // immediate children rather than assuming a fixed layout.
  private static async installRunnerPlugins(
    version: string,
    installDir: string,
  ): Promise<string> {
    const pluginsZipUrl = `https://github.com/rosettadb/dbt-studio/releases/download/${version}/${RUNNER_PLUGINS_ASSET_NAME}`;
    const pluginsHomeDir = path.join(installDir, 'plugins-home');
    const pluginsZipPath = path.join(installDir, RUNNER_PLUGINS_ASSET_NAME);

    await fs.remove(pluginsHomeDir);
    await fs.mkdirp(pluginsHomeDir);

    const response = await axios.get(pluginsZipUrl, {
      responseType: 'arraybuffer',
    });
    await fs.writeFile(pluginsZipPath, response.data);

    const zip = new AdmZip(pluginsZipPath);
    zip.extractAllTo(pluginsHomeDir, true);
    await fs.remove(pluginsZipPath);

    const runnerHome = await this.locateRunnerHome(pluginsHomeDir);
    if (!runnerHome) {
      throw new Error(
        `Could not find plugins.json in ${RUNNER_PLUGINS_ASSET_NAME}`,
      );
    }
    return runnerHome;
  }

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

  static async uninstallRunnerVersion(): Promise<void> {
    const settings = await SettingsService.loadSettings();
    if (settings.runnerPath && fs.existsSync(settings.runnerPath)) {
      await fs.remove(path.dirname(settings.runnerPath));
    }
    settings.runnerVersion = '';
    settings.runnerPath = '';
    settings.runnerHome = '';
    await SettingsService.saveSettings(settings);
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
        if (!def.command) {
          // command@v1: no external dependency, always usable
          return {
            id: def.id,
            label: def.label,
            plugin: def.plugin,
            available: true,
          };
        }
        const detected = await this.detectBinary(def.command, def.versionArgs);
        return {
          id: def.id,
          label: def.label,
          plugin: def.plugin,
          available: detected.available,
          version: detected.version,
          path: detected.path,
          downloadUrl: def.downloadUrl,
        };
      }),
    );
  }

  private static detectBinary(
    command: string,
    versionArgs: string[] = ['--version'],
  ): Promise<{ available: boolean; version?: string; path?: string }> {
    return new Promise((resolve) => {
      execFile(
        command,
        versionArgs,
        { timeout: 5000 },
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

      // Remove previous installation
      if (fs.existsSync(installDir)) {
        await fs.remove(installDir);
      }
      await fs.mkdirp(installDir);

      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
      });
      await fs.writeFile(binaryPath, response.data);

      if (process.platform !== 'win32') {
        await fs.chmod(binaryPath, 0o755);
      }

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
