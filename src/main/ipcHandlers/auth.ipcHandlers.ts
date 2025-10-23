import { ipcMain } from 'electron';
import AuthService from '../services/auth.service';

const registerAuthHandlers = () => {
  ipcMain.handle('auth:login', async () => {
    return AuthService.openLogin();
  });

  ipcMain.handle('auth:getToken', async () => {
    return AuthService.getToken();
  });

  ipcMain.handle('auth:logout', async () => {
    await AuthService.clearToken();
  });

  ipcMain.handle('auth:storeToken', async (_event, token: string) => {
    await AuthService.storeToken(token);
  });
};

export default registerAuthHandlers;
