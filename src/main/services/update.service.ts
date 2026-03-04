/* eslint-disable consistent-return */
import { autoUpdater } from 'electron-updater';
import { app } from 'electron';
import Store from 'electron-store';
import log from 'electron-log';

const isPrerelease = (version: string) => version.includes('-');

/**
 * Compare two semantic versions
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const v1IsPrerelease = isPrerelease(v1);
  const v2IsPrerelease = isPrerelease(v2);

  if (v1IsPrerelease && !v2IsPrerelease) return -1;
  if (!v1IsPrerelease && v2IsPrerelease) return 1;

  const cleanV1 = v1.split('-')[0];
  const cleanV2 = v2.split('-')[0];

  const a = cleanV1.split('.').map(Number);
  const b = cleanV2.split('.').map(Number);

  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const num1 = a[i] || 0;
    const num2 = b[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  if (v1IsPrerelease && v2IsPrerelease) {
    return v1.localeCompare(v2);
  }

  return 0;
}

export default class UpdateService {
  private static store: any = new Store();

  private static updateDownloaded = false;

  static async checkForUpdates() {
    const result = await autoUpdater.checkForUpdates();
    if (!result) return null;

    const { updateInfo } = result;
    const isDraftRelease =
      updateInfo &&
      typeof updateInfo === 'object' &&
      'draft' in updateInfo &&
      (updateInfo as { draft?: boolean }).draft === true;

    const isPrereleaseUpdate =
      updateInfo &&
      typeof updateInfo === 'object' &&
      'prerelease' in updateInfo &&
      (updateInfo as { prerelease?: boolean }).prerelease === true;

    if (isDraftRelease) {
      log.info('Skipping draft release update');
      return null;
    }

    if (isPrereleaseUpdate) {
      log.info('Skipping prerelease update');
      return null;
    }

    const currentVersion = app.getVersion();
    const newVersion = result.updateInfo.version;
    const rejectedVersion = this.store.get('rejectedVersion');
    const lastInstalledVersion = this.store.get('lastInstalledVersion');

    if (!lastInstalledVersion) {
      this.store.set('lastInstalledVersion', currentVersion);
      return null;
    }

    const versionComparison = compareVersions(newVersion, currentVersion);
    if (versionComparison <= 0) {
      return null;
    }

    if (rejectedVersion === newVersion) {
      return null;
    }

    return {
      currentVersion,
      newVersion,
      releaseNotes: result.updateInfo.releaseNotes,
    };
  }

  static async checkForSettingsUpdates() {
    const result = await autoUpdater.checkForUpdates();
    if (!result) return null;
    const currentVersion = app.getVersion();
    const newVersion = result.updateInfo.version;
    const lastInstalledVersion = this.store.get('lastInstalledVersion');

    // Determine which version is actually latest using semantic versioning
    const versionComparison = compareVersions(currentVersion, newVersion);
    const latestVersion = versionComparison >= 0 ? currentVersion : newVersion;

    return {
      currentVersion,
      newVersion: latestVersion,
      lastInstalledVersion,
      releaseNotes: result.updateInfo.releaseNotes,
    };
  }

  static async downloadAndInstall() {
    if (this.updateDownloaded) {
      autoUpdater.quitAndInstall();
      return;
    }
    autoUpdater.downloadUpdate();
    return new Promise((resolve, reject) => {
      autoUpdater.once('update-downloaded', () => {
        this.updateDownloaded = true;
        resolve(true);
      });

      autoUpdater.once('error', (err) => {
        reject(err);
      });
    });
  }

  static rejectVersion(version: string) {
    this.store.set('rejectedVersion', version);
  }

  static initialize() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;

    // Configure autoUpdater for prerelease handling
    autoUpdater.allowPrerelease = true; // Allow beta/alpha updates

    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for update...');
    });

    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info);
    });

    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available:', info);
    });

    autoUpdater.on('error', (err) => {
      log.error('Error in auto-updater:', err);
    });

    autoUpdater.on('download-progress', (progressObj) => {
      log.info('Download progress:', progressObj);
    });

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info);
      this.updateDownloaded = true;
    });

    autoUpdater.checkForUpdates();
  }
}
