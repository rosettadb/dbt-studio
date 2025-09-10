import { ipcMain, shell } from 'electron';
import { FileNode } from '../../types/backend';
import { UtilsService } from '../services';

const handlerChannels = ['open:external'];

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
};

export default registerUtilsHandlers;
