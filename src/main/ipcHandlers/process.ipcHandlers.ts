// Updated IPC Handlers
import { ipcMain, BrowserWindow, app } from 'electron';
import { ProcessAdapter } from '../adapters';

const processAdapter = new ProcessAdapter();

const handlerChannels = [
  'process:start',
  'process:stop',
  'process:status',
  'process:forceStop',
];

const listenerChannels = [
  'process:output',
  'process:error',
  'process:started',
  'process:exit',
  'process:done',
];

const removeProcessIpcHandlers = () => {
  handlerChannels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
  listenerChannels.forEach((channel) => {
    ipcMain.removeAllListeners(channel);
  });
};

const registerProcessHandlers = (mainWindow: BrowserWindow) => {
  removeProcessIpcHandlers();

  ipcMain.handle(
    'process:start',
    async (_event, { command }: { command: string }) => {
      try {
        processAdapter.start(command, mainWindow);
        return { success: true };
      } catch (err: any) {
        const errorMessage =
          err?.message || err?.toString() || 'Process failed';
        return { success: false, error: errorMessage };
      }
    },
  );

  ipcMain.handle(
    'process:stop',
    async (_event, { force = false }: { force?: boolean } = {}) => {
      try {
        const result = await processAdapter.stop(force);
        return { success: true, message: result.message };
      } catch (err: any) {
        return {
          success: false,
          error: err?.message || err?.toString() || 'Stop failed',
        };
      }
    },
  );

  ipcMain.handle('process:forceStop', async () => {
    try {
      const result = await processAdapter.stop(true);
      return { success: true, message: result.message };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || err?.toString() || 'Force stop failed',
      };
    }
  });

  ipcMain.handle('process:status', () => {
    return processAdapter.getStatus();
  });

  app.on('before-quit', async () => {
    if (processAdapter.isRunning()) {
      await processAdapter.stop(true);
    }
  });

  app.on('window-all-closed', async () => {
    if (processAdapter.isRunning()) {
      await processAdapter.stop(true);
    }
  });
};

export default registerProcessHandlers;
