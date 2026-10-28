/* eslint-disable prefer-promise-reject-errors, consistent-return */
import pg from 'pg';
import fs from 'fs';
import { QueryResponseType, RedshiftConnection } from '../../types/backend';

export async function testRedshiftConnection(
  config: RedshiftConnection,
): Promise<boolean> {
  const clientConfig: any = {
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    connectionTimeoutMillis: 15000,
  };

  if (config.ssl !== false) {
    clientConfig.ssl = {
      rejectUnauthorized: false,
      ...(config.sslrootcert && { ca: fs.readFileSync(config.sslrootcert) }),
    };
  }

  const client = new pg.Client(clientConfig);

  try {
    await client.connect();
    const result = await client.query('SELECT 1 as connection_test');
    await client.end();
    return result.rows[0]?.connection_test === 1;
  } catch (error) {
    return false;
  }
}

export const executeRedshiftQuery = async (
  config: RedshiftConnection,
  query: string,
  registerCancel?: (fn: () => void) => void,
): Promise<QueryResponseType> => {
  const clientConfig: any = {
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    connectionTimeoutMillis: 15000,
  };

  if (config.ssl !== false) {
    clientConfig.ssl = {
      rejectUnauthorized: false,
      ...(config.sslrootcert && { ca: fs.readFileSync(config.sslrootcert) }),
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
    };
  } catch (err: any) {
    return { success: false, error: err?.message };
  } finally {
    await client.end();
  }
};
