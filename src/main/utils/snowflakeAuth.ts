import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as http from 'http';
import { createHash } from 'crypto';
import * as snowflake from 'snowflake-sdk';
import { shell } from 'electron';
import {
  SnowflakeAuthEventPayload,
  StartSnowflakeAuthRequest,
} from '../../types/ipc';
import {
  ConnectionTestResult,
  SNOWFLAKE_REAUTH_MESSAGE,
  SnowflakeConnection,
} from '../../types/backend';

export { SNOWFLAKE_REAUTH_MESSAGE };

// Snowflake SDK: snowflake-sdk ^3.3.0 (requires Node >= 16).
// OAuth uses OAUTH_AUTHORIZATION_CODE with the SDK-owned system-browser flow
// and local callback. The browser callback exposes this attempt's redirect
// port, so Cancel can stop that SDK flow without probing other local servers.
const BROWSER_ACTION_TIMEOUT_MS = 120000;

export class SnowflakeAuthManager {
  private static activeAttempts = new Map<
    string,
    {
      connection: snowflake.Connection;
      connectionKey: string;
      abort: () => void;
      reject: (err: any) => void;
    }
  >();

  // One active browser attempt per Snowflake account+user. Guards duplicate
  // Test clicks / double submits for the same connection while allowing
  // immediate retry after cancel/finish (entries are released synchronously
  // on cancel and in `finally` on every other path).
  private static activeConnectionKeys = new Map<string, string>();

  private static validateStartRequest(
    request: StartSnowflakeAuthRequest,
  ): string | null {
    if (!request || typeof request !== 'object') {
      return 'Invalid authentication request.';
    }
    if (
      !request.correlationId ||
      typeof request.correlationId !== 'string' ||
      !request.correlationId.trim()
    ) {
      return 'Missing correlation ID for authentication attempt.';
    }
    if (
      !request.account ||
      typeof request.account !== 'string' ||
      !request.account.trim()
    ) {
      return 'Snowflake account identifier is required before starting browser authentication.';
    }
    if (
      !request.username ||
      typeof request.username !== 'string' ||
      !request.username.trim()
    ) {
      return 'Snowflake username is required before starting browser authentication.';
    }
    const missingField = (
      ['role', 'warehouse', 'database', 'schema'] as const
    ).find(
      (field) => typeof request[field] !== 'string' || !request[field]?.trim(),
    );
    if (missingField) {
      return `Snowflake ${missingField} is required before starting browser authentication.`;
    }
    return null;
  }

  private static connectionKeyFor(account: string, username: string): string {
    return `${account.trim().toLowerCase()}::${username.trim().toLowerCase()}`;
  }

  private static releaseAttempt(
    correlationId: string,
    connectionKey?: string,
  ): void {
    this.activeAttempts.delete(correlationId);
    if (connectionKey) {
      if (this.activeConnectionKeys.get(connectionKey) === correlationId) {
        this.activeConnectionKeys.delete(connectionKey);
      }
    } else {
      const staleKeys: string[] = [];
      this.activeConnectionKeys.forEach((id, key) => {
        if (id === correlationId) {
          staleKeys.push(key);
        }
      });
      staleKeys.forEach((key) => this.activeConnectionKeys.delete(key));
    }
  }

  static async startAuth(
    request: StartSnowflakeAuthRequest,
    sendEvent: (payload: SnowflakeAuthEventPayload) => void,
  ): Promise<ConnectionTestResult> {
    const validationError = this.validateStartRequest(request);
    if (validationError) {
      throw new Error(validationError);
    }

    const {
      correlationId,
      account,
      username,
      warehouse,
      database,
      schema,
      role,
    } = request;

    if (this.activeAttempts.has(correlationId)) {
      throw new Error('An authentication attempt is already in progress.');
    }

    const resolvedAccount = account.trim();
    const trimmedUsername = username.trim();
    const connectionKey = this.connectionKeyFor(account, username);
    if (this.activeConnectionKeys.has(connectionKey)) {
      throw new Error(
        'An authentication attempt for this Snowflake account and user is already in progress.',
      );
    }

    sendEvent({ correlationId, status: 'started' });

    let cancelled = false;
    let redirectPort: number | undefined;
    const abort = () => {
      cancelled = true;
      if (redirectPort) this.abortSdkCallbackServer(redirectPort);
    };
    const connectionConfig: snowflake.ConnectionOptions = {
      account: resolvedAccount,
      username: trimmedUsername,
      warehouse,
      database,
      schema,
      role,
      authenticator: 'OAUTH_AUTHORIZATION_CODE',
      browserActionTimeout: BROWSER_ACTION_TIMEOUT_MS,
      clientStoreTemporaryCredential: true,
      openExternalBrowserCallback: (authorizationUrl) => {
        const redirect = new URL(
          new URL(authorizationUrl).searchParams.get('redirect_uri') ?? '',
        );
        if (
          redirect.protocol !== 'http:' ||
          redirect.hostname !== '127.0.0.1' ||
          !redirect.port
        ) {
          throw new Error('Invalid Snowflake OAuth redirect URI.');
        }
        redirectPort = Number(redirect.port);
        if (cancelled) {
          this.abortSdkCallbackServer(redirectPort);
          return undefined;
        }
        return shell.openExternal(authorizationUrl);
      },
    };

    const connection = snowflake.createConnection(connectionConfig);

    // Register before invoking the SDK so cancel arriving in the race window
    // still finds the attempt (previously the map was set inside the promise
    // executor, after connectAsync was already called).
    let resolveAttempt!: () => void;
    let rejectAttempt!: (err: any) => void;
    const attemptPromise = new Promise<void>((resolve, reject) => {
      resolveAttempt = resolve;
      rejectAttempt = reject;
    });
    this.activeAttempts.set(correlationId, {
      connection,
      connectionKey,
      abort,
      reject: rejectAttempt,
    });
    this.activeConnectionKeys.set(connectionKey, correlationId);

    sendEvent({ correlationId, status: 'waiting_for_browser' });

    try {
      // connectAsync opens the browser when authenticator is OAUTH_AUTHORIZATION_CODE
      connection.connectAsync((err) => {
        if (err) {
          rejectAttempt(err);
        } else {
          resolveAttempt();
        }
      });

      await attemptPromise;

      sendEvent({ correlationId, status: 'completed' });
      return { ok: true, authFlow: 'browser' };
    } catch (error: any) {
      const message = error?.message || '';
      const lowercaseMessage = message.toLowerCase();

      let testMessage =
        'Snowflake connection failed after browser authentication';
      let details =
        'Snowflake authentication failed. Check the connection settings and try again.';

      if (
        /(cancel|timed out|timeout|did not complete|mfa token cache entry has expired)/i.test(
          message,
        )
      ) {
        testMessage = 'Snowflake browser authentication failed';
        details =
          'Browser authentication did not complete. Finish the Snowflake sign-in flow and test again.';
        sendEvent({ correlationId, status: 'cancelled', error: details });
      } else if (lowercaseMessage.includes('role')) {
        testMessage = 'Snowflake role authorization failed';
        details =
          'The selected Snowflake role is not authorized for this user.';
        sendEvent({ correlationId, status: 'failed', error: details });
      } else if (lowercaseMessage.includes('warehouse')) {
        testMessage = 'Snowflake warehouse validation failed';
        details =
          'The selected Snowflake warehouse is unavailable or not authorized for this user.';
        sendEvent({ correlationId, status: 'failed', error: details });
      } else if (
        lowercaseMessage.includes('saml') ||
        lowercaseMessage.includes('sso')
      ) {
        testMessage = 'Snowflake SAML/SSO authentication failed';
        details = 'Snowflake SSO authentication failed. Try signing in again.';
        sendEvent({ correlationId, status: 'failed', error: details });
      } else if (
        lowercaseMessage.includes('url') ||
        lowercaseMessage.includes('redirect') ||
        lowercaseMessage.includes('not recognized') ||
        lowercaseMessage.includes('idp')
      ) {
        testMessage = 'Snowflake SSO redirect failed';
        details = 'The Account Locator value may be incorrect.';
        sendEvent({ correlationId, status: 'failed', error: details });
      } else {
        sendEvent({ correlationId, status: 'failed', error: details });
      }

      return {
        ok: false,
        message: testMessage,
        details,
        authFlow: 'browser',
      };
    } finally {
      this.releaseAttempt(correlationId, connectionKey);
      // Ensure we cleanup the connection to free resources
      try {
        connection.destroy(() => {});
      } catch (e) {
        // Ignore destroy error
      }
    }
  }

  // Fail fast when no cached OAuth session exists. Query and extract
  // paths use this so a cold session redirects the user to the Connections
  // screen instead of opening a second, ungated browser flow.
  static assertCachedSession(): void {
    if (!this.hasSnowflakeToken()) {
      throw new Error(SNOWFLAKE_REAUTH_MESSAGE);
    }
  }

  // Reads the live OAuth access token from the Node SDK's own credential
  // cache file (never from SDK memory internals). Used to hand the current
  // session to dbt (Python driver) via process env at run time — the token
  // is never written to profiles, logs, or renderer state. Validate the
  // named session silently before reading its identity-specific cache entry.
  static async readCachedOAuthAccessToken(
    namedConnection: SnowflakeConnection,
  ): Promise<string | null> {
    if (!this.hasSnowflakeToken()) return null;

    const options: snowflake.ConnectionOptions = {
      account: namedConnection.account,
      username: namedConnection.username,
      warehouse: namedConnection.warehouse,
      database: namedConnection.database,
      schema: namedConnection.schema,
      role: namedConnection.role,
      authenticator: 'OAUTH_AUTHORIZATION_CODE',
      clientStoreTemporaryCredential: true,
      openExternalBrowserCallback: () => {
        throw new Error(SNOWFLAKE_REAUTH_MESSAGE);
      },
    };
    let connection: snowflake.Connection | undefined;
    try {
      connection = snowflake.createConnection(options);
      const sdkConnection = connection;
      await new Promise<void>((resolve, reject) => {
        Promise.resolve(
          sdkConnection.connectAsync((error) =>
            error ? reject(error) : resolve(),
          ),
        ).catch(reject);
      });
      // The SDK resolves host/accessUrl in createConnection and hashes these
      // fields with the username, OAuth token URL, and role for its cache key.
      if (!options.host || !options.accessUrl) return null;
      const normalize = (value: string) =>
        value.includes('"') ? value : value.toLowerCase();
      const hash = createHash('sha256')
        .update(
          JSON.stringify({
            snowflakeHost: options.host,
            username: normalize(namedConnection.username),
            oauthIdpUrl: `${options.accessUrl}/oauth/token-request`,
            role: namedConnection.role
              ? normalize(namedConnection.role)
              : undefined,
          }),
          'utf8',
        )
        .digest('hex');
      const raw = fs.readFileSync(this.getSnowflakeCacheFile(), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      const { tokens } = parsed as { tokens?: unknown };
      if (!tokens || typeof tokens !== 'object') {
        return null;
      }
      const record = tokens as Record<string, unknown>;
      const accessToken =
        record[`SnowflakeTokenCache.v2.OauthAccessToken.${hash}`];
      const refreshToken =
        record[`SnowflakeTokenCache.v2.OauthRefreshToken.${hash}`];
      return typeof accessToken === 'string' &&
        accessToken.length > 0 &&
        typeof refreshToken === 'string' &&
        refreshToken.length > 0
        ? accessToken
        : null;
    } catch (e) {
      return null;
    } finally {
      try {
        connection?.destroy(() => {});
      } catch (e) {
        // Ignore cleanup errors after the cache check.
      }
    }
  }

  static cancelAuth(correlationId: string): void {
    const attempt = this.activeAttempts.get(correlationId);
    if (!attempt) {
      return;
    }
    // Release synchronously so a new Test click can start immediately.
    this.releaseAttempt(correlationId, attempt.connectionKey);
    attempt.reject(new Error('Cancelled by user'));
    try {
      attempt.connection.destroy(() => {});
    } catch (e) {
      // Ignore destroy error
    }
    // destroy() does not stop the SDK's callback wait; signal its exact port.
    attempt.abort();
  }

  private static abortSdkCallbackServer(port: number): void {
    const req = http.get(
      `http://127.0.0.1:${port}/?error=cancelled_by_user`,
      (res) => res.resume(),
    );
    req.setTimeout(3000, () => req.destroy());
    req.on('error', () => {});
  }

  private static getSnowflakeCacheFile(): string {
    let cacheDir = '';
    if (process.platform === 'win32') {
      cacheDir = path.join(
        process.env.USERPROFILE || '',
        'AppData/Local/Snowflake/Caches',
      );
    } else if (process.platform === 'darwin') {
      cacheDir = path.join(os.homedir(), 'Library/Caches/Snowflake');
    } else {
      cacheDir = path.join(os.homedir(), '.cache/snowflake');
    }
    return path.join(cacheDir, 'credential_cache_v1.json');
  }

  static hasSnowflakeToken(): boolean {
    try {
      return fs.existsSync(this.getSnowflakeCacheFile());
    } catch (e) {
      return false;
    }
  }

  static revokeSnowflakeToken(): boolean {
    try {
      const cacheFile = this.getSnowflakeCacheFile();
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
      }
      return true;
    } catch {
      return false;
    }
  }
}
