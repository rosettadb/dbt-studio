import fs from 'fs';
import { app, BrowserWindow, ipcMain } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import type {
  PtyAckRequest,
  PtyCreateRequest,
  PtyRenameRequest,
  PtyResizeRequest,
  PtyWriteRequest,
} from '../../types/pty';
import {
  PtyService,
  createDefaultPtyServiceDeps,
} from '../services/pty.service';
import SettingsService from '../services/settings.service';
import { buildShellEnvironment } from '../utils/shellEnvironment';
import { resolveHtmlPath } from '../utils/setupHelpers';

const handlerChannels = [
  'pty:profiles',
  'pty:create',
  'pty:list',
  'pty:snapshot',
  'pty:clear',
  'pty:kill',
  'pty:rename',
];

const listenerChannels = ['pty:write', 'pty:resize', 'pty:ack'];

const directoryExists = (dir: string): boolean => {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
};

const buildEnv = async (): Promise<Record<string, string>> => {
  // A terminal must still open when settings cannot be read; it just will
  // not have Studio's tools on PATH.
  const settings = await SettingsService.loadSettings().catch(() => null);
  return buildShellEnvironment({
    baseEnv: process.env,
    platform: process.platform,
    isPackaged: app.isPackaged,
    locale: app.getLocale(),
    pythonPath: settings?.pythonPath,
    dbtPath: settings?.dbtPath,
    rosettaPath: settings?.rosettaPath,
    directoryExists,
  });
};

// One service for the lifetime of the app: shells outlive handler
// re-registration (setup window → main window) and renderer reloads.
const ptyService = new PtyService(createDefaultPtyServiceDeps(buildEnv));

let quitHookInstalled = false;
let quittingAfterPtys = false;

const removePtyIpcHandlers = () => {
  handlerChannels.forEach((channel) => ipcMain.removeHandler(channel));
  listenerChannels.forEach((channel) => ipcMain.removeAllListeners(channel));
};

const registerPtyHandlers = (mainWindow: BrowserWindow) => {
  removePtyIpcHandlers();
  const allowed = new URL(resolveHtmlPath('index.html', 'app'));
  const trusted = (event: IpcMainEvent | IpcMainInvokeEvent) => {
    if (
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame
    )
      return false;
    try {
      const actual = new URL(event.senderFrame.url);
      if (actual.origin !== allowed.origin) return false;
      // In dev mode the webpack-dev-server serves index.html at '/', so
      // actual.pathname is '/' while allowed.pathname is '/index.html'.
      // Both are valid; we allow either as long as the origin matches.
      const allowedPaths = new Set([allowed.pathname, '/']);
      return allowedPaths.has(actual.pathname);
    } catch {
      return false;
    }
  };
  const requireTrusted = (event: IpcMainInvokeEvent) => {
    if (!trusted(event)) throw new Error('Untrusted PTY sender');
  };

  ptyService.setEventSink((channel: string, payload: unknown) => {
    if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send(channel, payload);
  });

  ipcMain.handle('pty:profiles', (event) => {
    requireTrusted(event);
    return ptyService.getProfiles();
  });

  ipcMain.handle('pty:create', (event, request: PtyCreateRequest) => {
    requireTrusted(event);
    return ptyService.create(request);
  });

  ipcMain.handle('pty:list', (event) => {
    requireTrusted(event);
    return ptyService.list();
  });

  ipcMain.handle('pty:snapshot', (event, id: string) => {
    requireTrusted(event);
    return ptyService.snapshot(id);
  });
  ipcMain.handle('pty:clear', (event, id: string) => {
    requireTrusted(event);
    return ptyService.clear(id);
  });

  ipcMain.handle('pty:kill', (event, id: string) => {
    requireTrusted(event);
    return ptyService.kill(id);
  });

  ipcMain.handle('pty:rename', (event, request: PtyRenameRequest) => {
    requireTrusted(event);
    return ptyService.rename(request?.id, request?.title);
  });

  ipcMain.on('pty:write', (event, request: PtyWriteRequest) => {
    if (!trusted(event)) return;
    ptyService.write(request?.id, request?.data, request?.binary === true);
  });

  ipcMain.on('pty:resize', (event, request: PtyResizeRequest) => {
    if (!trusted(event)) return;
    ptyService.resize(request?.id, request?.cols, request?.rows);
  });

  ipcMain.on('pty:ack', (event, request: PtyAckRequest) => {
    if (!trusted(event)) return;
    ptyService.acknowledge(request?.id, request?.chars);
  });

  if (!quitHookInstalled) {
    quitHookInstalled = true;
    // Shells are children of a pseudo terminal, not of Studio's process
    // tree: without this they (and whatever runs in them) would be left
    // running after the app closes.
    app.on('before-quit', async (event) => {
      if (quittingAfterPtys) return;
      event.preventDefault();
      try {
        await ptyService.killAll();
      } finally {
        quittingAfterPtys = true;
        app.quit();
      }
    });
  }
};

export default registerPtyHandlers;
