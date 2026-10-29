/* eslint-disable no-restricted-syntax, no-await-in-loop, consistent-return */
import { DuckDBInstance } from '@duckdb/node-api';
import { Column, Table } from '../../types/backend';

type TableRef = { schema: string; name: string };

// Schema and object names come from the file, so they are escaped before
// they go into SQL.
const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

const sqlIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

const refKey = (ref: TableRef) => JSON.stringify([ref.schema, ref.name]);

// Drops repeated refs and refs whose key is already in `exclude`.
const uniqueRefs = (refs: TableRef[], exclude = new Set<string>()) => {
  const seen = new Set(exclude);
  return refs.filter((ref) => {
    const key = refKey(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export default class DuckDBSchemaExtractor {
  private database_path: string;

  // Without a schema, every schema in the database file is read.
  private schema?: string;

  constructor(config: { database_path: string; schema?: string }) {
    this.database_path = config.database_path;
    this.schema = config.schema;
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

  // information_schema also lists the system and temp catalogs, so rows are
  // limited to the database file and, when set, to one schema.
  private scopeFilter(): string {
    const schemaFilter = this.schema
      ? ` AND table_schema = ${sqlString(this.schema)}`
      : '';
    return `table_catalog = current_database()${schemaFilter}`;
  }

  private static toTableRefs(rows: any[]): TableRef[] {
    return rows
      .map((row) => {
        if (Array.isArray(row)) {
          return { schema: row[0], name: row[1] };
        }
        return { schema: row.table_schema, name: row.table_name };
      })
      .filter(
        (ref) =>
          ref.schema &&
          typeof ref.schema === 'string' &&
          ref.name &&
          typeof ref.name === 'string',
      );
  }

  private async getTables(): Promise<TableRef[]> {
    try {
      const rows = await this.executeQuery(`
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE ${this.scopeFilter()}
          AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name
      `);
      return DuckDBSchemaExtractor.toTableRefs(rows);
    } catch (error) {
      try {
        // SHOW TABLES lists only the schema set by USE, or main.
        const schema = this.schema || 'main';
        const rows = await this.executeQuery('SHOW TABLES');
        return rows
          .map((row) => {
            if (Array.isArray(row)) {
              return row[0];
            }
            return row.name;
          })
          .filter((name) => name && typeof name === 'string')
          .map((name) => ({ schema, name }));
      } catch (fallbackError) {
        return [];
      }
    }
  }

  private async getViews(): Promise<TableRef[]> {
    try {
      const rows = await this.executeQuery(`
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE ${this.scopeFilter()}
          AND table_type = 'VIEW'
        ORDER BY table_schema, table_name
      `);
      return DuckDBSchemaExtractor.toTableRefs(rows);
    } catch (error) {
      return [];
    }
  }

  private async getDetailedColumns(ref: TableRef): Promise<Column[]> {
    try {
      const rows = await this.executeQuery(`
        SELECT
          column_name,
          data_type,
          ordinal_position,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_catalog = current_database()
          AND table_schema = ${sqlString(ref.schema)}
          AND table_name = ${sqlString(ref.name)}
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
        const rows = await this.executeQuery(
          `DESCRIBE ${sqlIdentifier(ref.schema)}.${sqlIdentifier(ref.name)}`,
        );
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
    const [tableRefsRaw, viewRefsRaw] = await Promise.all([
      this.getTables(),
      this.getViews(),
    ]);

    // Deduplicate defensively: concurrent connections against the same
    // database file (opened separately for the tables and views queries)
    // have been observed to yield repeated rows on Windows.
    const tableRefs = uniqueRefs(tableRefsRaw);
    // Tables and views are read as two separate snapshots, so a name that
    // was replaced (table -> view or vice versa) mid-refresh could show up
    // in both lists. Prefer the table entry on a collision.
    const viewRefs = uniqueRefs(viewRefsRaw, new Set(tableRefs.map(refKey)));

    const allTables: Table[] = [];

    for (const tableRef of tableRefs) {
      try {
        const columns = await this.getDetailedColumns(tableRef);
        allTables.push({
          name: tableRef.name,
          type: 'TABLE',
          schema: tableRef.schema,
          columns,
        });
      } catch {
        /* empty */
      }
    }

    for (const viewRef of viewRefs) {
      try {
        const columns = await this.getDetailedColumns(viewRef);
        allTables.push({
          name: viewRef.name,
          type: 'VIEW',
          schema: viewRef.schema,
          columns,
        });
      } catch {
        /* empty */
      }
    }

    return { tables: allTables };
  }
}
