/* eslint-disable prefer-promise-reject-errors, consistent-return */
import pg from 'pg';
import snowflake from 'snowflake-sdk';
import { BigQuery } from '@google-cloud/bigquery';
import {
  PostgresConnection,
  QueryResponseType,
  SnowflakeConnection,
  DatabricksConnection,
  BigQueryConnection,
  BigQueryTestResponse,
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
      token: config.token, // Use token instead of password
      host: config.host,
      path: config.httpPath,
    });

    const session = await connection.openSession();
    const queryOperation = await session.executeStatement(
      'SELECT 1 as connection_test',
      {
        runAsync: true,
      },
    );

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
      token: config.token, // Use token instead of password
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
    const fields =
      result.length > 0
        ? Object.keys(result[0] as object).map((name, index) => ({
            name,
            type: index,
          }))
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

export async function testBigQueryConnection(
  config: BigQueryConnection,
): Promise<BigQueryTestResponse> {
  if (config.method !== 'service-account' || !config.keyfile) {
    throw new Error('Only service account authentication is supported');
  }

  const bigqueryConfig: any = {
    projectId: config.project,
  };

  try {
    const credentials = JSON.parse(config.keyfile);
    bigqueryConfig.credentials = credentials;
  } catch (err) {
    console.error('Invalid service account key JSON:', err);
    throw new Error('Invalid service account key JSON format');
  }

  if (config.location) {
    bigqueryConfig.location = config.location;
  }

  console.log('Creating BigQuery client with service account authentication');
  const client = new BigQuery(bigqueryConfig);

  try {
    // Test connection by running a simple query
    console.log('Testing BigQuery connection...');
    await client.query('SELECT 1');
    console.log('BigQuery connection test successful');
    return {
      success: true,
      accessToken: '',
      refreshToken: '',
    };
  } catch (err: any) {
    console.error('BigQuery connection test failed:', err);
    if (err.code === 403) {
      throw new Error(
        'Permission denied. Please check your credentials and project access.',
      );
    } else if (err.code === 404) {
      throw new Error('Project not found. Please verify your Project ID.');
    } else if (err.code === 401) {
      throw new Error(
        'Authentication failed. Please check your service account key.',
      );
    }
    throw err;
  }
}

export const executeBigQueryQuery = async (
  config: BigQueryConnection,
  query: string,
): Promise<QueryResponseType> => {
  if (config.method !== 'service-account' || !config.keyfile) {
    return {
      success: false,
      error: 'Only service account authentication is supported',
    };
  }

  const bigqueryConfig: any = {
    projectId: config.project,
  };

  try {
    const credentials = JSON.parse(config.keyfile);
    bigqueryConfig.credentials = credentials;
  } catch (err) {
    return {
      success: false,
      error: 'Invalid service account key JSON format',
    };
  }

  if (config.location) {
    bigqueryConfig.location = config.location;
  }

  console.log(
    'Creating BigQuery client for query with service account authentication',
  );
  const client = new BigQuery(bigqueryConfig);

  try {
    const options: any = {
      query,
      location: config.location,
    };

    if (config.priority === 'batch') {
      options.priority = 'BATCH';
    }

    const [rows] = await client.query(options);
    const fields =
      rows.length > 0
        ? Object.keys(rows[0]).map((name) => ({
            name,
            type: typeof rows[0][name] === 'number' ? 1 : 0,
          }))
        : [];

    return {
      success: true,
      data: rows,
      fields,
    };
  } catch (err: any) {
    let errorMessage = err.message;

    if (err.code === 403) {
      errorMessage =
        'Permission denied. Please check your credentials and project access.';
    } else if (err.code === 404) {
      errorMessage =
        'Project or dataset not found. Please verify your Project ID and dataset.';
    } else if (err.code === 401) {
      errorMessage =
        'Authentication failed. Please check your service account key.';
    }

    console.error('BigQuery query execution failed:', err);
    return {
      success: false,
      error: errorMessage,
    };
  }
};
