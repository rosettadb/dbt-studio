/* eslint-disable no-restricted-syntax, no-await-in-loop, consistent-return */
import { Client } from 'pg';
import { Column, ForeignKey, Table } from '../../types/backend';

export default class PGSchemaExtractor {
  private client: Client;

  constructor(config: {
    user: string;
    host: string;
    database: string;
    password: string;
    port: number;
    ssl?: boolean;
    sslRejectUnauthorized?: boolean;
  }) {
    const clientConfig: any = {
      user: config.user,
      host: config.host,
      database: config.database,
      password: config.password,
      port: config.port,
    };

    if (config.ssl) {
      // Default to secure (true) if not specified, unless strictly documented otherwise.
      // However, to maintain some compatibility or valid default behavior:
      // The prompt asked: "rejectUnauthorized is set from config.sslRejectUnauthorized (default true when not provided)"
      const rejectUnauthorized =
        config.sslRejectUnauthorized !== undefined
          ? config.sslRejectUnauthorized
          : true;

      clientConfig.ssl = {
        rejectUnauthorized,
      };

      if (!rejectUnauthorized) {
        // eslint-disable-next-line no-console
        console.warn(
          'Postgres connection: SSL certificate verification is disabled (rejectUnauthorized: false). This is insecure.',
        );
      }
    }

    this.client = new Client(clientConfig);
  }

  async connect() {
    await this.client.connect();
  }

  async disconnect() {
    await this.client.end();
  }

  private async getSchemas(): Promise<string[]> {
    const res = await this.client.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema');
    `);
    return res.rows.map((row) => row.schema_name);
  }

  private async getTables(schema: string): Promise<string[]> {
    const res = await this.client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE';`,
      [schema],
    );
    return res.rows.map((row) => row.table_name);
  }

  private async getViews(schema: string): Promise<string[]> {
    const res = await this.client.query(
      `SELECT table_name FROM information_schema.views
       WHERE table_schema = $1;`,
      [schema],
    );
    return res.rows.map((row) => row.table_name);
  }

  private async getDetailedColumns(
    schema: string,
    table: string,
  ): Promise<Column[]> {
    const res = await this.client.query(
      `
      SELECT
        c.column_name,
        c.data_type,
        c.ordinal_position,
        c.is_nullable,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.column_default,
        EXISTS (
          SELECT 1
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = c.table_schema
            AND tc.table_name = c.table_name
            AND kcu.column_name = c.column_name
        ) AS is_primary
      FROM information_schema.columns c
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position;
      `,
      [schema, table],
    );

    return res.rows.map((row, index) => {
      const autoincrement = row.column_default?.includes('nextval') || false;
      return {
        name: row.column_name,
        typeName: row.data_type,
        ordinalPosition: row.ordinal_position,
        primaryKeySequenceId: row.is_primary ? index + 1 : 0,
        columnDisplaySize:
          row.character_maximum_length || row.numeric_precision || 0,
        scale: row.numeric_scale || 0,
        precision: row.numeric_precision || 0,
        columnProperties: [],
        autoincrement,
        primaryKey: row.is_primary,
        nullable: row.is_nullable === 'YES',
      };
    });
  }

  /**
   * Every foreign key in the database in one query, keyed by
   * `schema\0table\0column`. A key over several columns gives one entry per
   * column pair. Empty when the query fails, so the schema still loads.
   */
  private async getForeignKeys(): Promise<Map<string, ForeignKey[]>> {
    const byColumn = new Map<string, ForeignKey[]>();
    try {
      const res = await this.client.query(`
        SELECT
          con.conname AS name,
          ns.nspname AS schema,
          cl.relname AS table_name,
          att.attname AS column_name,
          CASE con.confdeltype
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
            WHEN 'r' THEN 'RESTRICT'
            ELSE 'NO ACTION'
          END AS delete_rule,
          fns.nspname AS primary_schema,
          fcl.relname AS primary_table,
          fatt.attname AS primary_column
        FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        JOIN pg_class fcl ON fcl.oid = con.confrelid
        JOIN pg_namespace fns ON fns.oid = fcl.relnamespace
        CROSS JOIN LATERAL unnest(con.conkey, con.confkey) AS k(col, fcol)
        JOIN pg_attribute att
          ON att.attrelid = con.conrelid AND att.attnum = k.col
        JOIN pg_attribute fatt
          ON fatt.attrelid = con.confrelid AND fatt.attnum = k.fcol
        WHERE con.contype = 'f'
          AND ns.nspname NOT IN ('pg_catalog', 'information_schema');
      `);
      for (const row of res.rows) {
        const key = `${row.schema}\0${row.table_name}\0${row.column_name}`;
        const list = byColumn.get(key) ?? [];
        list.push({
          name: row.name,
          schema: row.schema,
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
      console.warn('Postgres: could not read foreign keys', error);
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
