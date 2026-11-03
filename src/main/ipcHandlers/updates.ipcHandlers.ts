import { ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import UpdateManager from '../services/update.service';
import { runInstallTask } from '../utils/installTask';

const registerUpdateHandlers = () => {
  ipcMain.handle('updates:check', async () => {
    return UpdateManager.checkForUpdates();
  });

  ipcMain.handle('updates:check-settings', async () => {
    return UpdateManager.checkForSettingsUpdates();
  });

  ipcMain.handle('updates:download', async () => {
    return runInstallTask('install:app-update', 'Downloading app update', () =>
      UpdateManager.downloadAndInstall(),
    );
  });

  ipcMain.handle('updates:reject-version', async (_event, version: string) => {
    return UpdateManager.rejectVersion(version);
  });

  ipcMain.handle('updates:restart', async () => {
    autoUpdater.quitAndInstall();
  });
};

export default registerUpdateHandlers;
