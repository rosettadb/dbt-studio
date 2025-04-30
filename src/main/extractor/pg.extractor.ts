/* eslint-disable no-restricted-syntax, no-await-in-loop, consistent-return */
import { Client } from 'pg';
import { Column, Table } from '../../types/backend';

export default class PGSchemaExtractor {
  private client: Client;

  constructor(config: {
    user: string;
    host: string;
    database: string;
    password: string;
    port: number;
  }) {
    this.client = new Client(config);
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

  async extractSchema(): Promise<{ tables: Table[] }> {
    const schemas = await this.getSchemas();
    const allTables: Table[] = [];

    for (const schema of schemas) {
      const tables = await this.getTables(schema);
      for (const table of tables) {
        const columns = await this.getDetailedColumns(schema, table);
        allTables.push({
          name: table,
          type: 'TABLE',
          schema,
          columns,
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
