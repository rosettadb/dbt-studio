import { ipcMain, BrowserWindow } from 'electron';
import { CliAdapter } from '../adapters';
import { CliProcessEnvironment } from '../../types/backend';

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
        args?: string[];
        environment?: CliProcessEnvironment;
        cb?: (message: string) => void;
      },
    ) => {
      try {
        await cliAdapter.runCommand(
          mainWindow,
          args.command,
          args.args,
          args.environment,
        );
        return { success: true };
      } catch (error: any) {
        const errorMessage =
          error?.message || error?.toString() || 'Command failed';
        return { success: false, error: errorMessage };
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
