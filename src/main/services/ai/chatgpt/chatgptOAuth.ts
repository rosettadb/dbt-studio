/**
 * ChatGPT subscription sign-in (Plan 71): protocol constants and pure helpers.
 *
 * DBT Studio signs in with the Codex OAuth flow (the login the Codex CLI
 * uses). OpenAI publishes no SDK for this; values were checked against pi
 * (earendil-works/pi@2b0a123, packages/ai/src/auth/oauth/openai-codex.ts)
 * and opencode (anomalyco/opencode@b471c2b,
 * packages/opencode/src/plugin/openai/codex.ts). Keep every protocol value
 * in this file so an endpoint change is a one-file fix.
 */
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export const CHATGPT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const CHATGPT_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
export const CHATGPT_TOKEN_URL = 'https://auth.openai.com/oauth/token';
export const CHATGPT_CALLBACK_HOST = '127.0.0.1';
export const CHATGPT_CALLBACK_PORT = 1455;
export const CHATGPT_CALLBACK_PATH = '/auth/callback';
// Registered by OpenAI for this client; it can't be changed or moved to
// another port.
export const CHATGPT_REDIRECT_URI = `http://localhost:${CHATGPT_CALLBACK_PORT}${CHATGPT_CALLBACK_PATH}`;
export const CHATGPT_SCOPE = 'openid profile email offline_access';
export const CHATGPT_ORIGINATOR = 'dbt_studio';
export const CHATGPT_BASE_URL = 'https://chatgpt.com/backend-api/codex';
const JWT_AUTH_CLAIM = 'https://api.openai.com/auth';

export type ChatGptCredential = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountId: string;
  email: string | null;
  planType: string | null;
};

export type ChatGptAuthErrorCode =
  | 'token_request_failed'
  | 'invalid_token_response'
  | 'missing_account'
  | 'signed_out';

export class ChatGptAuthError extends Error {
  readonly code: ChatGptAuthErrorCode;

  constructor(code: ChatGptAuthErrorCode, message: string) {
    super(message);
    this.name = 'ChatGptAuthError';
    this.code = code;
  }
}

export const SIGNED_OUT_MESSAGE =
  'Sign in to ChatGPT again in Settings → AI Settings → Providers.';

export function pkceChallengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: pkceChallengeFor(verifier) };
}

export function createState(): string {
  return randomBytes(32).toString('base64url');
}

export function statesMatch(expected: string, received: string | null) {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildAuthorizeUrl(challenge: string, state: string): string {
  const url = new URL(CHATGPT_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CHATGPT_CLIENT_ID);
  url.searchParams.set('redirect_uri', CHATGPT_REDIRECT_URI);
  url.searchParams.set('scope', CHATGPT_SCOPE);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('id_token_add_organizations', 'true');
  url.searchParams.set('codex_cli_simplified_flow', 'true');
  url.searchParams.set('originator', CHATGPT_ORIGINATOR);
  return url.toString();
}

export function buildCodeExchangeBody(
  code: string,
  verifier: string,
): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CHATGPT_CLIENT_ID,
    code,
    code_verifier: verifier,
    redirect_uri: CHATGPT_REDIRECT_URI,
  });
}

export function buildRefreshBody(refreshToken: string): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CHATGPT_CLIENT_ID,
  });
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) return {};
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    );
    return payload && typeof payload === 'object' ? payload : {};
  } catch {
    return {};
  }
}

const readString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/**
 * Builds a credential from an OAuth token response. The tokens come straight
 * from OpenAI over TLS, so claims are read without verifying signatures.
 * Refresh responses may omit the ID token; the previous email and plan are
 * kept in that case.
 */
export function credentialFromTokenResponse(
  json: unknown,
  previous?: ChatGptCredential,
  now: number = Date.now(),
): ChatGptCredential {
  const body = (json && typeof json === 'object' ? json : {}) as Record<
    string,
    unknown
  >;
  const accessToken = readString(body.access_token);
  const refreshToken =
    readString(body.refresh_token) ?? previous?.refreshToken ?? null;
  const expiresIn = body.expires_in;
  if (!accessToken || !refreshToken || typeof expiresIn !== 'number') {
    throw new ChatGptAuthError(
      'invalid_token_response',
      'ChatGPT returned an incomplete sign-in response.',
    );
  }

  const accessClaims = decodeJwtPayload(accessToken);
  const auth = (accessClaims[JWT_AUTH_CLAIM] ?? {}) as Record<string, unknown>;
  const accountId = readString(auth.chatgpt_account_id);
  if (!accountId) {
    throw new ChatGptAuthError(
      'missing_account',
      'This account has no ChatGPT plan that can be used here.',
    );
  }

  const idToken = readString(body.id_token);
  const idClaims = idToken ? decodeJwtPayload(idToken) : {};

  return {
    accessToken,
    refreshToken,
    expiresAt: now + expiresIn * 1000,
    accountId,
    email: readString(idClaims.email) ?? previous?.email ?? null,
    planType: readString(auth.chatgpt_plan_type) ?? previous?.planType ?? null,
  };
}

export function parseCredential(raw: string | null): ChatGptCredential | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (
      value &&
      typeof value.accessToken === 'string' &&
      typeof value.refreshToken === 'string' &&
      typeof value.expiresAt === 'number' &&
      typeof value.accountId === 'string'
    ) {
      return value as ChatGptCredential;
    }
    return null;
  } catch {
    return null;
  }
}
