import {
  buildDb2ConnectionString,
  scrubDb2Secrets,
} from '../../../../../src/main/services/db2/db2ConnectionString';
import { Db2Connection } from '../../../../../src/types/backend';

const connection: Db2Connection = {
  type: 'db2',
  name: 'db2-test',
  host: ' db2.example.com ',
  port: 50000,
  database: 'TESTDB',
  schema: '',
  username: 'db2inst1',
  password: 'Pa{ss}=w0rd',
};

describe('buildDb2ConnectionString', () => {
  it('builds a plain TCP/IP connection string', () => {
    expect(buildDb2ConnectionString(connection)).toBe(
      'DATABASE=TESTDB;HOSTNAME=db2.example.com;PORT=50000;PROTOCOL=TCPIP;' +
        'UID=db2inst1;PWD=Pa{ss}=w0rd;ConnectTimeout=10;MapDecimalFloatDescribe=1;',
    );
  });

  it('adds the schema, SSL and CA certificate when set', () => {
    const value = buildDb2ConnectionString({
      ...connection,
      schema: 'APP',
      ssl: true,
      sslCaPath: '/certs/ca.arm',
    });
    expect(value).toContain(';CurrentSchema=APP;');
    expect(value).toContain(
      ';Security=SSL;SSLServerCertificate=/certs/ca.arm;',
    );
  });

  it('does not add a CA certificate when SSL is off', () => {
    const value = buildDb2ConnectionString({
      ...connection,
      sslCaPath: '/certs/ca.arm',
    });
    expect(value).not.toContain('Security=SSL');
    expect(value).not.toContain('SSLServerCertificate');
  });

  it('refuses to build a string with an injected keyword', () => {
    expect(() =>
      buildDb2ConnectionString({ ...connection, host: 'h;Security=NONE' }),
    ).toThrow(/Host/);
    expect(() =>
      buildDb2ConnectionString({ ...connection, password: 'a;b' }),
    ).toThrow(/cannot send a password that contains ;/);
  });
});

describe('scrubDb2Secrets', () => {
  it('removes PWD values and the literal password', () => {
    const message =
      'SQL30082N failed for DATABASE=X;UID=u;PWD=Secret#1;PORT=1; (Secret#1)';
    const scrubbed = scrubDb2Secrets(message, 'Secret#1');
    expect(scrubbed).not.toContain('Secret#1');
    expect(scrubbed).toContain('PWD=***;');
  });

  it('leaves short passwords alone outside PWD to avoid mangling messages', () => {
    expect(scrubDb2Secrets('SQL0204N a is undefined', 'a')).toBe(
      'SQL0204N a is undefined',
    );
  });
});
