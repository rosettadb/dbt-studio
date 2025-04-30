/* eslint-disable no-restricted-syntax, no-await-in-loop, consistent-return */
import snowflake from 'snowflake-sdk';
import { Column, Table } from '../../types/backend';

export default class SnowflakeExtractor {
  private connection: snowflake.Connection;

  constructor(config: {
    account: string;
    username: string;
    password: string;
    warehouse: string;
    database: string;
    schema: string;
    role?: string;
  }) {
    this.connection = snowflake.createConnection(config);
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connection.connect((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      this.connection.destroy(() => resolve());
    });
  }

  private async execute<T = any>(sql: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.connection.execute({
        sqlText: sql,
        complete: (err, stmt, rows) => {
          if (err) return reject(err);
          resolve(rows as T[]);
        },
      });
    });
  }

  private async getSchemas(): Promise<string[]> {
    const rows = await this.execute<{ SCHEMA_NAME: string }>(`
      SELECT SCHEMA_NAME
      FROM INFORMATION_SCHEMA.SCHEMATA
      WHERE SCHEMA_NAME NOT IN ('INFORMATION_SCHEMA');
    `);
    return rows.map((row) => row.SCHEMA_NAME);
  }

  async extractSchema(): Promise<{ tables: Table[] }> {
    const schemas = await this.getSchemas();

    const allTables: Table[] = [];

    await Promise.all(
      schemas.map(async (schema) => {
        // Fetch all tables and views from INFORMATION_SCHEMA.TABLES
        const tableRows = await this.execute<{
          TABLE_NAME: string;
          TABLE_TYPE: string;
        }>(`
        SELECT TABLE_NAME, TABLE_TYPE
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = '${schema}' AND TABLE_TYPE IN ('BASE TABLE', 'VIEW');
      `);

        // Fetch all columns for this schema in one query
        const columnRows = await this.execute<any>(`
        SELECT
          TABLE_NAME,
          COLUMN_NAME,
          DATA_TYPE,
          ORDINAL_POSITION,
          IS_NULLABLE,
          CHARACTER_MAXIMUM_LENGTH,
          NUMERIC_PRECISION,
          NUMERIC_SCALE,
          COLUMN_DEFAULT,
          IS_IDENTITY
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = '${schema}'
        ORDER BY TABLE_NAME, ORDINAL_POSITION;
      `);

        // Group columns by table name
        const columnsByTable = columnRows.reduce<Record<string, Column[]>>(
          (acc, row) => {
            const column: Column = {
              name: row.COLUMN_NAME,
              typeName: row.DATA_TYPE,
              ordinalPosition: row.ORDINAL_POSITION,
              primaryKeySequenceId: 0,
              columnDisplaySize:
                row.CHARACTER_MAXIMUM_LENGTH || row.NUMERIC_PRECISION || 0,
              scale: row.NUMERIC_SCALE || 0,
              precision: row.NUMERIC_PRECISION || 0,
              columnProperties: [],
              autoincrement: row.IS_IDENTITY === 'YES',
              primaryKey: false,
              nullable: row.IS_NULLABLE === 'YES',
            };

            if (!acc[row.TABLE_NAME]) acc[row.TABLE_NAME] = [];
            acc[row.TABLE_NAME].push(column);
            return acc;
          },
          {},
        );

        // Assemble table/view metadata
        for (const { TABLE_NAME, TABLE_TYPE } of tableRows) {
          allTables.push({
            name: TABLE_NAME,
            type: TABLE_TYPE === 'BASE TABLE' ? 'TABLE' : 'VIEW',
            schema,
            columns: columnsByTable[TABLE_NAME] || [],
          });
        }
      }),
    );

    return { tables: allTables };
  }
}
