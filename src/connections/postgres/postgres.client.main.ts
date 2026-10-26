/* eslint-disable prefer-promise-reject-errors, consistent-return */
import pg from 'pg';
import { PostgresConnection, QueryResponseType } from '../../types/backend';

export async function testPostgresConnection(
  config: PostgresConnection,
): Promise<boolean> {
  const clientConfig: any = {
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    connectionTimeoutMillis: 5000,
  };

  if (config.ssl) {
    clientConfig.ssl = {
      rejectUnauthorized: false,
    };
  }

  const client = new pg.Client(clientConfig);

  await client.connect();
  const result = await client.query('SELECT 1 as connection_test');
  await client.end();
  return result.rows[0]?.connection_test === 1;
}

export const executePostgresQuery = async (
  config: PostgresConnection,
  query: string,
  registerCancel?: (fn: () => void) => void,
): Promise<QueryResponseType> => {
  const clientConfig: any = {
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    connectionTimeoutMillis: 5000,
  };

  if (config.ssl) {
    clientConfig.ssl = {
      rejectUnauthorized: false,
    };
  }

  const client = new pg.Client(clientConfig);

  if (registerCancel) {
    registerCancel(() => {
      client.end();
    });
  }

  try {
    await client.connect();
    const result = await client.query(query);
    return {
      success: true,
      data: result.rows,
      fields: result.fields.map((f) => ({ name: f.name, type: f.dataTypeID })),
      rowCount: result.rowCount ?? undefined,
    };
  } catch (err: any) {
    return { success: false, error: err?.message };
  } finally {
    await client.end();
  }
};
