import { shell, BrowserWindow } from 'electron';
import Store from 'electron-store';

interface DeviceAuthResponse {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
}

interface PollResponse {
  token?: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  pending?: boolean;
  error?: string;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export default class AuthService {
  private store: Store;

  private apiUrl: string;

  // eslint-disable-next-line no-undef
  private pollInterval: NodeJS.Timeout | null = null;

  private lastValidation: number = 0;

  private validationCache: boolean = false;

  private readonly VALIDATION_CACHE_DURATION = 5 * 60 * 1000;

  constructor() {
    this.store = new Store();
    this.apiUrl = process.env.API_URL || 'http://localhost:3000';
  }

  async authenticate(mainWindow: BrowserWindow): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/api/device/code`, {
        method: 'POST',
      });

      const data: DeviceAuthResponse = await response.json();
      const { deviceCode, userCode, verificationUrl } = data;

      mainWindow.webContents.send('auth:code', { userCode, verificationUrl });

      shell.openExternal(`${verificationUrl}?userCode=${userCode}`);

      this.pollInterval = setInterval(async () => {
        try {
          const pollResponse = await fetch(`${this.apiUrl}/api/device/poll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceCode }),
          });

          const pollData: PollResponse = await pollResponse.json();

          if (pollData.token) {
            this.clearPollInterval();
            this.store.set('authToken', pollData.token);
            this.store.set('user', pollData.user);
            this.validationCache = true;
            this.lastValidation = Date.now();
            mainWindow.webContents.send('auth:success', pollData.user);
          } else if (pollData.error) {
            this.clearPollInterval();
            mainWindow.webContents.send('auth:error', pollData.error);
          }
        } catch (error) {
          this.clearPollInterval();
          mainWindow.webContents.send('auth:error', 'Authentication failed');
        }
      }, 2000);

      setTimeout(() => {
        this.clearPollInterval();
        mainWindow.webContents.send('auth:error', 'Authentication timeout');
      }, 600000);
    } catch (error) {
      mainWindow.webContents.send(
        'auth:error',
        'Failed to start authentication',
      );
    }
  }

  private clearPollInterval(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async getAuthToken(): Promise<string | null> {
    const token = this.store.get('authToken') as string | null;
    if (!token) return null;

    const now = Date.now();
    if (
      now - this.lastValidation < this.VALIDATION_CACHE_DURATION &&
      this.validationCache
    ) {
      return token;
    }

    const isValid = await this.validateTokenWithServer(token);
    if (!isValid) {
      this.logout();
      return null;
    }

    this.validationCache = true;
    this.lastValidation = now;
    return token;
  }

  private async validateTokenWithServer(token: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/api/auth/validate`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  getUser(): User | null {
    return this.store.get('user') as User | null;
  }

  logout(): void {
    this.store.delete('authToken');
    this.store.delete('user');
    this.validationCache = false;
    this.lastValidation = 0;
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAuthToken();
    return !!token;
  }

  async validateToken(): Promise<boolean> {
    const token = this.store.get('authToken') as string | null;
    if (!token) return false;
    return this.validateTokenWithServer(token);
  }
}
