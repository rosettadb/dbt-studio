import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import {
  updateMainConf,
  updateProfilesYml,
} from '../../../../src/main/utils/yamlPartialUpdate';

const kineticaConnection = {
  type: 'kinetica',
  name: 'kin_01',
  host: 'tenant.kinetica.com/cluster-1/gpudb-0',
  port: 443,
  username: 'admin',
  password: 'secret',
  database: 'kinetica',
  schema: 'analytics',
  timeout: 30000,
  useSSL: true,
  bypassSslCertCheck: true,
} as any;

describe('updateProfilesYml', () => {
  it('writes the dbt-kinetica field set while preserving custom keys', async () => {
    const projectPath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'rosetta-profiles-test-'),
    );
    const profilesPath = path.join(projectPath, 'profiles.yml');
    await fs.promises.writeFile(
      profilesPath,
      yaml.dump({
        'project-name': {
          target: 'dev',
          outputs: { dev: { type: 'kinetica', timeout: 600, threads: 8 } },
        },
      }),
      'utf8',
    );

    try {
      await updateProfilesYml(projectPath, 'project-name', kineticaConnection);

      const result = yaml.load(
        await fs.promises.readFile(profilesPath, 'utf8'),
      ) as any;
      expect(result['project-name'].outputs.dev).toEqual({
        type: 'kinetica',
        host: '{{ env_var("db-url-kin_01") }}',
        user: '{{ env_var("db-user-kin_01") }}',
        password: '{{ env_var("db-password-kin_01") }}',
        schema: '{{ env_var("db-schema-kin_01") }}',
        database: '{{ env_var("db-dbname-kin_01") }}',
        disable_auto_discovery: true,
        skip_ssl_cert_verification: true,
        // custom keys survive the partial update
        timeout: 600,
        threads: 8,
      });
    } finally {
      await fs.promises.rm(projectPath, { recursive: true, force: true });
    }
  });
});

describe('updateMainConf', () => {
  it('writes a Kinetica JDBC URL with credentials placeholders', async () => {
    const projectPath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'rosetta-main-conf-test-'),
    );
    const rosettaPath = path.join(projectPath, 'rosetta');
    const mainConfPath = path.join(rosettaPath, 'main.conf');
    await fs.promises.mkdir(rosettaPath);
    await fs.promises.writeFile(
      mainConfPath,
      yaml.dump({ connections: [{ name: 'project-name' }] }),
      'utf8',
    );

    try {
      await updateMainConf(projectPath, 'project-name', kineticaConnection);

      const result = yaml.load(
        await fs.promises.readFile(mainConfPath, 'utf8'),
      ) as any;
      expect(result.connections[0]).toMatchObject({
        dbType: 'kinetica',
        databaseName: `\${db-dbname-kin_01}`,
        schemaName: `\${db-schema-kin_01}`,
        url: 'jdbc:kinetica:URL=https://tenant.kinetica.com/cluster-1/gpudb-0;Timeout=30000;BypassSslCertCheck=1',
        userName: `\${db-user-kin_01}`,
        password: `\${db-password-kin_01}`,
      });
    } finally {
      await fs.promises.rm(projectPath, { recursive: true, force: true });
    }
  });

  it('keeps BigQuery metadata portable and adds service-account authentication', async () => {
    const projectPath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'rosetta-main-conf-test-'),
    );
    const rosettaPath = path.join(projectPath, 'rosetta');
    const mainConfPath = path.join(rosettaPath, 'main.conf');
    await fs.promises.mkdir(rosettaPath);
    await fs.promises.writeFile(
      mainConfPath,
      yaml.dump({ connections: [{ name: 'project-name' }] }),
      'utf8',
    );

    try {
      await updateMainConf(projectPath, 'project-name', {
        type: 'bigquery',
        name: 'bigquery_01',
      } as any);

      const result = yaml.load(
        await fs.promises.readFile(mainConfPath, 'utf8'),
      ) as any;
      expect(result.connections[0]).toMatchObject({
        databaseName: `\${db-project-bigquery_01}`,
        schemaName: `\${db-dataset-bigquery_01}`,
        url: `jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=\${db-project-bigquery_01};OAuthType=0;OAuthServiceAcctEmail=\${db-bigquery-email-bigquery_01};OAuthPvtKeyPath=\${db-bigquery-bigquery_01};`,
      });
    } finally {
      await fs.promises.rm(projectPath, { recursive: true, force: true });
    }
  });
});
