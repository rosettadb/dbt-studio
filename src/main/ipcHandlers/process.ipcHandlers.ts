import { ipcMain, BrowserWindow, app } from 'electron';
import { ProcessAdapter } from '../adapters';

const processAdapter = new ProcessAdapter();

const handlerChannels = ['process:start', 'process:stop', 'process:status'];
const listenerChannels: string[] = [];

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
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    },
  );

  ipcMain.handle('process:stop', () => {
    processAdapter.stop();
    return { success: true };
  });

  ipcMain.handle('process:status', () => {
    return {
      running: processAdapter.isRunning(),
      pid: processAdapter.getPid(),
    };
  });

  app.on('before-quit', () => {
    processAdapter.stop();
  });
};

export default registerProcessHandlers;
