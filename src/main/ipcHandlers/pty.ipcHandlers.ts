import fs from 'fs';
import { app, BrowserWindow, ipcMain } from 'electron';
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

const handlerChannels = [
  'pty:profiles',
  'pty:create',
  'pty:list',
  'pty:snapshot',
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

const removePtyIpcHandlers = () => {
  handlerChannels.forEach((channel) => ipcMain.removeHandler(channel));
  listenerChannels.forEach((channel) => ipcMain.removeAllListeners(channel));
};

const registerPtyHandlers = (mainWindow: BrowserWindow) => {
  removePtyIpcHandlers();

  ptyService.setEventSink((channel: string, payload: unknown) => {
    if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send(channel, payload);
  });

  ipcMain.handle('pty:profiles', () => ptyService.getProfiles());

  ipcMain.handle('pty:create', (_event, request: PtyCreateRequest) =>
    ptyService.create(request),
  );

  ipcMain.handle('pty:list', () => ptyService.list());

  ipcMain.handle('pty:snapshot', (_event, id: string) =>
    ptyService.snapshot(id),
  );

  ipcMain.handle('pty:kill', (_event, id: string) => ptyService.kill(id));

  ipcMain.handle('pty:rename', (_event, request: PtyRenameRequest) =>
    ptyService.rename(request?.id, request?.title),
  );

  ipcMain.on('pty:write', (_event, request: PtyWriteRequest) => {
    ptyService.write(request?.id, request?.data, request?.binary === true);
  });

  ipcMain.on('pty:resize', (_event, request: PtyResizeRequest) => {
    ptyService.resize(request?.id, request?.cols, request?.rows);
  });

  ipcMain.on('pty:ack', (_event, request: PtyAckRequest) => {
    ptyService.acknowledge(request?.id, request?.chars);
  });

  if (!quitHookInstalled) {
    quitHookInstalled = true;
    // Shells are children of a pseudo terminal, not of Studio's process
    // tree: without this they (and whatever runs in them) would be left
    // running after the app closes.
    app.on('before-quit', () => ptyService.killAll());
    app.on('will-quit', () => ptyService.killAll());
  }
};

export default registerPtyHandlers;
