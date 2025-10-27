import { ipcMain, BrowserWindow } from 'electron';
import { AuthService } from '../services';

const authService = new AuthService();

const handlerChannels = [
  'auth:login',
  'auth:logout',
  'auth:getToken',
  'auth:getUser',
  'auth:isAuthenticated',
  'auth:validateToken',
];

const removeAuthIpcHandlers = () => {
  handlerChannels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
};

const registerAuthHandlers = (mainWindow: BrowserWindow) => {
  removeAuthIpcHandlers();

  ipcMain.handle('auth:login', async () => {
    await authService.authenticate(mainWindow);
  });

  ipcMain.handle('auth:logout', async () => {
    authService.logout();
  });

  ipcMain.handle('auth:getToken', () => {
    return authService.getAuthToken();
  });

  ipcMain.handle('auth:getUser', () => {
    return authService.getUser();
  });

  ipcMain.handle('auth:isAuthenticated', () => {
    return authService.isAuthenticated();
  });

  ipcMain.handle('auth:validateToken', async () => {
    return authService.validateToken();
  });
};

export default registerAuthHandlers;
