import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { updateMainConf } from '../../../../src/main/utils/yamlPartialUpdate';

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
