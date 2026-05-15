import { MCPClientManager } from './mcpClientManager';

/**
 * Builds a merged AI SDK toolset from one or more connected MCP servers.
 * Skips servers that are not currently connected (no error thrown).
 */
export async function buildMCPToolset(
  serverIds?: string[],
): Promise<Record<string, any>> {
  const connectedIds = serverIds
    ? serverIds.filter((id) => MCPClientManager.isConnected(id))
    : MCPClientManager.listConnected();

  const toolsets = await Promise.allSettled(
    connectedIds.map((id) => MCPClientManager.getTools(id)),
  );

  const merged: Record<string, any> = {};
  toolsets.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      Object.assign(merged, result.value);
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `[buildMCPToolset] Failed to get tools from ${connectedIds[i]}:`,
        result.reason,
      );
    }
  });

  return merged;
}
