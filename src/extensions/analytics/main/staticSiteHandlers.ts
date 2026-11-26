import type { ExtensionMainApi } from '../../../extensionApi/main';
import { StaticSiteService } from './staticSite.service';
import type { StaticSiteBuildOptions } from './staticSite.service';

export const registerStaticSiteHandlers = (api: ExtensionMainApi) => {
  api.ipc.handle(
    'analytics:static-site:build',
    (_e, opts: StaticSiteBuildOptions) => {
      // Build progress is sent to the main window.
      const mainWindow = api.windows.getMainWindow();
      if (!mainWindow) throw new Error('No window is open');
      return StaticSiteService.build(mainWindow, opts);
    },
  );

  api.ipc.handle(
    'analytics:static-site:open-folder',
    (_e, { path }: { path: string }) => StaticSiteService.openFolder(path),
  );

  api.ipc.handle(
    'analytics:static-site:open-preview',
    (_e, { path }: { path: string }) => StaticSiteService.openPreview(path),
  );

  api.ipc.handle(
    'analytics:static-site:get-state',
    (_e, { connectionId }: { connectionId: string }) =>
      StaticSiteService.getState(connectionId),
  );

  api.ipc.handle(
    'analytics:static-site:pick-folder',
    (_e, { defaultPath }: { defaultPath: string }) =>
      StaticSiteService.pickFolder(defaultPath),
  );

  api.ipc.handle(
    'analytics:static-site:get-default-path',
    (_e, { connectionName }: { connectionName: string }) =>
      StaticSiteService.getDefaultOutputPath(connectionName),
  );

  api.ipc.handle(
    'analytics:static-site:folder-exists',
    (_e, { path }: { path: string }) => StaticSiteService.folderExists(path),
  );
  api.ipc.handle(
    'analytics:static-site:delete-build',
    (
      _e,
      {
        connectionId,
        outputPath,
      }: { connectionId: string; outputPath: string },
    ) => StaticSiteService.deleteBuild(connectionId, outputPath),
  );
};
