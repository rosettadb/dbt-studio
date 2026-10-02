/**
 * ChatGPT subscription sign-in (Plan 71).
 *
 * A separate service (BE-03) because it is a security boundary for the
 * user's ChatGPT account tokens and owns its own lifecycle (one browser
 * login attempt at a time, a local callback server, token refresh).
 * Structure follows SnowflakeAuthManager from PR #465: attempts keyed by a
 * renderer-created correlation ID, lifecycle events, synchronous cancel.
 *
 * Tokens stay in the main process: keytar only, never logged, never
 * returned over IPC. The renderer gets `{ loginId, email, planType }`.
 */
import * as http from 'http';
import { randomUUID } from 'crypto';
import { shell } from 'electron';
import SecureStorageService from '../../secureStorage.service';
import MainDatabaseService from '../../mainDatabase.service';
import type {
  ChatGptAuthEventPayload,
  ChatGptAuthStatus,
  StartChatGptAuthRequest,
  StartChatGptAuthResult,
} from '../../../../types/ipc';
import {
  CHATGPT_CALLBACK_HOST,
  CHATGPT_CALLBACK_PATH,
  CHATGPT_CALLBACK_PORT,
  CHATGPT_TOKEN_URL,
  ChatGptAuthError,
  ChatGptCredential,
  SIGNED_OUT_MESSAGE,
  buildAuthorizeUrl,
  buildCodeExchangeBody,
  buildRefreshBody,
  createPkcePair,
  createState,
  credentialFromTokenResponse,
  parseCredential,
  statesMatch,
} from './chatgptOAuth';

const PROVIDER_TYPE = 'openai-codex';
const PENDING_KEY_PREFIX = `${PROVIDER_TYPE}-pending-`;
const pendingKey = (loginId: string) => `${PENDING_KEY_PREFIX}${loginId}-oauth`;
// Refresh this long before the access token expires, so a request never
// starts with a token that runs out mid-stream.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const MESSAGES = {
  cancelled: 'Sign-in cancelled.',
  timedOut: 'Sign-in timed out. Try again.',
  portInUse:
    'Port 1455 is in use, probably by another ChatGPT or Codex sign-in. Close it and try again.',
  failed: 'ChatGPT sign-in failed. Try again, or use an OpenAI API key.',
  alreadyRunning: 'A ChatGPT sign-in is already in progress.',
  missingCorrelationId: 'Missing correlation ID for ChatGPT sign-in.',
} as const;

const page = (message: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>DBT Studio</title></head>` +
  `<body style="font-family:sans-serif;padding:48px;text-align:center">` +
  `<h2>${message}</h2><p>You can close this tab and return to DBT Studio.</p></body></html>`;

type CallbackOutcome =
  | { kind: 'code'; code: string }
  | { kind: 'cancelled'; message: string };

type Attempt = {
  correlationId: string;
  cancel: () => void;
};

const listen = (server: http.Server, port: number, host: string) =>
  new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

export default class ChatGptAuthService {
  private static activeAttempt: Attempt | null = null;

  private static refreshing = new Map<number, Promise<ChatGptCredential>>();

  /** Overridable in tests only; the redirect URI fixes it to 1455. */
  static callbackPort = CHATGPT_CALLBACK_PORT;

  static loginTimeoutMs = 5 * 60 * 1000;

  static async startLogin(
    request: StartChatGptAuthRequest,
    sendEvent: (payload: ChatGptAuthEventPayload) => void,
  ): Promise<StartChatGptAuthResult> {
    const correlationId =
      typeof request?.correlationId === 'string'
        ? request.correlationId.trim()
        : '';
    if (!correlationId) throw new Error(MESSAGES.missingCorrelationId);
    // One login app-wide: the callback port is fixed.
    if (this.activeAttempt) throw new Error(MESSAGES.alreadyRunning);

    const send = (status: ChatGptAuthStatus, error?: string) =>
      sendEvent({ correlationId, status, ...(error ? { error } : {}) });

    const { verifier, challenge } = createPkcePair();
    const state = createState();

    let settle!: (outcome: CallbackOutcome) => void;
    let settled = false;
    const outcome = new Promise<CallbackOutcome>((resolve) => {
      settle = resolve;
    });
    const finish = (result: CallbackOutcome) => {
      if (settled) return;
      settled = true;
      settle(result);
    };

    const server = http.createServer((req, res) =>
      ChatGptAuthService.handleCallback(req, res, state, finish),
    );
    const closeServer = () => {
      server.close();
      server.closeAllConnections?.();
    };
    // Register before listening so a Cancel that arrives early still finds
    // the attempt (the race PR #465 fixed for Snowflake).
    const attempt: Attempt = {
      correlationId,
      cancel: () => {
        finish({ kind: 'cancelled', message: MESSAGES.cancelled });
        closeServer();
      },
    };
    this.activeAttempt = attempt;
    const timer = setTimeout(
      () => finish({ kind: 'cancelled', message: MESSAGES.timedOut }),
      this.loginTimeoutMs,
    );

    send('started');
    try {
      try {
        await listen(server, this.callbackPort, CHATGPT_CALLBACK_HOST);
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        throw new ChatGptAuthError(
          'token_request_failed',
          code === 'EADDRINUSE' ? MESSAGES.portInUse : MESSAGES.failed,
        );
      }

      if (!settled) {
        await shell.openExternal(buildAuthorizeUrl(challenge, state));
        send('waiting_for_browser');
      }

      const result = await outcome;
      if (result.kind === 'cancelled') {
        send('cancelled', result.message);
        return { ok: false, message: result.message };
      }

      const credential = await this.requestTokens(
        buildCodeExchangeBody(result.code, verifier),
      );
      const loginId = randomUUID();
      await SecureStorageService.setCredential(
        pendingKey(loginId),
        JSON.stringify(credential),
      );

      send('completed');
      return {
        ok: true,
        loginId,
        email: credential.email,
        planType: credential.planType,
      };
    } catch (error) {
      const message =
        error instanceof ChatGptAuthError ? error.message : MESSAGES.failed;
      // Log the error kind only: responses can echo codes or tokens.
      // eslint-disable-next-line no-console
      console.error(
        '[ChatGptAuth] Sign-in failed:',
        error instanceof ChatGptAuthError ? error.code : (error as Error)?.name,
      );
      send('failed', message);
      return { ok: false, message };
    } finally {
      clearTimeout(timer);
      closeServer();
      if (this.activeAttempt === attempt) this.activeAttempt = null;
    }
  }

  /** Releases the attempt synchronously so a retry can start at once. */
  static cancelLogin(correlationId: string): void {
    const attempt = this.activeAttempt;
    if (!attempt || attempt.correlationId !== correlationId) return;
    this.activeAttempt = null;
    attempt.cancel();
  }

  private static handleCallback(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    state: string,
    finish: (outcome: CallbackOutcome) => void,
  ): void {
    const respond = (status: number, message: string) => {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page(message));
    };

    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== CHATGPT_CALLBACK_PATH) {
      respond(404, 'Not found.');
      return;
    }
    // A request without our state didn't come from this sign-in. Reject it
    // but keep waiting, so a stray local request can't end the attempt.
    if (!statesMatch(state, url.searchParams.get('state'))) {
      respond(400, 'Sign-in could not be verified.');
      return;
    }
    if (url.searchParams.get('error')) {
      respond(200, 'Sign-in was cancelled.');
      finish({ kind: 'cancelled', message: MESSAGES.cancelled });
      return;
    }
    const code = url.searchParams.get('code');
    if (!code) {
      respond(400, 'Sign-in could not be completed.');
      return;
    }
    respond(200, 'Signed in to DBT Studio.');
    finish({ kind: 'code', code });
  }

  private static async requestTokens(
    body: URLSearchParams,
    previous?: ChatGptCredential,
  ): Promise<ChatGptCredential> {
    let response: Response;
    try {
      response = await fetch(CHATGPT_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch {
      throw new ChatGptAuthError('token_request_failed', MESSAGES.failed);
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const errorCode =
        typeof errorBody?.error === 'string'
          ? errorBody.error
          : errorBody?.error?.code;
      if (
        errorCode === 'invalid_grant' ||
        errorCode === 'refresh_token_expired'
      ) {
        throw new ChatGptAuthError('signed_out', SIGNED_OUT_MESSAGE);
      }
      throw new ChatGptAuthError('token_request_failed', MESSAGES.failed);
    }

    return credentialFromTokenResponse(await response.json(), previous);
  }

  /**
   * Returns a credential whose access token is valid for at least
   * REFRESH_MARGIN_MS. Called by the model's fetch on every request, so a
   * long agent run never uses an expired token. `forceRefresh` is used after
   * a 401.
   */
  static async getValidCredential(
    providerId: number,
    options: { forceRefresh?: boolean } = {},
  ): Promise<ChatGptCredential> {
    const credential = parseCredential(
      await SecureStorageService.getAIProviderOAuthCredential(
        providerId,
        PROVIDER_TYPE,
      ),
    );
    if (!credential) {
      throw new ChatGptAuthError('signed_out', SIGNED_OUT_MESSAGE);
    }
    if (
      !options.forceRefresh &&
      credential.expiresAt - Date.now() > REFRESH_MARGIN_MS
    ) {
      return credential;
    }
    return this.refresh(providerId, credential);
  }

  /**
   * Single-flight: refresh tokens rotate, so two parallel refreshes would
   * invalidate each other. Concurrent callers share one request.
   */
  private static refresh(
    providerId: number,
    credential: ChatGptCredential,
  ): Promise<ChatGptCredential> {
    const inFlight = this.refreshing.get(providerId);
    if (inFlight) return inFlight;

    const promise = (async () => {
      try {
        const next = await this.requestTokens(
          buildRefreshBody(credential.refreshToken),
          credential,
        );
        await SecureStorageService.setAIProviderOAuthCredential(
          providerId,
          PROVIDER_TYPE,
          JSON.stringify(next),
        );
        return next;
      } catch (error) {
        if (error instanceof ChatGptAuthError && error.code === 'signed_out') {
          await this.markSignedOut(providerId);
        }
        throw error;
      }
    })().finally(() => {
      this.refreshing.delete(providerId);
    });

    this.refreshing.set(providerId, promise);
    return promise;
  }

  /** Moves a pending login's credential to a newly created provider. */
  static async adoptPendingLogin(
    loginId: string,
    providerId: number,
  ): Promise<void> {
    const raw = await SecureStorageService.getCredential(pendingKey(loginId));
    if (!parseCredential(raw)) {
      throw new Error('The ChatGPT sign-in expired. Sign in again.');
    }
    await SecureStorageService.setAIProviderOAuthCredential(
      providerId,
      PROVIDER_TYPE,
      raw!,
    );
    await SecureStorageService.deleteCredential(pendingKey(loginId));
  }

  /** Deletes a pending login (dialog cancelled or closed before saving). */
  static async discardPendingLogin(loginId: string): Promise<void> {
    if (typeof loginId !== 'string' || !loginId) return;
    await SecureStorageService.deleteCredential(pendingKey(loginId));
  }

  /** Test Connection before the provider is saved. */
  static async getPendingCredential(
    loginId: string,
  ): Promise<ChatGptCredential> {
    const credential = parseCredential(
      await SecureStorageService.getCredential(pendingKey(loginId)),
    );
    if (!credential) {
      throw new ChatGptAuthError(
        'signed_out',
        'The ChatGPT sign-in expired. Sign in again.',
      );
    }
    return credential;
  }

  static async signOut(providerId: number): Promise<void> {
    await this.markSignedOut(providerId);
  }

  private static async markSignedOut(providerId: number): Promise<void> {
    await SecureStorageService.deleteAIProviderOAuthCredential(
      providerId,
      PROVIDER_TYPE,
    );
    const provider = await MainDatabaseService.getProvider(providerId);
    if (!provider) return;
    const config =
      typeof provider.config === 'string'
        ? JSON.parse(provider.config)
        : provider.config || {};
    await MainDatabaseService.updateProvider(providerId, {
      config: JSON.stringify({ ...config, signedOut: true }),
    });
  }

  /**
   * Called once at app start: a pending login belongs to a dialog that no
   * longer exists.
   */
  static async cleanupPendingLogins(): Promise<void> {
    const accounts = await SecureStorageService.findCredentials();
    await Promise.all(
      accounts
        .filter((account) => account.startsWith(PENDING_KEY_PREFIX))
        .map((account) => SecureStorageService.deleteCredential(account)),
    );
  }
}
