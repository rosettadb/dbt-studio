import type { Column, Table } from '../../types/backend';
import type { SpannerConnection } from './spanner.shared';
import {
  type SpannerDialect,
  withSpannerDatabase,
} from './spanner.client.main';

type Row = Record<string, any>;

const SYSTEM_SCHEMAS: Record<SpannerDialect, string> = {
  GOOGLE_STANDARD_SQL: "('INFORMATION_SCHEMA','SPANNER_SYS')",
  POSTGRESQL: "('information_schema','pg_catalog','spanner_sys')",
};

/** The three information-schema queries, per dialect. Aliases pin the result key case. */
export function schemaQueries(dialect: SpannerDialect) {
  const pg = dialect === 'POSTGRESQL';
  const info = pg ? 'information_schema' : 'INFORMATION_SCHEMA';
  const excluded = SYSTEM_SCHEMAS[dialect];
  return {
    tables: `SELECT table_schema AS table_schema, table_name AS table_name, table_type AS table_type FROM ${info}.tables WHERE table_schema NOT IN ${excluded} ORDER BY table_schema, table_name`,
    columns: `SELECT table_schema AS table_schema, table_name AS table_name, column_name AS column_name, ordinal_position AS ordinal_position, is_nullable AS is_nullable, ${pg ? 'data_type' : 'spanner_type'} AS type_name FROM ${info}.columns WHERE table_schema NOT IN ${excluded} ORDER BY table_schema, table_name, ordinal_position`,
    keys: `SELECT table_schema AS table_schema, table_name AS table_name, column_name AS column_name, ordinal_position AS ordinal_position FROM ${info}.index_columns WHERE index_type = 'PRIMARY_KEY'`,
  };
}

/**
 * GoogleSQL's default schema has no name, and SQL can't qualify its tables
 * with one, so it stays empty: callers then write the bare table name.
 */
const schemaName = (name: string, dialect: SpannerDialect): string =>
  name || (dialect === 'POSTGRESQL' ? 'public' : '');

export default class SpannerExtractor {
  private readonly conn: SpannerConnection;

  constructor(conn: SpannerConnection) {
    this.conn = conn;
  }

  async extractSchema(): Promise<{ tables: Table[] }> {
    return withSpannerDatabase(this.conn, async (lease) => {
      const dialect = await lease.dialect();
      // One strong read-only snapshot: a consistent view of tables, columns and
      // keys that also includes DDL that has just finished.
      const [snapshot] = await lease.database.getSnapshot({ strong: true });
      try {
        return await this.read(snapshot, dialect);
      } finally {
        snapshot.end();
      }
    });
  }

  private async read(
    snapshot: any,
    dialect: SpannerDialect,
  ): Promise<{ tables: Table[] }> {
    const queries = schemaQueries(dialect);
    const [tableRows] = await snapshot.run({ sql: queries.tables, json: true });
    const [columnRows] = await snapshot.run({
      sql: queries.columns,
      json: true,
    });
    const [keyRows] = await snapshot.run({ sql: queries.keys, json: true });

    // 1-based position of each primary-key column within its key.
    const keyPosition = new Map<string, number>(
      (keyRows as Row[]).map((row) => [
        `${row.table_schema}.${row.table_name}.${row.column_name}`,
        Number(row.ordinal_position) || 1,
      ]),
    );

    const columnsByTable = new Map<string, Column[]>();
    (columnRows as Row[]).forEach((row) => {
      const table = `${row.table_schema}.${row.table_name}`;
      const columns = columnsByTable.get(table) ?? [];
      const position = keyPosition.get(`${table}.${row.column_name}`);
      columns.push({
        name: row.column_name,
        typeName: row.type_name || 'UNKNOWN',
        ordinalPosition: Number(row.ordinal_position) || columns.length + 1,
        primaryKeySequenceId: position ?? 0,
        columnDisplaySize: 0,
        scale: 0,
        precision: 0,
        columnProperties: [],
        autoincrement: false,
        primaryKey: position !== undefined,
        nullable: String(row.is_nullable).toUpperCase() === 'YES',
      });
      columnsByTable.set(table, columns);
    });

    return {
      tables: (tableRows as Row[]).map((row) => ({
        name: row.table_name,
        type: /VIEW/i.test(row.table_type) ? 'VIEW' : 'TABLE',
        schema: schemaName(row.table_schema, dialect),
        columns:
          columnsByTable.get(`${row.table_schema}.${row.table_name}`) ?? [],
      })),
    };
  }
}
