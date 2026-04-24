import type {
  MCPFileConfig,
  MCPServerFileEntry,
  MCPServerWithStatus,
} from '../../types/backend';

export const listMCPServers = async (): Promise<MCPServerWithStatus[]> =>
  window.electron.ipcRenderer.invoke('mcp:servers:list');

export const connectMCPServer = async (
  serverId: string,
): Promise<{ ok: boolean; error?: string }> =>
  window.electron.ipcRenderer.invoke('mcp:server:connect', { serverId });

export const disconnectMCPServer = async (
  serverId: string,
): Promise<{ success: boolean }> =>
  window.electron.ipcRenderer.invoke('mcp:server:disconnect', { serverId });

export const listMCPServerTools = async (
  serverId: string,
): Promise<{ name: string; description: string }[]> =>
  window.electron.ipcRenderer.invoke('mcp:server:tools', { serverId });

export const loadMCPConfig = async (): Promise<MCPFileConfig> =>
  window.electron.ipcRenderer.invoke('mcp:config:load');

export const saveMCPConfig = async (config: MCPFileConfig): Promise<void> =>
  window.electron.ipcRenderer.invoke('mcp:config:save', config);

export const addMCPServer = async (
  id: string,
  entry: MCPServerFileEntry,
): Promise<MCPFileConfig> =>
  window.electron.ipcRenderer.invoke('mcp:server:add', { id, entry });

export const removeMCPServer = async (
  serverId: string,
): Promise<MCPFileConfig> =>
  window.electron.ipcRenderer.invoke('mcp:server:remove', { serverId });

export const toggleMCPServer = async (
  serverId: string,
  disabled: boolean,
): Promise<MCPFileConfig> =>
  window.electron.ipcRenderer.invoke('mcp:server:toggle', {
    serverId,
    disabled,
  });

export const getMCPConfigFilePath = async (): Promise<string> =>
  window.electron.ipcRenderer.invoke('mcp:config:file-path');
