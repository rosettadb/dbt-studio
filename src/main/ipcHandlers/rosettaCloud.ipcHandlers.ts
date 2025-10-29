import { ipcMain } from 'electron';
import { RosettaCloudService } from '../services';

const registerRosettaCloudIpcHandlers = () => {
  ipcMain.handle(
    'rosettaCloud:push',
    async (
      _event,
      body: {
        id: string;
        title: string;
        gitUrl: string;
        gitBranch: string;
        apiKey: string;
        githubUsername?: string;
        githubPassword?: string;
      },
    ) => {
      return RosettaCloudService.pushProjectToCloud(body);
    },
  );

  ipcMain.handle('rosettaCloud:getProfile', async () => {
    return RosettaCloudService.getProfile();
  });

  ipcMain.handle('rosettaCloud:refreshProfile', async () => {
    return RosettaCloudService.refreshProfile();
  });

  ipcMain.handle('rosettaCloud:getCachedProfile', async () => {
    return RosettaCloudService.getCachedProfile();
  });

  ipcMain.handle('rosettaCloud:login', async () => {
    return RosettaCloudService.openLogin();
  });

  ipcMain.handle('rosettaCloud:getToken', async () => {
    return RosettaCloudService.getToken();
  });

  ipcMain.handle('rosettaCloud:logout', async () => {
    await RosettaCloudService.clearToken();
  });

  ipcMain.handle('rosettaCloud:storeToken', async (_event, token: string) => {
    await RosettaCloudService.storeToken(token);
  });
};

export default registerRosettaCloudIpcHandlers;
