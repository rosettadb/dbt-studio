import fs from 'fs';
import { app } from 'electron';
import path from 'path';
import { URL } from 'url';
import MainDatabaseService from '../services/mainDatabase.service';
import { AIProviderManager } from '../services/ai/providerManager.service';

export const DATA_DIR = app.getPath('userData');
export const DB_FILE = path.join(DATA_DIR, 'database.json');

export const initializeDataStorage = async () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ projects: [] }, null, 2));
  }

  // Initialize main database for AI and future features
  try {
    await MainDatabaseService.initializeDatabase();

    // Initialize AI provider manager after database is ready
    await AIProviderManager.initializeAllProviders();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize main database or AI providers:', error);
    // Don't throw error to prevent app startup failure
  }
};

export const installExtensions = async () => {
  // eslint-disable-next-line global-require
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer.default(
    extensions.map((name) => installer[name]),
    forceDownload,
  );
  // eslint-disable-next-line no-console
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
