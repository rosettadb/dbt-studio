import connectionIcons from '../../../assets/connectionIcons';
import {
  FabricSparkConnection,
  SUPPORTED_CONNECTION_TYPES,
} from '../../../src/types/backend';
import {
  CONNECTION_DEFINITIONS,
  getConnectionCapabilities,
  getConnectionDisplayName,
  isSupportedConnectionType,
} from '../../../src/shared/connections/connectionCapabilities';
import { getConnectionTypeColor } from '../../../src/renderer/utils/connectionPresentation';

describe('connection capabilities', () => {
  it('defines metadata for every supported connection type', () => {
    expect(Object.keys(CONNECTION_DEFINITIONS).sort()).toEqual(
      [...SUPPORTED_CONNECTION_TYPES].sort(),
    );

    SUPPORTED_CONNECTION_TYPES.forEach((type) => {
      expect(CONNECTION_DEFINITIONS[type]).toBeDefined();
      expect(getConnectionCapabilities(type)).toBeDefined();
    });
  });

  it('defines Microsoft Fabric native Studio support and dbt Core v1 policy', () => {
    expect(getConnectionCapabilities('fabricspark')).toEqual({
      dbt: true,
      directQuery: true,
      schemaExtraction: true,
      rosettaJdbc: false,
      sqlEditor: true,
      sqlNotebook: true,
      dbtCoreV2: false,
    });
  });

  it('provides the Fabric display name, icon, and presentation color', () => {
    expect(getConnectionDisplayName('fabricspark')).toBe(
      'Microsoft Fabric Lakehouse',
    );
    expect(connectionIcons.images.fabricspark).toBeDefined();
    expect(getConnectionTypeColor('fabricspark')).toBe('#0078d4');
  });

  it('rejects unknown runtime connection types without inventing metadata', () => {
    expect(isSupportedConnectionType('future-adapter')).toBe(false);
    expect(getConnectionDisplayName('future-adapter')).toBe(
      'Unknown connection',
    );
    expect(getConnectionTypeColor('future-adapter')).toBe('#666');
  });
});

describe('FabricSparkConnection type contract', () => {
  const cliConnection: FabricSparkConnection = {
    type: 'fabricspark',
    name: 'Fabric CLI',
    endpoint: 'https://api.fabric.microsoft.com/v1',
    workspaceId: '11111111-1111-1111-1111-111111111111',
    lakehouseId: '22222222-2222-2222-2222-222222222222',
    lakehouse: 'analytics',
    schemaMode: 'non-schema',
    schema: 'analytics',
    authentication: 'CLI',
    threads: 1,
    reuseSession: true,
  };

  const spnConnection: FabricSparkConnection = {
    ...cliConnection,
    name: 'Fabric SPN',
    schemaMode: 'schema-enabled',
    schema: 'dbo',
    authentication: 'SPN',
    clientId: '33333333-3333-3333-3333-333333333333',
    tenantId: '44444444-4444-4444-4444-444444444444',
    hasClientSecret: true,
  };

  it('represents CLI and SPN without persisted secret material', () => {
    expect(cliConnection.authentication).toBe('CLI');
    expect(spnConnection.authentication).toBe('SPN');
    expect(spnConnection).not.toHaveProperty('clientSecret');
  });

  it('keeps unsupported auth, schema modes, and secret fields out of the type', () => {
    const invalidAuth: FabricSparkConnection = {
      ...cliConnection,
      // @ts-expect-error Raw-token authentication is intentionally unsupported.
      authentication: 'TOKEN',
    };
    const invalidSchemaMode: FabricSparkConnection = {
      ...cliConnection,
      // @ts-expect-error Only documented Lakehouse schema modes are accepted.
      schemaMode: 'automatic',
    };
    const invalidSecret: FabricSparkConnection = {
      ...spnConnection,
      // @ts-expect-error Persisted connection models must not contain secrets.
      clientSecret: 'must-not-persist',
    };

    expect(invalidAuth.authentication).toBe('TOKEN');
    expect(invalidSchemaMode.schemaMode).toBe('automatic');
    expect(invalidSecret).toHaveProperty('clientSecret');
  });
});
