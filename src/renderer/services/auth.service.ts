import { client } from '../config/client';

export type AuthSuccessPayload = {
  token: string;
};

const openLogin = async (): Promise<string> => {
  const { data } = await client.post<undefined, string>(
    'rosettaCloud:login',
    undefined,
  );
  return data;
};

const getToken = async (): Promise<string | null> => {
  const { data } = await client.get<string | null>('rosettaCloud:getToken');
  return data;
};

const logout = async (): Promise<void> => {
  await client.post<undefined, void>('rosettaCloud:logout', undefined);
};

const storeToken = async (token: string): Promise<void> => {
  await client.post<string, void>('rosettaCloud:storeToken', token);
};

const subscribeToAuthSuccess = (
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

const subscribeToAuthError = (callback: (message: string) => void) => {
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

const subscribeToTokenUpdate = (callback: () => void) => {
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

export const authService = {
  openLogin,
  getToken,
  logout,
  storeToken,
  subscribeToAuthSuccess,
  subscribeToAuthError,
  subscribeToTokenUpdate,
};

export default authService;
