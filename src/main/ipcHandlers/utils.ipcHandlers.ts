import {
  ipcMain,
  shell,
  dialog,
  OpenDialogOptions,
  SaveDialogOptions,
} from 'electron';
import { UtilsService } from '../services';

const handlerChannels = [
  'open:external',
  'utils:getFileContentList',
  'dialog:showOpenDialog',
  'dialog:showSaveDialog',
];

const removeUtilsIpcHandlers = () => {
  handlerChannels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
};

const registerUtilsHandlers = () => {
  removeUtilsIpcHandlers();

  // Handler for opening external URLs
  ipcMain.handle('open:external', async (_event, url) => {
    if (typeof url === 'string') {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle(
    'utils:getFileContentList',
    async (_event, files: string[]) => {
      return UtilsService.getFilesWithContent(files);
    },
  );

  // Handler for showOpenDialog
  ipcMain.handle(
    'dialog:showOpenDialog',
    async (_event, options: OpenDialogOptions) => {
      const result = await dialog.showOpenDialog(options);
      return result;
    },
  );

  // Handler for showSaveDialog
  ipcMain.handle(
    'dialog:showSaveDialog',
    async (_event, options: SaveDialogOptions) => {
      const result = await dialog.showSaveDialog(options);
      return result;
    },
  );

  ipcMain.handle('utils:open-path', (_event, filePath: string) =>
    shell.openPath(filePath),
  );
};

export default registerUtilsHandlers;
