import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeDuckDBQuery } from '../../../src/connections/duckdb/duckdb.client.main';
import DuckDBSchemaExtractor from '../../../src/connections/duckdb/duckdb.extractor.main';
import type { DuckDBConnection, Table } from '../../../src/types/backend';

const TEST_DIR = path.join(os.tmpdir(), 'dbt-studio-duckdb-extractor-test');
const DB_PATH = path.join(TEST_DIR, 'schemas.duckdb');

describe('DuckDBSchemaExtractor with a configured schema', () => {
  beforeAll(async () => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
    const connection: DuckDBConnection = {
      type: 'duckdb',
      name: 'extractor-test',
      database_path: DB_PATH,
      short_database_path: 'schemas.duckdb',
      database: DB_PATH,
      schema: 'main',
    };
    const seed = async (sql: string) => {
      const result = await executeDuckDBQuery(connection, sql);
      if (!result.success) throw new Error(result.error);
    };
    await seed('CREATE TABLE main_only (id INTEGER)');
    await seed('CREATE SCHEMA "sales data"');
    await seed('CREATE TABLE "sales data".orders (id INTEGER)');
    await seed('CREATE SCHEMA "é"');
    await seed('CREATE TABLE "é".lower_e (id INTEGER)');
    await seed('CREATE SCHEMA "É"');
    await seed('CREATE TABLE "É".upper_e (id INTEGER)');
  });

  afterAll(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('selects a schema whose name needs quoting', async () => {
    const extractor = new DuckDBSchemaExtractor({
      database_path: DB_PATH,
      schema: 'sales data',
    });

    const { tables } = await extractor.extractSchema();

    expect(tables.map(({ schema, name }) => ({ schema, name }))).toEqual([
      { schema: 'sales data', name: 'orders' },
    ]);
  });

  it('matches the schema ignoring ASCII case, like DuckDB', async () => {
    const extractor = new DuckDBSchemaExtractor({
      database_path: DB_PATH,
      schema: 'SALES DATA',
    });

    const { tables } = await extractor.extractSchema();

    expect(tables.map(({ schema, name }) => ({ schema, name }))).toEqual([
      { schema: 'sales data', name: 'orders' },
    ]);
  });

  it('keeps schemas that differ only in non-ASCII case apart', async () => {
    const extractor = new DuckDBSchemaExtractor({
      database_path: DB_PATH,
      schema: 'é',
    });

    const { tables } = await extractor.extractSchema();

    expect(tables.map(({ schema, name }) => ({ schema, name }))).toEqual([
      { schema: 'é', name: 'lower_e' },
    ]);
  });

  it('returns no tables, not main, when the schema is missing', async () => {
    const extractor = new DuckDBSchemaExtractor({
      database_path: DB_PATH,
      schema: 'missing',
    });

    const { tables } = await extractor.extractSchema();

    expect(tables).toEqual([]);
  });
});

describe('DuckDBSchemaExtractor keys', () => {
  const KEYS_DB_PATH = path.join(TEST_DIR, 'keys.duckdb');

  beforeAll(async () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    const connection: DuckDBConnection = {
      type: 'duckdb',
      name: 'keys-test',
      database_path: KEYS_DB_PATH,
      short_database_path: 'keys.duckdb',
      database: KEYS_DB_PATH,
      schema: 'main',
    };
    const seed = async (sql: string) => {
      const result = await executeDuckDBQuery(connection, sql);
      if (!result.success) throw new Error(result.error);
    };
    await seed('CREATE TABLE customers (id INTEGER PRIMARY KEY, name VARCHAR)');
    await seed(
      'CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id))',
    );
    await seed(
      'CREATE TABLE order_lines (order_id INTEGER, line_no INTEGER, PRIMARY KEY (order_id, line_no), FOREIGN KEY (order_id) REFERENCES orders(id))',
    );
    await seed('CREATE SCHEMA sales');
    await seed('CREATE TABLE sales.regions (code VARCHAR PRIMARY KEY)');
    await seed(
      'CREATE TABLE sales.shops (id INTEGER, region_code VARCHAR REFERENCES sales.regions(code))',
    );
  });

  afterAll(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // `name[pk position]->schema.table.column` for each column.
  const describeColumns = (tables: Table[], schema: string, name: string) =>
    tables
      .find((t) => t.schema === schema && t.name === name)!
      .columns.map(
        (c) =>
          `${c.name}${c.primaryKey ? `[${c.primaryKeySequenceId}]` : ''}${(
            c.foreignKeys ?? []
          )
            .map(
              (fk) =>
                `->${fk.primaryTableSchema}.${fk.primaryTableName}.${fk.primaryColumnName}`,
            )
            .join('')}`,
      );

  it('reads primary keys, keys over two columns and foreign keys', async () => {
    const { tables } = await new DuckDBSchemaExtractor({
      database_path: KEYS_DB_PATH,
    }).extractSchema();

    expect(describeColumns(tables, 'main', 'customers')).toEqual([
      'id[1]',
      'name',
    ]);
    expect(describeColumns(tables, 'main', 'orders')).toEqual([
      'id[1]',
      'customer_id->main.customers.id',
    ]);
    expect(describeColumns(tables, 'main', 'order_lines')).toEqual([
      'order_id[1]->main.orders.id',
      'line_no[2]',
    ]);
    expect(describeColumns(tables, 'sales', 'shops')).toEqual([
      'id',
      'region_code->sales.regions.code',
    ]);
  });

  it('reads the keys of the one schema it is limited to', async () => {
    const { tables } = await new DuckDBSchemaExtractor({
      database_path: KEYS_DB_PATH,
      schema: 'sales',
    }).extractSchema();

    expect(tables.map((t) => t.name).sort()).toEqual(['regions', 'shops']);
    expect(describeColumns(tables, 'sales', 'regions')).toEqual(['code[1]']);
    expect(describeColumns(tables, 'sales', 'shops')).toEqual([
      'id',
      'region_code->sales.regions.code',
    ]);
  });
});
