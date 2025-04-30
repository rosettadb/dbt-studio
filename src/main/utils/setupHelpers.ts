import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import fs from 'fs';
import { app } from 'electron';
import path from 'path';
import { URL } from 'url';

export const DATA_DIR = app.getPath('userData');
export const DB_FILE = path.join(DATA_DIR, 'database.json');

export const initializeDataStorage = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ projects: [] }, null, 2));
  }
};

export class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

export const installExtensions = async () => {
  // eslint-disable-next-line global-require
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return (
    installer
      .default(
        extensions.map((name) => installer[name]),
        forceDownload,
      )
      // eslint-disable-next-line no-console
      .catch(console.log)
  );
};

export const loadEnvironment = (isDebug: boolean, isProd: boolean) => {
  if (isProd) {
    // eslint-disable-next-line global-require
    const sourceMapSupport = require('source-map-support');
    sourceMapSupport.install();
  }

  if (isDebug) {
    // eslint-disable-next-line global-require
    require('electron-debug')();
  }
};

export function resolveHtmlPath(htmlFileName: string, routePath = '') {
  if (process.env.NODE_ENV === 'development') {
    const port = process.env.PORT || 1212;
    const url = new URL(`http://localhost:${port}`);
    url.pathname = htmlFileName;

    if (routePath) {
      url.hash = routePath;
    }

    return url.href;
  }

  const filePath = path.resolve(__dirname, '../renderer/', htmlFileName);

  if (routePath) {
    return `file://${filePath}#${routePath}`;
  }

  return `file://${filePath}`;
}
