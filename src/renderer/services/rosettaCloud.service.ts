import { client } from '../config/client';
import { CloudDeploymentPayload, Secret } from '../../types/backend';
import { AuthSuccessPayload, AuthErrorPayload } from '../../types/apiKey';
import { CloudLogEntry, CloudPipelineData } from '../../types/cloudAction';

export const openLogin = async (): Promise<string> => {
  const { data } = await client.post<undefined, string>(
    'rosettaCloud:login',
    undefined,
  );
  return data;
};

export const getApiKey = async (): Promise<string | null> => {
  const { data } = await client.get<string | null>('rosettaCloud:getApiKey');
  return data;
};

export const logout = async (): Promise<void> => {
  await client.post<undefined, void>('rosettaCloud:logout', undefined);
};

export const storeApiKey = async (apiKey: string): Promise<void> => {
  await client.post<string, void>('rosettaCloud:storeApiKey', apiKey);
};

export const validateApiKey = async (
  apiKey: string,
): Promise<{ valid: boolean; error?: string }> => {
  const { data } = await client.post<
    string,
    { valid: boolean; error?: string }
  >('rosettaCloud:validateApiKey', apiKey);
  return data;
};

export const subscribeToAuthSuccess = (
  callback: (payload: AuthSuccessPayload) => void,
) => {
  const listener: (...args: unknown[]) => void = (payload) => {
    const data = (payload ?? {}) as Partial<AuthSuccessPayload>;
    if (!data.apiKey) {
      return;
    }
    callback({ apiKey: data.apiKey });
  };

  return window.electron.ipcRenderer.on('rosettaCloud:authSuccess', listener);
};

export const subscribeToAuthError = (
  callback: (payload: AuthErrorPayload) => void,
) => {
  const listener: (...args: unknown[]) => void = (payload) => {
    const data = (payload ?? {}) as Partial<AuthErrorPayload>;
    callback({ error: data.error ?? 'Authentication failed.' });
  };

  return window.electron.ipcRenderer.on('rosettaCloud:authError', listener);
};

export const subscribeToApiKeyUpdate = (callback: () => void) => {
  const listener: (...args: unknown[]) => void = () => {
    callback();
  };

  return window.electron.ipcRenderer.on('rosettaCloud:apiKeyUpdated', listener);
};

export const pushProjectToCloud = async (
  body: CloudDeploymentPayload,
): Promise<void> => {
  await client.post<CloudDeploymentPayload, void>('rosettaCloud:push', body);
};

export const getSecrets = async (projectId: string): Promise<Secret[]> => {
  const { data } = await client.post<string, Secret[]>(
    'rosettaCloud:getSecrets',
    projectId,
  );
  return data;
};

export const deleteSecret = async (
  projectId: string,
  secretId: string,
): Promise<void> => {
  await client.post<{ projectId: string; secretId: string }, void>(
    'rosettaCloud:deleteSecret',
    { projectId, secretId },
  );
};

export const findActionForPipeline = async (
  projectId: string,
  pipelineFile: string,
): Promise<string | null> => {
  const { data } = await client.post<
    { projectId: string; pipelineFile: string },
    string | null
  >('rosettaCloud:findActionForPipeline', { projectId, pipelineFile });
  return data;
};

export const getActionStatus = async (
  actionId: string,
): Promise<CloudPipelineData | null> => {
  const { data } = await client.post<string, CloudPipelineData | null>(
    'rosettaCloud:getActionStatus',
    actionId,
  );
  return data;
};

export const getActionLogs = async (
  actionId: string,
): Promise<CloudLogEntry[]> => {
  const { data } = await client.post<string, CloudLogEntry[]>(
    'rosettaCloud:getActionLogs',
    actionId,
  );
  return data ?? [];
};
