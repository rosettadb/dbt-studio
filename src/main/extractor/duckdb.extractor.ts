/* eslint-disable no-restricted-syntax, no-await-in-loop, consistent-return */
import { DuckDBInstance } from '@duckdb/node-api';
import { Column, Table } from '../../types/backend';

export default class DuckDBSchemaExtractor {
  private database_path: string;

  private schema: string;

  constructor(config: { database_path: string; schema?: string }) {
    this.database_path = config.database_path;
    this.schema = config.schema || 'main';
  }

  private async executeQuery(query: string): Promise<any[]> {
    let instance: any = null;
    let connection: any = null;

    try {
      instance = await DuckDBInstance.create(this.database_path);
      connection = await instance.connect();

      // Set schema context if not 'main'
      if (this.schema && this.schema !== 'main') {
        try {
          await connection.run(`USE ${this.schema}`);
        } catch (schemaError: any) {
          // If schema doesn't exist, throw a clear error
          if (
            schemaError.message?.includes('does not exist') ||
            schemaError.message?.includes('not found')
          ) {
            throw new Error(
              `Schema '${this.schema}' does not exist in the DuckDB database.`,
            );
          }
        }
      }

      const result = await connection.run(query);
      return await result.getRows();
    } finally {
      try {
        if (connection) {
          if (typeof connection.close === 'function') {
            await connection.close();
          } else if (typeof connection.closeSync === 'function') {
            connection.closeSync();
          }
        }
      } catch {
        /* empty */
      }

      try {
        if (instance) {
          if (typeof instance.close === 'function') {
            await instance.close();
          } else if (typeof instance.closeSync === 'function') {
            instance.closeSync();
          } else if (typeof instance.terminate === 'function') {
            await instance.terminate();
          }
        }
      } catch {
        /* empty */
      }
    }
  }

  private async getTables(): Promise<string[]> {
    try {
      const rows = await this.executeQuery(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = '${this.schema}'
          AND table_type = 'BASE TABLE'
      `);
      return rows
        .map((row) => {
          if (Array.isArray(row)) {
            return row[0];
          }
          return row.table_name;
        })
        .filter((name) => name && typeof name === 'string');
    } catch (error) {
      try {
        const rows = await this.executeQuery('SHOW TABLES');
        return rows
          .map((row) => {
            if (Array.isArray(row)) {
              return row[0];
            }
            return row.name;
          })
          .filter((name) => name && typeof name === 'string');
      } catch (fallbackError) {
        return [];
      }
    }
  }

  private async getViews(): Promise<string[]> {
    try {
      const rows = await this.executeQuery(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = '${this.schema}'
          AND table_type = 'VIEW'
      `);
      return rows
        .map((row) => {
          if (Array.isArray(row)) {
            return row[0];
          }
          return row.table_name;
        })
        .filter((name) => name && typeof name === 'string');
    } catch (error) {
      return [];
    }
  }

  private async getDetailedColumns(tableName: string): Promise<Column[]> {
    try {
      const rows = await this.executeQuery(`
        SELECT
          column_name,
          data_type,
          ordinal_position,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_name = '${tableName}'
          AND table_schema = '${this.schema}'
        ORDER BY ordinal_position
      `);

      return rows
        .map((row, index) => {
          let columnName;
          let dataType;
          let ordinalPosition;
          let isNullable;

          if (Array.isArray(row)) {
            [columnName, dataType, ordinalPosition, isNullable] = row;
          } else {
            columnName = row.column_name;
            dataType = row.data_type;
            ordinalPosition = row.ordinal_position;
            isNullable = row.is_nullable;
          }

          return {
            name: columnName,
            typeName: dataType,
            ordinalPosition: ordinalPosition || index + 1,
            primaryKeySequenceId: 0,
            columnDisplaySize: 0,
            scale: 0,
            precision: 0,
            columnProperties: [],
            autoincrement: false,
            primaryKey: false,
            nullable: isNullable === 'YES',
          };
        })
        .filter((col) => col.name && typeof col.name === 'string');
    } catch (error) {
      try {
        const rows = await this.executeQuery(`DESCRIBE ${tableName}`);
        return rows
          .map((row, index) => {
            let columnName;
            let columnType;
            let nullable;

            if (Array.isArray(row)) {
              [columnName, columnType, , , ,] = row;
              nullable = true;
            } else {
              columnName = row.column_name;
              columnType = row.column_type;
              nullable = row.null === 'YES';
            }

            return {
              name: columnName,
              typeName: columnType,
              ordinalPosition: index + 1,
              primaryKeySequenceId: 0,
              columnDisplaySize: 0,
              scale: 0,
              precision: 0,
              columnProperties: [],
              autoincrement: false,
              primaryKey: false,
              nullable,
            };
          })
          .filter((col) => col.name && typeof col.name === 'string');
      } catch {
        return [];
      }
    }
  }

  async extractSchema(): Promise<{ tables: Table[] }> {
    const [tableNamesRaw, viewNamesRaw] = await Promise.all([
      this.getTables(),
      this.getViews(),
    ]);

    // Deduplicate defensively: concurrent connections against the same
    // database file (opened separately for the tables and views queries)
    // have been observed to yield repeated rows on Windows.
    const tableNames = Array.from(new Set(tableNamesRaw));
    const viewNames = Array.from(new Set(viewNamesRaw));

    const allTables: Table[] = [];

    for (const tableName of tableNames) {
      try {
        const columns = await this.getDetailedColumns(tableName);
        allTables.push({
          name: tableName,
          type: 'TABLE',
          schema: this.schema,
          columns,
        });
      } catch {
        /* empty */
      }
    }

    for (const viewName of viewNames) {
      try {
        const columns = await this.getDetailedColumns(viewName);
        allTables.push({
          name: viewName,
          type: 'VIEW',
          schema: this.schema,
          columns,
        });
      } catch {
        /* empty */
      }
    }

    return { tables: allTables };
  }
}
