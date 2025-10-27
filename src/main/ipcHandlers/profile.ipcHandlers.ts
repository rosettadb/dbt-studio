import { ipcMain } from 'electron';
import { ProfileService } from '../services/profile.service';

export function registerProfileHandlers() {
  ipcMain.handle('profile:get', async () => {
    return ProfileService.getProfile();
  });

  ipcMain.handle('profile:refresh', async () => {
    return ProfileService.refreshProfile();
  });

  ipcMain.handle('profile:getCached', async () => {
    return ProfileService.getCachedProfile();
  });
}
