import {
  database,
  resetSpannerMock,
} from '../../__setup__/googleCloudSpanner.mock';
import type { SpannerConnection } from '../../../../src/connections/spanner/spanner.shared';

jest.mock('../../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: { getCredential: jest.fn() },
}));

/* eslint-disable import/first */
import { closeSpannerClients } from '../../../../src/connections/spanner/spanner.client.main';
import SpannerExtractor, {
  schemaQueries,
} from '../../../../src/connections/spanner/spanner.extractor.main';

const conn: SpannerConnection = {
  type: 'spanner',
  name: 'extractor-test',
  username: 'my-project',
  password: '',
  project: 'my-project',
  instance: 'my-instance',
  database: 'my-db',
  schema: '',
  authMethod: 'adc',
};

const tableRows = [
  { table_schema: '', table_name: 'orders', table_type: 'BASE TABLE' },
  { table_schema: '', table_name: 'order_totals', table_type: 'VIEW' },
];
const columnRows = [
  {
    table_schema: '',
    table_name: 'orders',
    column_name: 'region',
    ordinal_position: 1,
    is_nullable: 'NO',
    type_name: 'STRING(MAX)',
  },
  {
    table_schema: '',
    table_name: 'orders',
    column_name: 'id',
    ordinal_position: 2,
    is_nullable: 'NO',
    type_name: 'INT64',
  },
  {
    table_schema: '',
    table_name: 'orders',
    column_name: 'note',
    ordinal_position: 3,
    is_nullable: 'YES',
    type_name: 'STRING(MAX)',
  },
  {
    table_schema: '',
    table_name: 'order_totals',
    column_name: 'total',
    ordinal_position: 1,
    is_nullable: 'YES',
    type_name: 'INT64',
  },
];
// A two-column key: (id, region), so region is not first in the key.
const keyRows = [
  {
    table_schema: '',
    table_name: 'orders',
    column_name: 'id',
    ordinal_position: 1,
  },
  {
    table_schema: '',
    table_name: 'orders',
    column_name: 'region',
    ordinal_position: 2,
  },
];

function useSnapshot(rows: unknown[][] = [tableRows, columnRows, keyRows]) {
  const run = jest.fn();
  rows.forEach((result) => run.mockResolvedValueOnce([result]));
  const snapshot = { run, end: jest.fn() };
  database.getSnapshot.mockResolvedValue([snapshot]);
  return snapshot;
}

describe('spanner schema queries', () => {
  it('GoogleSQL: upper-case INFORMATION_SCHEMA, system schemas excluded', () => {
    const { tables, columns, keys } = schemaQueries('GOOGLE_STANDARD_SQL');
    expect(tables).toContain('FROM INFORMATION_SCHEMA.tables');
    expect(tables).toContain("NOT IN ('INFORMATION_SCHEMA','SPANNER_SYS')");
    expect(columns).toContain('spanner_type AS type_name');
    expect(keys).toContain("index_type = 'PRIMARY_KEY'");
  });

  it('PostgreSQL dialect: lower-case information_schema, pg_catalog excluded', () => {
    const { tables, columns } = schemaQueries('POSTGRESQL');
    expect(tables).toContain('FROM information_schema.tables');
    expect(tables).toContain(
      "NOT IN ('information_schema','pg_catalog','spanner_sys')",
    );
    expect(columns).toContain('data_type AS type_name');
  });
});

describe('SpannerExtractor', () => {
  beforeEach(() => resetSpannerMock());
  afterEach(() => closeSpannerClients());

  it('builds tables, views, columns and a two-column primary key', async () => {
    database.getDatabaseDialect.mockResolvedValue('GOOGLE_STANDARD_SQL');
    const snapshot = useSnapshot();
    const { tables } = await new SpannerExtractor(conn).extractSchema();

    expect(database.getSnapshot).toHaveBeenCalledWith({ strong: true });
    expect(tables.map((t) => [t.name, t.type, t.schema])).toEqual([
      ['orders', 'TABLE', 'default'],
      ['order_totals', 'VIEW', 'default'],
    ]);
    const orders = tables[0].columns;
    expect(
      orders.map((c) => [c.name, c.primaryKey, c.primaryKeySequenceId]),
    ).toEqual([
      ['region', true, 2],
      ['id', true, 1],
      ['note', false, 0],
    ]);
    expect(orders[1]).toMatchObject({ typeName: 'INT64', nullable: false });
    expect(orders[2].nullable).toBe(true);
    expect(snapshot.end).toHaveBeenCalledTimes(1);
  });

  it('uses the PostgreSQL queries and the public schema for a PG-dialect database', async () => {
    database.getDatabaseDialect.mockResolvedValue('POSTGRESQL');
    const snapshot = useSnapshot([
      [
        {
          table_schema: 'public',
          table_name: 'orders',
          table_type: 'BASE TABLE',
        },
      ],
      [],
      [],
    ]);
    const { tables } = await new SpannerExtractor(conn).extractSchema();
    expect(snapshot.run.mock.calls[0][0].sql).toContain(
      'information_schema.tables',
    );
    expect(tables[0]).toMatchObject({ name: 'orders', schema: 'public' });
    const empty = useSnapshot([
      [{ table_schema: '', table_name: 't', table_type: 'BASE TABLE' }],
      [],
      [],
    ]);
    expect(
      (await new SpannerExtractor(conn).extractSchema()).tables[0].schema,
    ).toBe('public');
    expect(empty.end).toHaveBeenCalled();
  });

  it('ends the snapshot when a query fails', async () => {
    database.getDatabaseDialect.mockResolvedValue('GOOGLE_STANDARD_SQL');
    const run = jest.fn().mockRejectedValue(new Error('boom'));
    const snapshot = { run, end: jest.fn() };
    database.getSnapshot.mockResolvedValue([snapshot]);
    await expect(new SpannerExtractor(conn).extractSchema()).rejects.toThrow(
      'boom',
    );
    expect(snapshot.end).toHaveBeenCalledTimes(1);
  });

  it('asks the database for its dialect only once for repeated refreshes', async () => {
    database.getDatabaseDialect.mockResolvedValue('GOOGLE_STANDARD_SQL');
    useSnapshot();
    await new SpannerExtractor(conn).extractSchema();
    useSnapshot();
    await new SpannerExtractor(conn).extractSchema();
    expect(database.getDatabaseDialect).toHaveBeenCalledTimes(1);
  });
});
