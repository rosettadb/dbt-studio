/* eslint-disable no-restricted-syntax, no-await-in-loop, consistent-return */
import snowflake from 'snowflake-sdk';
import { Column, Table } from '../../types/backend';
import {
  SNOWFLAKE_REAUTH_MESSAGE,
  SnowflakeAuthManager,
} from '../utils/snowflakeAuth';

export default class SnowflakeExtractor {
  private connection: snowflake.Connection;

  private authMethod: 'password' | 'oauth_browser';

  constructor(config: {
    account: string;
    username: string;
    password?: string;
    warehouse: string;
    database: string;
    schema: string;
    role?: string;
    authMethod?: 'password' | 'oauth_browser';
  }) {
    this.authMethod = config.authMethod ?? 'password';
    const baseConfig = {
      account: config.account,
      username: config.username,
      warehouse: config.warehouse,
      database: config.database,
      schema: config.schema,
      role: config.role,
    };

    if (this.authMethod === 'oauth_browser') {
      this.connection = snowflake.createConnection({
        ...baseConfig,
        authenticator: 'OAUTH_AUTHORIZATION_CODE',
        browserActionTimeout: 120000,
        clientStoreTemporaryCredential: true,
        openExternalBrowserCallback: () => {
          throw new Error(SNOWFLAKE_REAUTH_MESSAGE);
        },
      });
    } else {
      this.connection = snowflake.createConnection({
        ...baseConfig,
        password: config.password,
      });
    }
  }

  async connect(): Promise<void> {
    if (this.authMethod === 'oauth_browser') {
      // No browser flows outside the Connections screen: a cold session
      // fails fast with guidance instead of opening an ungated popup.
      // A warm SDK cache connects silently without user interaction.
      SnowflakeAuthManager.assertCachedSession();
    }
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
        const tableRows = await this.execute<{
          TABLE_NAME: string;
          TABLE_TYPE: string;
        }>(`
        SELECT TABLE_NAME, TABLE_TYPE
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = '${schema}' AND TABLE_TYPE IN ('BASE TABLE', 'VIEW');
      `);

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
