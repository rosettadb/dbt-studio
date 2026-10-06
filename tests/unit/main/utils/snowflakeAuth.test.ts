/* eslint-disable import/first */
jest.mock('snowflake-sdk', () => ({
  createConnection: jest.fn(),
}));

// Import after mock so the manager uses the mocked SDK.
import * as net from 'net';
import * as snowflake from 'snowflake-sdk';
import { shell } from 'electron';
import {
  SNOWFLAKE_REAUTH_MESSAGE,
  SnowflakeAuthManager,
} from '../../../../src/main/utils/snowflakeAuth';

const createConnectionMock = snowflake.createConnection as jest.Mock;

const baseRequest = (overrides: Record<string, unknown> = {}) => ({
  correlationId: 'corr-1',
  account: 'xy12345.us-east-2.aws',
  username: 'alice',
  warehouse: 'COMPUTE_WH',
  database: 'DB',
  schema: 'PUBLIC',
  role: 'SYSADMIN',
  ...overrides,
});

const noopSend = jest.fn();

describe('SnowflakeAuthManager (OAuth browser slice)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    noopSend.mockClear();
    // Release static guards between tests (cancel unknown ids is a no-op).
    SnowflakeAuthManager.cancelAuth('corr-1');
    SnowflakeAuthManager.cancelAuth('corr-2');
    SnowflakeAuthManager.cancelAuth('corr-3');
  });

  it('rejects requests with missing account/username/correlationId without invoking the SDK', async () => {
    await expect(
      SnowflakeAuthManager.startAuth(
        baseRequest({ account: '   ' }) as any,
        noopSend,
      ),
    ).rejects.toThrow(/account identifier/i);
    await expect(
      SnowflakeAuthManager.startAuth(
        baseRequest({ username: '' }) as any,
        noopSend,
      ),
    ).rejects.toThrow(/username/i);
    await expect(
      SnowflakeAuthManager.startAuth(
        baseRequest({ correlationId: '' }) as any,
        noopSend,
      ),
    ).rejects.toThrow(/correlation/i);
    await expect(
      SnowflakeAuthManager.startAuth(
        baseRequest({ role: '' }) as any,
        noopSend,
      ),
    ).rejects.toThrow(/role/i);
    expect(createConnectionMock).not.toHaveBeenCalled();
  });

  it('rejects a duplicate correlationId while an attempt is active', async () => {
    const hanging = {
      connectAsync: jest.fn(() => undefined),
      destroy: jest.fn(() => undefined),
    };
    createConnectionMock.mockReturnValueOnce(hanging);

    const pending = SnowflakeAuthManager.startAuth(
      baseRequest({ correlationId: 'corr-1' }) as any,
      noopSend,
    );
    // Second start with the same correlationId must fail fast.
    await expect(
      SnowflakeAuthManager.startAuth(
        baseRequest({ correlationId: 'corr-1' }) as any,
        noopSend,
      ),
    ).rejects.toThrow(/already in progress/i);

    SnowflakeAuthManager.cancelAuth('corr-1');
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(noopSend).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'corr-1',
        status: 'cancelled',
      }),
    );
    expect(hanging.destroy).toHaveBeenCalled();
  });

  it('rejects a second attempt for the same account/user with a different correlationId', async () => {
    const hanging = {
      connectAsync: jest.fn(() => undefined),
      destroy: jest.fn(() => undefined),
    };
    createConnectionMock.mockReturnValueOnce(hanging);

    const pending = SnowflakeAuthManager.startAuth(
      baseRequest({ correlationId: 'corr-1' }) as any,
      noopSend,
    );
    await expect(
      SnowflakeAuthManager.startAuth(
        baseRequest({ correlationId: 'corr-2' }) as any,
        noopSend,
      ),
    ).rejects.toThrow(/account.*user.*already in progress/i);

    SnowflakeAuthManager.cancelAuth('corr-1');
    await pending;
  });

  it('allows immediate retry after cancel and cleans up deterministically', async () => {
    const first = {
      connectAsync: jest.fn(() => undefined),
      destroy: jest.fn(() => undefined),
    };
    const second = {
      connectAsync: jest.fn((cb: (err: null) => void) => cb(null)),
      destroy: jest.fn(() => undefined),
    };
    createConnectionMock.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const pending = SnowflakeAuthManager.startAuth(
      baseRequest({ correlationId: 'corr-1' }) as any,
      noopSend,
    );
    SnowflakeAuthManager.cancelAuth('corr-1');
    const cancelled = await pending;
    expect(cancelled.ok).toBe(false);
    expect(first.destroy).toHaveBeenCalled();

    // Retry with a fresh correlationId must not be blocked.
    const retried = await SnowflakeAuthManager.startAuth(
      baseRequest({ correlationId: 'corr-2' }) as any,
      noopSend,
    );
    expect(retried).toEqual({ ok: true, authFlow: 'browser' });
    expect(second.destroy).toHaveBeenCalled();
  });

  it('cancel is idempotent for unknown correlationIds', () => {
    expect(() =>
      SnowflakeAuthManager.cancelAuth('does-not-exist'),
    ).not.toThrow();
  });

  it('does not send raw SDK errors to the renderer', async () => {
    const secret = 'sensitive-token-value';
    createConnectionMock.mockReturnValueOnce({
      connectAsync: jest.fn((callback) => callback(new Error(secret))),
      destroy: jest.fn(),
    });
    const result = await SnowflakeAuthManager.startAuth(
      baseRequest({ correlationId: 'corr-3' }) as any,
      noopSend,
    );
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(noopSend.mock.calls)).not.toContain(secret);
  });

  it('assertCachedSession fails fast with guidance when no cached session exists', () => {
    jest
      .spyOn(SnowflakeAuthManager, 'hasSnowflakeToken')
      .mockReturnValueOnce(false);
    expect(() => SnowflakeAuthManager.assertCachedSession()).toThrow(
      SNOWFLAKE_REAUTH_MESSAGE,
    );
  });

  it('assertCachedSession passes when a cached session exists', () => {
    jest
      .spyOn(SnowflakeAuthManager, 'hasSnowflakeToken')
      .mockReturnValueOnce(true);
    expect(() => SnowflakeAuthManager.assertCachedSession()).not.toThrow();
  });

  it('cancel delivers an IdP-error request only to the SDK redirect port', async () => {
    const hanging = {
      connectAsync: jest.fn(() => undefined),
      destroy: jest.fn(() => undefined),
    };
    createConnectionMock.mockReturnValueOnce(hanging);

    // Pre-existing server: must NOT be contacted by cancel.
    let beforeHit = false;
    const beforeServer = net.createServer((socket) => {
      socket.on('data', () => {
        beforeHit = true;
        socket.end('HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n');
      });
    });
    await new Promise<void>((resolve) => {
      beforeServer.listen(0, '127.0.0.1', () => resolve());
    });

    const pending = SnowflakeAuthManager.startAuth(
      baseRequest({ correlationId: 'corr-1' }) as any,
      noopSend,
    );

    // In-window server: simulates the SDK local callback server.
    let notifyReceived: (line: string) => void = () => undefined;
    const receivedPromise = new Promise<string>((resolve) => {
      notifyReceived = resolve;
    });
    const sdkLikeServer = net.createServer((socket) => {
      socket.on('data', (chunk) => {
        const line = chunk.toString().split('\r\n')[0] ?? '';
        socket.end('HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n');
        notifyReceived(line);
      });
    });
    await new Promise<void>((resolve) => {
      sdkLikeServer.listen(0, '127.0.0.1', () => {
        resolve();
      });
    });

    try {
      const { port } = sdkLikeServer.address() as net.AddressInfo;
      const [config] = createConnectionMock.mock.calls[0];
      const authorizationUrl = `https://example.snowflakecomputing.com/oauth/authorize?redirect_uri=${encodeURIComponent(`http://127.0.0.1:${port}`)}`;
      config.openExternalBrowserCallback(authorizationUrl);
      expect(shell.openExternal).toHaveBeenCalledWith(authorizationUrl);
      SnowflakeAuthManager.cancelAuth('corr-1');
      await pending;

      const timeoutPromise = new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve('');
        }, 5000);
      });
      const receivedLine = await Promise.race([
        receivedPromise,
        timeoutPromise,
      ]);
      expect(receivedLine).toContain('?error=cancelled_by_user');
      expect(beforeHit).toBe(false);
    } finally {
      beforeServer.close();
      sdkLikeServer.close();
    }
  });
});
