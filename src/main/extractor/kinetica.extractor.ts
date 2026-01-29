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
      this.db.execute_sql(sql, 0, -9999, '', null, {}, (err: any, res: any) => {
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

  /**
   * Escape single quotes in SQL string literals to prevent SQL injection.
   * Doubles single quotes as per SQL standard.
   */
  private escapeIdentifier(value: string): string {
    return value.replace(/'/g, "''");
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
      // Use API instead of SQL to avoid "Field 23 out of bounds" error on information_schema.TABLES
      const tablesResponse: any = await new Promise((resolve, reject) => {
        this.db.show_table(
          '*',
          { show_children: 'true' },
          (err: any, res: any) => {
            if (err) {
              reject(err);
            } else {
              resolve(res);
            }
          },
        );
      });

      const systemSchemas = [
        'information_schema',
        'pg_catalog',
        'ki_catalog',
        'sys_catalog',
        'sys_temp',
      ];
      const tableNames = tablesResponse.table_names || [];

      // Create a Set of all names to help identify schemas (if a name appears as a prefix for others)
      // But better rely on naming convention or type if available.
      // Kinetica returns schemas as items too. Usually schemas don't have dots, tables do (schema.table).
      // Exception: default schema tables might not have dots? No, usually they are just "table".

      const tableRows = tableNames
        .map((fullName: string) => {
          let schemaName = 'default';
          let tableName = fullName;

          // Handle schema.table format
          const dotIndex = fullName.indexOf('.');
          if (dotIndex !== -1) {
            schemaName = fullName.substring(0, dotIndex);
            tableName = fullName.substring(dotIndex + 1);
          } else {
            // If no dot, it could be a table in default schema OR a schema itself.
            // If it's a known schema name, skip it.
            // Also, check if it's one of the schemas we found used as a prefix in other tables?
            // For now, let's assume if it matches a known system schema, it's a schema object.
          }

          if (
            systemSchemas.includes(schemaName) ||
            systemSchemas.includes(fullName)
          ) {
            return null;
          }

          // Very simple heuristic: If the name is exactly the same as a schema name used by other tables,
          // it's likely the schema object itself.
          // However, simpler: User schemas usually don't have dots. Tables in "default" schema don't have dots.
          // If we see "nurilacka_gmail" and "nurilacka_gmail.clients", the first one is the schema.

          // Let's defer filtering to a second pass or check against other names?
          // For now, let's just mark the type.

          // Debug log
          // console.log(`[Kinetica] Item: ${fullName}, Schema: ${schemaName}, Table: ${tableName}`);

          return {
            fullName,
            TABLE_SCHEMA: schemaName,
            TABLE_NAME: tableName,
            TABLE_TYPE: 'TABLE', // Default
          };
        })
        .filter((r: any) => r !== null)
        .filter((r: any, _: number, arr: any[]) => {
          // Filter out items that are actually schemas.
          // If 'r.fullName' matches the 'TABLE_SCHEMA' of another item, then 'r' is a schema object.
          const isSchema = arr.some(
            (other) =>
              other.TABLE_SCHEMA === r.fullName &&
              other.fullName !== r.fullName,
          );
          // Also filter out 'default' schema object if it exists?
          // And filter out system schemas explicitly if missed
          if (['public', 'information_schema'].includes(r.fullName))
            return false;

          // If isSchema is true, it's a folder/schema, not a table.
          return !isSchema;
        });

      // Apply optional schema filter if provided in constructor
      const filteredTableRows = this.schema
        ? tableRows.filter((r: any) => r.TABLE_SCHEMA === this.schema)
        : tableRows;

      // console.log('[Kinetica] Table list:', filteredTableRows.map((t: any) => t.fullName).join(', '));

      for (const row of filteredTableRows) {
        const tableName = row.TABLE_NAME;
        const schemaName = row.TABLE_SCHEMA || 'default';
        const tableType = (row.TABLE_TYPE || '').includes('VIEW')
          ? 'VIEW'
          : 'TABLE';

        if (tableName) {
          let columns: Column[] = [];
          try {
            // Escape identifiers to prevent SQL injection
            const safeSchema = this.escapeIdentifier(schemaName);
            const safeTable = this.escapeIdentifier(tableName);

            const colRows = await this.executeSQL(`
              SELECT COLUMN_NAME, DATA_TYPE, ORDINAL_POSITION, IS_NULLABLE
              FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = '${safeSchema}' AND TABLE_NAME = '${safeTable}'
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

    return { tables: allTables };
  }
}
