import { buildMCPToolset } from '../../../../../../src/main/services/ai/mcp/mcpToolAdapter';
import { MCPClientManager } from '../../../../../../src/main/services/ai/mcp/mcpClientManager';

jest.mock(
  '../../../../../../src/main/services/ai/mcp/mcpClientManager',
  () => ({
    MCPClientManager: {
      listConnected: jest.fn(),
      isConnected: jest.fn(),
      getTools: jest.fn(),
    },
  }),
);

describe('buildMCPToolset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses every connected MCP server when no server list is provided', async () => {
    (MCPClientManager.listConnected as jest.Mock).mockReturnValue([
      'dbt-core',
      'duckdb',
      'ducklake',
    ]);
    (MCPClientManager.getTools as jest.Mock).mockImplementation(
      async (serverId: string) => ({
        [`${serverId}_search`]: { description: `${serverId} search` },
      }),
    );

    const tools = await buildMCPToolset();

    expect(MCPClientManager.listConnected).toHaveBeenCalled();
    expect(MCPClientManager.getTools).toHaveBeenCalledWith('dbt-core');
    expect(MCPClientManager.getTools).toHaveBeenCalledWith('duckdb');
    expect(MCPClientManager.getTools).toHaveBeenCalledWith('ducklake');
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        'dbt-core_search',
        'duckdb_search',
        'ducklake_search',
      ]),
    );
  });

  it('still supports an explicit server allow-list', async () => {
    (MCPClientManager.isConnected as jest.Mock).mockImplementation(
      (serverId: string) => serverId === 'duckdb',
    );
    (MCPClientManager.getTools as jest.Mock).mockResolvedValue({
      duckdb_search: { description: 'DuckDB search' },
    });

    const tools = await buildMCPToolset(['dbt-core', 'duckdb']);

    expect(MCPClientManager.listConnected).not.toHaveBeenCalled();
    expect(MCPClientManager.getTools).toHaveBeenCalledTimes(1);
    expect(MCPClientManager.getTools).toHaveBeenCalledWith('duckdb');
    expect(Object.keys(tools)).toEqual(['duckdb_search']);
  });
});
