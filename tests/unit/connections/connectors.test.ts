import './characterization/mocks';
import { connectors } from '../../../src/connections/registry.main';
import { getCredential } from './characterization/mocks';

const get = getCredential as jest.Mock;

describe('Connection.resolveSecrets', () => {
  beforeEach(() => get.mockReset());

  it('returns a copy and sets only fields with values, in DEFAULT_SECRETS order', async () => {
    get.mockImplementation(async (k: string) =>
      k === 'db-user-p' ? 'u' : k === 'db-token-p' ? 't' : null,
    );
    const input = { type: 'postgres', name: 'c', username: '', password: 'keep' };
    const out = await connectors.postgres.resolveSecrets(input as any, () => 'p');
    expect(out).not.toBe(input);
    expect(input.username).toBe('');
    expect(out).toMatchObject({ username: 'u', password: 'keep', token: 't' });
    expect(get.mock.calls.map((c) => c[0])).toEqual([
      'db-user-p', 'db-password-p', 'db-token-p', 'db-bigquery-p',
    ]);
  });

  it('Oracle returns the same object', async () => {
    const c = { type: 'oracle', name: 'o' };
    await expect(connectors.oracle.resolveSecrets(c as any, undefined as any)).resolves.toBe(c);
  });
});

describe('connector hooks', () => {
  it('Snowflake profileKeysToRemove covers both auth methods and role (DIFF-3)', () => {
    const sf = connectors.snowflake as any;
    expect(sf.profileKeysToRemove({ authMethod: 'oauth_browser', role: 'r' })).toEqual(
      ['password', 'client_store_temporary_credential'],
    );
    expect(sf.profileKeysToRemove({ authMethod: 'password' })).toEqual(
      ['authenticator', 'token', 'client_store_temporary_credential', 'role'],
    );
  });

  it('DuckLake does not support partial updates', () => {
    expect((connectors.ducklake as any).supportsPartialUpdate).toBe(false);
  });

  it('Oracle validates on save and pages notebooks', () => {
    expect(connectors.oracle.validatesOnSave).toBe(true);
    expect(connectors.oracle.notebookPaging).not.toBeNull();
    expect(connectors.postgres.notebookPaging).toBeNull();
  });

  it('BigQuery prepareProjectEnv throws when the key is missing', async () => {
    get.mockResolvedValue(null);
    await expect(
      (connectors.bigquery as any).prepareProjectEnv({ name: 'b', method: 'service-account' }),
    ).rejects.toThrow('BigQuery service account key not found in secure storage');
  });

  it('SQLite project schema is unsupported', async () => {
    await expect(
      connectors.sqlite.extractProjectSchema({ type: 'sqlite' } as any),
    ).rejects.toThrow('Unsupported connection type: "sqlite"');
  });
});
