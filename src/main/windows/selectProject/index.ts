import { app, BrowserWindow, Menu } from 'electron';
import path from 'path';
import { resolveHtmlPath } from '../../utils/setupHelpers';

export const createProjectWindow = (
  onCloseCallback: () => void,
): BrowserWindow => {
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

  // Load your React app at a specific route for project selection
  projectWindow.loadURL(resolveHtmlPath('index.html', '/select-project'));

  // Set application menu to null to completely remove it
  Menu.setApplicationMenu(null);

  projectWindow.on('closed', onCloseCallback);

  return projectWindow;
};
