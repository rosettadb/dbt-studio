import { IcebergDatalakeService } from '../../../../src/main/services/icebergDatalake.service';
import secureStorage from '../../../../src/main/services/secureStorage.service';
import databaseStore from '../../../../src/main/database';

const mockDatabaseSnapshot = jest.fn();

const mockRun = jest.fn();
const mockRunAndReadUntil = jest.fn();
const mockRunAndReadAll = jest.fn();
const mockExtractStatements = jest.fn();
const mockCloseConnection = jest.fn();
const mockCloseInstance = jest.fn();
const mockInterrupt = jest.fn();

jest.mock('@duckdb/node-api', () => ({
  DuckDBInstance: {
    create: jest.fn(async () => ({
      connect: jest.fn(async () => ({
        run: mockRun,
        runAndReadUntil: mockRunAndReadUntil,
        runAndReadAll: mockRunAndReadAll,
        extractStatements: mockExtractStatements,
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

jest.mock('../../../../src/main/database', () => ({
  __esModule: true,
  default: { getField: jest.fn(), updateField: jest.fn() },
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

const mockedGetField = databaseStore.getField as jest.Mock;
const mockedUpdateField = databaseStore.updateField as jest.Mock;
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
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mockRunAndReadAll.mockResolvedValue({
      getRowObjectsJson: () => [
        {
          ast: JSON.stringify({
            error: false,
            statements: [{ node: { type: 'SELECT_NODE' } }],
          }),
        },
      ],
    });
    mockDatabaseSnapshot.mockResolvedValue(database);
    mockedGetField.mockImplementation(
      async (key: string) => (await mockDatabaseSnapshot())[key],
    );
    mockedUpdateField.mockImplementation(
      async (key: string, updater: (value: any) => any) =>
        updater((await mockDatabaseSnapshot())[key]),
    );
    mockedSecureStorage.getCredential.mockImplementation(async (key) => {
      if (key === 'cloud-minio-minio-connection') return 'minio-secret';
      if (key === 'iceberg-oauth-secret-iceberg-instance') {
        return 'oauth-secret';
      }
      return null;
    });
    mockRun.mockResolvedValue(undefined);
    mockExtractStatements.mockResolvedValue({
      count: 1,
      prepare: jest.fn(async () => ({
        statementType: 1,
        destroySync: jest.fn(),
      })),
    });
    mockRunAndReadUntil.mockResolvedValue({
      columnNames: () => ['table_schema', 'table_name'],
      getRowsJson: () => [],
      getRowObjectsJson: () => [
        { table_schema: 'sales', table_name: 'orders' },
      ],
      rowsChanged: 0,
      done: true,
    });
  });

  it('passes the SQL storage endpoint to server-managed REST catalogs', async () => {
    const buildProperties = (IcebergDatalakeService as any)
      .buildCatalogProperties as (config: unknown) => Promise<{
      props: Record<string, string>;
      env: Record<string, string>;
    }>;
    const result = await buildProperties(instance);

    expect(result.props).toMatchObject({
      's3.endpoint': 'http://localhost:9000',
      's3.access-key-id': 'minioadmin',
    });
  });

  it('returns DuckDB row objects keyed for the SQL result table', async () => {
    mockDatabaseSnapshot.mockResolvedValue({
      ...database,
      icebergInstances: [
        {
          ...instance,
          sqlAccessVerifiedAt: '2026-08-14T00:00:00.000Z',
          sqlRuntimeFingerprint: (
            IcebergDatalakeService as any
          ).getSqlRuntimeFingerprint(),
        },
      ],
    });
    mockRunAndReadUntil.mockResolvedValue({
      columnNames: () => ['Id', 'Keywords'],
      getRowObjectsJson: () => [{ Id: 1, Keywords: 'iceberg' }],
      rowsChanged: 0,
      done: true,
    });

    const result = await IcebergDatalakeService.executeSql({
      instanceId: instance.id,
      executionId: 'query-rows',
      sql: 'SELECT * FROM "iceberg"."default"."keywords"',
    });

    expect(result.columns).toEqual(['Id', 'Keywords']);
    expect(result.rows).toEqual([{ Id: 1, Keywords: 'iceberg' }]);
  });

  it('pages Iceberg reads in DuckDB and returns the total row count', async () => {
    mockDatabaseSnapshot.mockResolvedValue({
      ...database,
      icebergInstances: [
        {
          ...instance,
          sqlAccessVerifiedAt: '2026-08-14T00:00:00.000Z',
          sqlRuntimeFingerprint: (
            IcebergDatalakeService as any
          ).getSqlRuntimeFingerprint(),
        },
      ],
    });
    mockRunAndReadAll
      .mockResolvedValueOnce({
        getRowObjectsJson: () => [
          {
            ast: JSON.stringify({
              error: false,
              statements: [{ node: { type: 'SELECT_NODE' } }],
            }),
          },
        ],
      })
      .mockResolvedValueOnce({ getRowObjectsJson: () => [{ count: 20_000 }] });
    mockRunAndReadUntil.mockResolvedValue({
      columnNames: () => ['id'],
      getRowObjectsJson: () => [{ id: 11 }],
      rowsChanged: 0,
      done: true,
    });

    await expect(
      IcebergDatalakeService.executeSql({
        instanceId: instance.id,
        executionId: 'page-2',
        sql: 'SELECT * FROM iceberg.sales.orders',
        pageLimit: 10,
        pageOffset: 10,
      }),
    ).resolves.toMatchObject({
      rows: [{ id: 11 }],
      totalRows: 20_000,
      truncated: false,
    });
    expect(mockRunAndReadUntil).toHaveBeenCalledWith(
      'SELECT * FROM (SELECT * FROM iceberg.sales.orders) AS iceberg_page LIMIT 10 OFFSET 10',
      10,
    );
  });

  it('ignores read pagination for a confirmed mutation', async () => {
    mockDatabaseSnapshot.mockResolvedValue({
      ...database,
      icebergInstances: [
        {
          ...instance,
          sqlAccessVerifiedAt: '2026-08-14T00:00:00.000Z',
          sqlRuntimeFingerprint: (
            IcebergDatalakeService as any
          ).getSqlRuntimeFingerprint(),
        },
      ],
    });
    mockRunAndReadUntil.mockResolvedValue({
      columnNames: () => [],
      getRowObjectsJson: () => [],
      rowsChanged: 0,
      done: true,
    });

    await expect(
      IcebergDatalakeService.executeSql({
        instanceId: instance.id,
        executionId: 'create-customers',
        sql: 'CREATE TABLE iceberg.sales.customers (id BIGINT)',
        pageLimit: 10,
        pageOffset: 0,
        mutationConfirmed: true,
      }),
    ).resolves.toMatchObject({
      statementClass: 'create',
      rows: [],
      rowsChanged: 0,
    });
    expect(mockRunAndReadUntil).toHaveBeenCalledWith(
      'CREATE TABLE iceberg.sales.customers (id BIGINT)',
      1001,
    );
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
    expect(mockedUpdateField).toHaveBeenCalledWith(
      'icebergInstances',
      expect.any(Function),
    );
    await expect(mockedUpdateField.mock.results[0].value).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: instance.id,
          sqlAccessVerifiedAt: expect.any(String),
          sqlRuntimeFingerprint: expect.stringContaining('duckdb-node-api:'),
        }),
      ]),
    );
  });

  it('does not verify a configuration changed before the atomic store update', async () => {
    mockedUpdateField.mockImplementationOnce(
      async (_key: string, updater: (current: any[]) => any[]) =>
        updater([{ ...instance, endpoint: 'https://changed.example/catalog' }]),
    );
    const result = await IcebergDatalakeService.verifySqlAccess(instance.id);
    expect(result.success).toBe(false);
    expect(result.error).toBe('ICEBERG_SQL_CONFIGURATION_CHANGED');
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
    expect(mockedUpdateField).not.toHaveBeenCalled();
  });

  it('maps PyIceberg catalog metadata into SQL Editor schema metadata', async () => {
    mockDatabaseSnapshot.mockResolvedValue({
      ...database,
      icebergInstances: [
        {
          ...instance,
          sqlAccessVerifiedAt: '2026-08-14T00:00:00.000Z',
          sqlRuntimeFingerprint: (
            IcebergDatalakeService as any
          ).getSqlRuntimeFingerprint(),
        },
      ],
    });
    jest
      .spyOn(IcebergDatalakeService, 'listNamespaces')
      .mockResolvedValueOnce([['sales']])
      .mockResolvedValueOnce([]);
    jest
      .spyOn(IcebergDatalakeService, 'listTables')
      .mockResolvedValue(['customers']);
    jest.spyOn(IcebergDatalakeService, 'getTableSchema').mockResolvedValue({
      fields: [{ fieldId: 1, name: 'id', type: 'BIGINT', required: true }],
      properties: {},
    });

    await expect(
      IcebergDatalakeService.getSqlSchema(instance.id),
    ).resolves.toEqual({
      catalogName: 'iceberg',
      namespaces: [
        {
          name: 'sales',
          tables: [
            {
              name: 'customers',
              type: 'TABLE',
              columns: [{ name: 'id', type: 'BIGINT', position: 1 }],
            },
          ],
        },
      ],
    });
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
    mockDatabaseSnapshot.mockResolvedValue({
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
    expect(attachSql).toContain("ENDPOINT 'http://localhost:19120/iceberg'");
  });

  it('rejects runtime-control SQL after parsing exactly one statement', async () => {
    const classify = (IcebergDatalakeService as any).classifySqlStatement as (
      connection: unknown,
      sql: string,
    ) => Promise<string>;
    const connection = { runAndReadAll: mockRunAndReadAll };

    await expect(
      classify(connection, 'CREATE SECRET stolen (TYPE S3)'),
    ).rejects.toThrow('ICEBERG_SQL_STATEMENT_REJECTED');
    expect(mockRunAndReadAll).not.toHaveBeenCalled();
  });

  it.each([
    'endpoint',
    'oauthServerUri',
    'oauthClientId',
    'oauthScope',
    'catalogName',
    'nessieReference',
    'nessieWarehouse',
  ])('rejects changed %s before reading saved credentials', async (field) => {
    const result = await IcebergDatalakeService.verifySqlAccess(instance.id, {
      [field]: 'changed',
    });
    expect(result.error).toBe('ICEBERG_SQL_REPLACEMENT_CREDENTIALS_REQUIRED');
    expect(mockedSecureStorage.getCredential).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('uses replacement credentials without falling back to the saved OAuth secret', async () => {
    const result = await IcebergDatalakeService.verifySqlAccess(instance.id, {
      endpoint: 'http://localhost:8182/catalog',
      oauthClientSecret: 'replacement-secret',
    });
    expect(result.success).toBe(true);
    expect(mockedSecureStorage.getCredential).not.toHaveBeenCalledWith(
      instance.oauthClientSecretKey,
    );
    expect(
      mockRun.mock.calls.some(([sql]) =>
        String(sql).includes("CLIENT_SECRET 'replacement-secret'"),
      ),
    ).toBe(true);
    expect(mockedUpdateField).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    { endpoint: 42 },
    { sqlEnabled: 'yes' },
    { oauthClientSecretKey: 'stolen' },
    { id: 'other' },
  ])('rejects invalid verification drafts', (draft) => {
    expect(() =>
      IcebergDatalakeService.validateSqlVerificationPayload(instance.id, draft),
    ).toThrow('ICEBERG_SQL_VERIFICATION_PAYLOAD_INVALID');
  });

  it('rejects redirecting a saved bearer token', async () => {
    mockDatabaseSnapshot.mockResolvedValue({
      ...database,
      icebergInstances: [
        {
          ...instance,
          catalogAuthMode: 'token',
          catalogAccessTokenKey: 'iceberg-catalog-token-saved',
        },
      ],
    });
    const result = await IcebergDatalakeService.verifySqlAccess(instance.id, {
      endpoint: 'https://other.example/catalog',
    });
    expect(result.error).toBe('ICEBERG_SQL_REPLACEMENT_CREDENTIALS_REQUIRED');
    expect(mockedSecureStorage.getCredential).not.toHaveBeenCalled();
  });

  it('releases the execution id when setup fails', async () => {
    const getInstance = jest
      .spyOn(IcebergDatalakeService, 'getInstance')
      .mockRejectedValueOnce(new Error('failed'));
    await expect(
      (IcebergDatalakeService as any).withAttachedSqlCatalog(
        instance.id,
        'failed-setup',
        jest.fn(),
      ),
    ).rejects.toThrow();
    expect(IcebergDatalakeService.cancelSql('failed-setup')).toBe(false);
    getInstance.mockRestore();
  });

  it('preserves cancellation while the instance is being loaded', async () => {
    let release!: (value: any) => void;
    const pending = new Promise<any>((resolve) => {
      release = resolve;
    });
    const getInstance = jest
      .spyOn(IcebergDatalakeService, 'getInstance')
      .mockReturnValueOnce(pending);
    const callback = jest.fn();
    const run = (IcebergDatalakeService as any).withAttachedSqlCatalog(
      instance.id,
      'pending-query',
      callback,
    );
    expect(IcebergDatalakeService.cancelSql('pending-query')).toBe(true);
    release(instance);
    await expect(run).rejects.toThrow('ICEBERG_SQL_CANCELLED');
    expect(callback).not.toHaveBeenCalled();
    expect(IcebergDatalakeService.cancelSql('pending-query')).toBe(false);
    getInstance.mockRestore();
  });

  it('preserves cancellation during attachment even if interrupt does not reject', async () => {
    mockRun.mockImplementation(async (sql: string) => {
      if (sql.startsWith('ATTACH '))
        expect(IcebergDatalakeService.cancelSql('attaching-query')).toBe(true);
    });
    const callback = jest.fn();
    await expect(
      (IcebergDatalakeService as any).withAttachedSqlCatalog(
        instance.id,
        'attaching-query',
        callback,
      ),
    ).rejects.toThrow('ICEBERG_SQL_CANCELLED');
    expect(mockInterrupt).toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    expect(mockCloseConnection).toHaveBeenCalled();
    expect(IcebergDatalakeService.cancelSql('attaching-query')).toBe(false);
  });

  it('interrupts only a registered active execution', () => {
    const active = (IcebergDatalakeService as any).activeSqlExecutions as Map<
      string,
      unknown
    >;
    active.set('running-query', {
      cancelled: false,
      connection: { interrupt: mockInterrupt },
    });

    expect(IcebergDatalakeService.cancelSql('running-query')).toBe(true);
    expect(mockInterrupt).toHaveBeenCalled();
    active.delete('running-query');
    expect(IcebergDatalakeService.cancelSql('missing-query')).toBe(false);
  });
  it('requires a warehouse row read before persisting verification', async () => {
    await IcebergDatalakeService.verifySqlAccess(instance.id);
    expect(mockRunAndReadUntil).toHaveBeenCalledWith(
      'SELECT * FROM "iceberg"."sales"."orders" LIMIT 1',
      1,
    );
  });

  it.each([
    'empty catalog',
    'empty table',
    'unreadable table',
    'cleanup failure',
  ])('does not persist verification for %s', async (failure) => {
    if (failure === 'empty catalog') {
      mockRunAndReadUntil.mockResolvedValueOnce({
        getRowObjectsJson: () => [],
      });
    } else if (failure === 'empty table') {
      mockRunAndReadUntil
        .mockResolvedValueOnce({
          getRowObjectsJson: () => [
            { table_schema: 'sales', table_name: 'orders' },
          ],
        })
        .mockResolvedValueOnce({ getRowObjectsJson: () => [] });
    } else if (failure === 'unreadable table') {
      mockRunAndReadUntil
        .mockResolvedValueOnce({
          getRowObjectsJson: () => [
            { table_schema: 'sales', table_name: 'orders' },
          ],
        })
        .mockRejectedValueOnce(new Error('warehouse denied'));
    } else if (failure === 'cleanup failure') {
      mockRun.mockImplementation(async (sql: string) => {
        if (sql.startsWith('DETACH')) throw new Error('detach failed');
      });
    }
    expect(
      (await IcebergDatalakeService.verifySqlAccess(instance.id)).success,
    ).toBe(false);
    expect(mockedUpdateField).not.toHaveBeenCalled();
    expect(mockCloseConnection).toHaveBeenCalled();
    expect(mockCloseInstance).toHaveBeenCalled();
  });

  it('enables SQL for a verified connection without a combination registry', async () => {
    mockDatabaseSnapshot.mockResolvedValue({
      ...database,
      icebergInstances: [
        {
          ...instance,
          sqlAccessVerifiedAt: '2026-09-07',
          sqlRuntimeFingerprint: (
            IcebergDatalakeService as any
          ).getSqlRuntimeFingerprint(),
        },
      ],
    });
    expect(
      await IcebergDatalakeService.getSqlCapability(instance.id),
    ).toMatchObject({
      available: true,
      canRead: true,
      canWrite: true,
    });
    expect((await IcebergDatalakeService.listInstances())[0].sqlAvailable).toBe(
      true,
    );
  });

  it('requires explicit confirmation for parsed mutations before attaching', async () => {
    mockDatabaseSnapshot.mockResolvedValue({
      ...database,
      icebergInstances: [
        {
          ...instance,
          sqlAccessVerifiedAt: '2026-09-07',
          sqlRuntimeFingerprint: (
            IcebergDatalakeService as any
          ).getSqlRuntimeFingerprint(),
        },
      ],
    });
    const params = {
      instanceId: instance.id,
      executionId: 'mutation',
      sql: '/* comment */ DELETE FROM iceberg.sales.orders',
    };
    await expect(IcebergDatalakeService.executeSql(params)).rejects.toThrow(
      'ICEBERG_SQL_CONFIRMATION_REQUIRED',
    );
    expect(mockRun).not.toHaveBeenCalled();
    expect(
      await IcebergDatalakeService.executeSql({
        ...params,
        validateOnly: true,
      }),
    ).toMatchObject({ statementClass: 'delete' });
    expect(mockRun).not.toHaveBeenCalled();
    await IcebergDatalakeService.executeSql({
      ...params,
      mutationConfirmed: true,
    });
    expect(mockRunAndReadUntil).toHaveBeenCalledWith(params.sql, 1001);
  });
});
