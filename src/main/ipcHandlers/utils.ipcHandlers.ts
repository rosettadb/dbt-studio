import fs from 'fs/promises';
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
  'utils:writeBase64File',
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

  // Handler for writing a base64-encoded file to disk (e.g. PNG export)
  ipcMain.handle(
    'utils:writeBase64File',
    async (_event, { filePath, data }: { filePath: string; data: string }) => {
      // eslint-disable-next-line no-console
      console.log(
        '[writeBase64File] Received filePath:',
        filePath,
        'data.length:',
        data?.length,
      );
      const buffer = Buffer.from(data, 'base64');
      // eslint-disable-next-line no-console
      console.log('[writeBase64File] Decoded buffer length:', buffer.length);
      await fs.writeFile(filePath, buffer);
      // eslint-disable-next-line no-console
      console.log('[writeBase64File] File written successfully');
    },
  );
};

export default registerUtilsHandlers;
