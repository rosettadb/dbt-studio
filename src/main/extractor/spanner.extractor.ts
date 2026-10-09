import type { Column, SpannerConnection, Table } from '../../types/backend';
import { acquireSpannerDatabase } from '../utils/spannerClient';
import { confirmSpannerSchemaRefreshed } from '../utils/spannerQuery';

export default class SpannerExtractor {
  private readonly connection: SpannerConnection;

  constructor(connection: SpannerConnection) {
    this.connection = connection;
  }

  async extractSchema(): Promise<{ tables: Table[] }> {
    const { database, release } = await acquireSpannerDatabase(this.connection);
    try {
      return await this.readSchema(database);
    } finally {
      release();
    }
  }

  private async readSchema(database: any): Promise<{ tables: Table[] }> {
    // One strong read-only snapshot: a consistent view of tables, columns and
    // keys that also includes DDL that has just finished.
    const [snapshot] = await database.getSnapshot({ strong: true });
    try {
      return await this.readSchemaFrom(snapshot);
    } finally {
      snapshot.end();
    }
  }

  private async readSchemaFrom(snapshot: any): Promise<{ tables: Table[] }> {
    const pg = this.connection.dialect === 'POSTGRESQL';
    const info = pg ? 'information_schema' : 'INFORMATION_SCHEMA';
    const excluded = pg
      ? "('information_schema','pg_catalog','spanner_sys')"
      : "('INFORMATION_SCHEMA','SPANNER_SYS')";

    const [tableRows] = await snapshot.run({
      sql: `SELECT table_schema, table_name, table_type FROM ${info}.tables WHERE table_schema NOT IN ${excluded} ORDER BY table_schema, table_name`,
      json: true,
    });

    const [columnRows] = await snapshot.run({
      sql: `SELECT table_schema, table_name, column_name, ordinal_position, is_nullable, ${pg ? 'data_type' : 'spanner_type'} AS type_name FROM ${info}.columns WHERE table_schema NOT IN ${excluded} ORDER BY table_schema, table_name, ordinal_position`,
      json: true,
    });

    const [keyRows] = await snapshot
      .run({
        sql: `SELECT table_schema, table_name, column_name, ordinal_position FROM ${info}.index_columns WHERE index_type = 'PRIMARY_KEY'`,
        json: true,
      })
      .catch(() => [[]]);

    // Position of each primary-key column within its key (1-based).
    const primaryKeys = new Map<string, number>(
      (keyRows as any[]).map((row) => [
        `${row.table_schema}.${row.table_name}.${row.column_name}`,
        Number(row.ordinal_position) || 1,
      ]),
    );

    const columnsByTable = new Map<string, Column[]>();
    (columnRows as any[]).forEach((row) => {
      const key = `${row.table_schema}.${row.table_name}`;
      const columns = columnsByTable.get(key) || [];
      const keyPosition = primaryKeys.get(`${key}.${row.column_name}`);
      const primaryKey = keyPosition !== undefined;
      columns.push({
        name: row.column_name,
        typeName: row.type_name || 'UNKNOWN',
        ordinalPosition: Number(row.ordinal_position || columns.length + 1),
        primaryKeySequenceId: keyPosition ?? 0,
        columnDisplaySize: 0,
        scale: 0,
        precision: 0,
        columnProperties: [],
        autoincrement: false,
        primaryKey,
        nullable: String(row.is_nullable).toUpperCase() === 'YES',
      });
      columnsByTable.set(key, columns);
    });

    const schema = {
      tables: (tableRows as any[]).map((row) => ({
        name: row.table_name,
        type: /VIEW/i.test(row.table_type) ? 'VIEW' : 'TABLE',
        schema: row.table_schema || (pg ? 'public' : 'default'),
        columns:
          columnsByTable.get(`${row.table_schema}.${row.table_name}`) || [],
      })),
    };

    confirmSpannerSchemaRefreshed(this.connection.name);
    return schema;
  }
}
