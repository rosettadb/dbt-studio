/* eslint-disable no-restricted-syntax, no-await-in-loop, consistent-return */
import { Column, Table } from '../../types/backend';
import { DBSQLClient } from '@databricks/sql';

export default class DatabricksExtractor {
  private client: any;
  private session: any = null;
  private config: {
    token: string;
    host: string;
    path: string;
    catalog?: string;
    schema: string;
  };

  constructor(config: {
    token: string;
    host: string;
    path: string;
    catalog?: string;
    schema: string;
  }) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.client = new DBSQLClient();

    const connection = await this.client.connect({
      token: this.config.token,
      host: this.config.host,
      path: this.config.path,
    });
    this.session = await connection.openSession();
  }

  async disconnect(): Promise<void> {
    if (this.session) {
      await this.session.close();
      this.session = null;
    }
    await this.client.close();
  }

  private async execute<T = any>(sql: string): Promise<T[]> {
    if (!this.session) {
      throw new Error('Not connected to Databricks');
    }

    const queryOperation = await this.session.executeStatement(sql, {
      runAsync: true,
    });

    const result = await queryOperation.fetchAll();
    await queryOperation.close();

    return result as T[];
  }

  private async getSchemas(): Promise<string[]> {
    const queries = [];

    if (this.config.catalog) {
      queries.push({
        sql: `
          SELECT DISTINCT schema_name
          FROM information_schema.schemata
          WHERE catalog_name = '${this.config.catalog}'
          ORDER BY schema_name;
        `
      });
    }

    queries.push({
      sql: `
        SELECT DISTINCT schema_name
        FROM information_schema.schemata
        ORDER BY schema_name;
      `
    });

    if (this.config.catalog) {
      queries.push({
        sql: `SHOW SCHEMAS IN ${this.config.catalog}`
      });
    }

    queries.push({
      sql: `SHOW SCHEMAS`
    });

    for (const query of queries) {
      try {
        const rows = await this.execute<any>(query.sql);

        if (rows && rows.length > 0) {
          let schemaNames: string[] = [];

          if (rows[0].schema_name !== undefined) {
            schemaNames = rows.map((row) => row.schema_name);
          } else if (rows[0].databaseName !== undefined) {
            schemaNames = rows.map((row) => row.databaseName);
          } else if (rows[0].namespace !== undefined) {
            schemaNames = rows.map((row) => row.namespace);
          } else {
            schemaNames = rows.map((row) => Object.values(row)[0] as string);
          }

          if (this.config.schema && this.config.schema !== 'default') {
            const filteredSchemas = schemaNames.filter(name =>
              name.toLowerCase() === this.config.schema.toLowerCase()
            );
            if (filteredSchemas.length > 0) {
              return filteredSchemas;
            }
          }

          return schemaNames;
        }
      } catch (error: unknown) {
        continue;
      }
    }

    return [];
  }

  private async getTables(schema: string): Promise<{ table_name: string; table_type: string }[]> {
    const queries = [];

    if (this.config.catalog) {
      queries.push({
        sql: `
          SELECT table_name, table_type
          FROM information_schema.tables
          WHERE table_schema = '${schema}' AND catalog_name = '${this.config.catalog}'
          AND table_type IN ('BASE TABLE', 'VIEW')
          ORDER BY table_name;
        `
      });
    }

    queries.push({
      sql: `
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = '${schema}'
        AND table_type IN ('BASE TABLE', 'VIEW')
        ORDER BY table_name;
      `
    });

    if (this.config.catalog) {
      queries.push({
        sql: `SHOW TABLES IN ${this.config.catalog}.${schema}`
      });
    }

    queries.push({
      sql: `SHOW TABLES IN ${schema}`
    });

    for (const query of queries) {
      try {
        const rows = await this.execute<any>(query.sql);

        if (rows && rows.length > 0) {
          let tables: { table_name: string; table_type: string }[] = [];

          if (rows[0].table_name !== undefined && rows[0].table_type !== undefined) {
            tables = rows.map((row) => ({
              table_name: row.table_name,
              table_type: row.table_type
            }));
          } else if (rows[0].tableName !== undefined) {
            tables = rows.map((row) => ({
              table_name: row.tableName,
              table_type: row.isTemporary ? 'VIEW' : 'BASE TABLE'
            }));
          } else if (rows[0].database !== undefined && rows[0].tableName !== undefined) {
            tables = rows.map((row) => ({
              table_name: row.tableName,
              table_type: 'BASE TABLE'
            }));
          } else {
            const tableNames = rows.map((row) => Object.values(row)[0] as string);
            tables = tableNames.map((name) => ({
              table_name: name,
              table_type: 'BASE TABLE'
            }));
          }

          return tables;
        }
      } catch (error: unknown) {
        continue;
      }
    }

    return [];
  }

  private async getColumns(schema: string, tableName: string): Promise<Column[]> {
    const queries = [];

    if (this.config.catalog) {
      queries.push({
        sql: `
          SELECT
            column_name,
            data_type,
            ordinal_position,
            is_nullable,
            character_maximum_length,
            numeric_precision,
            numeric_scale,
            column_default
          FROM information_schema.columns
          WHERE table_schema = '${schema}'
          AND table_name = '${tableName}' AND catalog_name = '${this.config.catalog}'
          ORDER BY ordinal_position;
        `
      });
    }

    queries.push({
      sql: `
        SELECT
          column_name,
          data_type,
          ordinal_position,
          is_nullable,
          character_maximum_length,
          numeric_precision,
          numeric_scale,
          column_default
        FROM information_schema.columns
        WHERE table_schema = '${schema}'
        AND table_name = '${tableName}'
        ORDER BY ordinal_position;
      `
    });

    if (this.config.catalog) {
      queries.push({
        sql: `DESCRIBE ${this.config.catalog}.${schema}.${tableName}`
      });
    }

    queries.push({
      sql: `DESCRIBE ${schema}.${tableName}`
    });

    for (const query of queries) {
      try {
        const rows = await this.execute<any>(query.sql);

        if (rows && rows.length > 0) {
          let columns: Column[] = [];

          if (rows[0].column_name !== undefined && rows[0].data_type !== undefined) {
            columns = rows.map((row) => ({
              name: row.column_name,
              typeName: row.data_type,
              ordinalPosition: row.ordinal_position || 0,
              primaryKeySequenceId: 0,
              columnDisplaySize: row.character_maximum_length || row.numeric_precision || 0,
              scale: row.numeric_scale || 0,
              precision: row.numeric_precision || 0,
              columnProperties: [],
              autoincrement: false,
              primaryKey: false,
              nullable: row.is_nullable === 'YES',
            }));
          } else if (rows[0].col_name !== undefined && rows[0].data_type !== undefined) {
            columns = rows.map((row, index) => ({
              name: row.col_name,
              typeName: row.data_type,
              ordinalPosition: index + 1,
              primaryKeySequenceId: 0,
              columnDisplaySize: 0,
              scale: 0,
              precision: 0,
              columnProperties: [],
              autoincrement: false,
              primaryKey: false,
              nullable: true,
            }));
          } else {
            columns = rows.map((row, index) => ({
              name: row.name || row.column || Object.values(row)[0] as string,
              typeName: row.type || row.dataType || 'string',
              ordinalPosition: index + 1,
              primaryKeySequenceId: 0,
              columnDisplaySize: 0,
              scale: 0,
              precision: 0,
              columnProperties: [],
              autoincrement: false,
              primaryKey: false,
              nullable: true,
            }));
          }

          return columns;
        }
      } catch (error: unknown) {
        continue;
      }
    }

    return [];
  }

  async extractSchema(): Promise<{ tables: Table[] }> {
    try {
      const schemas = await this.getSchemas();
      const allTables: Table[] = [];

      for (const schema of schemas) {
        const tables = await this.getTables(schema);

        for (const { table_name, table_type } of tables) {
          const columns = await this.getColumns(schema, table_name);

          const table: Table = {
            name: table_name,
            type: table_type === 'BASE TABLE' ? 'TABLE' : 'VIEW',
            schema,
            columns,
          };

          allTables.push(table);
        }
      }

      return { tables: allTables };
    } catch (error) {
      throw error;
    }
  }
}