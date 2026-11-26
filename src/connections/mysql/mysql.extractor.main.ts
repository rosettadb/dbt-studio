/* eslint-disable no-restricted-syntax, no-await-in-loop, consistent-return */
import mysql from 'mysql2/promise';
import { Column, ForeignKey, Table } from '../../types/backend';

export default class MySqlExtractor {
  private connection: mysql.Connection | null = null;

  private readonly config: mysql.ConnectionOptions;

  constructor(config: {
    user: string;
    host: string;
    database: string;
    password: string;
    port: number;
    ssl?: boolean;
  }) {
    this.config = {
      user: config.user,
      host: config.host,
      database: config.database,
      password: config.password,
      port: config.port,
      connectTimeout: 5000,
      ...(config.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    };
  }

  async connect() {
    this.connection = await mysql.createConnection(this.config);
  }

  async disconnect() {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  private async getSchemas(): Promise<string[]> {
    const [rows] = await this.connection!.query(
      `SELECT schema_name
       FROM information_schema.schemata
       WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
       ORDER BY schema_name`,
    );
    return (rows as Array<{ SCHEMA_NAME: string }>).map(
      (row) => row.SCHEMA_NAME,
    );
  }

  private async getTables(schema: string): Promise<string[]> {
    const [rows] = await this.connection!.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = ? AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [schema],
    );
    return (rows as Array<{ TABLE_NAME: string }>).map((row) => row.TABLE_NAME);
  }

  private async getViews(schema: string): Promise<string[]> {
    const [rows] = await this.connection!.query(
      `SELECT table_name FROM information_schema.views
       WHERE table_schema = ?
       ORDER BY table_name`,
      [schema],
    );
    return (rows as Array<{ TABLE_NAME: string }>).map((row) => row.TABLE_NAME);
  }

  private async getDetailedColumns(
    schema: string,
    table: string,
  ): Promise<Column[]> {
    const [rows] = await this.connection!.query(
      `SELECT
         c.column_name,
         c.data_type,
         c.ordinal_position,
         c.is_nullable,
         c.character_maximum_length,
         c.numeric_precision,
         c.numeric_scale,
         c.column_default,
         c.column_key,
         c.extra
       FROM information_schema.columns c
       WHERE c.table_schema = ? AND c.table_name = ?
       ORDER BY c.ordinal_position`,
      [schema, table],
    );

    return (rows as any[]).map((row, index) => {
      const isPrimary = row.COLUMN_KEY === 'PRI';
      const isAutoIncrement =
        typeof row.EXTRA === 'string' &&
        row.EXTRA.toLowerCase().includes('auto_increment');
      return {
        name: row.COLUMN_NAME,
        typeName: row.DATA_TYPE,
        ordinalPosition: row.ORDINAL_POSITION,
        primaryKeySequenceId: isPrimary ? index + 1 : 0,
        columnDisplaySize:
          row.CHARACTER_MAXIMUM_LENGTH || row.NUMERIC_PRECISION || 0,
        scale: row.NUMERIC_SCALE || 0,
        precision: row.NUMERIC_PRECISION || 0,
        columnProperties: [],
        autoincrement: isAutoIncrement,
        primaryKey: isPrimary,
        nullable: row.IS_NULLABLE === 'YES',
      };
    });
  }

  /**
   * Every foreign key in the server's user schemas in one query, keyed by
   * `schema\0table\0column`. Empty when the query fails, so the schema still
   * loads.
   */
  private async getForeignKeys(): Promise<Map<string, ForeignKey[]>> {
    const byColumn = new Map<string, ForeignKey[]>();
    try {
      const [rows] = await this.connection!.query(
        `SELECT
           k.constraint_name AS name,
           k.table_schema AS table_schema,
           k.table_name AS table_name,
           k.column_name AS column_name,
           r.delete_rule AS delete_rule,
           k.referenced_table_schema AS primary_schema,
           k.referenced_table_name AS primary_table,
           k.referenced_column_name AS primary_column
         FROM information_schema.key_column_usage k
         JOIN information_schema.referential_constraints r
           ON r.constraint_schema = k.constraint_schema
          AND r.constraint_name = k.constraint_name
         WHERE k.referenced_table_name IS NOT NULL
           AND k.table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')`,
      );
      for (const row of rows as any[]) {
        const key = `${row.table_schema}\0${row.table_name}\0${row.column_name}`;
        const list = byColumn.get(key) ?? [];
        list.push({
          name: row.name,
          schema: row.table_schema,
          tableName: row.table_name,
          columnName: row.column_name,
          deleteRule: row.delete_rule,
          primaryTableSchema: row.primary_schema,
          primaryTableName: row.primary_table,
          primaryColumnName: row.primary_column,
        });
        byColumn.set(key, list);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('MySQL: could not read foreign keys', error);
    }
    return byColumn;
  }

  async extractSchema(): Promise<{ tables: Table[] }> {
    const schemas = await this.getSchemas();
    const foreignKeys = await this.getForeignKeys();
    const allTables: Table[] = [];

    for (const schema of schemas) {
      const tables = await this.getTables(schema);
      for (const table of tables) {
        const columns = await this.getDetailedColumns(schema, table);
        allTables.push({
          name: table,
          type: 'TABLE',
          schema,
          columns: columns.map((column) => ({
            ...column,
            foreignKeys:
              foreignKeys.get(`${schema}\0${table}\0${column.name}`) ?? [],
          })),
        });
      }

      const views = await this.getViews(schema);
      for (const view of views) {
        const columns = await this.getDetailedColumns(schema, view);
        allTables.push({
          name: view,
          type: 'VIEW',
          schema,
          columns,
        });
      }
    }

    return { tables: allTables };
  }
}
