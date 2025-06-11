/* eslint-disable no-restricted-syntax, no-await-in-loop, consistent-return */
import { DuckDBInstance } from '@duckdb/node-api';
import { Column, Table } from '../../types/backend';

export default class DuckDBSchemaExtractor {
  private database_path: string;

  constructor(config: { database_path: string }) {
    this.database_path = config.database_path;
  }

  private async executeQuery(query: string): Promise<any[]> {
    const instance = await DuckDBInstance.create(this.database_path);
    const connection = await instance.connect();

    try {
      const result = await connection.run(query);
      const rows = await result.getRows();
      connection.closeSync();
      return rows;
    } catch (error) {
      connection.closeSync();
      throw error;
    }
  }

  private async getTables(): Promise<string[]> {
    try {
      const rows = await this.executeQuery(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'main' 
          AND table_type = 'BASE TABLE'
      `);
      // DuckDB returns 2D arrays, so we need to handle both object and array formats
      return rows
        .map((row) => {
          if (Array.isArray(row)) {
            return row[0]; // For 2D array format: [["table1"], ["table2"]]
          }
          return row.table_name; // For object format: [{table_name: "table1"}]
        })
        .filter((name) => name && typeof name === 'string'); // Filter out undefined/null values
    } catch (error) {
      // Fallback to SHOW TABLES if information_schema is not available
      try {
        const rows = await this.executeQuery('SHOW TABLES');
        return rows
          .map((row) => {
            if (Array.isArray(row)) {
              return row[0]; // For 2D array format
            }
            return row.name; // For object format
          })
          .filter((name) => name && typeof name === 'string');
      } catch (fallbackError) {
        console.error('Failed to get tables:', fallbackError);
        return [];
      }
    }
  }

  private async getViews(): Promise<string[]> {
    try {
      const rows = await this.executeQuery(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'main' 
          AND table_type = 'VIEW'
      `);
      return rows
        .map((row) => {
          if (Array.isArray(row)) {
            return row[0]; // For 2D array format
          }
          return row.table_name; // For object format
        })
        .filter((name) => name && typeof name === 'string');
    } catch (error) {
      // DuckDB might not have views in information_schema, return empty array
      console.warn('Failed to get views, likely not supported:', error);
      return [];
    }
  }

  private async getDetailedColumns(tableName: string): Promise<Column[]> {
    try {
      // Try using information_schema first
      const rows = await this.executeQuery(`
        SELECT 
          column_name,
          data_type,
          ordinal_position,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_name = '${tableName}' 
          AND table_schema = 'main'
        ORDER BY ordinal_position
      `);

      return rows
        .map((row, index) => {
          // Handle both 2D array and object formats
          let columnName, dataType, ordinalPosition, isNullable, columnDefault;

          if (Array.isArray(row)) {
            // 2D array format: [column_name, data_type, ordinal_position, is_nullable, column_default]
            [columnName, dataType, ordinalPosition, isNullable, columnDefault] =
              row;
          } else {
            // Object format
            columnName = row.column_name;
            dataType = row.data_type;
            ordinalPosition = row.ordinal_position;
            isNullable = row.is_nullable;
            columnDefault = row.column_default;
          }

          return {
            name: columnName,
            typeName: dataType,
            ordinalPosition: ordinalPosition || index + 1,
            primaryKeySequenceId: 0, // DuckDB doesn't easily expose PK info in information_schema
            columnDisplaySize: 0,
            scale: 0,
            precision: 0,
            columnProperties: [],
            autoincrement: false,
            primaryKey: false, // Would need additional logic to determine
            nullable: isNullable === 'YES',
          };
        })
        .filter((col) => col.name && typeof col.name === 'string'); // Filter out invalid columns
    } catch (error) {
      // Fallback to DESCRIBE table
      try {
        const rows = await this.executeQuery(`DESCRIBE ${tableName}`);
        return rows
          .map((row, index) => {
            let columnName, columnType, nullable;

            if (Array.isArray(row)) {
              // DESCRIBE typically returns: [column_name, column_type, null, key, default, extra]
              [columnName, columnType, , , ,] = row;
              nullable = true; // Default assumption for DESCRIBE fallback
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
      } catch (fallbackError) {
        console.error(
          `Failed to get columns for table ${tableName}:`,
          fallbackError,
        );
        return [];
      }
    }
  }

  async extractSchema(): Promise<{ tables: Table[] }> {
    try {
      const [tableNames, viewNames] = await Promise.all([
        this.getTables(),
        this.getViews(),
      ]);

      const allTables: Table[] = [];

      // Process tables
      for (const tableName of tableNames) {
        try {
          const columns = await this.getDetailedColumns(tableName);
          allTables.push({
            name: tableName,
            type: 'TABLE',
            schema: 'main',
            columns,
          });
        } catch (error) {
          console.error(`Failed to extract table ${tableName}:`, error);
        }
      }

      // Process views
      for (const viewName of viewNames) {
        try {
          const columns = await this.getDetailedColumns(viewName);
          allTables.push({
            name: viewName,
            type: 'VIEW',
            schema: 'main',
            columns,
          });
        } catch (error) {
          console.error(`Failed to extract view ${viewName}:`, error);
        }
      }

      return { tables: allTables };
    } catch (error) {
      console.error('Failed to extract DuckDB schema:', error);
      throw error;
    }
  }
}
