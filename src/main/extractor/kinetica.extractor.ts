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
          console.error('[Kinetica] SQL Error:', err.message);
          reject(err);
          return;
        }
        // column_headers is INSIDE data object
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
      // Use ki_catalog.ki_objects which exists based on the DDL we saw
      const tableRows = await this.executeSQL(`
        SELECT schema_name, object_name, obj_kind
        FROM ki_catalog.ki_objects
        WHERE obj_kind IN ('R', 'H', 'V', 'M', 'E')
        AND schema_name NOT LIKE 'ki_%'
        AND schema_name NOT LIKE 'sys_%'
        AND schema_name != 'information_schema'
        AND schema_name != 'pg_catalog'
      `);

      console.log('[Kinetica] Found tables:', tableRows.length);

      for (const row of tableRows) {
        const tableName = row.object_name;
        const schemaName = row.schema_name || 'default';
        const objKind = row.obj_kind;
        // R=regular table, H=replicated, E=external, V=view, M=materialized view
        const tableType = objKind === 'V' || objKind === 'M' ? 'VIEW' : 'TABLE';

        if (tableName) {
          let columns: Column[] = [];
          try {
            // Get columns from ki_catalog.ki_columns
            const colRows = await this.executeSQL(`
              SELECT column_name, column_type, column_position
              FROM ki_catalog.ki_columns
              WHERE schema_name = '${schemaName}'
              AND table_name = '${tableName}'
              ORDER BY column_position
            `);

            columns = colRows.map((c, idx) => ({
              name: c.column_name || '',
              typeName: (c.column_type || 'VARCHAR').toUpperCase(),
              ordinalPosition: c.column_position || idx + 1,
              primaryKeySequenceId: 0,
              columnDisplaySize: 0,
              scale: 0,
              precision: 0,
              columnProperties: [],
              autoincrement: false,
              primaryKey: false,
              nullable: true,
            }));
          } catch (e: any) {
            console.log('[Kinetica] Failed to get columns for', tableName);
          }

          allTables.push({
            name: tableName,
            type: tableType,
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
