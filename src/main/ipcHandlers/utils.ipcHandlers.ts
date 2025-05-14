import { ipcMain, shell } from 'electron';

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
};

export default registerUtilsHandlers;
