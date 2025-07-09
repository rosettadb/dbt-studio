import { autoUpdater } from 'electron-updater';
import { app } from 'electron';
import Store from 'electron-store';
import log from 'electron-log';

export default class UpdateService {
  private static store: any = new Store();

  private static updateDownloaded = false;

  static async checkForUpdates() {
    const result = await autoUpdater.checkForUpdates();
    if (!result) return null;

    const currentVersion = app.getVersion();
    const newVersion = result.updateInfo.version;
    const rejectedVersion = this.store.get('rejectedVersion');
    const lastInstalledVersion = this.store.get('lastInstalledVersion');

    // Don't show update modal on fresh installation
    if (!lastInstalledVersion) {
      this.store.set('lastInstalledVersion', currentVersion);
      return null;
    }

    // Don't show update modal if versions are the same
    if (currentVersion === newVersion) {
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

    return {
      currentVersion,
      newVersion,
      lastInstalledVersion,
      releaseNotes: result.updateInfo.releaseNotes,
    };
  }

  static async downloadAndInstall() {
    if (this.updateDownloaded) {
      autoUpdater.quitAndInstall();
      return;
    }

    // Start download
    autoUpdater.downloadUpdate();

    // Return a promise that resolves when download is complete
    // eslint-disable-next-line consistent-return
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

    // Set up logging for update events
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

    // Do an initial check for updates
    autoUpdater.checkForUpdates();
  }
}
