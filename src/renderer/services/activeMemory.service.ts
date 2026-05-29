import { AgentMemoryDiagnostic } from '../../types/agentMemory';

export const listActiveMemoryDiagnostics = (
  limit?: number,
): Promise<AgentMemoryDiagnostic[]> =>
  window.electron.ipcRenderer.invoke('active-memory:diagnostics:list', limit);

export const clearActiveMemoryDiagnostics = (): Promise<void> =>
  window.electron.ipcRenderer.invoke('active-memory:diagnostics:clear');

export const subscribeActiveMemoryStatus = (
  callback: (status: any) => void,
) => {
  const channel = 'active-memory:status';
  window.electron.ipcRenderer.on(channel, callback);
  return () => window.electron.ipcRenderer.removeListener(channel, callback);
};
