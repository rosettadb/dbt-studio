import { buildFabricProfileOutput } from '../../../src/shared/connections/fabricConnection';
import { FabricSparkConnection } from '../../../src/types/backend';

const baseConnection: FabricSparkConnection = {
  type: 'fabricspark',
  name: 'Fabric',
  endpoint: 'https://api.fabric.microsoft.com/v1',
  workspaceId: '11111111-1111-1111-1111-111111111111',
  lakehouseId: '22222222-2222-2222-2222-222222222222',
  lakehouse: 'analytics',
  schemaMode: 'schema-enabled',
  schema: 'dbo',
  authentication: 'CLI',
  threads: 4,
  environmentId: 'environment-id',
  reuseSession: true,
  highConcurrency: false,
};

describe('Microsoft Fabric dbt profile mapping', () => {
  it('writes literal Fabric identifiers for CLI authentication', () => {
    const output = buildFabricProfileOutput(baseConnection);

    expect(output).toMatchObject({
      type: 'fabricspark',
      method: 'livy',
      endpoint: 'https://api.fabric.microsoft.com/v1',
      workspaceid: baseConnection.workspaceId,
      lakehouseid: baseConnection.lakehouseId,
      lakehouse: baseConnection.lakehouse,
      schema: baseConnection.schema,
      authentication: 'CLI',
      threads: 4,
      environmentId: 'environment-id',
      reuse_session: true,
      session_id_file: 'target/fabricspark-session-id',
      high_concurrency: false,
    });
    expect(output).not.toHaveProperty('client_secret');
  });

  it('writes literal service-principal fields when supplied by the main process', () => {
    const output = buildFabricProfileOutput(
      {
        ...baseConnection,
        authentication: 'SPN',
        clientId: 'client-id',
        tenantId: 'tenant-id',
        hasClientSecret: true,
      },
      'client-secret',
    );

    expect(output).toMatchObject({
      authentication: 'SPN',
      client_id: 'client-id',
      tenant_id: 'tenant-id',
      client_secret: 'client-secret',
    });
  });
});
