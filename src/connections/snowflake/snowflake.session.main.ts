import SecureStorageService from '../../main/services/secureStorage.service';
import type { ConnectionInput } from '../registry.shared';
import type { SnowflakeConnection } from './snowflake.shared';
import { SnowflakeAuthManager } from './snowflake.auth.main';

// Revokes the cached Snowflake OAuth session and clears the stored secrets and
// process env. Identity fields (username, account, …) are kept so forms can
// re-hydrate; only secrets are removed.
/** Body of ConnectorsService.revokeSnowflakeSession (CS 957-977), verbatim. */
export async function revokeSnowflakeSession(
  connectionName: string,
): Promise<boolean> {
  const name = (connectionName ?? '').trim();
  if (!name) {
    throw new Error(
      'Connection name is required to revoke Snowflake credentials.',
    );
  }
  const revoked = SnowflakeAuthManager.revokeSnowflakeToken();
  // eslint-disable-next-line no-restricted-syntax, no-await-in-loop -- moved verbatim from ConnectorsService.revokeSnowflakeSession
  for (const field of ['password', 'token']) {
    const key = `db-${field}-${name}`;
    try {
      // eslint-disable-next-line no-await-in-loop
      await SecureStorageService.deleteCredential(key);
    } catch {
      // Missing credentials are fine; revoke stays idempotent.
    }
    delete process.env[key];
  }
  return revoked;
}

/**
 * Hands the live Snowflake OAuth session to dbt (Python driver) at run time:
 * reads the access token from the Node SDK's own cache file and exports it as
 * `db-token-<name>` process env, which OAuth profiles reference via
 * `{{ env_var(...) }}`. The token never touches profiles, logs, keychain, or
 * renderer state — same channel passwords already use.
 * Self-gating: no-op (false) unless the connection is Snowflake+oauth_browser.
 * Body of ConnectorsService.materializeSnowflakeOAuthEnv after its
 * findConnectionByName lookup (CS 995-1010), verbatim.
 */
export async function materializeSnowflakeOAuthEnv(
  connection: ConnectionInput | undefined,
): Promise<boolean> {
  const snowflakeConn = connection;
  if (
    !snowflakeConn ||
    snowflakeConn.type !== 'snowflake' ||
    (snowflakeConn as SnowflakeConnection).authMethod !== 'oauth_browser'
  ) {
    return false;
  }
  const accessToken = await SnowflakeAuthManager.readCachedOAuthAccessToken(
    snowflakeConn as SnowflakeConnection,
  );
  if (!accessToken) {
    delete process.env[`db-token-${snowflakeConn.name}`];
    return false;
  }
  process.env[`db-token-${snowflakeConn.name}`] = accessToken;
  return true;
}
