import { BrowserWindow, dialog, ipcMain, app } from 'electron';
import { initializeDataStorage } from '../utils/setupHelpers';
import { FileDialogProperties, SettingsType } from '../../types/backend';
import { SettingsService, RunnerService } from '../services';
import { SettingsChannels } from '../../types/ipc';
import { DbtCoreVersionService } from '../services/dbtCoreVersion.service';

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
  'version:python:check',
  'version:python:install',
  'version:python:uninstall',
  'version:runner:check',
  'version:runner:install',
  'version:runner:uninstall',
  'runner:plugins:check',
  'settings:reset-factory',
  'settings:restart',
  'settings:getBasename',
  'settings:getDirname',
  'dbt:versions:list',
  'dbt:installed:get',
  'dbt:versionChange:plan',
  'dbt:versionChange:install',
  'dbt:compatibility:check',
  'dbt:adapters:active',
  'dbt:adapters:check',
  'dbt:packages:installed',
  'dbt:package:installLatest',
  'dbt:package:uninstall',
  'dbt:packageVersions:list',
  'dbt:packageVersion:install',
  'kisql:install',
  'kisql:uninstall',
  'kisql:check',
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

  // Managed Python version management handlers
  ipcMain.handle('version:python:check', async () => {
    return SettingsService.checkPythonInstall();
  });

  ipcMain.handle('version:python:install', async () => {
    return SettingsService.installPython();
  });

  ipcMain.handle('version:python:uninstall', async () => {
    return SettingsService.uninstallPython();
  });

  // Local runner binary version management handlers
  ipcMain.handle('version:runner:check', async () => {
    return RunnerService.checkRunnerVersions();
  });

  ipcMain.handle('version:runner:install', async (_event, version: string) => {
    return RunnerService.installRunnerVersion(version);
  });

  ipcMain.handle('version:runner:uninstall', async () => {
    return RunnerService.uninstallRunnerVersion();
  });

  ipcMain.handle('runner:plugins:check', async () => {
    return RunnerService.checkPluginDependencies();
  });

  ipcMain.handle('settings:reset-factory', async (event) => {
    return SettingsService.resetFactorySettings(event.sender.session);
  });

  ipcMain.handle('settings:restart', async () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle('settings:getFileName', async (_event, body: string[]) => {
    return SettingsService.getFileName(body);
  });

  ipcMain.handle('settings:getBasename', async (_event, filePath: string) => {
    return SettingsService.getBasename(filePath);
  });

  ipcMain.handle('settings:getDirname', async (_event, filePath: string) => {
    return SettingsService.getDirname(filePath);
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

  ipcMain.handle('dbt:versions:list', async (_event, request) => {
    return DbtCoreVersionService.listDbtCoreVersions(request);
  });

  ipcMain.handle('dbt:installed:get', async () => {
    return DbtCoreVersionService.getInstalledDbtCore();
  });

  ipcMain.handle('dbt:versionChange:plan', async (_event, request) => {
    return DbtCoreVersionService.planVersionChange(request);
  });

  ipcMain.handle('dbt:versionChange:install', async (_event, request) => {
    return DbtCoreVersionService.installVersionChange(request);
  });

  ipcMain.handle('dbt:compatibility:check', async () => {
    return DbtCoreVersionService.checkCurrentProjectCompatibility();
  });

  ipcMain.handle('dbt:adapters:active', async (_event, request) => {
    return DbtCoreVersionService.getActiveAdapterCapabilities(
      request?.projectPath,
    );
  });

  ipcMain.handle('dbt:adapters:check', async (_event, request) => {
    return DbtCoreVersionService.checkProjectAdapterCompatibility(
      request?.projectPath,
    );
  });

  ipcMain.handle('dbt:packages:installed', async () => {
    return DbtCoreVersionService.getInstalledPackages();
  });

  ipcMain.handle('dbt:package:installLatest', async (_event, request) => {
    return DbtCoreVersionService.installLatestPackage(request);
  });

  ipcMain.handle('dbt:package:uninstall', async (_event, request) => {
    return DbtCoreVersionService.uninstallPackage(request);
  });

  ipcMain.handle('dbt:packageVersions:list', async (_event, req) => {
    return DbtCoreVersionService.listPackageVersions(req?.packageName);
  });

  ipcMain.handle('dbt:packageVersion:install', async (_event, req) => {
    return DbtCoreVersionService.installPackageVersion(req);
  });

  // KiSQL (Kinetica CLI) handlers
  ipcMain.handle('kisql:check', async () => {
    return RunnerService.checkKisqlVersion();
  });

  ipcMain.handle('kisql:install', async () => {
    return RunnerService.installKisql();
  });

  ipcMain.handle('kisql:uninstall', async () => {
    return RunnerService.uninstallKisql();
  });
};

export default registerSettingsHandlers;
