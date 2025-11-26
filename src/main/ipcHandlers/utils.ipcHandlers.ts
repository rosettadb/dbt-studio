import { ipcMain, shell } from 'electron';
import { UtilsService } from '../services';

const handlerChannels = ['open:external', 'utils:openPath'];

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

  // Handler for opening file paths in system file manager
  ipcMain.handle('utils:openPath', async (_event, filePath: string) => {
    if (typeof filePath === 'string') {
      const result = await shell.openPath(filePath);
      // openPath returns empty string on success, error message on failure
      return { success: result === '', error: result };
    }
    return { success: false, error: 'Invalid file path' };
  });
};

export default registerUtilsHandlers;
