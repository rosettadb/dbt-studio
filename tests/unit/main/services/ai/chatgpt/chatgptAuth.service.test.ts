/**
 * @jest-environment ./tests/unit/__setup__/nodeWithWindow.environment.js
 */
import * as http from 'http';
import * as net from 'net';
import { shell } from 'electron';
import ChatGptAuthService from '../../../../../../src/main/services/ai/chatgpt/chatgptAuth.service';
import { ChatGptAuthError } from '../../../../../../src/main/services/ai/chatgpt/chatgptOAuth';
import { jsonResponse, tokenResponse } from './chatgptTestUtils';

const store = new Map<string, string>();

jest.mock('../../../../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: {
    setCredential: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    getCredential: jest.fn(async (k: string) => store.get(k) ?? null),
    deleteCredential: jest.fn(async (k: string) => {
      store.delete(k);
    }),
    findCredentials: jest.fn(async () => [...store.keys()]),
    setAIProviderOAuthCredential: jest.fn(
      async (id: number, type: string, v: string) => {
        store.set(`${type}-${id}-oauth`, v);
      },
    ),
    getAIProviderOAuthCredential: jest.fn(
      async (id: number, type: string) =>
        store.get(`${type}-${id}-oauth`) ?? null,
    ),
    deleteAIProviderOAuthCredential: jest.fn(
      async (id: number, type: string) => {
        store.delete(`${type}-${id}-oauth`);
      },
    ),
  },
}));

const updateProvider = jest.fn();
jest.mock('../../../../../../src/main/services/mainDatabase.service', () => ({
  __esModule: true,
  default: {
    getProvider: jest.fn(async (id: number) => ({
      id,
      type: 'openai-codex',
      config: JSON.stringify({ model: 'gpt-5.5' }),
    })),
    updateProvider: (...args: unknown[]) => updateProvider(...args),
  },
}));

const openExternal = shell.openExternal as jest.Mock;

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });

const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }
  throw new Error('condition not met');
};

const callback = (port: number, query: string) =>
  new Promise<number>((resolve, reject) => {
    http
      .get(
        `http://127.0.0.1:${port}/auth/callback?${query}`,
        { agent: false },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      )
      .on('error', reject);
  });

const authorizeState = () =>
  new URL(openExternal.mock.calls[0][0]).searchParams.get('state');

let fetchMock: jest.SpyInstance;

beforeEach(async () => {
  store.clear();
  jest.clearAllMocks();
  openExternal.mockResolvedValue(undefined);
  ChatGptAuthService.callbackPort = await freePort();
  ChatGptAuthService.loginTimeoutMs = 5 * 60 * 1000;
  fetchMock = jest.spyOn(global, 'fetch');
});

afterEach(() => {
  ChatGptAuthService.cancelLogin('corr-1');
  fetchMock.mockRestore();
});

describe('ChatGptAuthService.startLogin', () => {
  it('rejects a missing correlation ID without opening the browser', async () => {
    await expect(
      ChatGptAuthService.startLogin({ correlationId: ' ' }, jest.fn()),
    ).rejects.toThrow(/correlation/i);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('completes a sign-in, stores a pending login, and returns no tokens', async () => {
    fetchMock.mockResolvedValue(jsonResponse(tokenResponse()));
    const events: string[] = [];
    const login = ChatGptAuthService.startLogin(
      { correlationId: 'corr-1' },
      (e) => events.push(e.status),
    );
    await waitFor(() => openExternal.mock.calls.length > 0);

    expect(
      await callback(
        ChatGptAuthService.callbackPort,
        `code=abc&state=${authorizeState()}`,
      ),
    ).toBe(200);
    const result = await login;

    expect(result).toEqual({
      ok: true,
      loginId: expect.any(String),
      email: 'ada@example.com',
      planType: 'plus',
    });
    expect(JSON.stringify(result)).not.toContain('refresh-1');
    expect(events).toEqual(['started', 'waiting_for_browser', 'completed']);
    const [tokenUrl, init] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://auth.openai.com/oauth/token');
    expect(String(init.body)).toContain('code=abc');
    expect([...store.keys()]).toEqual([
      `openai-codex-pending-${(result as { loginId: string }).loginId}-oauth`,
    ]);
  });

  it('ignores a callback with the wrong state and keeps waiting', async () => {
    const login = ChatGptAuthService.startLogin(
      { correlationId: 'corr-1' },
      jest.fn(),
    );
    await waitFor(() => openExternal.mock.calls.length > 0);

    expect(
      await callback(ChatGptAuthService.callbackPort, 'code=abc&state=nope'),
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();

    ChatGptAuthService.cancelLogin('corr-1');
    await expect(login).resolves.toEqual({
      ok: false,
      message: 'Sign-in cancelled.',
    });
  });

  it('rejects a second sign-in while one is running, and allows a retry right after cancel', async () => {
    const first = ChatGptAuthService.startLogin(
      { correlationId: 'corr-1' },
      jest.fn(),
    );
    await waitFor(() => openExternal.mock.calls.length > 0);
    await expect(
      ChatGptAuthService.startLogin({ correlationId: 'corr-2' }, jest.fn()),
    ).rejects.toThrow(/already in progress/);

    ChatGptAuthService.cancelLogin('corr-1');
    await first;
    const events: string[] = [];
    const retry = ChatGptAuthService.startLogin(
      { correlationId: 'corr-2' },
      (e) => events.push(e.status),
    );
    await waitFor(() => events.includes('waiting_for_browser'));
    ChatGptAuthService.cancelLogin('corr-2');
    await expect(retry).resolves.toMatchObject({ ok: false });
  });

  it('reports a cancel from the browser page', async () => {
    const events: Array<{ status: string; error?: string }> = [];
    const login = ChatGptAuthService.startLogin(
      { correlationId: 'corr-1' },
      (e) => events.push(e),
    );
    await waitFor(() => openExternal.mock.calls.length > 0);
    await callback(
      ChatGptAuthService.callbackPort,
      `error=access_denied&state=${authorizeState()}`,
    );

    await expect(login).resolves.toEqual({
      ok: false,
      message: 'Sign-in cancelled.',
    });
    expect(events.at(-1)).toEqual({
      correlationId: 'corr-1',
      status: 'cancelled',
      error: 'Sign-in cancelled.',
    });
  });

  it('times out and frees the port', async () => {
    ChatGptAuthService.loginTimeoutMs = 30;
    await expect(
      ChatGptAuthService.startLogin({ correlationId: 'corr-1' }, jest.fn()),
    ).resolves.toEqual({ ok: false, message: 'Sign-in timed out. Try again.' });

    const probe = net.createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(ChatGptAuthService.callbackPort, '127.0.0.1', () =>
        resolve(),
      );
    });
    probe.close();
  });

  it('explains when the callback port is taken', async () => {
    const blocker = net.createServer();
    await new Promise<void>((resolve) => {
      blocker.listen(ChatGptAuthService.callbackPort, '127.0.0.1', () =>
        resolve(),
      );
    });
    const events: Array<{ status: string; error?: string }> = [];
    try {
      const result = await ChatGptAuthService.startLogin(
        { correlationId: 'corr-1' },
        (e) => events.push(e),
      );
      expect(result).toMatchObject({
        ok: false,
        message: expect.stringMatching(/Port 1455 is in use/),
      });
      expect(events.at(-1)?.status).toBe('failed');
      expect(openExternal).not.toHaveBeenCalled();
    } finally {
      blocker.close();
    }
  });

  it('fails with a friendly message when the token exchange fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'server_error' }, 500));
    const login = ChatGptAuthService.startLogin(
      { correlationId: 'corr-1' },
      jest.fn(),
    );
    await waitFor(() => openExternal.mock.calls.length > 0);
    await callback(
      ChatGptAuthService.callbackPort,
      `code=abc&state=${authorizeState()}`,
    );

    await expect(login).resolves.toEqual({
      ok: false,
      message: 'ChatGPT sign-in failed. Try again, or use an OpenAI API key.',
    });
    expect(store.size).toBe(0);
  });
});

describe('ChatGptAuthService credentials', () => {
  const saveCredential = (expiresAt: number) =>
    store.set(
      'openai-codex-7-oauth',
      JSON.stringify({
        accessToken: 'old-access',
        refreshToken: 'refresh-old',
        expiresAt,
        accountId: 'acct-1',
        email: 'ada@example.com',
        planType: 'plus',
      }),
    );

  it('returns a valid credential without refreshing', async () => {
    saveCredential(Date.now() + 60 * 60 * 1000);
    const credential = await ChatGptAuthService.getValidCredential(7);
    expect(credential.accessToken).toBe('old-access');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes once for concurrent callers and saves the rotated token', async () => {
    saveCredential(Date.now() + 1000);
    fetchMock.mockImplementation(async () =>
      jsonResponse(tokenResponse({ refresh_token: 'refresh-new' })),
    );

    const [a, b] = await Promise.all([
      ChatGptAuthService.getValidCredential(7),
      ChatGptAuthService.getValidCredential(7),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(JSON.parse(store.get('openai-codex-7-oauth')!).refreshToken).toBe(
      'refresh-new',
    );
  });

  it('signs the provider out when the refresh token is rejected', async () => {
    saveCredential(Date.now() + 1000);
    fetchMock.mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, 400));

    await expect(
      ChatGptAuthService.getValidCredential(7),
    ).rejects.toBeInstanceOf(ChatGptAuthError);
    expect(store.has('openai-codex-7-oauth')).toBe(false);
    expect(updateProvider).toHaveBeenCalledWith(7, {
      config: JSON.stringify({ model: 'gpt-5.5', signedOut: true }),
    });
  });

  it('throws a signed-out error when there is no credential', async () => {
    await expect(
      ChatGptAuthService.getValidCredential(7),
    ).rejects.toMatchObject({
      code: 'signed_out',
    });
  });

  it('moves a pending login to the provider, and discards pending logins', async () => {
    store.set(
      'openai-codex-pending-L1-oauth',
      JSON.stringify({
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: 1,
        accountId: 'acct-1',
        email: null,
        planType: null,
      }),
    );
    await ChatGptAuthService.adoptPendingLogin('L1', 9);
    expect(store.has('openai-codex-9-oauth')).toBe(true);
    expect(store.has('openai-codex-pending-L1-oauth')).toBe(false);

    await expect(
      ChatGptAuthService.adoptPendingLogin('missing', 9),
    ).rejects.toThrow(/expired/);

    store.set('openai-codex-pending-L2-oauth', '{}');
    store.set('openai-9-api-key', 'sk');
    await ChatGptAuthService.cleanupPendingLogins();
    expect([...store.keys()].sort()).toEqual([
      'openai-9-api-key',
      'openai-codex-9-oauth',
    ]);
  });
});
