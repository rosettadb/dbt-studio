import {
  buildOracleEasyConnect,
  isSupportedOracleVersion,
  normalizeOracleIdentifier,
  parseOracleVersion,
  prepareOracleConnection,
  scrubOracleSecrets,
  validateOracleConnection,
  parseOracleWalletAliases,
} from '../../../src/shared/oracle';
import {
  canUseAsDbtConnection,
  OracleConnection,
} from '../../../src/types/backend';

const basic: OracleConnection = {
  type: 'oracle',
  connectMode: 'basic',
  name: 'test',
  username: 'studio',
  password: '',
  database: '',
  schema: '',
  host: 'localhost',
  port: 1521,
  serviceName: 'FREEPDB1',
};

describe('Oracle shared policies', () => {
  it.each([
    [{}, null],
    [{ username: '' }, 'Username'],
    [{ host: 'bad/host' }, 'host'],
    [{ host: '[::1]' }, null],
    [{ port: 0 }, 'Port'],
    [{ port: 65536 }, 'Port'],
    [{ port: 1.5 }, 'Port'],
    [{ serviceName: 'bad?x=y' }, 'service'],
    [{ name: 'a\nb' }, 'control'],
    [{ schema: 'a"b' }, null],
    [{ schema: '"Mixed Case"' }, null],
    [{ connectMode: 'connectString', connectString: '' }, 'required'],
    [
      {
        connectMode: 'connectString',
        connectString: 'me/password@localhost/service',
      },
      'credentials',
    ],
    [
      {
        connectMode: 'connectString',
        connectString: '(DESCRIPTION=(USER=bad))',
      },
      'credentials',
    ],
    [
      {
        connectMode: 'connectString',
        connectString: 'tcps://me:pass@host/service',
      },
      'credentials',
    ],
    [
      { connectMode: 'connectString', connectString: '(DESCRIPTION=(X=Y)' },
      'balanced',
    ],
    [{ connectMode: 'connectString', connectString: '(X=Y))(' }, 'balanced'],
    [
      {
        connectMode: 'connectString',
        connectString: 'tcps://host:2484/service',
      },
      null,
    ],
    [
      {
        connectMode: 'connectString',
        connectString: '(DESCRIPTION=(CONNECT_DATA=(SID=ORCL)))',
      },
      null,
    ],
    [{ connectMode: 'wallet', walletDir: '' }, 'folder'],
    [
      { connectMode: 'wallet', walletDir: '/wallet', connectString: 'db_low' },
      null,
    ],
    [
      {
        connectMode: 'wallet',
        walletDir: '/wallet',
        connectString: 'bad?alias',
      },
      'alias',
    ],
    [{ connectMode: 'bad' }, 'mode'],
  ])('validates %j', (changes, error) => {
    const result = validateOracleConnection({
      ...basic,
      ...changes,
    } as OracleConnection);
    expect(result?.includes(error || '') ?? null).toBe(error ? true : null);
  });
  it('normalizes identifiers and preserves quoted case', () => {
    expect(normalizeOracleIdentifier(' studio ')).toBe('STUDIO');
    expect(normalizeOracleIdentifier('"MixedCase"')).toBe('MixedCase');
    expect(normalizeOracleIdentifier('"a""b"')).toBe('a"b');
  });
  it('builds Easy Connect without credentials', () => {
    expect(buildOracleEasyConnect(basic)).toBe('localhost:1521/FREEPDB1');
    expect(
      buildOracleEasyConnect({
        ...basic,
        host: '[::1]',
        port: 2484,
        tls: true,
      }),
    ).toBe('tcps://[::1]:2484/FREEPDB1');
  });
  it.each([
    ['12.1.0.0.0', true],
    ['12.0', false],
    ['11.2.0', false],
    ['21.0.0', true],
    ['23.0.0', true],
    ['unknown', false],
  ])('checks server %s', (version, allowed) =>
    expect(isSupportedOracleVersion(version)).toBe(allowed),
  );
  it('parses versions without accepting arbitrary banners', () => {
    expect(parseOracleVersion('23.0.0.0.0')).toEqual([23, 0]);
    expect(parseOracleVersion('not version')).toBeNull();
  });
  it('scrubs literal regex-special secrets, including overlapping values', () =>
    expect(
      scrubOracleSecrets('Ora$# Ora$#long wallet?', [
        'Ora$#',
        'Ora$#long',
        'wallet?',
      ]),
    ).toBe('[redacted] [redacted] [redacted]'));
  it('extracts only top-level aliases and supports multiple aliases', () => {
    expect(
      parseOracleWalletAliases(
        '# ignored\n db_low, db_high = (DESCRIPTION=\n (ADDRESS=(PROTOCOL=tcps))\n (CONNECT_DATA=(SERVICE_NAME=test)))\nother=(DESCRIPTION=(X=Y))',
      ),
    ).toEqual(['db_low', 'db_high', 'other']);
    expect(() => parseOracleWalletAliases('bad=(DESCRIPTION=')).toThrow(
      'Invalid',
    );
  });
  it('persists an explicit allowlist and stays query-only', () => {
    expect(
      prepareOracleConnection({
        ...basic,
        password: 'secret',
        walletDir: '/inactive',
        schema: '"MixedCase"',
      }),
    ).toEqual({ ...basic, password: '', schema: 'MixedCase', tls: false });
    expect(prepareOracleConnection(basic).schema).toBe('STUDIO');
    expect(canUseAsDbtConnection('oracle')).toBe(false);
    expect(canUseAsDbtConnection('postgres')).toBe(true);
  });
});
