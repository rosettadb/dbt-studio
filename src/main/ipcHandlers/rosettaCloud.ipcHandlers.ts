import { ipcMain } from 'electron';
import { RosettaCloudService } from '../services';
import { CloudDeploymentPayload } from '../../types/backend';

const registerRosettaCloudIpcHandlers = () => {
  ipcMain.handle(
    'rosettaCloud:push',
    async (_event, body: CloudDeploymentPayload) => {
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

  ipcMain.handle(
    'rosettaCloud:getSecrets',
    async (_event, projectId: string) => {
      return RosettaCloudService.getSecrets(projectId);
    },
  );

  ipcMain.handle(
    'rosettaCloud:deleteSecret',
    async (_event, projectId: string, secretId: string) => {
      return RosettaCloudService.deleteSecret(projectId, secretId);
    },
  );
};

export default registerRosettaCloudIpcHandlers;
