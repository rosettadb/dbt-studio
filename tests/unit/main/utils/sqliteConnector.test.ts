import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  executeSQLiteQuery,
  extractSQLiteSchema,
  testSQLiteConnection,
} from '../../../../src/connections/sqlite/sqlite.client.main';
import type { SQLiteConnection } from '../../../../src/types/backend';

jest.mock('better-sqlite3', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../../../../release/app/node_modules/better-sqlite3', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const MockSqliteDatabase = jest.requireMock(
  '../../../../release/app/node_modules/better-sqlite3',
).default as jest.Mock;
const close = jest.fn();
const get = jest.fn();
const prepare: jest.Mock = jest.fn(() => ({ get }));

describe('testSQLiteConnection', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-connector-'));
    close.mockClear();
    get.mockReset().mockReturnValue({ version: '3.46.0' });
    prepare.mockClear();
    MockSqliteDatabase.mockReset().mockImplementation(() => ({
      close,
      prepare,
    }));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const connection = (databasePath: string): SQLiteConnection => ({
    type: 'sqlite',
    name: 'Local analytics',
    database_path: databasePath,
    short_database_path: path.basename(databasePath),
    database: databasePath,
    schema: 'main',
  });

  it('opens an existing SQLite database without modifying its data', () => {
    const databasePath = path.join(directory, 'analytics.sqlite');
    fs.writeFileSync(databasePath, 'existing database bytes');
    const before = fs.readFileSync(databasePath);

    expect(testSQLiteConnection(connection(databasePath))).toBe(true);

    expect(MockSqliteDatabase).toHaveBeenCalledWith(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    expect(prepare).toHaveBeenCalledWith('SELECT sqlite_version() AS version');
    expect(close).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(databasePath)).toEqual(before);
  });

  it('rejects missing files, directories, and non-SQLite files', () => {
    expect(() =>
      testSQLiteConnection(connection(path.join(directory, 'missing.sqlite'))),
    ).toThrow('does not exist');
    expect(() => testSQLiteConnection(connection(directory))).toThrow(
      'selected path is a directory',
    );

    const textFile = path.join(directory, 'not-sqlite.db');
    fs.writeFileSync(textFile, 'plain text');
    MockSqliteDatabase.mockImplementationOnce(() => {
      const error = new Error('file is not a database') as Error & {
        code: string;
      };
      error.code = 'SQLITE_NOTADB';
      throw error;
    });
    expect(() => testSQLiteConnection(connection(textFile))).toThrow(
      'not a valid SQLite database',
    );
  });

  it('returns rows and normalizes values for the existing result grid', () => {
    prepare.mockReturnValueOnce({
      reader: true,
      columns: () => [
        { name: 'safe_id' },
        { name: 'large_id' },
        { name: 'data' },
      ],
      all: () => [
        {
          safe_id: BigInt(42),
          large_id: BigInt('9007199254740993'),
          data: Buffer.from('sqlite'),
        },
      ],
    });

    expect(
      executeSQLiteQuery(connection('/tmp/analytics.sqlite'), 'SELECT 1'),
    ).toEqual({
      success: true,
      data: [
        {
          safe_id: 42,
          large_id: '9007199254740993',
          data: Buffer.from('sqlite').toString('base64'),
        },
      ],
      fields: [
        { name: 'safe_id', type: -1 },
        { name: 'large_id', type: -1 },
        { name: 'data', type: -1 },
      ],
      rowCount: 1,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns affected rows for non-row statements', () => {
    prepare.mockReturnValueOnce({
      reader: false,
      run: () => ({ changes: 2 }),
    });

    expect(
      executeSQLiteQuery(
        connection('/tmp/analytics.sqlite'),
        'UPDATE metrics SET value = 1',
      ),
    ).toEqual({
      success: true,
      data: [],
      fields: [],
      rowCount: 2,
      isCommand: true,
      commandType: 'DML',
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('extracts tables and views and safely quotes object names', () => {
    prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM sqlite_schema')) {
        return {
          all: () => [
            { name: 'metrics', type: 'table' },
            { name: 'odd"view', type: 'view' },
          ],
        };
      }
      if (sql === 'PRAGMA table_xinfo("metrics")') {
        return {
          all: () => [
            { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, pk: 1 },
          ],
        };
      }
      if (sql === 'PRAGMA table_xinfo("odd""view")') {
        return {
          all: () => [
            { cid: 0, name: 'label', type: 'TEXT', notnull: 0, pk: 0 },
          ],
        };
      }
      // Keys are read for tables only, never for views.
      if (sql === 'PRAGMA foreign_key_list("metrics")') {
        return { all: () => [] };
      }
      throw new Error(`Unexpected schema query: ${sql}`);
    });

    const tables = extractSQLiteSchema(connection('/tmp/analytics.sqlite'));

    expect(tables).toHaveLength(2);
    expect(tables[0]).toMatchObject({
      name: 'metrics',
      type: 'TABLE',
      schema: 'main',
      columns: [
        {
          name: 'id',
          typeName: 'INTEGER',
          ordinalPosition: 1,
          primaryKey: true,
          nullable: false,
        },
      ],
    });
    expect(tables[1]).toMatchObject({ name: 'odd"view', type: 'VIEW' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('reads foreign keys and matches their names to the real tables and columns', () => {
    const schema: Record<string, unknown[]> = {
      'FROM sqlite_schema': [
        { name: 'Customers', type: 'table' },
        { name: 'orders', type: 'table' },
      ],
      'PRAGMA table_xinfo("Customers")': [
        { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, pk: 1 },
      ],
      'PRAGMA table_xinfo("orders")': [
        { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, pk: 1 },
        { cid: 1, name: 'customer_id', type: 'INTEGER', notnull: 0, pk: 0 },
        { cid: 2, name: 'buyer_id', type: 'INTEGER', notnull: 0, pk: 0 },
        { cid: 3, name: 'note_id', type: 'INTEGER', notnull: 0, pk: 0 },
      ],
      'PRAGMA foreign_key_list("Customers")': [],
      'PRAGMA foreign_key_list("orders")': [
        // REFERENCES customers: no column, so the target's primary key.
        {
          id: 0,
          seq: 0,
          table: 'customers',
          from: 'customer_id',
          to: null,
          on_delete: 'CASCADE',
        },
        // FOREIGN KEY (Buyer_ID) REFERENCES CUSTOMERS(ID): any case.
        {
          id: 1,
          seq: 0,
          table: 'CUSTOMERS',
          from: 'Buyer_ID',
          to: 'ID',
          on_delete: 'NO ACTION',
        },
        // A key to a table that isn't there is kept as written.
        {
          id: 2,
          seq: 0,
          table: 'notes',
          from: 'note_id',
          to: 'nid',
          on_delete: 'NO ACTION',
        },
      ],
    };
    prepare.mockImplementation((sql: string) => {
      const key = Object.keys(schema).find((k) => sql.includes(k));
      if (!key) throw new Error(`Unexpected schema query: ${sql}`);
      return { all: () => schema[key] };
    });

    const tables = extractSQLiteSchema(connection('/tmp/shop.sqlite'));
    const orders = tables.find((t) => t.name === 'orders')!;
    const keysOf = (column: string) =>
      orders.columns
        .find((c) => c.name === column)!
        .foreignKeys!.map(
          (fk) =>
            `${fk.primaryTableSchema}.${fk.primaryTableName}.${fk.primaryColumnName} ${fk.deleteRule}`,
        );

    expect(keysOf('id')).toEqual([]);
    expect(keysOf('customer_id')).toEqual(['main.Customers.id CASCADE']);
    expect(keysOf('buyer_id')).toEqual(['main.Customers.id NO ACTION']);
    expect(keysOf('note_id')).toEqual(['main.notes.nid NO ACTION']);
  });

  it('pairs a key over two columns with the primary key by position, and folds A–Z only', () => {
    const schema: Record<string, unknown[]> = {
      'FROM sqlite_schema': [
        { name: 'parent', type: 'table' },
        { name: 'Ä', type: 'table' },
        { name: 'ä', type: 'table' },
        { name: 'child', type: 'table' },
      ],
      'PRAGMA table_xinfo("parent")': [
        { cid: 0, name: 'a', type: 'INTEGER', notnull: 1, pk: 1 },
        { cid: 1, name: 'b', type: 'INTEGER', notnull: 1, pk: 2 },
      ],
      'PRAGMA table_xinfo("Ä")': [
        { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, pk: 1 },
      ],
      'PRAGMA table_xinfo("ä")': [
        { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, pk: 1 },
      ],
      'PRAGMA table_xinfo("child")': [
        { cid: 0, name: 'x', type: 'INTEGER', notnull: 0, pk: 0 },
        { cid: 1, name: 'y', type: 'INTEGER', notnull: 0, pk: 0 },
        { cid: 2, name: 'upper_ref', type: 'INTEGER', notnull: 0, pk: 0 },
      ],
      'PRAGMA foreign_key_list("parent")': [],
      'PRAGMA foreign_key_list("Ä")': [],
      'PRAGMA foreign_key_list("ä")': [],
      'PRAGMA foreign_key_list("child")': [
        // FOREIGN KEY (x, y) REFERENCES parent: no target columns.
        {
          id: 0,
          seq: 0,
          table: 'parent',
          from: 'x',
          to: null,
          on_delete: 'NO ACTION',
        },
        {
          id: 0,
          seq: 1,
          table: 'parent',
          from: 'y',
          to: null,
          on_delete: 'NO ACTION',
        },
        // REFERENCES "Ä"(id): Ä and ä are two tables in SQLite.
        {
          id: 1,
          seq: 0,
          table: 'Ä',
          from: 'upper_ref',
          to: 'id',
          on_delete: 'NO ACTION',
        },
      ],
    };
    prepare.mockImplementation((sql: string) => {
      const key = Object.keys(schema).find((k) => sql.includes(k));
      if (!key) throw new Error(`Unexpected schema query: ${sql}`);
      return { all: () => schema[key] };
    });

    const tables = extractSQLiteSchema(connection('/tmp/keys.sqlite'));
    const child = tables.find((t) => t.name === 'child')!;
    const keysOf = (column: string) =>
      child.columns
        .find((c) => c.name === column)!
        .foreignKeys!.map(
          (fk) => `${fk.primaryTableName}.${fk.primaryColumnName}`,
        );

    expect(keysOf('x')).toEqual(['parent.a']);
    expect(keysOf('y')).toEqual(['parent.b']);
    expect(keysOf('upper_ref')).toEqual(['Ä.id']);
  });
});
