import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeDuckDBQuery } from '../../../src/connections/duckdb/duckdb.client.main';
import DuckDBSchemaExtractor from '../../../src/connections/duckdb/duckdb.extractor.main';
import type { DuckDBConnection } from '../../../src/types/backend';

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
