import { createMCPClient } from '@ai-sdk/mcp';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import SettingsService from '../../settings.service';
import { MCPConfigService } from './mcpConfig.service';
import type { MCPServerWithStatus } from '../../../../types/backend';

type MCPClientInstance = Awaited<ReturnType<typeof createMCPClient>>;

export class MCPClientManager {
  // Long-lived clients — kept open across agent requests, closed on app quit
  private static clients: Map<string, MCPClientInstance> = new Map();

  static async connectServer(
    serverId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (MCPClientManager.clients.has(serverId)) {
      return { ok: true };
    }

    const config = await MCPConfigService.load();
    const entry = config.mcpServers[serverId];
    if (!entry) return { ok: false, error: `Unknown MCP server: ${serverId}` };
    if (entry.disabled)
      return { ok: false, error: `Server ${serverId} is disabled` };

    try {
      let client: MCPClientInstance;

      if (entry.transport === 'stdio') {
        let command = entry.command ?? 'npx';
        const settings = await SettingsService.loadSettings();

        // Only override command for rosetta stdio server
        if (serverId === 'rosetta' && settings.rosettaPath) {
          command = settings.rosettaPath;
        }

        // eslint-disable-next-line no-console
        console.log(
          `[MCPClientManager] Spawning ${serverId}: ${command} ${(entry.args ?? []).join(' ')}`,
        );

        const transport = new StdioClientTransport({
          command,
          args: entry.args ?? [],
          env: Object.fromEntries(
            Object.entries({ ...process.env, ...entry.env }).filter(
              (pair): pair is [string, string] => pair[1] !== undefined,
            ),
          ),
        });
        client = await createMCPClient({ transport });
      } else {
        client = await createMCPClient({
          transport: {
            type: entry.transport as any,
            url: entry.url!,
            ...(entry.headers ? { headers: entry.headers } : {}),
          },
        });
      }

      MCPClientManager.clients.set(serverId, client);
      return { ok: true };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[MCPClientManager] Failed to connect ${serverId}:`, error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async getTools(serverId: string): Promise<Record<string, any>> {
    const client = MCPClientManager.clients.get(serverId);
    if (!client) throw new Error(`MCP server not connected: ${serverId}`);
    return client.tools();
  }

  static async listServersWithStatus(): Promise<MCPServerWithStatus[]> {
    const config = await MCPConfigService.load();
    return Object.entries(config.mcpServers).map(([id, entry]) => ({
      id,
      ...entry,
      connected: MCPClientManager.clients.has(id),
      isBuiltIn: MCPConfigService.isBuiltIn(id),
    }));
  }

  static listConnected(): string[] {
    return Array.from(MCPClientManager.clients.keys());
  }

  static isConnected(serverId: string): boolean {
    return MCPClientManager.clients.has(serverId);
  }

  static async disconnectServer(serverId: string): Promise<void> {
    const client = MCPClientManager.clients.get(serverId);
    if (client) {
      try {
        await client.close();
      } catch (_e) {
        // Ignored
      }
      MCPClientManager.clients.delete(serverId);
    }
  }

  static async disconnectAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(MCPClientManager.clients.keys()).map((id) =>
        MCPClientManager.disconnectServer(id),
      ),
    );
  }
}
