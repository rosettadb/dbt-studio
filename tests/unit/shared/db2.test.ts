import {
  isSupportedDb2Version,
  parseDb2Version,
  validateDb2Fields,
} from '../../../src/shared/db2';
import { canUseAsDbtConnection } from '../../../src/types/backend';

const valid = {
  host: 'db2.example.com',
  port: 50000,
  database: 'TESTDB',
  schema: 'APP',
  username: 'db2inst1',
  password: 'Pa{ss}=w"0rd x',
  ssl: false,
};

const fieldsWithErrors = (fields: Parameters<typeof validateDb2Fields>[0]) =>
  validateDb2Fields(fields).map((error) => error.field);

describe('validateDb2Fields', () => {
  it('accepts a complete connection, including a password with { } = and spaces', () => {
    expect(validateDb2Fields(valid)).toEqual([]);
  });

  it('requires host, database and username, and a valid port', () => {
    expect(
      fieldsWithErrors({
        ...valid,
        host: ' ',
        database: '',
        username: '',
        port: 0,
      }),
    ).toEqual(['host', 'port', 'database', 'username']);
    expect(fieldsWithErrors({ ...valid, port: 65536 })).toEqual(['port']);
    expect(fieldsWithErrors({ ...valid, port: 1.5 })).toEqual(['port']);
  });

  it.each([
    ['host', { host: 'db2;Security=NONE' }],
    ['host', { host: 'db2 host' }],
    ['database', { database: 'TESTDB;X' }],
    ['database', { database: 'TOOLONGNAME' }],
    ['schema', { schema: 'APP;CurrentSchema=OTHER' }],
    ['schema', { schema: 'A{B}' }],
    ['username', { username: 'user;PWD=x' }],
    ['password', { password: 'pa;ss' }],
    ['password', { password: 'pa\nss' }],
    ['sslCaPath', { ssl: true, sslCaPath: '/tmp/ca.pem;Security=NONE' }],
  ])('rejects connection-string breakers in %s', (field, patch) => {
    expect(fieldsWithErrors({ ...valid, ...patch })).toEqual([field]);
  });

  it('ignores the CA path when SSL is off', () => {
    expect(validateDb2Fields({ ...valid, sslCaPath: 'x;y' })).toEqual([]);
  });
});

describe('Db2 server version', () => {
  it('parses SQL_DBMS_VER values', () => {
    expect(parseDb2Version('11.05.0900')).toEqual({ major: 11, minor: 5 });
    expect(parseDb2Version('12.01.0500')).toEqual({ major: 12, minor: 1 });
    expect(parseDb2Version('garbage')).toBeNull();
    expect(parseDb2Version(null)).toBeNull();
  });

  it('supports 11.1 and later only', () => {
    expect(isSupportedDb2Version({ major: 10, minor: 5 })).toBe(false);
    expect(isSupportedDb2Version({ major: 11, minor: 0 })).toBe(false);
    expect(isSupportedDb2Version({ major: 11, minor: 1 })).toBe(true);
    expect(isSupportedDb2Version({ major: 12, minor: 1 })).toBe(true);
  });
});

describe('canUseAsDbtConnection', () => {
  it('keeps Db2 and SQLite out of dbt', () => {
    expect(canUseAsDbtConnection('db2')).toBe(false);
    expect(canUseAsDbtConnection('sqlite')).toBe(false);
    expect(canUseAsDbtConnection('postgres')).toBe(true);
  });
});
