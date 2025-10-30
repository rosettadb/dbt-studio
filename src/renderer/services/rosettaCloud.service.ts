import { client } from '../config/client';
import { CloudDeploymentPayload, Secret } from '../../types/backend';

export type AuthSuccessPayload = {
  token: string;
};

export const openLogin = async (): Promise<string> => {
  const { data } = await client.post<undefined, string>(
    'rosettaCloud:login',
    undefined,
  );
  return data;
};

export const getToken = async (): Promise<string | null> => {
  const { data } = await client.get<string | null>('rosettaCloud:getToken');
  return data;
};

export const logout = async (): Promise<void> => {
  await client.post<undefined, void>('rosettaCloud:logout', undefined);
};

export const storeToken = async (token: string): Promise<void> => {
  await client.post<string, void>('rosettaCloud:storeToken', token);
};

export const subscribeToAuthSuccess = (
  callback: (payload: AuthSuccessPayload) => void,
) => {
  const listener: (...args: unknown[]) => void = (_event, payload) => {
    const data = (payload ?? {}) as Partial<AuthSuccessPayload>;
    if (!data.token) {
      return;
    }
    callback({ token: data.token });
  };

  window.electron.ipcRenderer.on('rosettaCloud:authSuccess', listener);

  return () => {
    window.electron.ipcRenderer.removeListener(
      'rosettaCloud:authSuccess',
      listener,
    );
  };
};

export const subscribeToAuthError = (callback: (message: string) => void) => {
  const listener: (...args: unknown[]) => void = (_event, payload) => {
    const { error } = (payload ?? {}) as { error?: string };
    callback(error ?? 'Authentication failed.');
  };

  window.electron.ipcRenderer.on('rosettaCloud:authError', listener);

  return () => {
    window.electron.ipcRenderer.removeListener(
      'rosettaCloud:authError',
      listener,
    );
  };
};

export const subscribeToTokenUpdate = (callback: () => void) => {
  const listener: (...args: unknown[]) => void = () => {
    callback();
  };

  window.electron.ipcRenderer.on('rosettaCloud:authTokenUpdated', listener);

  return () => {
    window.electron.ipcRenderer.removeListener(
      'rosettaCloud:authTokenUpdated',
      listener,
    );
  };
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
