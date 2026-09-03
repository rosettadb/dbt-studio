import { ipcMain, dialog, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { ConnectorsService } from '../services';

const HANDLER_CHANNELS = ['backup:export', 'backup:import'];

const removeBackupIpcHandlers = () => {
  HANDLER_CHANNELS.forEach((channel) => ipcMain.removeHandler(channel));
};

const registerBackupHandlers = () => {
  removeBackupIpcHandlers();

  /**
   * backup:export
   * Opens a save-file dialog, writes the JSON bundle, returns the chosen path
   * (or null if the user cancelled).
   */
  ipcMain.handle('backup:export', async () => {
    const defaultName = `dbt-studio-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export connections & settings',
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [{ name: 'JSON backup', extensions: ['json'] }],
      buttonLabel: 'Export',
    });

    if (canceled || !filePath) return { success: false, canceled: true };

    try {
      const json = await ConnectorsService.exportBackup();
      await fs.promises.writeFile(filePath, json, 'utf8');
      return { success: true, filePath };
    } catch (error: any) {
      return { success: false, error: error?.message ?? String(error) };
    }
  });

  /**
   * backup:import
   * Opens an open-file dialog, reads the JSON bundle, imports it.
   * mode: 'merge' | 'replace'  (forwarded from the renderer)
   */
  ipcMain.handle(
    'backup:import',
    async (_event, mode: 'merge' | 'replace' = 'merge') => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Import connections & settings',
        filters: [{ name: 'JSON backup', extensions: ['json'] }],
        properties: ['openFile'],
        buttonLabel: 'Import',
      });

      if (canceled || !filePaths.length)
        return { success: false, canceled: true };

      try {
        const json = await fs.promises.readFile(filePaths[0], 'utf8');
        const result = await ConnectorsService.importBackup(json, mode);
        return { success: true, ...result };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  );
};

export default registerBackupHandlers;
