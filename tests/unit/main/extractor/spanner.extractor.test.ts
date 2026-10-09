import SpannerExtractor from '../../../../src/main/extractor/spanner.extractor';
import { acquireSpannerDatabase } from '../../../../src/main/utils/spannerClient';
import { confirmSpannerSchemaRefreshed } from '../../../../src/main/utils/spannerQuery';
import type { SpannerConnection } from '../../../../src/types/backend';

jest.mock('../../../../src/main/utils/spannerClient', () => ({
  acquireSpannerDatabase: jest.fn(),
}));

const useDatabase = (database: unknown) =>
  (acquireSpannerDatabase as jest.Mock).mockResolvedValue({
    database,
    release: jest.fn(),
  });
jest.mock('../../../../src/main/utils/spannerQuery', () => ({
  confirmSpannerSchemaRefreshed: jest.fn(),
}));

const baseConnection: SpannerConnection = {
  type: 'spanner',
  name: 'test-conn',
  project: 'demo-project',
  instance: 'test-instance',
  database: 'test-db',
  schema: '',
  username: 'demo-project',
  password: '',
  authMethod: 'adc',
};

/**
 * Builds a mock database whose getSnapshot() snapshot.run() returns each element of
 * runResults in order. Each element is an array of row objects that will be
 * wrapped in Promise<[rows]> to match the real Spanner snapshot API:
 *   const [rows] = await snapshot.run(...) => rows is the array
 */
function makeMockDatabase(runResults: any[][]): any {
  let callIndex = 0;
  const snapshot = {
    run: jest.fn().mockImplementation(() => {
      const result = runResults[callIndex] ?? [];
      callIndex += 1;
      return Promise.resolve([result]);
    }),
    end: jest.fn().mockResolvedValue(undefined),
  };
  return {
    getSnapshot: jest.fn().mockResolvedValue([snapshot]),
    _snapshot: snapshot,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('row mapping', () => {
  it('maps table, column, and PK rows to the Table/Column shape', async () => {
    const tableRows = [
      {
        table_schema: 'public_schema',
        table_name: 'users',
        table_type: 'BASE TABLE',
      },
    ];
    const columnRows = [
      {
        table_schema: 'public_schema',
        table_name: 'users',
        column_name: 'id',
        ordinal_position: 1,
        is_nullable: 'NO',
        type_name: 'INT64',
      },
    ];
    const keyRows = [
      {
        table_schema: 'public_schema',
        table_name: 'users',
        column_name: 'id',
        ordinal_position: 1,
      },
    ];

    const mockDb = makeMockDatabase([tableRows, columnRows, keyRows]);
    useDatabase(mockDb);

    const extractor = new SpannerExtractor(baseConnection);
    const result = await extractor.extractSchema();

    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].name).toBe('users');
    expect(result.tables[0].schema).toBe('public_schema');
    expect(result.tables[0].columns[0].name).toBe('id');
    expect(result.tables[0].columns[0].typeName).toBe('INT64');
    expect(result.tables[0].columns[0].nullable).toBe(false);
    expect(result.tables[0].columns[0].primaryKey).toBe(true);
    expect(confirmSpannerSchemaRefreshed).toHaveBeenCalledWith('test-conn');
  });
});

describe('system-schema filter', () => {
  it('only includes user-schema tables (system schemas excluded by SQL query)', async () => {
    // The extractor's WHERE clause filters system schemas at the DB level.
    // This test confirms the row mapper only processes what the DB returns.
    const tableRows = [
      {
        table_schema: 'my_schema',
        table_name: 'orders',
        table_type: 'BASE TABLE',
      },
    ];
    const columnRows = [
      {
        table_schema: 'my_schema',
        table_name: 'orders',
        column_name: 'id',
        ordinal_position: 1,
        is_nullable: 'YES',
        type_name: 'STRING(36)',
      },
    ];
    const keyRows: any[] = [];

    const mockDb = makeMockDatabase([tableRows, columnRows, keyRows]);
    useDatabase(mockDb);

    const extractor = new SpannerExtractor(baseConnection);
    const result = await extractor.extractSchema();

    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].name).toBe('orders');
  });
});

describe('default-schema naming', () => {
  it('labels tables with an empty table_schema as "default"', async () => {
    const tableRows = [
      { table_schema: '', table_name: 'events', table_type: 'BASE TABLE' },
    ];
    const columnRows: any[] = [];
    const keyRows: any[] = [];

    const mockDb = makeMockDatabase([tableRows, columnRows, keyRows]);
    useDatabase(mockDb);

    const extractor = new SpannerExtractor(baseConnection);
    const result = await extractor.extractSchema();

    expect(result.tables[0].schema).toBe('default');
  });
});

describe('PG-dialect query switch', () => {
  it('uses lowercase information_schema and data_type for POSTGRESQL dialect', async () => {
    const pgConnection: SpannerConnection = {
      ...baseConnection,
      dialect: 'POSTGRESQL',
    };
    const tableRows = [
      {
        table_schema: 'public',
        table_name: 'items',
        table_type: 'BASE TABLE',
      },
    ];
    const columnRows: any[] = [];
    const keyRows: any[] = [];

    const mockDb = makeMockDatabase([tableRows, columnRows, keyRows]);
    useDatabase(mockDb);

    const extractor = new SpannerExtractor(pgConnection);
    await extractor.extractSchema();

    const calls = mockDb._snapshot.run.mock.calls as Array<[{ sql: string }]>;
    const firstSql = calls[0][0].sql;
    const secondSql = calls[1][0].sql;

    // PG dialect: lowercase schema name
    expect(firstSql).toContain('information_schema.tables');
    expect(firstSql).not.toContain('INFORMATION_SCHEMA.TABLES');

    // PG dialect: data_type column alias
    expect(secondSql).toContain('data_type');

    // PG dialect: excludes lowercase schema names
    expect(firstSql).toContain('information_schema');
  });
});

describe('PK detection', () => {
  it('sets primaryKey=true and primaryKeySequenceId=1 for columns in index_columns', async () => {
    const tableRows = [
      {
        table_schema: 'myschema',
        table_name: 'products',
        table_type: 'BASE TABLE',
      },
    ];
    const columnRows = [
      {
        table_schema: 'myschema',
        table_name: 'products',
        column_name: 'sku',
        ordinal_position: 1,
        is_nullable: 'NO',
        type_name: 'STRING(32)',
      },
    ];
    const keyRows = [
      {
        table_schema: 'myschema',
        table_name: 'products',
        column_name: 'sku',
        ordinal_position: 1,
      },
    ];

    const mockDb = makeMockDatabase([tableRows, columnRows, keyRows]);
    useDatabase(mockDb);

    const extractor = new SpannerExtractor(baseConnection);
    const result = await extractor.extractSchema();

    expect(result.tables[0].columns[0].primaryKey).toBe(true);
    expect(result.tables[0].columns[0].primaryKeySequenceId).toBe(1);
  });
});

describe('snapshot use and SQL filters', () => {
  it('reads all three queries from one strong snapshot and ends it', async () => {
    const mockDb = makeMockDatabase([[], [], []]);
    useDatabase(mockDb);
    await new SpannerExtractor(baseConnection).extractSchema();
    expect(mockDb.getSnapshot).toHaveBeenCalledWith({ strong: true });
    expect(mockDb._snapshot.run).toHaveBeenCalledTimes(3);
    expect(mockDb._snapshot.end).toHaveBeenCalledTimes(1);
  });

  it('ends the snapshot when a query fails', async () => {
    const mockDb = makeMockDatabase([]);
    mockDb._snapshot.run.mockRejectedValueOnce(new Error('boom'));
    useDatabase(mockDb);
    await expect(
      new SpannerExtractor(baseConnection).extractSchema(),
    ).rejects.toThrow('boom');
    expect(mockDb._snapshot.end).toHaveBeenCalledTimes(1);
  });

  it('excludes the GoogleSQL system schemas in SQL', async () => {
    const mockDb = makeMockDatabase([[], [], []]);
    useDatabase(mockDb);
    await new SpannerExtractor(baseConnection).extractSchema();
    const calls = mockDb._snapshot.run.mock.calls as Array<[{ sql: string }]>;
    expect(calls[0][0].sql).toContain(
      "NOT IN ('INFORMATION_SCHEMA','SPANNER_SYS')",
    );
    expect(calls[1][0].sql).toContain(
      "NOT IN ('INFORMATION_SCHEMA','SPANNER_SYS')",
    );
  });

  it('numbers multi-column primary keys by their position in the key', async () => {
    const mockDb = makeMockDatabase([
      [{ table_schema: '', table_name: 'albums', table_type: 'BASE TABLE' }],
      [
        {
          table_schema: '',
          table_name: 'albums',
          column_name: 'singer_id',
          ordinal_position: 1,
          is_nullable: 'NO',
          type_name: 'INT64',
        },
        {
          table_schema: '',
          table_name: 'albums',
          column_name: 'album_id',
          ordinal_position: 2,
          is_nullable: 'NO',
          type_name: 'INT64',
        },
        {
          table_schema: '',
          table_name: 'albums',
          column_name: 'title',
          ordinal_position: 3,
          is_nullable: 'YES',
          type_name: 'STRING(MAX)',
        },
      ],
      [
        {
          table_schema: '',
          table_name: 'albums',
          column_name: 'singer_id',
          ordinal_position: 1,
        },
        {
          table_schema: '',
          table_name: 'albums',
          column_name: 'album_id',
          ordinal_position: 2,
        },
      ],
    ]);
    useDatabase(mockDb);
    const result = await new SpannerExtractor(baseConnection).extractSchema();
    expect(
      result.tables[0].columns.map((column) => [
        column.name,
        column.primaryKey,
        column.primaryKeySequenceId,
      ]),
    ).toEqual([
      ['singer_id', true, 1],
      ['album_id', true, 2],
      ['title', false, 0],
    ]);
  });
});
