export const checkForUpdates = async () => {
  return window.electron.ipcRenderer.invoke('updates:check');
};

export const checkForSettingsUpdates = async () => {
  return window.electron.ipcRenderer.invoke('updates:check-settings');
};

export const downloadUpdate = async () => {
  return window.electron.ipcRenderer.invoke('updates:download');
};

export const restartUpdate = async () => {
  return window.electron.ipcRenderer.invoke('updates:restart');
};

export const rejectUpdateVersion = async (version: string) => {
  return window.electron.ipcRenderer.invoke('updates:reject-version', version);
};
