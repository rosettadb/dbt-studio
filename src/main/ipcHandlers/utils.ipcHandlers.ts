import fs from 'fs/promises';
import path from 'path';
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
  'utils:saveBase64File',
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

  // Handler for saving a base64-encoded file to disk (e.g. PNG export)
  ipcMain.handle(
    'utils:saveBase64File',
    async (
      _event,
      { data, options }: { data: string; options: SaveDialogOptions },
    ) => {
      const result = await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }

      // eslint-disable-next-line no-console
      console.log(
        '[saveBase64File] Saving filename:',
        path.basename(result.filePath),
        'data.length:',
        data?.length,
      );
      const buffer = Buffer.from(data, 'base64');
      // eslint-disable-next-line no-console
      console.log('[saveBase64File] Decoded buffer length:', buffer.length);
      await fs.writeFile(result.filePath, buffer);
      // eslint-disable-next-line no-console
      console.log('[saveBase64File] File written successfully');
      return { canceled: false, filePath: result.filePath };
    },
  );
};

export default registerUtilsHandlers;
