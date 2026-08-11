import { BrowserWindow, shell, app, screen, Menu } from 'electron';
import path from 'path';
import { resolveHtmlPath } from '../../utils/setupHelpers';
import MenuBuilder from './menu';

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
      webviewTag: true,
    },
  });

  // Windows/Linux: no application menu at all. macOS always shows a native
  // menu bar regardless — Electron falls back to its own default (mostly
  // non-functional) menu if we pass null, so build a real one there instead.
  if (process.platform === 'darwin') {
    new MenuBuilder(mainWindow).buildMenu();
  } else {
    Menu.setApplicationMenu(null);
  }

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

  return mainWindow;
};
