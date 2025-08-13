import { BrowserWindow, dialog, ipcMain, app } from 'electron';
import { initializeDataStorage } from '../utils/setupHelpers';
import { FileDialogProperties, SettingsType } from '../../types/backend';
import { SettingsService } from '../services';
import { SettingsChannels } from '../../types/ipc';

const handlerChannels: SettingsChannels[] = [
  'settings:load',
  'settings:save',
  'settings:checkCliUpdates',
  'settings:updateCli',
  'settings:dialog',
  'settings:reset-factory',
  'settings:restart',
];

const removeSettingsIpcHandlers = () => {
  handlerChannels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
};

const registerSettingsHandlers = (mainWindow: BrowserWindow) => {
  removeSettingsIpcHandlers();
  initializeDataStorage();

  ipcMain.handle('settings:load', async () => {
    return SettingsService.loadSettings();
  });

  ipcMain.handle('settings:save', async (_event, body: SettingsType) => {
    return SettingsService.saveSettings(body);
  });

  ipcMain.handle('settings:checkCliUpdates', async () => {
    return SettingsService.checkCliUpdates();
  });

  ipcMain.handle('settings:getDbtPath', async () => {
    return SettingsService.getDbtExePath();
  });

  ipcMain.handle('settings:usePathJoin', async (_event, body: string[]) => {
    return SettingsService.usePathJoin(body);
  });

  ipcMain.handle(
    'settings:dialog',
    async (
      _event,
      {
        properties,
        defaultPath,
        filters,
      }: {
        properties: FileDialogProperties[];
        defaultPath?: string;
        filters?: { name: string; extensions: string[] }[];
      },
    ) => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties,
        defaultPath,
        filters,
      });
      return result.filePaths;
    },
  );

  ipcMain.handle('settings:reset-factory', async () => {
    return SettingsService.resetFactorySettings();
  });

  ipcMain.handle('settings:restart', async () => {
    app.relaunch();
    app.exit(0);
  });
};

export default registerSettingsHandlers;
