import './characterization/mocks';
import { connectors } from '../../../src/connections/registry.main';
import { getCredential } from './characterization/mocks';
import { duckDBSearchOrder } from '../../../src/connections/duckdb/duckdb.client.main';

const get = getCredential as jest.Mock;

jest.mock('../../../src/connections/duckdb/duckdb.extractor.main', () => ({
  __esModule: true,
  default: jest.fn(),
}));

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

describe('DuckDB schema extraction', () => {
  const DuckDBExtractor = jest.requireMock(
    '../../../src/connections/duckdb/duckdb.extractor.main',
  ).default as jest.Mock;
  const table = (schema: string, name: string) => ({
    schema,
    name,
    type: 'TABLE',
    columns: [],
  });

  beforeEach(() => {
    DuckDBExtractor.mockReset().mockImplementation(() => ({
      extractSchema: async () => ({
        tables: [
          table('analytics', 'orders'),
          table('main', 'customers'),
          table('public', 'customers'),
          table('staging', 'customers'),
        ],
      }),
    }));
  });

  it('SQL Editor reads every schema, the form schema first, then main', async () => {
    const { tables } = await connectors.duckdb.extractSchema({
      type: 'duckdb',
      database_path: '/db.duckdb',
      schema: 'public',
    } as any);
    expect(DuckDBExtractor).toHaveBeenCalledWith({
      database_path: '/db.duckdb',
    });
    expect(tables.map((t) => t.schema)).toEqual([
      'public',
      'main',
      'analytics',
      'staging',
    ]);
  });

  it('search order is the form schema, then main, then the rest by name', () => {
    expect(
      duckDBSearchOrder('public', [
        'staging',
        'main',
        'Staging Area',
        'public',
        'analytics',
      ]),
    ).toEqual(['public', 'main', 'Staging Area', 'analytics', 'staging']);
    // A form schema that is not in the file is left out
    expect(duckDBSearchOrder('missing', ['main', 'b', 'a'])).toEqual([
      'main',
      'a',
      'b',
    ]);
  });

  it('project schema reads only the form schema, main by default', async () => {
    await connectors.duckdb.extractProjectSchema({
      type: 'duckdb',
      database_path: '/db.duckdb',
    } as any);
    expect(DuckDBExtractor).toHaveBeenCalledWith({
      database_path: '/db.duckdb',
      schema: 'main',
    });
  });
});
