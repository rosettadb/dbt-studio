import { BrowserWindow, shell, app, screen, Menu } from 'electron';
import path from 'path';
import { AppUpdater, resolveHtmlPath } from '../../utils/setupHelpers';

export const createMainWindow = (
  onCloseCallback: () => void,
): BrowserWindow => {
  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../../assets');

  const getAssetPath = (...paths: string[]) => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const mainWindow = new BrowserWindow({
    width,
    height,
    show: false,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Set application menu to null to completely remove it
  Menu.setApplicationMenu(null);

  mainWindow.loadURL(resolveHtmlPath('index.html', 'app'));

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) {
      if (process.env.START_MINIMIZED) {
        mainWindow.minimize();
      } else {
        mainWindow.show();
      }
    }
  });

  mainWindow.on('closed', onCloseCallback);

  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // eslint-disable-next-line no-new
  new AppUpdater();

  return mainWindow;
};
