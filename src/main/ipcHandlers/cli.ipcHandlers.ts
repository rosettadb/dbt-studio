import { ipcMain, BrowserWindow } from 'electron';
import { CliAdapter } from '../adapters';

const cliAdapter = new CliAdapter();

const handlerChannels = [
  'cli:run',
  'cli:input',
  'cli:stop',
  'cli:setPath',
  'cli:status',
  'cli:clear',
];

const listenerChannels = [
  'cli:output',
  'cli:error',
  'cli:done',
  'cli:inputRequest',
];

const removeCliIpcHandlers = () => {
  handlerChannels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
  listenerChannels.forEach((channel) => {
    ipcMain.removeAllListeners(channel);
  });
};

const registerCliHandlers = (mainWindow: BrowserWindow) => {
  removeCliIpcHandlers();

  ipcMain.handle(
    'cli:run',
    async (
      _event,
      args: {
        command: string;
        cb?: (message: string) => void;
      },
    ) => {
      try {
        await cliAdapter.runCommand(mainWindow, args.command);
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    },
  );

  ipcMain.handle('cli:status', () => {
    return !!cliAdapter.getProcess();
  });

  ipcMain.on('cli:input', (_event, input: string) => {
    cliAdapter.sendInput(input);
  });

  ipcMain.on('cli:stop', () => {
    cliAdapter.stopCommand();
  });
};

export default registerCliHandlers;
