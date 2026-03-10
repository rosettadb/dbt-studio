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
    // Compare prerelease identifiers according to semver spec
    const pre1 = v1.split('-')[1].split('.');
    const pre2 = v2.split('-')[1].split('.');

    for (let i = 0; i < Math.max(pre1.length, pre2.length); i += 1) {
      const p1 = pre1[i];
      const p2 = pre2[i];

      // If one identifier is missing, the shorter version is less
      if (p1 === undefined) return -1;
      if (p2 === undefined) return 1;

      // Check if both are numeric
      const p1Num = /^\d+$/.test(p1) ? parseInt(p1, 10) : null;
      const p2Num = /^\d+$/.test(p2) ? parseInt(p2, 10) : null;

      if (p1Num !== null && p2Num !== null) {
        // Both numeric - compare numerically
        if (p1Num > p2Num) return 1;
        if (p1Num < p2Num) return -1;
      } else if (p1Num !== null) {
        // Numeric is always less than non-numeric
        return -1;
      } else if (p2Num !== null) {
        // Non-numeric is always greater than numeric
        return 1;
      } else {
        // Both non-numeric - compare lexicographically
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
      }
    }
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

    // Select appropriate release notes based on which version is actually latest
    let releaseNotes: string;
    if (latestVersion === newVersion) {
      // Remote version is latest - use its release notes
      releaseNotes =
        (result.updateInfo.releaseNotes as string) ||
        `Release notes not available for version ${newVersion}`;
    } else {
      // Current version is latest - no new release notes available
      releaseNotes = `Current version ${currentVersion} is up to date or newer than available version ${newVersion}`;
    }

    return {
      currentVersion,
      newVersion: latestVersion,
      lastInstalledVersion,
      releaseNotes,
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

    autoUpdater.allowPrerelease = false;

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
