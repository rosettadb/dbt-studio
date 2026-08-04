import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import {
  updateMainConf,
  updateProfilesYml,
} from '../../../../src/main/utils/yamlPartialUpdate';

describe('updateMainConf', () => {
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

describe('Microsoft Fabric profile updates', () => {
  it('removes stale SPN fields when switching to Azure CLI and preserves custom fields', async () => {
    const projectPath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'fabric-profile-update-test-'),
    );
    const profilesPath = path.join(projectPath, 'profiles.yml');
    await fs.promises.writeFile(
      profilesPath,
      yaml.dump({
        analytics: {
          target: 'dev',
          outputs: {
            dev: {
              type: 'fabricspark',
              authentication: 'SPN',
              client_id: 'stale-client',
              tenant_id: 'stale-tenant',
              client_secret: 'stale-secret',
              workspace_name: 'stale-workspace',
              custom_setting: 'preserve-me',
            },
          },
        },
      }),
      'utf8',
    );

    try {
      await updateProfilesYml(
        projectPath,
        'analytics',
        {
          type: 'fabricspark',
          name: 'Fabric',
          endpoint: 'https://api.fabric.microsoft.com/v1',
          workspaceId: 'workspace-id',
          lakehouseId: 'lakehouse-id',
          lakehouse: 'lakehouse',
          schemaMode: 'schema-enabled',
          schema: 'dbo',
          authentication: 'CLI',
          threads: 2,
          reuseSession: true,
          highConcurrency: false,
        },
        'connection-id',
      );

      const profile = yaml.load(
        await fs.promises.readFile(profilesPath, 'utf8'),
      ) as any;
      const output = profile.analytics.outputs.dev;
      expect(output).toMatchObject({
        type: 'fabricspark',
        method: 'livy',
        authentication: 'CLI',
        custom_setting: 'preserve-me',
      });
      expect(output).not.toHaveProperty('client_id');
      expect(output).not.toHaveProperty('tenant_id');
      expect(output).not.toHaveProperty('client_secret');
      expect(output).not.toHaveProperty('workspace_name');
    } finally {
      await fs.promises.rm(projectPath, { recursive: true, force: true });
    }
  });

  it('writes literal SPN profile values from trusted credentials', async () => {
    const projectPath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'fabric-profile-spn-update-test-'),
    );
    const profilesPath = path.join(projectPath, 'profiles.yml');
    await fs.promises.writeFile(
      profilesPath,
      yaml.dump({
        analytics: {
          target: 'dev',
          outputs: {
            dev: {
              type: 'fabricspark',
              authentication: 'CLI',
              custom_setting: 'preserve-me',
            },
          },
        },
      }),
      'utf8',
    );

    try {
      await updateProfilesYml(
        projectPath,
        'analytics',
        {
          type: 'fabricspark',
          name: 'Fabric',
          endpoint: 'https://api.fabric.microsoft.com/v1',
          workspaceId: 'workspace-id',
          lakehouseId: 'lakehouse-id',
          lakehouse: 'lakehouse',
          schemaMode: 'schema-enabled',
          schema: 'dbo',
          authentication: 'SPN',
          tenantId: 'tenant-id',
          clientId: 'client-id',
          threads: 2,
          reuseSession: true,
          highConcurrency: false,
        },
        'connection-id',
        { clientSecret: 'literal-secret' },
      );

      const profile = yaml.load(
        await fs.promises.readFile(profilesPath, 'utf8'),
      ) as any;
      const output = profile.analytics.outputs.dev;
      expect(output).toMatchObject({
        type: 'fabricspark',
        method: 'livy',
        endpoint: 'https://api.fabric.microsoft.com/v1',
        workspaceid: 'workspace-id',
        lakehouseid: 'lakehouse-id',
        lakehouse: 'lakehouse',
        schema: 'dbo',
        authentication: 'SPN',
        tenant_id: 'tenant-id',
        client_id: 'client-id',
        client_secret: 'literal-secret',
        custom_setting: 'preserve-me',
      });
    } finally {
      await fs.promises.rm(projectPath, { recursive: true, force: true });
    }
  });
});
