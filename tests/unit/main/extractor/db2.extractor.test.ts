import {
  DB2_SCHEMA_SQL,
  Db2SchemaRow,
  mapDb2SchemaRows,
} from '../../../../src/main/extractor/db2.extractor';

const row = (patch: Partial<Db2SchemaRow>): Db2SchemaRow => ({
  TABSCHEMA: 'DB2INST1',
  TABNAME: 'ORDERS',
  TYPE: 'T',
  COLNAME: 'ID',
  COLNO: 0,
  TYPENAME: 'INTEGER',
  LENGTH: 4,
  SCALE: 0,
  NULLS: 'N',
  KEYSEQ: 1,
  IDENTITY: 'Y',
  ...patch,
});

describe('Db2 schema extraction', () => {
  it('groups columns into tables and views, keeping stored name case', () => {
    const tables = mapDb2SchemaRows([
      row({}),
      row({
        COLNAME: 'AMOUNT',
        COLNO: 1,
        TYPENAME: 'DECIMAL',
        LENGTH: 12,
        SCALE: 2,
        NULLS: 'Y',
        KEYSEQ: null,
        IDENTITY: 'N',
      }),
      row({
        TABSCHEMA: 'MixedCase',
        TABNAME: 'OrderLines',
        TYPE: 'V ',
        COLNAME: 'LineId',
      }),
    ]);

    expect(tables).toHaveLength(2);
    expect(tables[0]).toMatchObject({
      schema: 'DB2INST1',
      name: 'ORDERS',
      type: 'TABLE',
    });
    expect(tables[0].columns).toEqual([
      expect.objectContaining({
        name: 'ID',
        ordinalPosition: 1,
        primaryKey: true,
        primaryKeySequenceId: 1,
        autoincrement: true,
        nullable: false,
      }),
      expect.objectContaining({
        name: 'AMOUNT',
        typeName: 'DECIMAL',
        ordinalPosition: 2,
        precision: 12,
        scale: 2,
        primaryKey: false,
        nullable: true,
      }),
    ]);
    expect(tables[1]).toMatchObject({
      schema: 'MixedCase',
      name: 'OrderLines',
      type: 'VIEW',
    });
  });

  it('reads only user tables, views and MQTs', () => {
    expect(DB2_SCHEMA_SQL).toContain("T.TYPE IN ('T', 'V', 'S')");
    expect(DB2_SCHEMA_SQL).toContain("T.TABSCHEMA NOT LIKE 'SYS%'");
    expect(DB2_SCHEMA_SQL).toContain("NOT IN ('NULLID', 'SQLJ')");
  });
});
