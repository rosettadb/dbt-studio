import driver, { connection } from '../../__setup__/oracledb.mock';
import OracleExtractor from '../../../../src/main/extractor/oracle.extractor';
import type { OracleConnection } from '../../../../src/types/backend';

const config: OracleConnection = {
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

const catalogCalls = () =>
  connection.execute.mock.calls.filter(
    ([sql]) => !sql.startsWith('ALTER SESSION'),
  );

async function extract() {
  const extractor = new OracleExtractor(config, { password: 'secret' });
  await extractor.connect();
  return extractor.extractSchema();
}

describe('Oracle schema extraction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connection.thin = true;
    driver.getConnection.mockResolvedValue(connection);
  });
  it('maps metadata by exact owner, table and column with bound identifiers', async () => {
    const otherOwner = "Mixed'Case";
    connection.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('ALL_TABLES'))
        return {
          rows: [
            { OWNER: 'STUDIO', NAME: 'T', KIND: 'TABLE' },
            { OWNER: 'STUDIO', NAME: 'MV', KIND: 'MATERIALIZED VIEW' },
            { OWNER: otherOwner, NAME: 'T', KIND: 'VIEW' },
          ],
        };
      if (sql.includes('ALL_TAB_COLUMNS'))
        return {
          rows: [
            {
              OWNER: otherOwner,
              TABLE_NAME: 'T',
              COLUMN_NAME: 'ID',
              DATA_TYPE: 'DATE',
              COLUMN_ID: 1,
              NULLABLE: 'Y',
            },
            {
              OWNER: 'STUDIO',
              TABLE_NAME: 'T',
              COLUMN_NAME: 'ID',
              DATA_TYPE: 'NUMBER',
              DATA_PRECISION: 9,
              DATA_SCALE: 0,
              COLUMN_ID: 1,
              NULLABLE: 'N',
            },
            {
              OWNER: 'STUDIO',
              TABLE_NAME: 'T',
              COLUMN_NAME: 'NAME',
              DATA_TYPE: 'VARCHAR2',
              CHAR_LENGTH: 20,
              CHAR_USED: 'C',
              COLUMN_ID: 2,
              NULLABLE: 'Y',
            },
          ],
        };
      if (sql.includes('ALL_CONS_COLUMNS'))
        return {
          rows: [
            {
              OWNER: 'STUDIO',
              TABLE_NAME: 'T',
              COLUMN_NAME: 'ID',
              POSITION: 1,
            },
          ],
        };
      return {};
    });
    const result = await extract();
    expect(
      result.tables.map((table) => [table.schema, table.name, table.type]),
    ).toEqual([
      ['STUDIO', 'T', 'TABLE'],
      ['STUDIO', 'MV', 'MATERIALIZED VIEW'],
      [otherOwner, 'T', 'VIEW'],
    ]);
    expect(result.tables[0].columns[0]).toMatchObject({
      name: 'ID',
      typeName: 'NUMBER(9,0)',
      primaryKey: true,
      primaryKeySequenceId: 1,
      nullable: false,
    });
    expect(result.tables[0].columns[1]).toMatchObject({
      typeName: 'VARCHAR2(20 CHAR)',
      nullable: true,
    });
    expect(result.tables[1].columns).toEqual([]);
    expect(result.tables[2].columns).toEqual([
      expect.objectContaining({
        name: 'ID',
        typeName: 'DATE',
        primaryKey: false,
        primaryKeySequenceId: 0,
      }),
    ]);
    const [objects, columns, keys] = catalogCalls();
    expect(objects[1]).toEqual({ owner: 'STUDIO', cap: 20001 });
    expect(objects[0]).toContain('NOT EXISTS');
    expect(objects[0]).toContain("TABLE_NAME NOT LIKE 'BIN$%'");
    expect(objects[0]).toContain("ORACLE_MAINTAINED = 'N'");
    expect(objects[0]).toContain('CASE WHEN OWNER = :owner THEN 0 ELSE 1 END');
    expect(columns[1]).toEqual({
      o0: 'STUDIO',
      t0: 'T',
      o1: 'STUDIO',
      t1: 'MV',
      o2: otherOwner,
      t2: 'T',
    });
    expect(keys[1]).toEqual(columns[1]);
    expect(columns[0]).not.toContain('ALL_CONSTRAINTS');
    expect(columns[0]).not.toContain(otherOwner);
    expect(keys[0]).not.toContain(otherOwner);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });
  it('batches many owners without per-schema queries and bounds each metadata batch', async () => {
    connection.execute.mockImplementation(async (sql: string) => ({
      rows: sql.includes('ALL_TABLES')
        ? Array.from({ length: 1001 }, (_v, index) => ({
            OWNER: `OWNER${index}`,
            NAME: 'T',
            KIND: 'TABLE',
          }))
        : [],
    }));
    const result = await extract();
    expect(result.tables).toHaveLength(1001);
    const calls = catalogCalls();
    expect(calls.filter(([sql]) => sql.includes('ALL_TABLES'))).toHaveLength(1);
    const columnCalls = calls.filter(([sql]) =>
      sql.includes('ALL_TAB_COLUMNS'),
    );
    const keyCalls = calls.filter(([sql]) => sql.includes('ALL_CONS_COLUMNS'));
    expect(columnCalls).toHaveLength(3);
    expect(keyCalls).toHaveLength(3);
    expect(columnCalls.map((call) => Object.keys(call[1]).length)).toEqual([
      1000, 1000, 2,
    ]);
    expect(columnCalls[2][1]).toEqual({ o0: 'OWNER1000', t0: 'T' });
    calls.forEach((call) =>
      expect(call[2]).toMatchObject({ fetchArraySize: 1000 }),
    );
  });
  it('caps catalogs at 20,000 objects and excludes the sentinel from metadata reads', async () => {
    connection.execute.mockImplementation(async (sql: string) => ({
      rows: sql.includes('ALL_TABLES')
        ? Array.from({ length: 20001 }, (_v, index) => ({
            OWNER: 'STUDIO',
            NAME: `T${index}`,
            KIND: 'TABLE',
          }))
        : [],
    }));
    const result = await extract();
    expect(result.tables).toHaveLength(20000);
    expect(
      catalogCalls()
        .slice(1)
        .some((call) => Object.values(call[1]).includes('T20000')),
    ).toBe(false);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });
  it('returns an empty catalog without querying columns or keys', async () => {
    connection.execute.mockResolvedValue({ rows: [] });
    await expect(extract()).resolves.toEqual({ tables: [] });
    expect(catalogCalls()).toHaveLength(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });
  it.each(['ALL_TABLES', 'ALL_TAB_COLUMNS', 'ALL_CONS_COLUMNS'])(
    'closes and scrubs a failed %s catalog read',
    async (stage) => {
      connection.execute.mockImplementation(async (sql: string) => {
        if (sql.includes(stage)) throw new Error('ORA-00001: secret');
        return {
          rows: sql.includes('ALL_TABLES')
            ? [{ OWNER: 'STUDIO', NAME: 'T', KIND: 'TABLE' }]
            : [],
        };
      });
      const extractor = new OracleExtractor(config, { password: 'secret' });
      await extractor.connect();
      await expect(extractor.extractSchema()).rejects.toThrow(
        'ORA-00001: [redacted]',
      );
      await extractor.disconnect();
      expect(connection.close).toHaveBeenCalledTimes(1);
    },
  );
});
