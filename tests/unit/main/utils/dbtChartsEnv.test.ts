const SECRET_PASSWORD = 'hunter2-SUPER-secret';
const SECRET_KEY_JSON = JSON.stringify({
  client_email: 'svc@x.iam',
  private_key: '-----BEGIN PRIVATE KEY-----ABCDEF',
});

const creds: Record<string, string> = {
  'db-user-warehouse': 'alice-user',
  'db-password-warehouse': SECRET_PASSWORD,
  'db-bigquery-warehouse': SECRET_KEY_JSON,
};

jest.mock('../../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: {
    getCredential: jest.fn(async (key: string) => creds[key] ?? null),
  },
}));

const setConnectionEnvVariable = jest.fn(async (key: string, value: string) => {
  if (!key.startsWith('db-bigquery-')) process.env[key] = value;
});
const materializeSnowflakeOAuthEnv = jest.fn(async () => false);

jest.mock('../../../../src/main/services/connectors.service', () => ({
  __esModule: true,
  default: {
    setConnectionEnvVariable: (k: string, v: string) =>
      setConnectionEnvVariable(k, v),
    materializeSnowflakeOAuthEnv: (n: string) =>
      (materializeSnowflakeOAuthEnv as any)(n),
  },
}));

import {
  buildDbtChartsEnv,
  clearKnownSecrets,
  redactSecrets,
} from '../../../../src/main/utils/dbtChartsEnv';

describe('dbtChartsEnv', () => {
  afterEach(() => {
    clearKnownSecrets();
    Object.keys(process.env)
      .filter((k) => k.startsWith('db-'))
      .forEach((k) => delete process.env[k]);
    jest.clearAllMocks();
  });

  it('returns secrets and DBT_PROFILES_DIR for the child process', async () => {
    const env = await buildDbtChartsEnv({ name: 'warehouse' }, '/proj');
    expect(env.DBT_PROFILES_DIR).toBe('/proj');
    expect(env['db-user-warehouse']).toBe('alice-user');
    expect(env['db-password-warehouse']).toBe(SECRET_PASSWORD);
    expect(setConnectionEnvVariable).toHaveBeenCalledWith(
      'db-bigquery-warehouse',
      SECRET_KEY_JSON,
    );
    expect(materializeSnowflakeOAuthEnv).toHaveBeenCalledWith('warehouse');
  });

  it('redacts every secret from logged lines', async () => {
    const env = await buildDbtChartsEnv({ name: 'warehouse' }, '/proj');
    const line = `connect failed user=alice-user pw=${SECRET_PASSWORD} key=${SECRET_KEY_JSON}`;
    const out = redactSecrets(line, env);
    expect(out).not.toContain(SECRET_PASSWORD);
    expect(out).not.toContain('alice-user');
    expect(out).not.toContain('SUPER');
    expect(redactSecrets('-----BEGIN PRIVATE KEY-----ABCDEF', env)).toBe('***');
  });

  it('leaves unrelated text alone', async () => {
    const env = await buildDbtChartsEnv({ name: 'warehouse' }, '/proj');
    expect(redactSecrets('Serving on http://127.0.0.1:1', env)).toBe(
      'Serving on http://127.0.0.1:1',
    );
  });
});
