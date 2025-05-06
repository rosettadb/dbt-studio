import { app, BrowserWindow, Menu } from 'electron';
import path from 'path';
import { resolveHtmlPath } from '../../utils/setupHelpers';

export const createProjectWindow = (): BrowserWindow => {
  const projectWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
    maxWidth: 800,
    maxHeight: 600,
    resizable: false,
    fullscreenable: false,
    title: 'Select Project',
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  projectWindow.loadURL(resolveHtmlPath('index.html', '/select-project'));
  Menu.setApplicationMenu(null);
  return projectWindow;
};
