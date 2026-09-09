import ConnectorsService from '../../../../../src/main/services/connectors.service';
import DuckLakeService from '../../../../../src/main/services/duckLake.service';
import { IcebergDatalakeService } from '../../../../../src/main/services/icebergDatalake.service';
import AgentService from '../../../../../src/main/services/agent.service';
import { createStudioConnectionsTools } from '../../../../../src/main/services/ai/tools/studio/connections.tools';
import { createStudioSqlTools } from '../../../../../src/main/services/ai/tools/studio/sql.tools';

jest.mock('ai', () => ({
  tool: (definition: unknown) => definition,
}));

jest.mock('../../../../../src/main/services/connectors.service', () => ({
  __esModule: true,
  default: {
    loadConnections: jest.fn(),
    extractSchemaFromConnection: jest.fn(),
  },
}));

jest.mock('../../../../../src/main/services/duckLake.service', () => ({
  __esModule: true,
  default: { listInstances: jest.fn() },
}));

jest.mock('../../../../../src/main/services/icebergDatalake.service', () => ({
  IcebergDatalakeService: {
    listInstances: jest.fn(),
    getSqlSchema: jest.fn(),
  },
}));

jest.mock('../../../../../src/main/services/agent.service', () => ({
  __esModule: true,
  default: { getAgentContext: jest.fn() },
}));

jest.mock(
  '../../../../../src/main/services/ai/agentEditorBridge.service',
  () => ({
    AgentEditorBridgeService: { recordQueryFired: jest.fn() },
  }),
);

jest.mock('../../../../../src/main/services/ai/tools/toolRegistry', () => ({
  isToolEnabled: jest.fn(() => true),
}));

jest.mock(
  '../../../../../src/main/services/ai/tools/terminalConfirmGate',
  () => ({
    TerminalConfirmGate: { request: jest.fn() },
  }),
);

describe('Iceberg AI connection tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (DuckLakeService.listInstances as jest.Mock).mockResolvedValue([]);
  });

  it('lists only SQL-verified Iceberg instances as Iceberg connections', async () => {
    (IcebergDatalakeService.listInstances as jest.Mock).mockResolvedValue([
      {
        id: 'verified',
        name: 'Lakekeeper',
        catalogType: 'lakekeeper',
        sqlAvailable: true,
      },
      {
        id: 'unverified',
        name: 'Unverified catalog',
        catalogType: 'rest',
        sqlAvailable: false,
      },
    ]);

    const tools = createStudioConnectionsTools() as any;
    const result = await tools.studio_connections_list.execute({
      includeDatabases: false,
      includeHealth: false,
    });

    expect(result.data.connections).toEqual([
      {
        id: 'iceberg-verified',
        name: 'Lakekeeper',
        type: 'iceberg (lakekeeper)',
        kind: 'iceberg',
        health: 'healthy',
      },
    ]);
    expect(ConnectorsService.loadConnections).not.toHaveBeenCalled();
  });

  it('routes Iceberg schema extraction without calling the database resolver', async () => {
    (AgentService.getAgentContext as jest.Mock).mockReturnValue({
      connectionId: 'iceberg-verified',
    });
    (IcebergDatalakeService.getSqlSchema as jest.Mock).mockResolvedValue({
      catalogName: 'iceberg',
      namespaces: [
        {
          name: 'sales',
          tables: [
            {
              name: 'orders',
              type: 'TABLE',
              columns: [{ name: 'id', type: 'BIGINT', position: 1 }],
            },
          ],
        },
      ],
    });

    const tools = createStudioSqlTools(12) as any;
    const result = await tools.studio_sql_schema_extract.execute({});

    expect(IcebergDatalakeService.getSqlSchema).toHaveBeenCalledWith(
      'verified',
    );
    expect(
      ConnectorsService.extractSchemaFromConnection,
    ).not.toHaveBeenCalled();
    expect(result.data.tables).toEqual([
      {
        name: 'orders',
        schema: 'sales',
        type: 'TABLE',
        columns: [{ name: 'id', type: 'BIGINT', position: 1 }],
      },
    ]);
  });
});
