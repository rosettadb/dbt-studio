/* eslint-disable prefer-promise-reject-errors, consistent-return */
import snowflake from 'snowflake-sdk';
import { SNOWFLAKE_TYPE_MAP } from '../../main/utils/constants';
import { QueryResponseType, SnowflakeConnection } from '../../types/backend';
import {
  SNOWFLAKE_REAUTH_MESSAGE,
  SnowflakeAuthManager,
} from './snowflake.auth.main';

const getSnowflakeAuthMethod = (config: SnowflakeConnection) => {
  return config.authMethod || 'password';
};

export const createSnowflakeConnection = (config: SnowflakeConnection) => {
  const authMethod = getSnowflakeAuthMethod(config);

  const baseConfig = {
    username: config.username,
    warehouse: config.warehouse,
    database: config.database,
    schema: config.schema,
    role: config.role,
  };

  if (authMethod === 'oauth_browser') {
    return snowflake.createConnection({
      ...baseConfig,
      account: config.account,
      authenticator: 'OAUTH_AUTHORIZATION_CODE',
      browserActionTimeout: 120000,
      clientStoreTemporaryCredential: true,
      openExternalBrowserCallback: () => {
        throw new Error(SNOWFLAKE_REAUTH_MESSAGE);
      },
    });
  }

  return snowflake.createConnection({
    ...baseConfig,
    account: config.account.split('.')[0],
    password: config.password,
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
    return false;
  } finally {
    connection.destroy(() => {});
  }
}

export const executeSnowflakeQuery = async (
  config: SnowflakeConnection,
  query: string,
  registerCancel?: (fn: () => void) => void,
): Promise<QueryResponseType> => {
  const connection = createSnowflakeConnection(config);
  const authMethod = getSnowflakeAuthMethod(config);

  if (registerCancel) {
    registerCancel(() => {
      try {
        connection.destroy(() => {});
      } catch (e) {
        // ignore
      }
    });
  }

  try {
    if (authMethod === 'oauth_browser') {
      // No browser flows outside the Connections screen: a cold session
      // fails fast with guidance instead of opening an ungated popup.
      // A warm SDK cache connects silently without user interaction.
      SnowflakeAuthManager.assertCachedSession();
      await new Promise<void>((resolve, reject) => {
        connection.connectAsync((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    } else {
      await new Promise<void>((resolve, reject) => {
        connection.connect((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }

  return new Promise((resolve) => {
    connection.execute({
      sqlText: query,
      complete: (error, stmt, rows) => {
        connection.destroy(() => {});
        if (error) {
          return resolve({ success: false, error: error.message });
        }

        const fields =
          stmt?.getColumns()?.map((col) => ({
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
};
