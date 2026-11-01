import {
  clients,
  database,
  resetSpannerMock,
  Spanner,
} from '../../__setup__/googleCloudSpanner.mock';
import type { SpannerConnection } from '../../../../src/connections/spanner/spanner.shared';

const credentials = new Map<string, string>();
jest.mock('../../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: {
    getCredential: jest.fn(async (key: string) => credentials.get(key) ?? null),
  },
}));

// eslint-disable-next-line import/first
import {
  acquireSpannerDatabase,
  closeSpannerClients,
  spannerErrorText,
} from '../../../../src/connections/spanner/spanner.client.main';

const KEY = JSON.stringify({
  type: 'service_account',
  client_email: 'svc@proj.iam.gserviceaccount.com',
  private_key: 'secret',
});

const conn = (patch: Partial<SpannerConnection> = {}): SpannerConnection => ({
  type: 'spanner',
  name: 'spanner-a',
  username: 'my-project',
  password: '',
  project: 'my-project',
  instance: 'my-instance',
  database: 'my-db',
  schema: '',
  authMethod: 'adc',
  ...patch,
});

describe('spanner client', () => {
  beforeEach(() => {
    resetSpannerMock();
    credentials.clear();
  });
  afterEach(() => {
    closeSpannerClients();
    jest.useRealTimers();
  });

  it('ADC: project only, with built-in metrics off', async () => {
    const lease = await acquireSpannerDatabase(conn());
    expect(Spanner).toHaveBeenCalledWith({
      projectId: 'my-project',
      disableBuiltInMetrics: true,
    });
    lease.release();
  });

  it('emulator: insecure channel and placeholder credentials, never the env var', async () => {
    const lease = await acquireSpannerDatabase(
      conn({ authMethod: 'emulator', emulatorHost: 'localhost:9010' }),
    );
    const options = Spanner.mock.calls[0][0] as Record<string, any>;
    expect(options).toMatchObject({
      projectId: 'my-project',
      servicePath: 'localhost',
      port: 9010,
      disableBuiltInMetrics: true,
    });
    expect(options.sslCreds).toBeDefined();
    expect(options.credentials.client_email).toContain('emulator@');
    expect(process.env.SPANNER_EMULATOR_HOST).toBeUndefined();
    lease.release();
  });

  it('service account: reads the key from secure storage by connection name', async () => {
    credentials.set('db-spanner-spanner-a', KEY);
    const lease = await acquireSpannerDatabase(
      conn({ authMethod: 'service-account', keyfile: 'db-spanner-spanner-a' }),
    );
    expect(Spanner.mock.calls[0][0]).toMatchObject({
      credentials: JSON.parse(KEY),
      disableBuiltInMetrics: true,
    });
    lease.release();
  });

  it('service account: a missing stored key says what to do', async () => {
    await expect(
      acquireSpannerDatabase(
        conn({
          authMethod: 'service-account',
          keyfile: 'db-spanner-spanner-a',
        }),
      ),
    ).rejects.toThrow('Edit the connection and paste the key');
  });

  it('service account: rejects a key without client_email', async () => {
    credentials.set('db-spanner-spanner-a', '{"type":"service_account"}');
    await expect(
      acquireSpannerDatabase(
        conn({
          authMethod: 'service-account',
          keyfile: 'db-spanner-spanner-a',
        }),
      ),
    ).rejects.toThrow('client_email');
  });

  it('reuses the client until the settings change, then replaces it', async () => {
    const first = await acquireSpannerDatabase(conn());
    const second = await acquireSpannerDatabase(conn());
    expect(Spanner).toHaveBeenCalledTimes(1);
    first.release();
    second.release();

    const changed = await acquireSpannerDatabase(
      conn({ instance: 'other-instance' }),
    );
    expect(Spanner).toHaveBeenCalledTimes(2);
    expect(clients[0].close).toHaveBeenCalledTimes(1);
    changed.release();
  });

  it('a replaced client that is still in use closes when it is released', async () => {
    const busy = await acquireSpannerDatabase(conn());
    const replacement = await acquireSpannerDatabase(
      conn({ database: 'other-db' }),
    );
    expect(clients[0].close).not.toHaveBeenCalled();
    busy.release();
    expect(clients[0].close).toHaveBeenCalledTimes(1);
    replacement.release();
  });

  it('a raw-JSON key (Test) is never cached and closes on release', async () => {
    const test = conn({ authMethod: 'service-account', keyfile: KEY });
    const first = await acquireSpannerDatabase(test);
    first.release();
    expect(clients[0].close).toHaveBeenCalledTimes(1);
    const second = await acquireSpannerDatabase(test);
    expect(Spanner).toHaveBeenCalledTimes(2);
    second.release();
  });

  it('closes an idle client after 10 minutes, not while work is running', async () => {
    jest.useFakeTimers();
    const lease = await acquireSpannerDatabase(conn());
    const busy = await acquireSpannerDatabase(conn());
    lease.release();
    jest.advanceTimersByTime(11 * 60_000);
    expect(clients[0].close).not.toHaveBeenCalled();
    busy.release();
    jest.advanceTimersByTime(9 * 60_000);
    expect(clients[0].close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2 * 60_000);
    expect(clients[0].close).toHaveBeenCalledTimes(1);
  });

  it('closeSpannerClients closes every cached client', async () => {
    (await acquireSpannerDatabase(conn({ name: 'a' }))).release();
    (await acquireSpannerDatabase(conn({ name: 'b' }))).release();
    closeSpannerClients();
    expect(clients.map((c) => c.close.mock.calls.length)).toEqual([1, 1]);
  });

  it('looks the dialect up once per client and maps it', async () => {
    database.getDatabaseDialect.mockResolvedValue('POSTGRESQL');
    const lease = await acquireSpannerDatabase(conn());
    expect(await lease.dialect()).toBe('POSTGRESQL');
    expect(await lease.dialect()).toBe('POSTGRESQL');
    expect(database.getDatabaseDialect).toHaveBeenCalledTimes(1);
    lease.release();
  });

  it('does not keep a failed dialect lookup', async () => {
    database.getDatabaseDialect
      .mockRejectedValueOnce({ code: 14, details: 'unavailable' })
      .mockResolvedValueOnce('GOOGLE_STANDARD_SQL');
    const lease = await acquireSpannerDatabase(conn());
    await expect(lease.dialect()).rejects.toBeDefined();
    await Promise.resolve();
    expect(await lease.dialect()).toBe('GOOGLE_STANDARD_SQL');
    lease.release();
  });

  it('turns common gRPC codes into readable text', () => {
    expect(spannerErrorText({ code: 5 })).toContain('was not found');
    expect(spannerErrorText({ code: 7 })).toContain(
      'roles/spanner.databaseReader',
    );
    expect(spannerErrorText({ code: 16 })).toContain(
      'gcloud auth application-default login',
    );
    expect(spannerErrorText({ details: 'boom' })).toBe('boom');
  });
});
