/* eslint global-require: off, no-console: off, promise/always-return: off, no-restricted-syntax: off, no-await-in-loop: off */
import { app, ipcMain, protocol } from 'electron';
import fs from 'fs-extra';
import { WindowManager } from './windows';
import { loadEnvironment } from './utils/setupHelpers';
import { AssetUrl } from './utils/assetUrl';
import { AssetServer } from './utils/assetServer';
import { setupApplicationIcon } from './utils/iconUtils';
import {
  SettingsService,
  AnalyticsService,
  UpdateService,
  RosettaCloudService,
} from './services';
import { copyAssetsToUserData } from './utils/fileHelper';

const isProd = process.env.NODE_ENV === 'production';
const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

loadEnvironment(isDebug, isProd);

UpdateService.initialize();

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app-asset',
    privileges: {
      standard: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
  {
    scheme: 'rosetta',
    privileges: {
      standard: true,
      secure: true,
    },
  },
]);

setupApplicationIcon();

let windowManager: WindowManager | null = null;
async function handleDeepLink(url: string) {
  try {
    const parsedUrl = new URL(url);
    if (
      parsedUrl.protocol === 'rosetta:' &&
      (parsedUrl.pathname === '//auth' || parsedUrl.host === 'auth')
    ) {
      const token = parsedUrl.searchParams.get('token');
      if (token) {
        await RosettaCloudService.storeToken(token);

        windowManager
          ?.getMainWindow()
          ?.webContents.send('rosettaCloud:authTokenUpdated');

        windowManager
          ?.getMainWindow()
          ?.webContents.send('rosettaCloud:authSuccess', {
            token,
          });
        return;
      }

      windowManager
        ?.getMainWindow()
        ?.webContents.send('rosettaCloud:authError', {
          error: 'Missing token in deep link response.',
        });
    }
  } catch (error) {
    windowManager?.getMainWindow()?.webContents.send('rosettaCloud:authError', {
      error:
        error instanceof Error
          ? `Failed to process deep link: ${error.message}`
          : 'Failed to process deep link.',
    });
  }
}

// Ensure single instance of the app
const gotTheLock = app.requestSingleInstanceLock();

// Register custom protocol for deep linking
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('rosetta', process.execPath, [
      process.argv[1],
    ]);
  }
} else {
  app.setAsDefaultProtocolClient('rosetta');
}

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

          // Load settings to check if this is first run
          const settings = await SettingsService.loadSettings();
          const isFirstRun = settings.isSetup !== 'true';

          // Only auto-install Rosetta on first run
          if (isFirstRun) {
            await updateMessage('Downloading latest Rosetta release...');
            try {
              await SettingsService.updateRosetta();
            } catch (e) {
              console.error('Failed to install Rosetta:', e);
            }
          } else if (
            !settings.rosettaPath ||
            !fs.existsSync(settings.rosettaPath)
          ) {
            await updateMessage(
              'Rosetta not configured - please set up in Settings > Rosetta',
            );
          } else {
            await updateMessage(
              `Rosetta ready - version ${settings.rosettaVersion}`,
            );
          }

          await updateMessage('Embedding Python...');
          try {
            await SettingsService.updatePython();
          } catch (e) {
            console.error('Failed to install Python:', e);
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
            // Use already loaded settings instead of loading again
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

  app.on('second-instance', (event, commandLine) => {
    if (!windowManager) return;

    // Handle deep link from second instance
    const url = commandLine.find((arg) => arg.startsWith('rosetta://'));
    if (url) {
      handleDeepLink(url);
    }

    const activeWindow = windowManager.getMainWindow();

    if (activeWindow) {
      if (activeWindow.isMinimized()) activeWindow.restore();
      activeWindow.show();
      activeWindow.focus();
    } else {
      windowManager.startApplication();
    }
  });

  // Handle deep links on macOS
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  // Handle deep links on Windows/Linux
  app.on('ready', () => {
    // Check if app was opened with a deep link
    const url = process.argv.find((arg) => arg.startsWith('rosetta://'));
    if (url) {
      handleDeepLink(url);
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
