import { BrowserWindow, dialog, ipcMain, app } from 'electron';
import { initializeDataStorage } from '../utils/setupHelpers';
import { FileDialogProperties, SettingsType } from '../../types/backend';
import { SettingsService } from '../services';
import { SettingsChannels } from '../../types/ipc';

const handlerChannels: SettingsChannels[] = [
  'settings:load',
  'settings:load-with-db-info',
  'settings:save',
  'settings:checkCliUpdates',
  'settings:updateCli',
  'settings:dialog',
  'version:rosetta:check',
  'version:rosetta:install',
  'version:rosetta:uninstall',
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

  ipcMain.handle('settings:load-with-db-info', async () => {
    return SettingsService.loadSettingsWithDatabaseInfo();
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

  // Rosetta version management handlers
  ipcMain.handle('version:rosetta:check', async () => {
    return SettingsService.checkRosettaVersions();
  });

  ipcMain.handle('version:rosetta:install', async (_event, version: string) => {
    return SettingsService.installRosettaVersion(version);
  });

  ipcMain.handle('version:rosetta:uninstall', async () => {
    return SettingsService.uninstallRosetta();
  });

  ipcMain.handle('settings:reset-factory', async () => {
    return SettingsService.resetFactorySettings();
  });

  ipcMain.handle('settings:restart', async () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle('settings:getFileName', async (_event, body: string[]) => {
    return SettingsService.getFileName(body);
  });

  // DuckDB management handlers
  ipcMain.handle('settings:duckdb:metadata', async () => {
    return SettingsService.getDuckDbMetadata();
  });
  ipcMain.handle('settings:duckdb:refresh', async () => {
    return SettingsService.refreshDuckDbMetadata();
  });
  ipcMain.handle(
    'settings:duckdb:reinitialize',
    async (_event, options?: { dropExisting?: boolean }) => {
      return SettingsService.reinitializeDuckDb(options);
    },
  );
  ipcMain.handle('settings:duckdb:diagnose', async () => {
    return SettingsService.diagnoseDuckDb();
  });

  ipcMain.handle('settings:installSqlGlot', async () => {
    return SettingsService.installSqlGlot();
  });
};

export default registerSettingsHandlers;
