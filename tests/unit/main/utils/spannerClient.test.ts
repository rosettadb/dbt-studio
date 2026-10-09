import { mockSpannerInstances } from '../../__setup__/spanner.mock';
import {
  acquireSpannerDatabase,
  closeSpannerClients,
} from '../../../../src/main/utils/spannerClient';
import type { SpannerConnection } from '../../../../src/types/backend';
import SecureStorageService from '../../../../src/main/services/secureStorage.service';

jest.mock('../../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: { getCredential: jest.fn() },
}));

const base: SpannerConnection = {
  type: 'spanner',
  name: 'cache-test',
  project: 'demo-project',
  instance: 'instance-id',
  database: 'database-id',
  schema: '',
  username: 'demo-project',
  password: '',
  authMethod: 'adc',
};

/** Borrow the database and give it straight back, as a short query would. */
const use = async (connection: SpannerConnection) =>
  (await acquireSpannerDatabase(connection)).release();

describe('Spanner client options and cache lifecycle', () => {
  beforeEach(async () => {
    await closeSpannerClients();
    mockSpannerInstances.length = 0;
    jest.clearAllMocks();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await closeSpannerClients();
  });

  it('uses ADC with project ID and reuses a matching client', async () => {
    await use(base);
    await use(base);
    expect(mockSpannerInstances).toHaveLength(1);
    expect(mockSpannerInstances[0].options).toEqual({
      projectId: 'demo-project',
      disableBuiltInMetrics: true,
    });
  });

  it('configures the emulator endpoint without changing process environment', async () => {
    const before = process.env.SPANNER_EMULATOR_HOST;
    await use({
      ...base,
      authMethod: 'emulator',
      emulatorHost: 'localhost:9010',
    });
    expect(mockSpannerInstances[0].options).toMatchObject({
      projectId: 'demo-project',
      servicePath: 'localhost',
      port: 9010,
      disableBuiltInMetrics: true,
    });
    expect(process.env.SPANNER_EMULATOR_HOST).toBe(before);
  });

  it('reads service account JSON from secure storage and hashes credential changes in the cache key', async () => {
    (SecureStorageService.getCredential as jest.Mock)
      .mockResolvedValueOnce(
        '{"type":"service_account","client_email":"a","private_key":"one"}',
      )
      .mockResolvedValueOnce(
        '{"type":"service_account","client_email":"a","private_key":"two"}',
      );
    const connection = {
      ...base,
      authMethod: 'service-account' as const,
      keyfile: 'db-spanner-cache-test',
    };
    await use(connection);
    await use(connection);
    expect(mockSpannerInstances).toHaveLength(2);
    expect(mockSpannerInstances[0].options.credentials.private_key).toBe('one');
    expect(mockSpannerInstances[1].options.credentials.private_key).toBe('two');
  });

  it('uses a key sent inline by Test without secure storage or caching', async () => {
    const connection = {
      ...base,
      authMethod: 'service-account' as const,
      keyfile:
        '{"type":"service_account","client_email":"a","private_key":"inline"}',
    };
    const lease = await acquireSpannerDatabase(connection);
    expect(SecureStorageService.getCredential).not.toHaveBeenCalled();
    expect(mockSpannerInstances[0].options).toMatchObject({
      credentials: { private_key: 'inline' },
      disableBuiltInMetrics: true,
    });
    const close = jest.spyOn(mockSpannerInstances[0], 'close');
    lease.release();
    expect(close).toHaveBeenCalledTimes(1);

    await use(connection);
    expect(mockSpannerInstances).toHaveLength(2);
  });

  it('keeps a client open while work runs and closes it after 10 idle minutes', async () => {
    jest.useFakeTimers();
    const lease = await acquireSpannerDatabase(base);
    const close = jest.spyOn(mockSpannerInstances[0], 'close');

    jest.advanceTimersByTime(11 * 60_000);
    expect(close).not.toHaveBeenCalled();

    lease.release();
    jest.advanceTimersByTime(10 * 60_000 - 1);
    expect(close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(close).toHaveBeenCalledTimes(1);

    await use(base);
    expect(mockSpannerInstances).toHaveLength(2);
  });

  it('replaces a client when settings change, closing the old one only after its work releases it', async () => {
    const lease = await acquireSpannerDatabase(base);
    const closeOld = jest.spyOn(mockSpannerInstances[0], 'close');

    await use({ ...base, database: 'other-database' });
    expect(mockSpannerInstances).toHaveLength(2);
    expect(closeOld).not.toHaveBeenCalled();

    lease.release();
    expect(closeOld).toHaveBeenCalledTimes(1);
  });
});
