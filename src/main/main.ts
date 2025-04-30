/* eslint global-require: off, no-console: off, promise/always-return: off, no-restricted-syntax: off, no-await-in-loop: off */
import { app, protocol } from 'electron';
import { WindowManager } from './windows';
import { loadEnvironment } from './utils/setupHelpers';
import { AssetUrl } from './utils/assetUrl';
import { AssetServer } from './utils/assetServer';
import { setupApplicationIcon } from './utils/iconUtils';
import { SettingsService } from './services';
import { copyAssetsToUserData } from './utils/fileHelper';

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
    .then(() => {
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

          // Ensure windowManager is not null before using it
          if (windowManager) {
            await windowManager.showMainWindow();
            windowManager.closeSplashScreen();
          }
        });
      }

      protocol.handle('app-asset', (request) => {
        const asset = new AssetUrl(request.url);
        return AssetServer.fromNodeModules(asset.relativeUrl);
      });

      // Enhanced macOS activate event handler - critical for dock icon clicks
      app.on('activate', () => {
        if (windowManager) {
          const mainWindow = windowManager.getMainWindow();

          if (mainWindow) {
            // Main window exists, show and focus it
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          } else {
            // No windows exist, restart application
            windowManager.startApplication();
          }
        } else {
          // WindowManager doesn't exist, create one and start app
          windowManager = new WindowManager();
          windowManager.startApplication();
        }
      });
    })
    .catch(console.log);

  // Handle second instance attempt - simplified
  app.on('second-instance', () => {
    if (!windowManager) return;

    // Find the active window to focus
    const activeWindow = windowManager.getMainWindow();

    if (activeWindow) {
      // Restore and focus the existing window
      if (activeWindow.isMinimized()) activeWindow.restore();
      activeWindow.show();
      activeWindow.focus();
    } else {
      // No visible windows, start fresh
      windowManager.startApplication();
    }
  });
}

app.on('window-all-closed', () => {
  // Don't quit - WindowManager will handle the actual quitting
});
