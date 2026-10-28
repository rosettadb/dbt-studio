/* eslint-disable prefer-promise-reject-errors, consistent-return */
import mysql from 'mysql2/promise';
import { MySqlConnection, QueryResponseType } from '../../types/backend';

// MySQL connection functions using the official mysql2 driver
function createMySqlConfig(config: MySqlConnection) {
  return {
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    connectTimeout: 5000,
    ...(config.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

export async function testMySqlConnection(
  config: MySqlConnection,
): Promise<boolean> {
  let connection: any = null;
  try {
    connection = await mysql.createConnection(createMySqlConfig(config));
    await connection.query('SELECT 1 AS connection_test');
    return true;
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error('MySQL connection test failed:', error.message);
    return false;
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch {
        /* empty */
      }
    }
  }
}

export const executeMySqlQuery = async (
  config: MySqlConnection,
  query: string,
  registerCancel?: (fn: () => void) => void,
): Promise<QueryResponseType> => {
  let connection: any = null;
  try {
    connection = await mysql.createConnection(createMySqlConfig(config));

    if (registerCancel) {
      registerCancel(() => {
        try {
          connection.destroy();
        } catch {
          /* empty */
        }
      });
    }

    const [rows, rawFields] = await connection.query(query);

    if (Array.isArray(rows)) {
      const data = rows as any[];
      // mysql2 returns field metadata for SELECTs even when there are no rows.
      const fieldPackets = Array.isArray(rawFields) ? rawFields : [];

      let fields: { name: string; type: number }[] = [];
      if (fieldPackets.length > 0) {
        fields = fieldPackets.map((field: any) => ({
          name: field.name,
          type: 0,
        }));
      } else if (data.length > 0) {
        fields = Object.keys(data[0]).map((name) => ({ name, type: 0 }));
      }

      return {
        success: true,
        data,
        fields,
        rowCount: data.length,
      };
    }

    // Non-SELECT statement (ResultSetHeader)
    const statementType = query.trimStart().split(/\s+/, 1)[0]?.toUpperCase();
    const commandType = ['INSERT', 'UPDATE', 'DELETE', 'REPLACE'].includes(
      statementType,
    )
      ? 'DML'
      : 'DDL';
    return {
      success: true,
      data: [],
      fields: [],
      rowCount: (rows as any)?.affectedRows ?? 0,
      isCommand: true,
      commandType,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Unknown error occurred during query execution',
    };
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch {
        /* empty */
      }
    }
  }
};
