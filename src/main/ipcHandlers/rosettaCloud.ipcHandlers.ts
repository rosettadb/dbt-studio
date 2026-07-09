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

  ipcMain.handle('rosettaCloud:getApiKey', async () => {
    return RosettaCloudService.getApiKey();
  });

  ipcMain.handle('rosettaCloud:logout', async () => {
    await RosettaCloudService.clearApiKey();
  });

  ipcMain.handle('rosettaCloud:storeApiKey', async (_event, apiKey: string) => {
    await RosettaCloudService.storeApiKey(apiKey);
  });

  ipcMain.handle(
    'rosettaCloud:validateApiKey',
    async (_event, apiKey: string) => {
      return RosettaCloudService.validateApiKey(apiKey);
    },
  );

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

  ipcMain.handle(
    'rosettaCloud:findActionForPipeline',
    async (_event, payload: { projectId: string; pipelineFile: string }) => {
      return RosettaCloudService.findActionForPipeline(
        payload.projectId,
        payload.pipelineFile,
      );
    },
  );

  ipcMain.handle(
    'rosettaCloud:getActionStatus',
    async (_event, actionId: string) => {
      return RosettaCloudService.getActionStatus(actionId);
    },
  );

  ipcMain.handle(
    'rosettaCloud:getActionLogs',
    async (_event, actionId: string) => {
      return RosettaCloudService.getActionLogs(actionId);
    },
  );
};

export default registerRosettaCloudIpcHandlers;
