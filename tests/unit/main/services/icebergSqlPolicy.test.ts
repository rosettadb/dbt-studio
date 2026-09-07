// Test the exact application runtime, which is installed outside root node_modules.
// eslint-disable-next-line import/no-relative-packages, import/no-useless-path-segments
import { DuckDBInstance } from '../../../../release/app/node_modules/@duckdb/node-api';
import {
  parseIcebergSql,
  validateIcebergSelectAst,
} from '../../../../src/main/services/iceberg/sqlPolicy';

// Real packaged-version parser, no catalog credentials, extension downloads,
// binding or execution of the supplied SQL.
describe('Iceberg SQL policy with the native DuckDB parser', () => {
  let db: Awaited<ReturnType<typeof DuckDBInstance.create>>;
  let connection: Awaited<ReturnType<typeof db.connect>>;
  beforeAll(async () => {
    db = await DuckDBInstance.create(':memory:');
    connection = await db.connect();
  });
  afterAll(() => {
    connection.closeSync();
    db.closeSync();
  });
  const classify = async (sql: string) => {
    const parsed = parseIcebergSql(sql);
    if (parsed.selectSql) {
      const reader = await connection.runAndReadAll(
        'SELECT json_serialize_sql(CAST(? AS VARCHAR)) AS ast',
        [parsed.selectSql],
      );
      validateIcebergSelectAst(
        JSON.parse(String(reader.getRowObjectsJson()[0].ast)),
      );
    }
    return parsed.statementClass;
  };
  it.each([
    ['SELECT * FROM iceberg.sales.orders', 'select'],
    ["SELECT 'read_text attach drop' AS value", 'select'],
    [
      '-- comment\n/* nested /* comment */ */ DELETE FROM iceberg.sales.orders WHERE id = 1',
      'delete',
    ],
    [
      'WITH ids AS (SELECT id FROM iceberg.sales.orders) DELETE FROM iceberg.sales.orders WHERE id IN (SELECT id FROM ids)',
      'delete',
    ],
    [
      'WITH ids AS (SELECT id FROM iceberg.sales.orders) SELECT * FROM ids',
      'select',
    ],
    ['SELECT count(*), sum(id) FROM iceberg.sales.orders', 'select'],
    [
      'SELECT row_number() OVER (ORDER BY id) FROM iceberg.sales.orders',
      'select',
    ],
    ['SELECT * FROM iceberg.sales.orders AT (VERSION => 3)', 'select'],
    [
      'SELECT a.id + b.id FROM iceberg.sales.orders a JOIN iceberg.sales.orders b ON a.id=b.id',
      'select',
    ],
    ['INSERT INTO iceberg.sales.orders (id) VALUES (1), (2)', 'insert'],
    [
      'INSERT INTO iceberg.sales.orders SELECT id FROM iceberg.sales.source',
      'insert',
    ],
    [
      'UPDATE iceberg.sales.orders SET id = id + 1, name = upper(name) WHERE id > 2',
      'update',
    ],
    [
      'CREATE TABLE iceberg.sales.orders (id INTEGER, name VARCHAR NOT NULL, price DECIMAL(10,2))',
      'create',
    ],
    [
      'CREATE TABLE iceberg.sales.orders AS SELECT * FROM iceberg.sales.source',
      'create',
    ],
    ['CREATE SCHEMA IF NOT EXISTS "iceberg"."sales"', 'create'],
    ['DROP TABLE IF EXISTS iceberg.sales.orders', 'drop'],
    ['DROP SCHEMA iceberg.sales', 'drop'],
  ])('accepts %s', async (sql, expected) => {
    expect(await classify(sql)).toBe(expected);
  });

  it.each([
    "SELECT * FROM read_text('/dev/null')",
    "SELECT * FROM read_blob('/dev/null')",
    'SELECT * FROM duckdb_secrets()',
    "SELECT * FROM read_csv_auto('/tmp/file.csv')",
    "SELECT * FROM 'file.parquet'",
    "SELECT * FROM query('SELECT 1')",
    "SELECT getvariable('secret')",
    "SELECT current_setting('s3_secret_access_key')",
    'SELECT * FROM information_schema.tables',
    'SELECT * FROM orders',
    'SELECT * FROM memory.main.orders',
    'SELECT * FROM iceberg.sales.orders; DROP TABLE iceberg.sales.orders',
    "WITH x AS (SELECT * FROM read_text('/dev/null')) SELECT * FROM x",
    'WITH x AS (SELECT * FROM iceberg.sales.orders) SELECT * FROM (SELECT * FROM information_schema.tables) y',
    'SELECT (SELECT * FROM duckdb_secrets()) FROM iceberg.sales.orders',
    "INSERT INTO iceberg.sales.orders SELECT * FROM read_text('/dev/null')",
    "UPDATE iceberg.sales.orders SET name = (SELECT content FROM read_text('/dev/null'))",
    'DELETE FROM iceberg.sales.orders WHERE EXISTS (SELECT * FROM duckdb_secrets())',
    'CREATE TABLE local_table (id INTEGER)',
    'CREATE TABLE memory.main.orders (id INTEGER)',
    'CREATE VIEW iceberg.sales.orders AS SELECT 1',
    'CREATE MACRO iceberg.sales.evil() AS 1',
    'CREATE SECRET stolen (TYPE S3)',
    'CREATE /* bypass */ SECRET stolen (TYPE S3)',
    "CREATE TABLE iceberg.sales.orders (id INTEGER DEFAULT nextval('x'))",
    "CREATE TABLE iceberg.sales.orders AS SELECT * FROM read_text('/dev/null')",
    'DROP SCHEMA main',
    "ATTACH 'x' AS iceberg",
    'SET enable_external_access = true',
    'LOAD httpfs',
    'MERGE INTO iceberg.sales.orders USING iceberg.sales.source ON true WHEN MATCHED THEN DELETE',
  ])('rejects %s before binding', async (sql) => {
    await expect(classify(sql)).rejects.toThrow(
      'ICEBERG_SQL_STATEMENT_REJECTED',
    );
  });
});
