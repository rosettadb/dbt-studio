import { IcebergDatalakeService } from '../../../../src/main/services/icebergDatalake.service';
import secureStorage from '../../../../src/main/services/secureStorage.service';
import {
  loadDatabaseFile,
  updateDatabase,
} from '../../../../src/main/utils/fileHelper';

jest.mock('../../../../src/main/utils/fileHelper', () => ({
  loadDatabaseFile: jest.fn(),
  updateDatabase: jest.fn(),
}));

jest.mock('../../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: {
    setCredential: jest.fn(),
    getCredential: jest.fn(),
    deleteCredential: jest.fn(),
  },
}));

jest.mock('../../../../src/main/services/settings.service', () => ({
  __esModule: true,
  default: { loadSettings: jest.fn() },
}));

const mockedLoadDatabase = loadDatabaseFile as jest.Mock;
const mockedUpdateDatabase = updateDatabase as jest.Mock;
const mockedSecureStorage = secureStorage as jest.Mocked<typeof secureStorage>;

describe('IcebergDatalakeService compatibility and secret persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadDatabase.mockResolvedValue({ icebergInstances: [] });
    mockedUpdateDatabase.mockResolvedValue(undefined);
    mockedSecureStorage.setCredential.mockResolvedValue(undefined);
  });

  it('omits Hadoop while exposing modern catalog capabilities', () => {
    const capabilities = IcebergDatalakeService.getCapabilities();

    expect(capabilities.catalogs.map(({ type }) => type)).not.toContain(
      'hadoop',
    );
    expect(
      capabilities.catalogs.find(({ type }) => type === 'polaris'),
    ).toMatchObject({
      enabled: true,
      authModes: expect.arrayContaining(['oauth-client-credentials']),
    });
    expect(
      capabilities.catalogs.find(({ type }) => type === 'lakekeeper'),
    ).toMatchObject({
      enabled: true,
      pyicebergType: 'rest',
      requiredFields: ['endpoint', 'catalogName'],
      allowedStorageTypes: ['server-managed'],
    });
    expect(
      capabilities.catalogs.find(({ type }) => type === 'nessie'),
    ).toMatchObject({
      enabled: true,
      pyicebergType: 'rest',
      requiredFields: ['endpoint', 'nessieReference'],
      allowedStorageTypes: ['server-managed'],
    });
    expect(
      capabilities.catalogs.find(({ type }) => type === 'hive'),
    ).toMatchObject({
      enabled: true,
      pyicebergType: 'hive',
      requiredFields: ['hiveUri'],
      allowedStorageTypes: ['local'],
    });
    (
      [
        'glue',
        'biglake',
        'onelake',
        'unity',
        'snowflake',
        'cloudflare',
      ] as const
    ).forEach((type) => {
      expect(
        capabilities.catalogs.find((catalog) => catalog.type === type),
      ).toMatchObject({
        enabled: false,
        disabledReason: 'Available by request through a GitHub issue.',
        allowedStorageTypes: [],
      });
    });
  });

  it('rejects invalid OAuth configuration before bridge execution', () => {
    const validate = (IcebergDatalakeService as any)
      .validateCatalogAuthentication as (config: unknown) => void;

    expect(() =>
      validate({
        catalogType: 'polaris',
        catalogAuthMode: 'oauth-client-credentials',
        oauthClientId: 'root',
        oauthClientSecret: 'secret',
      }),
    ).toThrow('ICEBERG_OAUTH_SERVER_URI_REQUIRED');
    expect(() =>
      validate({
        catalogType: 'polaris',
        catalogAuthMode: 'oauth-client-credentials',
        oauthClientId: 'invalid:id',
        oauthClientSecret: 'secret',
        oauthServerUri: 'http://localhost/oauth/tokens',
      }),
    ).toThrow('ICEBERG_OAUTH_CLIENT_ID_INVALID');
  });

  it('stores the OAuth secret in keytar and excludes it from database persistence', async () => {
    const created = await IcebergDatalakeService.createInstance({
      name: 'polaris-test',
      catalogType: 'polaris',
      endpoint: 'http://localhost:8181/api/catalog',
      catalogName: 'quickstart_catalog',
      catalogAuthMode: 'oauth-client-credentials',
      oauthClientId: 'root',
      oauthClientSecret: 'top-secret',
      oauthServerUri: 'http://localhost:8181/api/catalog/v1/oauth/tokens',
      oauthScope: 'PRINCIPAL_ROLE:ALL',
      storageType: 'server-managed',
    });

    expect(mockedSecureStorage.setCredential).toHaveBeenCalledWith(
      `iceberg-oauth-secret-${created.id}`,
      'top-secret',
    );
    const persisted = mockedUpdateDatabase.mock.calls[0][1][0];
    expect(persisted.oauthClientSecret).toBeUndefined();
    expect(JSON.stringify(persisted)).not.toContain('top-secret');
    expect(persisted.oauthClientSecretKey).toBe(
      `iceberg-oauth-secret-${created.id}`,
    );
  });

  it('persists Lakekeeper without client or vended storage credentials', async () => {
    const created = await IcebergDatalakeService.createInstance({
      name: 'lakekeeper-test',
      catalogType: 'lakekeeper',
      endpoint: 'http://localhost:8181/catalog',
      catalogName: 'minio-warehouse',
      catalogAuthMode: 'none',
      storageType: 'server-managed',
    });

    const persisted = mockedUpdateDatabase.mock.calls[0][1][0];
    expect(persisted).toMatchObject({
      id: created.id,
      catalogType: 'lakekeeper',
      endpoint: 'http://localhost:8181/catalog',
      catalogName: 'minio-warehouse',
      storageType: 'server-managed',
    });
    expect(persisted.storageConnectionId).toBeUndefined();
    expect(persisted.catalogAccessTokenKey).toBeUndefined();
    expect(persisted.oauthClientSecretKey).toBeUndefined();
    expect(JSON.stringify(persisted)).not.toMatch(
      /access.?key|secret.?access|session.?token/i,
    );
  });

  it('redacts OAuth and database secrets from bridge errors', () => {
    const redact = (IcebergDatalakeService as any).redactBridgeSecrets as (
      message: string,
      env: Record<string, string>,
    ) => string;
    const message = redact(
      'OAuth top-secret failed; URI postgresql+psycopg2://user:db-secret@host/db',
      {
        ICEBERG_OAUTH_CREDENTIAL: 'client-id:top-secret',
        ICEBERG_SQL_CATALOG_URI: 'postgresql+psycopg2://user:db-secret@host/db',
      },
    );

    expect(message).not.toContain('top-secret');
    expect(message).not.toContain('db-secret');
    expect(message).toContain('[REDACTED]');
  });

  it('builds the Nessie Iceberg REST URI from reference and warehouse', () => {
    const buildUri = (IcebergDatalakeService as any).buildNessieRestUri as (
      config: unknown,
    ) => string;

    expect(
      buildUri({
        endpoint: 'http://localhost:19120/iceberg/',
        nessieReference: 'main',
      }),
    ).toBe('http://localhost:19120/iceberg/main');
    expect(
      buildUri({
        endpoint: 'http://localhost:19120/iceberg',
        nessieReference: 'experiments',
        nessieWarehouse: 'sales',
      }),
    ).toBe('http://localhost:19120/iceberg/experiments|sales');
  });

  it('rejects the native Nessie API when Iceberg REST is required', () => {
    const validate = (IcebergDatalakeService as any)
      .validateCatalogWarehousePair as (config: unknown) => void;

    expect(() =>
      validate({
        catalogType: 'nessie',
        endpoint: 'http://localhost:19120/api/v2',
        nessieReference: 'main',
        storageType: 'server-managed',
      }),
    ).toThrow('ICEBERG_NESSIE_ICEBERG_REST_ENDPOINT_REQUIRED');
  });

  it('configures Nessie REST with server-managed remote signing', async () => {
    const buildProperties = (IcebergDatalakeService as any)
      .buildCatalogProperties as (config: unknown) => Promise<{
      props: Record<string, string>;
      env: Record<string, string>;
    }>;

    const result = await buildProperties({
      catalogType: 'nessie',
      endpoint: 'http://localhost:19120/iceberg',
      nessieReference: 'main',
      nessieWarehouse: 'warehouse',
      catalogAuthMode: 'none',
      storageType: 'server-managed',
    });

    expect(result).toEqual({
      props: {
        type: 'rest',
        uri: 'http://localhost:19120/iceberg/main|warehouse',
        'header.X-Iceberg-Access-Delegation': 'remote-signing',
      },
      env: {},
    });
  });

  it('configures Lakekeeper REST with server-managed remote signing', async () => {
    const buildProperties = (IcebergDatalakeService as any)
      .buildCatalogProperties as (config: unknown) => Promise<{
      props: Record<string, string>;
      env: Record<string, string>;
    }>;

    const result = await buildProperties({
      catalogType: 'lakekeeper',
      endpoint: 'http://localhost:8181/catalog',
      catalogName: 'minio-warehouse',
      catalogAuthMode: 'none',
      storageType: 'server-managed',
    });

    expect(result).toEqual({
      props: {
        type: 'rest',
        uri: 'http://localhost:8181/catalog',
        warehouse: 'minio-warehouse',
        'header.X-Iceberg-Access-Delegation': 'remote-signing',
      },
      env: {},
    });
  });

  it('rejects managed catalog placeholders before Python executes', () => {
    const validate = (IcebergDatalakeService as any)
      .validateCatalogWarehousePair as (config: unknown) => void;

    (
      [
        'glue',
        'biglake',
        'onelake',
        'unity',
        'snowflake',
        'cloudflare',
      ] as const
    ).forEach((catalogType) => {
      expect(() =>
        validate({ catalogType, storageType: 'server-managed' }),
      ).toThrow(`ICEBERG_CATALOG_NOT_ENABLED: ${catalogType}`);
    });
  });

  it('validates Hive Thrift URIs and optional UGI identity', () => {
    const validate = (IcebergDatalakeService as any)
      .validateCatalogWarehousePair as (config: unknown) => void;

    expect(() =>
      validate({
        catalogType: 'hive',
        hiveUri: 'http://localhost:9083',
        storageType: 'local',
        localPath: '/tmp/hive-warehouse',
      }),
    ).toThrow('ICEBERG_HIVE_URI_INVALID');
    expect(() =>
      validate({
        catalogType: 'hive',
        hiveUri: 'thrift://localhost:9083',
        hiveUgi: 'invalid',
        storageType: 'local',
        localPath: '/tmp/hive-warehouse',
      }),
    ).toThrow('ICEBERG_HIVE_UGI_INVALID');
  });

  it('builds native Hive catalog properties independently from storage', async () => {
    const buildProperties = (IcebergDatalakeService as any)
      .buildCatalogProperties as (config: unknown) => Promise<{
      props: Record<string, string>;
      env: Record<string, string>;
    }>;

    const result = await buildProperties({
      catalogType: 'hive',
      hiveUri: 'thrift://localhost:9083',
      hiveUgi: 'dbt:analytics',
      storageType: 'local',
      localPath: '/tmp/hive-warehouse',
    });

    expect(result).toEqual({
      props: {
        type: 'hive',
        uri: 'thrift://localhost:9083',
        ugi: 'dbt:analytics',
        warehouse: 'file:///tmp/hive-warehouse',
      },
      env: {},
    });
  });

  it('rejects unverified Hive cloud warehouses before Python executes', () => {
    const validate = (IcebergDatalakeService as any)
      .validateCatalogWarehousePair as (config: unknown) => void;

    expect(() =>
      validate({
        catalogType: 'hive',
        hiveUri: 'thrift://localhost:9083',
        storageType: 'cloud',
        storageConnectionId: 'minio',
        storageBucket: 'iceberg-hive',
      }),
    ).toThrow('ICEBERG_WAREHOUSE_NOT_ALLOWED: hive/cloud');
  });
});
