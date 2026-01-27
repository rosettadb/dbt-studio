/* eslint-disable no-restricted-syntax, no-await-in-loop, consistent-return, class-methods-use-this, no-console */
import { Column, Table } from '../../types/backend';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GPUdb = require('../lib/GPUdb');

export default class KineticaExtractor {
  private db: any;

  private schema?: string;

  constructor(config: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    useSSL?: boolean;
    timeout?: number;
    schema?: string;
  }) {
    const protocol = config.useSSL ? 'https' : 'http';
    let cleanHost = config.host.replace(/(^\w+:|^)\/\//, '');
    let path = '';

    const pathIndex = cleanHost.indexOf('/');
    if (pathIndex !== -1) {
      path = cleanHost.substring(pathIndex);
      cleanHost = cleanHost.substring(0, pathIndex);
    }

    const url = `${protocol}://${cleanHost}:${config.port}${path}`;

    this.db = new GPUdb(url, {
      username: config.username,
      password: config.password,
      timeout: config.timeout || 30000,
    });

    this.schema = config.schema;
  }

  private async executeSQL(sql: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.execute_sql(sql, 0, 10000, '', null, {}, (err: any, res: any) => {
        if (err) {
          reject(err);
          return;
        }
        const { data } = res;
        if (!data) {
          resolve([]);
          return;
        }
        const headers = data.column_headers || [];
        if (headers.length === 0) {
          resolve([]);
          return;
        }
        const numRows = data.column_1?.length || 0;
        const rows: any[] = [];
        for (let i = 0; i < numRows; i += 1) {
          const row: any = {};
          headers.forEach((h: string, idx: number) => {
            row[h] = data[`column_${idx + 1}`]?.[i];
          });
          rows.push(row);
        }
        resolve(rows);
      });
    });
  }

  async connect(): Promise<void> {
    await this.executeSQL('SELECT 1');
  }

  async disconnect(): Promise<void> {
    this.db = null;
  }

  async extractSchema(): Promise<{ tables: Table[] }> {
    const allTables: Table[] = [];

    try {
      // Use standard information_schema
      const tableRows = await this.executeSQL(`
        SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA NOT IN ('information_schema', 'pg_catalog', 'ki_catalog', 'sys_catalog')
      `);

      console.log('[Kinetica] Found tables:', tableRows.length);

      for (const row of tableRows) {
        const tableName = row.TABLE_NAME;
        const schemaName = row.TABLE_SCHEMA || 'default';
        const tableType = (row.TABLE_TYPE || '').includes('VIEW')
          ? 'VIEW'
          : 'TABLE';

        if (tableName) {
          let columns: Column[] = [];
          try {
            const colRows = await this.executeSQL(`
              SELECT COLUMN_NAME, DATA_TYPE, ORDINAL_POSITION, IS_NULLABLE
              FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = '${schemaName}' AND TABLE_NAME = '${tableName}'
              ORDER BY ORDINAL_POSITION
            `);

            columns = colRows.map((c, idx) => ({
              name: c.COLUMN_NAME || '',
              typeName: (c.DATA_TYPE || 'VARCHAR').toUpperCase(),
              ordinalPosition: c.ORDINAL_POSITION || idx + 1,
              primaryKeySequenceId: 0,
              columnDisplaySize: 0,
              scale: 0,
              precision: 0,
              columnProperties: [],
              autoincrement: false,
              primaryKey: false,
              nullable: c.IS_NULLABLE !== 'NO',
            }));
          } catch {
            // Skip columns if query fails
          }

          allTables.push({
            name: tableName,
            type: tableType as 'TABLE' | 'VIEW',
            schema: schemaName,
            columns,
          });
        }
      }
    } catch (err: any) {
      console.error('[Kinetica] Schema extraction error:', err.message);
    }

    console.log('[Kinetica] Final tables count:', allTables.length);
    return { tables: allTables };
  }
}
