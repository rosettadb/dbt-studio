import SecureStorageService from '../services/secureStorage.service';
import ConnectorsService from '../services/connectors.service';
import {
  rememberSecret,
  SECRET_PREFIX,
  type ChartsEnv,
} from './dbtChartsRedact';

export { clearKnownSecrets, redactSecrets } from './dbtChartsRedact';
export type { ChartsEnv } from './dbtChartsRedact';

const SECRET_FIELDS = ['user', 'password', 'token', 'bigquery'] as const;

/**
 * Environment for dct / dbt child processes. Reads the connection's
 * credentials from secure storage inside the main process (nothing goes
 * through the renderer) and exposes them exactly as profiles.yml expects:
 * env_var("db-<field>-<connection>").
 */
export async function buildDbtChartsEnv(
  connection: { name: string },
  projectPath: string,
): Promise<ChartsEnv> {
  const { name } = connection;

  await Promise.all(
    SECRET_FIELDS.map(async (field) => {
      const key = `${SECRET_PREFIX}${field}-${name}`;
      const value = await SecureStorageService.getCredential(key);
      if (value) {
        rememberSecret(value);
        await ConnectorsService.setConnectionEnvVariable(key, value);
      }
    }),
  );

  // No-op unless the connection is Snowflake with browser OAuth.
  await ConnectorsService.materializeSnowflakeOAuthEnv(name);

  return { ...process.env, DBT_PROFILES_DIR: projectPath };
}
