/* eslint global-require: off, no-console: off, promise/always-return: off, no-restricted-syntax: off, no-await-in-loop: off */
import { app, ipcMain, protocol } from 'electron';
import { WindowManager } from './windows';
import { loadEnvironment } from './utils/setupHelpers';
import { AssetUrl } from './utils/assetUrl';
import { AssetServer } from './utils/assetServer';
import { setupApplicationIcon } from './utils/iconUtils';
import { SettingsService } from './services';
import { copyAssetsToUserData } from './utils/fileHelper';
import AnalyticsService from './services/analytics.service';

const isProd = process.env.NODE_ENV === 'production';
const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

loadEnvironment(isDebug, isProd);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app-asset',
    privileges: {
      standard: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
]);

setupApplicationIcon();

// Ensure single instance of the app
const gotTheLock = app.requestSingleInstanceLock();
let windowManager: WindowManager | null = null;

if (!gotTheLock) {
  console.log('Another instance is already running. Quitting...');
  app.quit();
} else {
  app
    .whenReady()
    .then(async () => {
      windowManager = new WindowManager();
      windowManager.startApplication();
      copyAssetsToUserData();
      const splash = windowManager.getSplash();

      if (splash) {
        splash.webContents.once('did-finish-load', async () => {
          const updateMessage = async (msg: string) => {
            await splash.webContents.executeJavaScript(
              `window.updateLoaderMessage(${JSON.stringify(msg)})`,
            );
          };

          await updateMessage('Downloading latest Rosetta release...');
          try {
            await SettingsService.updateRosetta();
          } catch (e) {
            console.error(e);
          }

          await updateMessage('Embedding Python...');
          try {
            await SettingsService.updatePython();
          } catch (e) {
            console.error(e);
          }

          const fakeStages = [
            { message: 'Loading settings...', delay: 1000 },
            { message: 'Loading projects...', delay: 1000 },
            { message: 'Getting everything ready...', delay: 1000 },
          ];

          for (const stage of fakeStages) {
            await updateMessage(stage.message);
            await new Promise((resolve) => {
              setTimeout(resolve, stage.delay);
            });
          }

          if (windowManager) {
            windowManager.closeSplashScreen();
            const settings = await SettingsService.loadSettings();
            if (settings.isSetup !== 'true') {
              await windowManager.showSetupWindow();
            } else {
              await windowManager.showMainWindow();
            }
          }
        });
      }

      protocol.handle('app-asset', (request) => {
        const asset = new AssetUrl(request.url);
        return AssetServer.fromNodeModules(asset.relativeUrl);
      });

      app.on('activate', () => {
        if (windowManager) {
          const mainWindow = windowManager.getMainWindow();
          const splashWindow = windowManager.getSplash();
          const setupWindow = windowManager.getSetupWindow();

          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          } else if (setupWindow) {
            if (setupWindow.isMinimized()) setupWindow.restore();
            setupWindow.show();
            setupWindow.focus();
          } else if (splashWindow) {
            splashWindow.focus();
          } else {
            windowManager.startApplication();
          }
        } else {
          windowManager = new WindowManager();
          windowManager.startApplication();
        }
      });

      await AnalyticsService.trackAppUpdate();
    })
    .catch(console.log);

  app.on('second-instance', () => {
    if (!windowManager) return;

    const activeWindow = windowManager.getMainWindow();

    if (activeWindow) {
      if (activeWindow.isMinimized()) activeWindow.restore();
      activeWindow.show();
      activeWindow.focus();
    } else {
      windowManager.startApplication();
    }
  });
}

ipcMain.handle('windows:closeSetup', () => {
  if (windowManager) {
    windowManager.closeSetupWindow();
  }
});

app.on('window-all-closed', () => {
  // Don't quit - WindowManager will handle the actual quitting
});
