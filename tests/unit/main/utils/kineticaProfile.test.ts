import { buildKineticaProfileOutput } from '../../../../src/main/utils/kineticaProfile';
import { KineticaConnection } from '../../../../src/types/backend';

const envVar = (field: string) => `{{ env_var("db-${field}-kin_01") }}`;

const baseConnection: KineticaConnection = {
  type: 'kinetica',
  name: 'kin_01',
  host: 'kinetica.example.com',
  port: 9191,
  username: 'admin',
  password: 'secret',
  database: 'kinetica',
  schema: 'analytics',
  timeout: 30000,
  useSSL: false,
  bypassSslCertCheck: false,
};

describe('buildKineticaProfileOutput', () => {
  it('emits the dbt-kinetica profile with the full URL as host', () => {
    expect(buildKineticaProfileOutput(baseConnection, envVar)).toEqual({
      type: 'kinetica',
      host: '{{ env_var("db-url-kin_01") }}',
      user: '{{ env_var("db-user-kin_01") }}',
      password: '{{ env_var("db-password-kin_01") }}',
      schema: '{{ env_var("db-schema-kin_01") }}',
      database: '{{ env_var("db-dbname-kin_01") }}',
      threads: 4,
      disable_auto_discovery: true,
    });
  });

  it('never leaks the interactive client timeout or a port into the profile', () => {
    const output = buildKineticaProfileOutput(baseConnection, envVar);
    expect(output).not.toHaveProperty('timeout');
    expect(output).not.toHaveProperty('port');
    expect(output).not.toHaveProperty('ssl');
  });

  it('falls back to ki_home and omits database when both are blank', () => {
    const output = buildKineticaProfileOutput(
      { ...baseConnection, schema: '', database: '' },
      envVar,
    );
    expect(output.schema).toBe('ki_home');
    expect(output).not.toHaveProperty('database');
  });

  it('only skips certificate verification for SSL connections that opt in', () => {
    expect(
      buildKineticaProfileOutput(
        { ...baseConnection, useSSL: true, bypassSslCertCheck: true },
        envVar,
      ),
    ).toMatchObject({ skip_ssl_cert_verification: true });

    expect(
      buildKineticaProfileOutput(
        { ...baseConnection, useSSL: false, bypassSslCertCheck: true },
        envVar,
      ),
    ).not.toHaveProperty('skip_ssl_cert_verification');
  });
});
