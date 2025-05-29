/* eslint-disable prefer-promise-reject-errors, consistent-return */
import pg from 'pg';
import snowflake from 'snowflake-sdk';
import { BigQuery } from '@google-cloud/bigquery';
import { OAuth2Client } from 'google-auth-library';
import { app, BrowserWindow } from 'electron';
import {
  PostgresConnection,
  QueryResponseType,
  SnowflakeConnection,
  BigQueryConnection,
  BigQueryTestResponse,
} from '../../types/backend';
import { SNOWFLAKE_TYPE_MAP } from './constants';

const OAUTH_REDIRECT_PORT = 1212;
const OAUTH_REDIRECT_HOST = 'localhost';
const OAUTH_REDIRECT_URL = `http://${OAUTH_REDIRECT_HOST}:${OAUTH_REDIRECT_PORT}`;

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

export async function testBigQueryConnection(
  config: BigQueryConnection,
): Promise<BigQueryTestResponse> {
  const bigqueryConfig: any = {
    projectId: config.project,
  };

  if (config.method === 'service-account' && config.keyfile) {
    try {
      const credentials = JSON.parse(config.keyfile);
      bigqueryConfig.credentials = credentials;
    } catch (err) {
      console.error('Invalid service account key JSON:', err);
      throw new Error('Invalid service account key JSON format');
    }
  } else if (config.method === 'oauth') {
    try {
      console.log('Starting OAuth flow...');
      const oauth2Client = new OAuth2Client({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: OAUTH_REDIRECT_URL + '/',
      });

      // Generate the url that will be used for authorization
      const authorizeUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/bigquery'],
        prompt: 'consent', // Force showing consent screen to get refresh token
      });
      console.log('Generated auth URL:', authorizeUrl);

      // Create a new window to handle the OAuth flow
      const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false
        }
      });

      // Handle the OAuth callback
      const { session: { webRequest } } = win.webContents;

      const p = new Promise<string>((resolve, reject) => {
        // Create the callback handler
        const handleCallback = (details: { url: string }) => {
          console.log('Received callback URL:', details.url);
          try {
            // Parse the URL to handle the code properly
            const urlObj = new URL(details.url);
            const code = urlObj.searchParams.get('code');
            if (code) {
              console.log('Extracted authorization code');
              // Remove the listener
              webRequest.onBeforeRequest(null);
              resolve(decodeURIComponent(code));
              win.removeAllListeners('closed');
              win.close();
            }
          } catch (err) {
            console.error('Error parsing callback URL:', err);
            reject(new Error('Invalid callback URL format'));
          }
        };

        // Add the listener with URL filter
        webRequest.onBeforeRequest({ urls: [`${OAUTH_REDIRECT_URL}/*`] }, handleCallback);

        // Handle if user closes the window
        win.on('closed', () => {
          console.log('OAuth window was closed by user');
          // Clean up the listener when window is closed
          webRequest.onBeforeRequest(null);
          reject(new Error('Authentication window was closed'));
        });
      });

      // Load the authorization URL
      await win.loadURL(authorizeUrl);

      try {
        // Wait for the code
        console.log('Waiting for authorization code...');
        const code = await p;
        console.log('Received authorization code, exchanging for tokens...');

        // Get the access token
        const { tokens } = await oauth2Client.getToken(code);
        console.log('Received tokens:', JSON.stringify(tokens, null, 2));
        oauth2Client.setCredentials(tokens);

        // Store tokens in the config - this will update the form state
        config.accessToken = tokens.access_token || '';
        config.refreshToken = tokens.refresh_token || '';
      } catch (error) {
        console.error('OAuth token exchange error:', error);
        throw new Error('OAuth authentication failed. Please try again.');
      }

      // Set up auth client for BigQuery
      bigqueryConfig.authClient = oauth2Client;
    } catch (err) {
      console.error('OAuth authentication failed:', err);
      throw new Error('OAuth authentication failed. Please try again.');
    }
  }

  if (config.location) {
    bigqueryConfig.location = config.location;
  }

  console.log('Creating BigQuery client with config:', JSON.stringify(bigqueryConfig, null, 2));
  const client = new BigQuery(bigqueryConfig);

  try {
    // Test connection by running a simple query
    console.log('Testing BigQuery connection...');
    await client.query('SELECT 1');
    console.log('BigQuery connection test successful');
    return {
      success: true,
      accessToken: config.accessToken || '',
      refreshToken: config.refreshToken || '',
    }
  } catch (err: any) {
    console.error('BigQuery connection test failed:', err);
    if (err.code === 403) {
      throw new Error('Permission denied. Please check your credentials and project access.');
    } else if (err.code === 404) {
      throw new Error('Project not found. Please verify your Project ID.');
    } else if (err.code === 401) {
      throw new Error('Authentication failed. Please check your OAuth setup or service account key.');
    }
    throw err;
  }
}

export const executeBigQueryQuery = async (
  config: BigQueryConnection,
  query: string,
): Promise<QueryResponseType> => {
  const bigqueryConfig: any = {
    projectId: config.project,
    credentials: {} // Initialize empty credentials object to prevent default credentials lookup
  };

  if (config.method === 'service-account' && config.keyfile) {
    try {
      const credentials = JSON.parse(config.keyfile);
      bigqueryConfig.credentials = credentials;
    } catch (err) {
      return {
        success: false,
        error: 'Invalid service account key JSON format',
      };
    }
  } else if (config.method === 'oauth') {
    try {
      const oauth2Client = new OAuth2Client({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: `${OAUTH_REDIRECT_URL}/`,
      });

      // If we have existing tokens, try to use them
      if (config.accessToken && config.refreshToken) {
        console.log('Using existing OAuth tokens for query execution');
        oauth2Client.setCredentials({
          access_token: config.accessToken,
          refresh_token: config.refreshToken,
        });
        bigqueryConfig.auth = oauth2Client;
        delete bigqueryConfig.credentials; // Remove empty credentials when using OAuth
      } else {
        return {
          success: false,
          error: 'OAuth tokens not found. Please test the connection first.',
        };
      }
    } catch (err) {
      return {
        success: false,
        error: 'OAuth authentication failed. Please try again.',
      };
    }
  }

  if (config.location) {
    bigqueryConfig.location = config.location;
  }

  console.log('Creating BigQuery client for query with config:', JSON.stringify(bigqueryConfig, null, 2));
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
    const fields = rows.length > 0
      ? Object.keys(rows[0]).map(name => ({
          name,
          type: typeof rows[0][name] === 'number' ? 1 : 0
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
      errorMessage = 'Permission denied. Please check your credentials and project access.';
    } else if (err.code === 404) {
      errorMessage = 'Project or dataset not found. Please verify your Project ID and dataset.';
    } else if (err.code === 401) {
      errorMessage = 'Authentication failed. Please check your service account key or OAuth setup.';
    }

    console.error('BigQuery query execution failed:', err);
    return {
      success: false,
      error: errorMessage,
    };
  }
};
