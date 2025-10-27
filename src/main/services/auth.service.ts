import { shell } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import SecureStorageService from './secureStorage.service';
import { CloudDashboardUrl, CloudDashboardTokenKey } from '../utils/constants';
import { ProfileService } from './profile.service';

const openLogin = async (): Promise<string> => {
  const uuid = uuidv4();
  const authUrl = `${CloudDashboardUrl}/api/device-auth/start?uuid=${uuid}`;

  await shell.openExternal(authUrl);

  return uuid;
};

const storeToken = async (token: string): Promise<void> => {
  await SecureStorageService.setCredential(CloudDashboardTokenKey, token);
};

const getToken = async (): Promise<string | null> =>
  SecureStorageService.getCredential(CloudDashboardTokenKey);

const clearToken = async (): Promise<void> => {
  await SecureStorageService.deleteCredential(CloudDashboardTokenKey);

  // Clear profile cache when auth is cleared
  ProfileService.clearProfile();
};

const isAuthenticated = async (): Promise<boolean> => {
  const token = await getToken();
  return token !== null;
};

const AuthService = {
  openLogin,
  storeToken,
  getToken,
  clearToken,
  isAuthenticated,
};

export default AuthService;
