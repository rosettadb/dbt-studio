/**
 * @jest-environment ./tests/unit/__setup__/nodeWithWindow.environment.js
 */
import {
  CHATGPT_CLIENT_ID,
  CHATGPT_REDIRECT_URI,
  ChatGptAuthError,
  buildAuthorizeUrl,
  buildCodeExchangeBody,
  buildRefreshBody,
  createPkcePair,
  credentialFromTokenResponse,
  parseCredential,
  pkceChallengeFor,
  statesMatch,
} from '../../../../../../src/main/services/ai/chatgpt/chatgptOAuth';
import { makeAccessToken, makeJwt, tokenResponse } from './chatgptTestUtils';

describe('chatgptOAuth', () => {
  it('computes the S256 challenge from the RFC 7636 test vector', () => {
    expect(
      pkceChallengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    ).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('creates a fresh verifier and matching challenge each time', () => {
    const a = createPkcePair();
    const b = createPkcePair();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).toBe(pkceChallengeFor(a.verifier));
  });

  it('builds the authorize URL with every Codex parameter', () => {
    const url = new URL(buildAuthorizeUrl('challenge-1', 'state-1'));
    expect(url.origin + url.pathname).toBe(
      'https://auth.openai.com/oauth/authorize',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: CHATGPT_CLIENT_ID,
      redirect_uri: CHATGPT_REDIRECT_URI,
      scope: 'openid profile email offline_access',
      code_challenge: 'challenge-1',
      code_challenge_method: 'S256',
      state: 'state-1',
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true',
      originator: 'dbt_studio',
    });
  });

  it('builds form bodies for code exchange and refresh', () => {
    expect(Object.fromEntries(buildCodeExchangeBody('c', 'v'))).toEqual({
      grant_type: 'authorization_code',
      client_id: CHATGPT_CLIENT_ID,
      code: 'c',
      code_verifier: 'v',
      redirect_uri: CHATGPT_REDIRECT_URI,
    });
    expect(Object.fromEntries(buildRefreshBody('r'))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'r',
      client_id: CHATGPT_CLIENT_ID,
    });
  });

  it('compares states exactly', () => {
    expect(statesMatch('abc', 'abc')).toBe(true);
    expect(statesMatch('abc', 'abd')).toBe(false);
    expect(statesMatch('abc', 'ab')).toBe(false);
    expect(statesMatch('abc', null)).toBe(false);
  });

  it('reads account, plan, email and expiry from a token response', () => {
    const credential = credentialFromTokenResponse(
      tokenResponse(),
      undefined,
      1000,
    );
    expect(credential).toEqual({
      accessToken: expect.any(String),
      refreshToken: 'refresh-1',
      expiresAt: 1000 + 3600 * 1000,
      accountId: 'acct-1',
      email: 'ada@example.com',
      planType: 'plus',
    });
  });

  it('keeps the previous refresh token, email and plan when a refresh omits them', () => {
    const previous = credentialFromTokenResponse(tokenResponse());
    const next = credentialFromTokenResponse(
      {
        access_token: makeAccessToken('acct-1', ''),
        expires_in: 60,
      },
      previous,
    );
    expect(next.refreshToken).toBe('refresh-1');
    expect(next.email).toBe('ada@example.com');
    expect(next.planType).toBe('plus');
  });

  it('rejects a token without a ChatGPT account', () => {
    expect(() =>
      credentialFromTokenResponse(
        tokenResponse({ access_token: makeAccessToken(null) }),
      ),
    ).toThrow(ChatGptAuthError);
  });

  it('rejects an incomplete token response', () => {
    expect(() => credentialFromTokenResponse({ access_token: 'x' })).toThrow(
      /incomplete/,
    );
    expect(() =>
      credentialFromTokenResponse(tokenResponse({ access_token: makeJwt({}) })),
    ).toThrow(/no ChatGPT plan/);
  });

  it('parses only well-formed stored credentials', () => {
    const credential = credentialFromTokenResponse(tokenResponse());
    expect(parseCredential(JSON.stringify(credential))).toEqual(credential);
    expect(parseCredential('{"accessToken":1}')).toBeNull();
    expect(parseCredential('not json')).toBeNull();
    expect(parseCredential(null)).toBeNull();
  });
});
