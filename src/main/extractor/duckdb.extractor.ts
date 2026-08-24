import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { Column, Table } from '../../types/backend';

export default class DuckDBSchemaExtractor {
  private database_path: string;

  private schema: string;

  constructor(config: { database_path: string; schema?: string }) {
    this.database_path = config.database_path;
    this.schema = config.schema || 'main';
  }

  /**
   * DuckDB holds an exclusive lock on the database file, so opening a second
   * instance while the first is still alive fails. Everything is read over one
   * connection, and tables and views come from a single query so that an object
   * can never be collected twice under two different types.
   */
  async extractSchema(): Promise<{ tables: Table[] }> {
    const instance = await DuckDBInstance.create(this.database_path);
    let connection: DuckDBConnection | undefined;

    try {
      connection = await instance.connect();

      const columnsByTable = await this.getColumnsByTable(connection);
      const objects = await this.query(
        connection,
        `SELECT table_name, table_type
         FROM information_schema.tables
         WHERE table_schema = ?
         ORDER BY table_name`,
      );

      return {
        tables: objects.map((object) => ({
          name: object.table_name,
          type: object.table_type === 'VIEW' ? 'VIEW' : 'TABLE',
          schema: this.schema,
          columns: columnsByTable.get(object.table_name) ?? [],
        })),
      };
    } finally {
      connection?.closeSync();
      instance.closeSync();
    }
  }

  private async getColumnsByTable(
    connection: DuckDBConnection,
  ): Promise<Map<string, Column[]>> {
    const rows = await this.query(
      connection,
      `SELECT table_name, column_name, data_type, ordinal_position, is_nullable
       FROM information_schema.columns
       WHERE table_schema = ?
       ORDER BY table_name, ordinal_position`,
    );

    const columnsByTable = new Map<string, Column[]>();
    rows.forEach((row) => {
      const columns = columnsByTable.get(row.table_name) ?? [];
      columns.push({
        name: row.column_name,
        typeName: row.data_type,
        ordinalPosition: row.ordinal_position,
        primaryKeySequenceId: 0,
        columnDisplaySize: 0,
        scale: 0,
        precision: 0,
        columnProperties: [],
        autoincrement: false,
        primaryKey: false,
        nullable: row.is_nullable === 'YES',
      });
      columnsByTable.set(row.table_name, columns);
    });

    return columnsByTable;
  }

  private async query(
    connection: DuckDBConnection,
    sql: string,
  ): Promise<any[]> {
    const reader = await connection.runAndReadAll(sql, [this.schema]);
    return reader.getRowObjectsJS();
  }
}
