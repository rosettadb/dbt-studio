/* eslint-disable class-methods-use-this */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

class AuthService {
  async login(): Promise<void> {
    await window.electron.ipcRenderer.invoke('auth:login');
  }

  async logout(): Promise<void> {
    await window.electron.ipcRenderer.invoke('auth:logout');
  }

  async getToken(): Promise<string | null> {
    return window.electron.ipcRenderer.invoke('auth:getToken');
  }

  async getUser(): Promise<User | null> {
    return window.electron.ipcRenderer.invoke('auth:getUser');
  }

  async isAuthenticated(): Promise<boolean> {
    return window.electron.ipcRenderer.invoke('auth:isAuthenticated');
  }

  async validateToken(): Promise<boolean> {
    return window.electron.ipcRenderer.invoke('auth:validateToken');
  }

  onAuthCode(
    callback: (data: { userCode: string; verificationUrl: string }) => void,
  ): void {
    window.electron.ipcRenderer.on('auth:code', (_event, data: any) =>
      callback(data),
    );
  }

  onAuthSuccess(callback: (user: User) => void): void {
    window.electron.ipcRenderer.on('auth:success', (_event, user: any) =>
      callback(user),
    );
  }

  onAuthError(callback: (error: string) => void): void {
    window.electron.ipcRenderer.on('auth:error', (_event, error: any) =>
      callback(error),
    );
  }

  removeAuthListeners(): void {
    window.electron.ipcRenderer.removeAllListeners('auth:code');
    window.electron.ipcRenderer.removeAllListeners('auth:success');
    window.electron.ipcRenderer.removeAllListeners('auth:error');
  }
}

export default new AuthService();
