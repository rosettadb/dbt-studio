import { BrowserWindow, dialog, ipcMain } from 'electron';
import { initializeDataStorage } from '../utils/setupHelpers';
import { FileDialogProperties, SettingsType } from '../../types/backend';
import { SettingsService } from '../services';

const handlerChannels = [
  'settings:load',
  'settings:save',
  'settings:checkCliUpdates',
  'settings:updateCli',
  'settings:dialog',
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
};

export default registerSettingsHandlers;
