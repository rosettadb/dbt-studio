import { ipcMain, BrowserWindow } from 'electron';
import { StaticSiteService } from '../services/staticSite.service';
import type { StaticSiteBuildOptions } from '../services/staticSite.service';

export const registerStaticSiteHandlers = (mainWindow: BrowserWindow) => {
  ipcMain.handle(
    'analytics:static-site:build',
    (_e, opts: StaticSiteBuildOptions) =>
      StaticSiteService.build(mainWindow, opts),
  );

  ipcMain.handle(
    'analytics:static-site:open-folder',
    (_e, { path }: { path: string }) => StaticSiteService.openFolder(path),
  );

  ipcMain.handle(
    'analytics:static-site:open-preview',
    (_e, { path }: { path: string }) => StaticSiteService.openPreview(path),
  );

  ipcMain.handle(
    'analytics:static-site:get-state',
    (_e, { connectionId }: { connectionId: string }) =>
      StaticSiteService.getState(connectionId),
  );

  ipcMain.handle(
    'analytics:static-site:pick-folder',
    (_e, { defaultPath }: { defaultPath: string }) =>
      StaticSiteService.pickFolder(defaultPath),
  );

  ipcMain.handle(
    'analytics:static-site:get-default-path',
    (_e, { connectionName }: { connectionName: string }) =>
      StaticSiteService.getDefaultOutputPath(connectionName),
  );

  ipcMain.handle(
    'analytics:static-site:folder-exists',
    (_e, { path }: { path: string }) => StaticSiteService.folderExists(path),
  );
};
