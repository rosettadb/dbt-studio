import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import {
  buildDbtChartsEnv,
  createRedactor,
} from '../../../../src/main/utils/dbtChartsEnv';

const SECRET = 's3cret-Pa55word';

jest.mock('../../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: {
    getCredential: jest.fn(async (name: string) =>
      name === 'db-password-shop' ? 's3cret-Pa55word' : null,
    ),
  },
}));

describe('buildDbtChartsEnv', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-charts-env-'));
  });

  afterEach(async () => {
    await fs.remove(dir);
  });

  it('fills env_var names from keytar and sets the dct switches', async () => {
    await fs.writeFile(
      path.join(dir, 'profiles.yml'),
      'shop:\n  outputs:\n    dev:\n      password: "{{ env_var(\'db-password-shop\') }}"\n      user: "{{ env_var(\'db-user-shop\') }}"\n',
    );
    const { env, secrets } = await buildDbtChartsEnv(dir);
    expect(env['db-password-shop']).toBe(SECRET);
    expect(env['db-user-shop']).toBeUndefined();
    expect(env.DBT_PROFILES_DIR).toBe(dir);
    expect(env.DO_NOT_TRACK).toBe('1');
    expect(env.DCT_NO_AUTO_INSTALL).toBe('1');
    expect(secrets).toEqual([SECRET]);
  });

  it('works without profiles.yml', async () => {
    const { env, secrets } = await buildDbtChartsEnv(dir);
    expect(env.DBT_PROFILES_DIR).toBe(dir);
    expect(secrets).toEqual([]);
  });
});

describe('createRedactor', () => {
  it('removes every secret value, longest first', () => {
    const redact = createRedactor(['abcdef', 'abc', 'x']);
    expect(redact('pw=abcdef user=abc short=x')).toBe(
      'pw=*** user=*** short=x',
    );
  });

  it('keeps a secret out of an error message', () => {
    const redact = createRedactor([SECRET]);
    const error = new Error(`connection failed for password ${SECRET}`);
    expect(redact(error.message)).not.toContain(SECRET);
  });
});
