import { client } from '../config/client';

export type AuthSuccessPayload = {
  token: string;
};

const openLogin = async (): Promise<string> => {
  const { data } = await client.post<undefined, string>(
    'auth:login',
    undefined,
  );
  return data;
};

const getToken = async (): Promise<string | null> => {
  const { data } = await client.get<string | null>('auth:getToken');
  return data;
};

const logout = async (): Promise<void> => {
  await client.post<undefined, void>('auth:logout', undefined);
};

const storeToken = async (token: string): Promise<void> => {
  await client.post<string, void>('auth:storeToken', token);
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

  window.electron.ipcRenderer.on('auth:success', listener);

  return () => {
    window.electron.ipcRenderer.removeListener('auth:success', listener);
  };
};

const subscribeToAuthError = (callback: (message: string) => void) => {
  const listener: (...args: unknown[]) => void = (_event, payload) => {
    const { error } = (payload ?? {}) as { error?: string };
    callback(error ?? 'Authentication failed.');
  };

  window.electron.ipcRenderer.on('auth:error', listener);

  return () => {
    window.electron.ipcRenderer.removeListener('auth:error', listener);
  };
};

const subscribeToTokenUpdate = (callback: () => void) => {
  const listener: (...args: unknown[]) => void = () => {
    callback();
  };

  window.electron.ipcRenderer.on('auth:token-updated', listener);

  return () => {
    window.electron.ipcRenderer.removeListener('auth:token-updated', listener);
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
