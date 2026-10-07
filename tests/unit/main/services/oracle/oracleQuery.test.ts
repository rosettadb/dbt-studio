import type { Metadata, ExecuteOptions } from 'oracledb';
import driver, {
  connection,
  resultSet,
} from '../../../__setup__/oracledb.mock';
import {
  executeOracleQuery,
  mapOracleValue,
  normalizeOracleStatement,
  testOracleConnection,
} from '../../../../../src/main/utils/oracleHelper';
import type { OracleConnection } from '../../../../../src/types/backend';

const conn: OracleConnection = {
  type: 'oracle',
  name: 'test',
  connectMode: 'basic',
  host: 'localhost',
  port: 1521,
  serviceName: 'FREEPDB1',
  username: 'STUDIO',
  password: '',
  database: '',
  schema: 'STUDIO',
};
const secrets = { password: 'p$ss', walletPassword: 'wallet-secret' };
const realTypeDriver = driver as unknown as Awaited<
  ReturnType<
    typeof import('../../../../../src/main/utils/oracleHelper').loadOracleDriver
  >
>;
const meta = (type: number) =>
  ({ name: 'VALUE', dbType: type }) as unknown as Metadata<never>;

beforeEach(() => {
  jest.clearAllMocks();
  driver.getConnection.mockResolvedValue(connection);
  connection.thin = true;
  connection.oracleServerVersionString = '23.0.0.0.0';
  connection.execute.mockImplementation(async (sql: string) => {
    if (sql.startsWith('ALTER SESSION')) return {};
    if (sql.includes('SYS_CONTEXT')) return { rows: [{ DB_NAME: 'FREE' }] };
    return {
      resultSet,
      metaData: [
        { name: 'ID', dbType: driver.DB_TYPE_NUMBER, precision: 9, scale: 0 },
      ],
    };
  });
  resultSet.getRows.mockResolvedValue([{ ID: 1 }]);
});

describe('Oracle test connection', () => {
  it('returns database metadata and closes', async () => {
    expect(await testOracleConnection(conn, secrets)).toEqual({
      success: true,
      database: 'FREE',
    });
    expect(connection.close).toHaveBeenCalledTimes(1);
  });
  it('rejects old and unknown server versions', async () => {
    connection.oracleServerVersionString = '11.2.0.0.0';
    await expect(testOracleConnection(conn, secrets)).rejects.toThrow(
      '12.1 or later is required (server reports 11.2.0.0.0)',
    );
    expect(connection.close).toHaveBeenCalledTimes(1);
  });
  it('maps Thin old-server errors', async () => {
    driver.getConnection.mockRejectedValueOnce(
      new Error('NJS-138: unsupported'),
    );
    await expect(testOracleConnection(conn, secrets)).rejects.toThrow(
      '12.1 or later',
    );
  });
  it('keeps Oracle errors while scrubbing both secrets', async () => {
    driver.getConnection.mockRejectedValueOnce(
      new Error('ORA-01017: p$ss wallet-secret'),
    );
    await expect(testOracleConnection(conn, secrets)).rejects.toThrow(
      'ORA-01017: [redacted] [redacted]',
    );
  });
});

describe('Oracle query execution', () => {
  it.each([
    ['SELECT 1 FROM DUAL; ', 'SELECT 1 FROM DUAL'],
    ['-- comment\nBEGIN NULL; END;\n/', '-- comment\nBEGIN NULL; END;'],
    [
      '/* comment */ DECLARE x NUMBER; BEGIN NULL; END;\n /',
      '/* comment */ DECLARE x NUMBER; BEGIN NULL; END;',
    ],
    [
      'CREATE OR REPLACE EDITIONABLE PACKAGE BODY p AS PROCEDURE f IS BEGIN NULL; END; END;\n/',
      'CREATE OR REPLACE EDITIONABLE PACKAGE BODY p AS PROCEDURE f IS BEGIN NULL; END; END;',
    ],
    ["SELECT ';' AS X FROM DUAL;", "SELECT ';' AS X FROM DUAL"],
  ])('normalizes statements', (input, output) =>
    expect(normalizeOracleStatement(input)).toBe(output),
  );
  it.each([0, 10000, 10001])(
    'returns all %i rows from the SQL result',
    async (count) => {
      resultSet.getRows.mockResolvedValueOnce(
        Array.from({ length: count }, (_v, index) => ({ ID: index })),
      );
      const result = await executeOracleQuery(
        conn,
        'SELECT * FROM BIG_T;',
        secrets,
      );
      expect(result.data).toHaveLength(count);
      expect(result.rowCount).toBe(count);
      expect(result.data?.[count - 1]).toEqual(
        count ? { ID: count - 1 } : undefined,
      );
      expect(resultSet.getRows).toHaveBeenCalledWith();
      expect(resultSet.close).toHaveBeenCalledTimes(1);
      expect(connection.close).toHaveBeenCalledTimes(1);
      expect(connection.execute).toHaveBeenCalledWith(
        'SELECT * FROM BIG_T',
        [],
        expect.objectContaining({
          autoCommit: true,
          resultSet: true,
          outFormat: driver.OUT_FORMAT_OBJECT,
        }),
      );
    },
  );
  it('passes SQL pagination through without adding a result limit', async () => {
    const sql =
      'SELECT ID FROM T ORDER BY ID OFFSET 10 ROWS FETCH NEXT 5 ROWS ONLY';
    resultSet.getRows.mockResolvedValueOnce(
      Array.from({ length: 5 }, (_v, index) => ({ ID: index + 10 })),
    );
    const result = await executeOracleQuery(conn, sql, secrets);
    expect(connection.execute).toHaveBeenLastCalledWith(
      sql,
      [],
      expect.any(Object),
    );
    expect(result.rowCount).toBe(5);
    expect(result.data).toEqual([
      { ID: 10 },
      { ID: 11 },
      { ID: 12 },
      { ID: 13 },
      { ID: 14 },
    ]);
  });
  it('keeps every row when the driver supplies rows directly', async () => {
    const rows = Array.from({ length: 10001 }, (_v, index) => ({ ID: index }));
    connection.execute.mockImplementation(async (statement: string) =>
      statement.startsWith('ALTER SESSION')
        ? {}
        : { rows, metaData: [{ name: 'ID', dbType: driver.DB_TYPE_NUMBER }] },
    );
    const result = await executeOracleQuery(conn, 'SELECT ID FROM T', secrets);
    expect(result.data).toEqual(rows);
    expect(result.rowCount).toBe(rows.length);
    expect(resultSet.getRows).not.toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalledTimes(1);
  });
  it('requests exact NUMBER strings and stable dates without converting safe integers', async () => {
    await executeOracleQuery(conn, 'SELECT 1 FROM DUAL', secrets);
    const options = connection.execute.mock.calls.at(-1)![2] as ExecuteOptions;
    const handler = options.fetchTypeHandler!;
    expect(
      handler({ ...meta(driver.DB_TYPE_NUMBER), precision: 15, scale: 0 }),
    ).toBeUndefined();
    // eslint-disable-next-line no-restricted-syntax
    for (const [precision, scale] of [
      [0, 0],
      [16, 0],
      [9, 2],
    ])
      expect(
        handler({ ...meta(driver.DB_TYPE_NUMBER), precision, scale }),
      ).toEqual({ type: driver.DB_TYPE_VARCHAR });
    expect(handler(meta(driver.DB_TYPE_TIMESTAMP_TZ))).toEqual({
      type: driver.DB_TYPE_VARCHAR,
    });
    expect(handler(meta(driver.DB_TYPE_INTERVAL_DS))).toBeUndefined();
  });
  it.each([
    ['INSERT INTO T VALUES (1);', { rowsAffected: 3 }, 'DML', 3],
    ['CREATE TABLE T (ID NUMBER);', {}, 'DDL', 0],
    ['BEGIN NULL; END;\n/', {}, 'PLSQL', 0],
  ])('reports commands', async (sql, result, commandType, rowCount) => {
    connection.execute.mockImplementation(async (statement: string) =>
      statement.startsWith('ALTER SESSION') ? {} : result,
    );
    expect(await executeOracleQuery(conn, sql, secrets)).toEqual({
      success: true,
      isCommand: true,
      commandType,
      rowCount,
    });
  });
  it('uses break for cancellation and closes', async () => {
    const result = await executeOracleQuery(
      conn,
      'SELECT * FROM T',
      secrets,
      (cancel) => cancel(),
    );
    expect(connection.break).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: false, error: 'Query cancelled' });
    expect(connection.close).toHaveBeenCalled();
  });
  it.each([
    ['ORA-01013: cancelled', 'Query cancelled'],
    ['NJS-123: timeout', 'Query stopped after the 10-minute Oracle time limit'],
    ['ORA-00001: p$ss wallet-secret', 'ORA-00001: [redacted] [redacted]'],
  ])('maps failures and releases cursors', async (message, error) => {
    resultSet.getRows.mockRejectedValueOnce(new Error(message));
    expect(await executeOracleQuery(conn, 'SELECT * FROM T', secrets)).toEqual({
      success: false,
      error,
    });
    expect(resultSet.close).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });
});

describe('Oracle IPC value mapping', () => {
  it.each([
    [driver.DB_TYPE_NUMBER, '9007199254740993.12', '9007199254740993.12'],
    [driver.DB_TYPE_NUMBER, 123, 123],
    [driver.DB_TYPE_BINARY_DOUBLE, 3.2, 3.2],
    [driver.DB_TYPE_DATE, '2026-10-06 12:00:00', '2026-10-06 12:00:00'],
    [
      driver.DB_TYPE_TIMESTAMP,
      '2026-10-06 12:00:00.123',
      '2026-10-06 12:00:00.123',
    ],
    [driver.DB_TYPE_BOOLEAN, true, true],
    [driver.DB_TYPE_RAW, Buffer.from([1, 255]), '01ff'],
    [driver.DB_TYPE_BLOB, Buffer.from([1, 2]), '<BLOB 2 bytes>'],
    [driver.DB_TYPE_LONG_RAW, Buffer.from([1]), '<BLOB 1 bytes>'],
    [driver.DB_TYPE_ROWID, 'AAA001', 'AAA001'],
    [driver.DB_TYPE_UROWID, 'BBB001', 'BBB001'],
    [driver.DB_TYPE_JSON, { a: 1 }, '{"a":1}'],
    [driver.DB_TYPE_JSON, 'value', '"value"'],
    [driver.DB_TYPE_VECTOR, new Float32Array([1, 2]), '[1,2]'],
    [driver.DB_TYPE_OBJECT, { secret: 'ignored' }, '<OBJECT unknown>'],
    [driver.DB_TYPE_INTERVAL_YM, { years: 2, months: 3 }, '+2-03'],
    [
      driver.DB_TYPE_INTERVAL_DS,
      { days: 1, hours: 2, minutes: 3, seconds: 4, fseconds: 5 },
      '+1 02:03:04.000000005',
    ],
    [driver.DB_TYPE_NUMBER, null, null],
  ])('maps type %i', async (type, value, expected) =>
    expect(await mapOracleValue(value, meta(type), realTypeDriver)).toEqual(
      expected,
    ),
  );
  it.each([driver.DB_TYPE_CLOB, driver.DB_TYPE_NCLOB])(
    'bounds CLOB reads and closes locators',
    async (type) => {
      const lob = {
        getData: jest.fn().mockResolvedValue('a'.repeat(65536)),
        length: 1000000,
        close: jest.fn().mockResolvedValue(undefined),
      };
      expect(await mapOracleValue(lob, meta(type), realTypeDriver)).toBe(
        `${'a'.repeat(65536)}… [truncated]`,
      );
      expect(lob.getData).toHaveBeenCalledWith(1, 65536);
      expect(lob.close).toHaveBeenCalled();
    },
  );
  it('does not fetch BFILE content', async () => {
    const lob = {
      length: 9000000,
      getData: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    expect(
      await mapOracleValue(lob, meta(driver.DB_TYPE_BFILE), realTypeDriver),
    ).toBe('<BLOB 9000000 bytes>');
    expect(lob.getData).not.toHaveBeenCalled();
  });
  it('bounds LONG and JSON output to 64 KiB', async () => {
    expect(
      (
        (await mapOracleValue(
          'a'.repeat(70000),
          meta(driver.DB_TYPE_LONG),
          realTypeDriver,
        )) as string
      ).length,
    ).toBe(65536 + '… [truncated]'.length);
    expect(
      await mapOracleValue(
        { a: 'x'.repeat(70000) },
        meta(driver.DB_TYPE_JSON),
        realTypeDriver,
      ),
    ).toMatch(/… \[truncated\]$/);
  });
});
