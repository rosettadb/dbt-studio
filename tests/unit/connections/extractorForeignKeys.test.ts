import mysql from 'mysql2/promise';
import PGSchemaExtractor from '../../../src/connections/postgres/postgres.extractor.main';
import MySqlExtractor from '../../../src/connections/mysql/mysql.extractor.main';
import type { Table } from '../../../src/types/backend';

const mockPgQuery = jest.fn();
jest.mock('pg', () => ({
  Client: jest.fn(() => ({
    connect: jest.fn(),
    end: jest.fn(),
    query: (...args: unknown[]) => mockPgQuery(...args),
  })),
}));

// Answers a query by the first marker its SQL contains.
const answerBy =
  (answers: Array<[string, (params?: unknown[]) => unknown]>) =>
  (sql: string, params?: unknown[]) => {
    const match = answers.find(([marker]) => sql.includes(marker));
    if (!match) throw new Error(`Unexpected query: ${sql}`);
    return match[1](params);
  };

const keysOf = (tables: Table[], table: string, column: string) =>
  tables
    .find((t) => t.name === table)!
    .columns.find((c) => c.name === column)!
    .foreignKeys!.map(
      (fk) =>
        `${fk.primaryTableSchema}.${fk.primaryTableName}.${fk.primaryColumnName}`,
    );

const config = {
  user: 'u',
  host: 'localhost',
  database: 'shop',
  password: 'p',
  port: 1,
};

describe('Postgres foreign keys', () => {
  const pgAnswers = (foreignKeys: () => unknown) =>
    answerBy([
      [
        'information_schema.schemata',
        () => ({ rows: [{ schema_name: 'shop' }] }),
      ],
      ['pg_constraint', foreignKeys],
      [
        'information_schema.tables',
        () => ({
          rows: [{ table_name: 'customers' }, { table_name: 'orders' }],
        }),
      ],
      ['information_schema.views', () => ({ rows: [] })],
      [
        'information_schema.columns',
        (params) => ({
          rows:
            params?.[1] === 'orders'
              ? [{ column_name: 'id' }, { column_name: 'customer_id' }]
              : [{ column_name: 'id' }],
        }),
      ],
    ]);

  beforeEach(() => mockPgQuery.mockReset());

  it('reads every key in one query and puts it on its column', async () => {
    const foreignKeys = jest.fn(() => ({
      rows: [
        {
          name: 'orders_customer_fk',
          schema: 'shop',
          table_name: 'orders',
          column_name: 'customer_id',
          delete_rule: 'CASCADE',
          primary_schema: 'shop',
          primary_table: 'customers',
          primary_column: 'id',
        },
      ],
    }));
    mockPgQuery.mockImplementation(pgAnswers(foreignKeys));

    const { tables } = await new PGSchemaExtractor(config).extractSchema();

    expect(foreignKeys).toHaveBeenCalledTimes(1);
    expect(keysOf(tables, 'orders', 'customer_id')).toEqual([
      'shop.customers.id',
    ]);
    expect(keysOf(tables, 'orders', 'id')).toEqual([]);
    expect(keysOf(tables, 'customers', 'id')).toEqual([]);
  });

  it('still loads the schema when the key query fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockPgQuery.mockImplementation(
      pgAnswers(() => {
        throw new Error('permission denied');
      }),
    );

    const { tables } = await new PGSchemaExtractor(config).extractSchema();

    expect(tables.map((t) => t.name)).toEqual(['customers', 'orders']);
    expect(keysOf(tables, 'orders', 'customer_id')).toEqual([]);
    warn.mockRestore();
  });
});

describe('MySQL foreign keys', () => {
  const mysqlAnswers = (foreignKeys: () => unknown) =>
    answerBy([
      ['information_schema.schemata', () => [[{ SCHEMA_NAME: 'shop' }]]],
      ['key_column_usage', foreignKeys],
      [
        'information_schema.tables',
        () => [[{ TABLE_NAME: 'customers' }, { TABLE_NAME: 'orders' }]],
      ],
      ['information_schema.views', () => [[]]],
      [
        'information_schema.columns',
        (params) => [
          params?.[1] === 'orders'
            ? [{ COLUMN_NAME: 'id' }, { COLUMN_NAME: 'customer_id' }]
            : [{ COLUMN_NAME: 'id' }],
        ],
      ],
    ]);

  const useConnection = (query: jest.Mock) =>
    (mysql.createConnection as jest.Mock).mockReturnValue({
      query,
      end: jest.fn(),
    });

  const extract = async () => {
    const extractor = new MySqlExtractor(config);
    await extractor.connect();
    return extractor.extractSchema();
  };

  it('reads every key in one query and puts it on its column', async () => {
    const foreignKeys = jest.fn(() => [
      [
        {
          name: 'orders_customer_fk',
          table_schema: 'shop',
          table_name: 'orders',
          column_name: 'customer_id',
          delete_rule: 'RESTRICT',
          primary_schema: 'shop',
          primary_table: 'customers',
          primary_column: 'id',
        },
      ],
    ]);
    useConnection(jest.fn(mysqlAnswers(foreignKeys)));

    const { tables } = await extract();

    expect(foreignKeys).toHaveBeenCalledTimes(1);
    expect(keysOf(tables, 'orders', 'customer_id')).toEqual([
      'shop.customers.id',
    ]);
    expect(keysOf(tables, 'customers', 'id')).toEqual([]);
  });

  it('still loads the schema when the key query fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    useConnection(
      jest.fn(
        mysqlAnswers(() => {
          throw new Error('access denied');
        }),
      ),
    );

    const { tables } = await extract();

    expect(tables.map((t) => t.name)).toEqual(['customers', 'orders']);
    expect(keysOf(tables, 'orders', 'customer_id')).toEqual([]);
    warn.mockRestore();
  });
});
