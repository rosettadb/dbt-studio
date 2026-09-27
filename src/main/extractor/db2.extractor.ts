import { Column, Db2Connection, Table } from '../../types/backend';
import { runInDb2Slot, withDb2Connection } from '../services/db2/db2Query';

/**
 * User tables, views and materialized query tables with their columns.
 * System schemas are excluded; there is no user input in this statement.
 */
export const DB2_SCHEMA_SQL = `
SELECT T.TABSCHEMA, T.TABNAME, T.TYPE,
       C.COLNAME, C.COLNO, C.TYPENAME, C.LENGTH, C.SCALE,
       C.NULLS, C.KEYSEQ, C.IDENTITY
FROM SYSCAT.TABLES T
JOIN SYSCAT.COLUMNS C
  ON C.TABSCHEMA = T.TABSCHEMA AND C.TABNAME = T.TABNAME
WHERE T.TYPE IN ('T', 'V', 'S')
  AND T.TABSCHEMA NOT LIKE 'SYS%'
  AND T.TABSCHEMA NOT IN ('NULLID', 'SQLJ')
ORDER BY T.TABSCHEMA, T.TABNAME, C.COLNO`;

export type Db2SchemaRow = {
  TABSCHEMA: string;
  TABNAME: string;
  TYPE: string;
  COLNAME: string;
  COLNO: number;
  TYPENAME: string;
  LENGTH: number;
  SCALE: number;
  NULLS: string;
  KEYSEQ: number | null;
  IDENTITY: string;
};

// Catalog CHAR columns are blank-padded.
const clean = (value: unknown) => String(value ?? '').trimEnd();

/** Groups catalog rows into tables. Names keep Db2's stored (usually uppercase) case. */
export const mapDb2SchemaRows = (rows: Db2SchemaRow[]): Table[] => {
  const tables = new Map<string, Table>();

  rows.forEach((row) => {
    const schema = clean(row.TABSCHEMA);
    const name = clean(row.TABNAME);
    const key = `${schema}\u0000${name}`;
    let table = tables.get(key);
    if (!table) {
      table = {
        schema,
        name,
        type: clean(row.TYPE) === 'V' ? 'VIEW' : 'TABLE',
        columns: [],
      };
      tables.set(key, table);
    }

    const keySequence = Number(row.KEYSEQ ?? 0);
    const column: Column = {
      name: clean(row.COLNAME),
      typeName: clean(row.TYPENAME),
      ordinalPosition: Number(row.COLNO) + 1,
      primaryKeySequenceId: keySequence,
      columnDisplaySize: Number(row.LENGTH ?? 0),
      scale: Number(row.SCALE ?? 0),
      precision: Number(row.LENGTH ?? 0),
      columnProperties: [],
      autoincrement: clean(row.IDENTITY) === 'Y',
      primaryKey: keySequence > 0,
      nullable: clean(row.NULLS) === 'Y',
    };
    table.columns.push(column);
  });

  return Array.from(tables.values());
};

export default class Db2Extractor {
  private readonly connection: Db2Connection;

  constructor(connection: Db2Connection) {
    this.connection = connection;
  }

  async extractSchema(): Promise<{ tables: Table[] }> {
    const rows = await runInDb2Slot(() =>
      withDb2Connection(
        this.connection,
        async (db) => (await db.query(DB2_SCHEMA_SQL)) as Db2SchemaRow[],
      ),
    );
    return { tables: mapDb2SchemaRows(rows) };
  }
}
