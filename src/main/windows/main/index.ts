import { BrowserWindow, shell, app, Menu } from 'electron';
import path from 'path';
import { resolveHtmlPath } from '../../utils/setupHelpers';
import { createWindowStateKeeper } from '../../utils/windowState';
import MenuBuilder from './menu';

const mainWindowState = createWindowStateKeeper('main-window-state');

export const createMainWindow = (
  onCloseCallback: () => void,
): BrowserWindow => {
  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../../assets');

  const getAssetPath = (...paths: string[]) => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  const initialBounds = mainWindowState.getInitialBounds();

  const mainWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    show: false,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload exposes Node's `path` module to the renderer (see
      // src/main/preload.ts); a sandboxed preload cannot require it. Page
      // code is still isolated from Node by contextIsolation above.
      sandbox: false,
      webviewTag: true,
    },
  });

  mainWindowState.track(mainWindow);

  // Windows/Linux: no application menu at all. macOS always shows a native
  // menu bar regardless — Electron falls back to its own default (mostly
  // non-functional) menu if we pass null, so build a real one there instead.
  if (process.platform === 'darwin') {
    new MenuBuilder(mainWindow).buildMenu();
  } else {
    Menu.setApplicationMenu(null);
  }

  const studioUrl = new URL(resolveHtmlPath('index.html', 'app'));
  const isStudioUrl = (url: string) => {
    try {
      const target = new URL(url);
      return (
        target.origin === studioUrl.origin &&
        target.pathname === studioUrl.pathname
      );
    } catch {
      return false;
    }
  };
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isStudioUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.on('will-frame-navigate', (event) => {
    // Only block top-level frame navigations away from the app URL.
    // Child frames (iframes such as the Flowfile UI) must be allowed to load
    // their own URLs freely.
    if (event.frame?.parent == null && !isStudioUrl(event.url)) {
      event.preventDefault();
    }
  });
  mainWindow.loadURL(studioUrl.href);

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) {
      if (process.env.START_MINIMIZED) {
        mainWindow.minimize();
      } else {
        if (initialBounds.isMaximized) {
          mainWindow.maximize();
        }
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
