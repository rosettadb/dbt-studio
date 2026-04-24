import { ipcMain } from 'electron';
import { MCPClientManager } from '../services/ai/mcp/mcpClientManager';
import { MCPConfigService } from '../services/ai/mcp/mcpConfig.service';

const mcpChannels = [
  'mcp:servers:list',
  'mcp:server:connect',
  'mcp:server:disconnect',
  'mcp:server:tools',
  'mcp:config:load',
  'mcp:config:save',
  'mcp:server:add',
  'mcp:server:remove',
  'mcp:server:toggle',
  'mcp:config:file-path',
];

export const registerMCPHandlers = () => {
  mcpChannels.forEach((ch) => ipcMain.removeHandler(ch));

  ipcMain.handle('mcp:servers:list', () =>
    MCPClientManager.listServersWithStatus(),
  );

  ipcMain.handle(
    'mcp:server:connect',
    (_, { serverId }: { serverId: string }) =>
      MCPClientManager.connectServer(serverId),
  );

  ipcMain.handle(
    'mcp:server:disconnect',
    async (_, { serverId }: { serverId: string }) => {
      await MCPClientManager.disconnectServer(serverId);
      return { success: true };
    },
  );

  ipcMain.handle(
    'mcp:server:tools',
    async (_, { serverId }: { serverId: string }) => {
      const tools = await MCPClientManager.getTools(serverId);
      return Object.entries(tools).map(([name, tool]: [string, any]) => ({
        name,
        description: tool.description ?? '',
      }));
    },
  );

  ipcMain.handle('mcp:config:load', () => MCPConfigService.load());

  ipcMain.handle('mcp:config:save', (_, config) =>
    MCPConfigService.save(config),
  );

  ipcMain.handle('mcp:server:add', (_, { id, entry }) =>
    MCPConfigService.addServer(id, entry),
  );

  ipcMain.handle(
    'mcp:server:remove',
    async (_, { serverId }: { serverId: string }) => {
      await MCPClientManager.disconnectServer(serverId);
      return MCPConfigService.removeServer(serverId);
    },
  );

  ipcMain.handle(
    'mcp:server:toggle',
    async (
      _,
      { serverId, disabled }: { serverId: string; disabled: boolean },
    ) => {
      if (disabled) await MCPClientManager.disconnectServer(serverId);
      return MCPConfigService.toggleServer(serverId, disabled);
    },
  );

  ipcMain.handle('mcp:config:file-path', () => MCPConfigService.getFilePath());
};
