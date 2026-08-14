import { IcebergDatalakeService } from '../../../../src/main/services/icebergDatalake.service';
import secureStorage from '../../../../src/main/services/secureStorage.service';
import {
  loadDatabaseFile,
  updateDatabase,
} from '../../../../src/main/utils/fileHelper';

const mockRun = jest.fn();
const mockRunAndReadUntil = jest.fn();
const mockCloseConnection = jest.fn();
const mockCloseInstance = jest.fn();
const mockInterrupt = jest.fn();

jest.mock('@duckdb/node-api', () => ({
  DuckDBInstance: {
    create: jest.fn(async () => ({
      connect: jest.fn(async () => ({
        run: mockRun,
        runAndReadUntil: mockRunAndReadUntil,
        closeSync: mockCloseConnection,
        interrupt: mockInterrupt,
      })),
      closeSync: mockCloseInstance,
    })),
  },
  StatementType: {
    SELECT: 1,
    INSERT: 2,
    UPDATE: 3,
    DELETE: 5,
    CREATE: 7,
    DROP: 15,
  },
}));

jest.mock('../../../../src/main/utils/fileHelper', () => ({
  loadDatabaseFile: jest.fn(),
  updateDatabase: jest.fn(),
}));

jest.mock('../../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: {
    getCredential: jest.fn(),
    setCredential: jest.fn(),
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

const instance = {
  id: 'iceberg-instance',
  name: 'Lakekeeper',
  catalogType: 'lakekeeper' as const,
  endpoint: 'http://localhost:8181/catalog',
  catalogName: 'minio-warehouse',
  catalogAuthMode: 'oauth-client-credentials' as const,
  oauthClientId: 'lakekeeper',
  oauthClientSecretKey: 'iceberg-oauth-secret-iceberg-instance' as const,
  oauthServerUri:
    'http://localhost:8080/realms/lakekeeper/protocol/openid-connect/token',
  storageType: 'server-managed' as const,
  sqlEnabled: true,
  sqlStorageConnectionId: 'minio-connection',
  sqlStorageProvider: 'minio' as const,
  sqlStorageBucket: 'iceberg-warehouse',
  sqlWarehouseMatchAcknowledged: true,
  createdAt: '2026-08-14T00:00:00.000Z',
  updatedAt: '2026-08-14T00:00:00.000Z',
};

const database = {
  icebergInstances: [instance],
  sources: [
    {
      id: 'minio-connection',
      name: 'MinIO',
      provider: 'minio',
      config: {
        endpoint: 'http://localhost:9000',
        accessKeyId: 'minioadmin',
      },
    },
  ],
};

describe('IcebergDatalakeService DuckDB Iceberg lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadDatabase.mockResolvedValue(database);
    mockedUpdateDatabase.mockResolvedValue(undefined);
    mockedSecureStorage.getCredential.mockImplementation(async (key) => {
      if (key === 'cloud-minio-minio-connection') return 'minio-secret';
      if (key === 'iceberg-oauth-secret-iceberg-instance') {
        return 'oauth-secret';
      }
      return null;
    });
    mockRun.mockResolvedValue(undefined);
    mockRunAndReadUntil.mockResolvedValue({
      columnNames: () => ['table_schema', 'table_name'],
      getRowsJson: () => [],
      rowsChanged: 0,
      done: true,
    });
  });

  it('verifies with temporary secrets, attach, detach, and cleanup', async () => {
    const result = await IcebergDatalakeService.verifySqlAccess(instance.id);

    expect(result.success).toBe(true);
    expect(mockRun).toHaveBeenCalledWith('INSTALL httpfs');
    expect(mockRun).toHaveBeenCalledWith('INSTALL iceberg');
    expect(mockRun).toHaveBeenCalledWith('LOAD httpfs');
    expect(mockRun).toHaveBeenCalledWith('LOAD iceberg');
    expect(
      mockRun.mock.calls.some(([sql]) =>
        String(sql).startsWith('CREATE TEMPORARY SECRET'),
      ),
    ).toBe(true);
    expect(
      mockRun.mock.calls
        .map(([sql]) => String(sql))
        .find(
          (sql) =>
            sql.startsWith('CREATE TEMPORARY SECRET') &&
            sql.includes('TYPE ICEBERG'),
        ),
    ).toContain("OAUTH2_SCOPE 'catalog'");
    expect(
      mockRun.mock.calls.some(([sql]) => String(sql).startsWith('ATTACH ')),
    ).toBe(true);
    expect(
      mockRun.mock.calls.some(([sql]) => String(sql).startsWith('DETACH ')),
    ).toBe(true);
    expect(
      mockRun.mock.calls.filter(([sql]) =>
        String(sql).startsWith('DROP SECRET IF EXISTS'),
      ),
    ).toHaveLength(2);
    expect(mockCloseConnection).toHaveBeenCalled();
    expect(mockCloseInstance).toHaveBeenCalled();
    expect(mockedUpdateDatabase).toHaveBeenCalledWith(
      'icebergInstances',
      expect.arrayContaining([
        expect.objectContaining({
          id: instance.id,
          sqlAccessVerifiedAt: expect.any(String),
          sqlRuntimeFingerprint: expect.stringContaining('duckdb-node-api:'),
        }),
      ]),
    );
  });

  it('cleans up secrets and closes handles when attach fails', async () => {
    mockRun.mockImplementation(async (sql: string) => {
      if (sql.startsWith('ATTACH ')) throw new Error('attach failed');
      return undefined;
    });

    const result = await IcebergDatalakeService.verifySqlAccess(instance.id);

    expect(result.success).toBe(false);
    expect(
      mockRun.mock.calls.filter(([sql]) =>
        String(sql).startsWith('DROP SECRET IF EXISTS'),
      ),
    ).toHaveLength(2);
    expect(mockCloseConnection).toHaveBeenCalled();
    expect(mockCloseInstance).toHaveBeenCalled();
    expect(mockedUpdateDatabase).not.toHaveBeenCalled();
  });

  it('overrides DuckDB default OAuth scope for Nessie when none is configured', async () => {
    const nessieInstance = {
      ...instance,
      id: 'nessie-instance',
      catalogType: 'nessie' as const,
      endpoint: 'http://localhost:19120/iceberg',
      catalogName: undefined,
      nessieReference: 'main',
      nessieWarehouse: 'warehouse',
      oauthClientSecretKey: 'iceberg-oauth-secret-nessie-instance',
    };
    mockedLoadDatabase.mockResolvedValue({
      ...database,
      icebergInstances: [nessieInstance],
    });
    mockedSecureStorage.getCredential.mockImplementation(async (key) => {
      if (key === 'cloud-minio-minio-connection') return 'minio-secret';
      if (key === 'iceberg-oauth-secret-nessie-instance') {
        return 'oauth-secret';
      }
      return null;
    });

    const result = await IcebergDatalakeService.verifySqlAccess(
      nessieInstance.id,
    );

    expect(result.success).toBe(true);
    const catalogSecretSql = mockRun.mock.calls
      .map(([sql]) => String(sql))
      .find(
        (sql) =>
          sql.startsWith('CREATE TEMPORARY SECRET') &&
          sql.includes('TYPE ICEBERG'),
      );
    expect(catalogSecretSql).toContain("OAUTH2_SCOPE 'catalog'");
    const attachSql = mockRun.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.startsWith('ATTACH '));
    expect(attachSql).toContain("ATTACH 'warehouse'");
    expect(attachSql).toContain(
      "ENDPOINT 'http://localhost:19120/iceberg/main'",
    );
  });

  it('rejects runtime-control SQL after parsing exactly one statement', async () => {
    const destroySync = jest.fn();
    const classify = (IcebergDatalakeService as any).classifySqlStatement as (
      connection: unknown,
      sql: string,
    ) => Promise<string>;
    const connection = {
      extractStatements: jest.fn(async () => ({
        count: 1,
        prepare: jest.fn(async () => ({ statementType: 7, destroySync })),
      })),
    };

    await expect(
      classify(connection, 'CREATE SECRET stolen (TYPE S3)'),
    ).rejects.toThrow('ICEBERG_SQL_STATEMENT_REJECTED');
    expect(destroySync).toHaveBeenCalled();
  });

  it('interrupts only a registered active execution', () => {
    const active = (IcebergDatalakeService as any).activeSqlExecutions as Map<
      string,
      unknown
    >;
    active.set('running-query', { interrupt: mockInterrupt });

    expect(IcebergDatalakeService.cancelSql('running-query')).toBe(true);
    expect(mockInterrupt).toHaveBeenCalled();
    active.delete('running-query');
    expect(IcebergDatalakeService.cancelSql('missing-query')).toBe(false);
  });
});
