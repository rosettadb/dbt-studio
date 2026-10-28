/* eslint-disable prefer-promise-reject-errors, consistent-return */
import { DuckDBInstance } from '@duckdb/node-api';
import fs from 'fs';
import { DuckDBConnection, QueryResponseType } from '../../types/backend';

export async function testDuckDBConnection(
  config: DuckDBConnection,
): Promise<boolean> {
  let instance: any = null;
  let connection: any = null;

  try {
    if (!config.database_path) {
      return false;
    }

    try {
      const stats = fs.statSync(config.database_path);
      if (stats.isDirectory()) {
        return false;
      }
    } catch {
      /* empty */
    }
    instance = await DuckDBInstance.create(config.database_path);
    connection = await instance.connect();

    try {
      // First test basic connection
      const result = await connection.run('SELECT 1 as connection_test');
      const rows = await result.getRows();

      let success = false;
      if (rows.length > 0) {
        if (Array.isArray(rows[0])) {
          success = rows[0][0] === 1;
        } else if (typeof rows[0] === 'object' && rows[0] !== null) {
          success = (rows[0] as any).connection_test === 1;
        } else {
          success = rows[0] === 1;
        }
      }

      if (!success) {
        return false;
      }

      // If schema is specified and not 'main', validate it exists
      if (config.schema && config.schema !== 'main') {
        try {
          const schemaQuery = `SELECT schema_name FROM information_schema.schemata WHERE schema_name = '${config.schema}'`;
          const schemaResult = await connection.run(schemaQuery);
          const schemaRows = await schemaResult.getRows();

          if (schemaRows.length === 0) {
            throw new Error(
              `Schema '${config.schema}' does not exist in the DuckDB database. Available schemas can be viewed with: SHOW SCHEMAS;`,
            );
          }
        } catch (schemaError: any) {
          // If information_schema doesn't work, try alternative approach
          if (schemaError.message?.includes('does not exist')) {
            throw schemaError;
          }

          try {
            // Try to use the schema directly
            await connection.run(`USE ${config.schema}`);
          } catch (useError: any) {
            if (
              useError.message?.includes('does not exist') ||
              useError.message?.includes('not found')
            ) {
              throw new Error(
                `Schema '${config.schema}' does not exist in the DuckDB database. Available schemas can be viewed with: SHOW SCHEMAS;`,
              );
            }
            // If it's some other error, continue - the schema might exist but have other issues
          }
        }
      }

      return success;
    } catch (queryError: any) {
      // Re-throw schema validation errors
      if (
        queryError.message?.includes('Schema') &&
        queryError.message?.includes('does not exist')
      ) {
        throw queryError;
      }
      return false;
    }
  } catch (error: any) {
    if (error.message?.includes('Is a directory')) {
      const errorMsg =
        'The selected path is a directory. Please select a DuckDB file (.duckdb)';
      throw new Error(errorMsg);
    }

    if (error.message?.includes('Conflicting lock')) {
      const pidMatch = error.message.match(/PID (\d+)/);
      const pid = pidMatch ? pidMatch[1] : 'unknown';
      const errorMsg = `The DuckDB file is locked by another process (PID: ${pid}). Please close any DuckDB CLI sessions or run: kill ${pid}`;
      throw new Error(errorMsg);
    }

    if (error.message?.includes('Permission denied')) {
      const errorMsg =
        'Permission denied. Please check file permissions or select a different location.';
      throw new Error(errorMsg);
    }

    throw error;
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

export const executeDuckDBQuery = async (
  config: DuckDBConnection,
  query: string,
  registerCancel?: (fn: () => void) => void,
): Promise<QueryResponseType> => {
  let instance: any = null;
  let connection: any = null;

  if (registerCancel) {
    registerCancel(async () => {
      try {
        if (connection) {
          if (typeof connection.close === 'function') await connection.close();
          else if (typeof connection.closeSync === 'function')
            connection.closeSync();
        }
        if (instance) {
          if (typeof instance.close === 'function') await instance.close();
          else if (typeof instance.closeSync === 'function')
            instance.closeSync();
          else if (typeof instance.terminate === 'function')
            await instance.terminate();
        }
      } catch (e) {
        // ignore
      }
    });
  }

  try {
    instance = await DuckDBInstance.create(config.database_path);
    connection = await instance.connect();

    // Set schema context if specified and not 'main'
    if (config.schema && config.schema !== 'main') {
      try {
        await connection.run(`USE ${config.schema}`);
      } catch (schemaError: any) {
        if (
          schemaError.message?.includes('does not exist') ||
          schemaError.message?.includes('not found')
        ) {
          return {
            success: false,
            error: `Schema '${config.schema}' does not exist in the DuckDB database. Available schemas can be viewed with: SHOW SCHEMAS;`,
          };
        }
        // If it's some other error, continue - might be a permission issue but schema exists
      }
    }

    const result = await connection.run(query);
    const rows = await result.getRows();
    const columns = await result.columnNamesAndTypesJson();

    const fields: { name: string; type: number }[] = columns.columnNames.map(
      (name: string, index: number) => ({
        name,
        type: columns.columnTypes[index]?.typeId || -1,
      }),
    );

    const mappedRows = rows.map((row: any[]) => {
      const r: any = {};
      fields.forEach((field, index) => {
        r[field.name] = row[index];
      });
      return r;
    });

    return {
      success: true,
      data: mappedRows as any[],
      fields,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Unknown error occurred during query execution',
    };
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
};
