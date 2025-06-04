/* eslint-disable prefer-promise-reject-errors, consistent-return */
import pg from 'pg';
import snowflake from 'snowflake-sdk';
import {
  PostgresConnection,
  QueryResponseType,
  SnowflakeConnection,
  DatabricksConnection,
} from '../../types/backend';
import { SNOWFLAKE_TYPE_MAP } from './constants';
import { DBSQLClient } from '@databricks/sql';


export async function testPostgresConnection(
  config: PostgresConnection,
): Promise<boolean> {
  const client = new pg.Client({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    connectionTimeoutMillis: 5000,
  });

  await client.connect();
  const result = await client.query('SELECT 1 as connection_test');
  await client.end();
  return result.rows[0]?.connection_test === 1;
}

export const executePostgresQuery = async (
  config: PostgresConnection,
  query: string,
): Promise<QueryResponseType> => {
  const client = new pg.Client({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    const result = await client.query(query);
    return {
      success: true,
      data: result.rows,
      fields: result.fields.map((f) => ({ name: f.name, type: f.dataTypeID })),
    };
  } catch (err: any) {
    return { success: false, error: err?.message };
  } finally {
    await client.end();
  }
};

const createSnowflakeConnection = (config: SnowflakeConnection) => {
  return snowflake.createConnection({
    account: config.account.split('.')[0],
    username: config.username,
    password: config.password,
    warehouse: config.warehouse,
    database: config.database,
    schema: config.schema,
    role: config.role,
  });
};

export async function testSnowflakeConnection(
  config: SnowflakeConnection,
): Promise<boolean> {
  const connection = createSnowflakeConnection(config);

  const connectPromise = () =>
    new Promise<void>((resolve, reject) => {
      connection.connect((err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });

  const executePromise = (sql: string) =>
    new Promise<any[]>((resolve, reject) => {
      connection.execute({
        sqlText: sql,
        complete: (err, _stmt, rows) => {
          if (err) {
            return reject(err);
          }
          resolve(rows || []);
        },
      });
    });

  try {
    await connectPromise();
    const rows = await executePromise('SELECT 1 AS connection_test');
    return rows[0]?.CONNECTION_TEST === 1;
  } catch (error) {
    console.log(error);
    return false;
  } finally {
    connection.destroy(() => {});
  }
}

export const executeSnowflakeQuery = async (
  config: SnowflakeConnection,
  query: string,
): Promise<QueryResponseType> => {
  const connection = createSnowflakeConnection(config);

  return new Promise((resolve) => {
    connection.connect((err) => {
      if (err) {
        return resolve({ success: false, error: err.message });
      }

      connection.execute({
        sqlText: query,
        complete: (error, stmt, rows) => {
          connection.destroy(() => {});
          if (error) {
            return resolve({ success: false, error: error.message });
          }

          const fields =
            stmt?.getColumns().map((col) => ({
              name: col.getName(),
              type: SNOWFLAKE_TYPE_MAP[col.getType().toUpperCase()] || 0,
            })) || [];

          resolve({
            success: true,
            data: rows,
            fields,
          });
        },
      });
    });
  });
};

export async function testDatabricksConnection(
  config: DatabricksConnection,
): Promise<boolean> {

  const client = new DBSQLClient();

  try {
    const connection = await client.connect({
      token: config.password, // Using password field for token
      host: config.host,
      path: config.httpPath,
    });

    const session = await connection.openSession();
    const queryOperation = await session.executeStatement('SELECT 1 as connection_test', {
      runAsync: true,
    });

    const result = await queryOperation.fetchAll();
    await queryOperation.close();
    await session.close();
    await client.close();

    return result.length > 0 && (result[0] as any)?.connection_test === 1;
  } catch (error) {
    console.log('Databricks connection test failed:', error);
    return false;
  }
}

export const executeDatabricksQuery = async (
  config: DatabricksConnection,
  query: string,
): Promise<QueryResponseType> => {
  const client = new DBSQLClient();

  try {
    const connection = await client.connect({
      token: config.password, // Using password field for token
      host: config.host,
      path: config.httpPath,
    });

    const session = await connection.openSession();
    const queryOperation = await session.executeStatement(query, {
      runAsync: true,
    });

    const result = await queryOperation.fetchAll();
    await queryOperation.close();
    await session.close();
    await client.close();

    // For now, we'll return basic field info since Databricks doesn't provide detailed type info easily
    const fields = result.length > 0
      ? Object.keys(result[0] as object).map((name, index) => ({ name, type: index }))
      : [];

    return {
      success: true,
      data: result as any[], // Cast to any[] to match expected type
      fields,
    };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
};
