import { ipcMain } from 'electron';
import SecureStorageService from '../services/secureStorage.service';

const registerSecureStorageHandlers = () => {
  ipcMain.handle(
    'secure-storage:set',
    async (_event, { account, password }) => {
      await SecureStorageService.setCredential(account, password);
    },
  );
  ipcMain.handle('secure-storage:get', async (_event, { account }) => {
    return SecureStorageService.getCredential(account);
  });

  ipcMain.handle('secure-storage:delete', async (_event, { account }) => {
    await SecureStorageService.deleteCredential(account);
  });

  ipcMain.handle('secure-storage:list', async () => {
    return SecureStorageService.findCredentials();
  });
};

export default registerSecureStorageHandlers;
