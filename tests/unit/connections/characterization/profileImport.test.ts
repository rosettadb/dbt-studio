import './mocks';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import ConnectorsService from '../../../../src/main/services/connectors.service';
import { cleanTempProjects, makeTempProject } from './fixtures';

const profiles: Record<string, Record<string, unknown>> = {
  postgres: {
    type: 'postgres',
    host: 'pg.example.com',
    port: 5432,
    user: 'u',
    password: 'p',
    dbname: 'db',
    schema: 'public',
  },
  snowflake: {
    type: 'snowflake',
    account: 'acme',
    user: 'u',
    password: 'p',
    database: 'DB',
    schema: 'PUBLIC',
    warehouse: 'WH',
    role: 'R',
  },
  bigquery: {
    type: 'bigquery',
    method: 'service-account',
    project: 'proj',
    dataset: 'ds',
    keyfile: '/k.json',
  },
  redshift: {
    type: 'redshift',
    host: 'rs.example.com',
    port: 5439,
    user: 'u',
    password: 'p',
    dbname: 'db',
    schema: 'public',
  },
  databricks: {
    type: 'databricks',
    host: 'dbc.example.com',
    http_path: '/sql/1.0/warehouses/abc',
    token: 't',
    catalog: 'main',
    schema: 'default',
  },
  'duckdb (relative path)': {
    type: 'duckdb',
    path: 'data/warehouse.duckdb',
    schema: 'main',
  },
  'duckdb (absolute path)': {
    type: 'duckdb',
    path: '/data/warehouse.duckdb',
    schema: 'main',
  },
  'kinetica (env placeholder, env unset)': {
    type: 'kinetica',
    host: '{{ env_var("db-url-kin") }}',
    user: 'u',
    password: 'p',
    schema: 'ki_home',
    database: 'kindb',
  },
  'kinetica (env placeholder, env set)': {
    type: 'kinetica',
    host: '{{ env_var("db-url-kin-set") }}',
    user: 'u',
    password: 'p',
    schema: 'ki_home',
    database: 'kindb',
    skip_ssl_cert_verification: true,
  },
  'kinetica (plain url)': {
    type: 'kinetica',
    host: 'https://kin.example.com:9191',
    user: 'u',
    password: 'p',
    schema: 'ki_home',
    database: 'kindb',
  },
  'unknown type': { type: 'mongodb', host: 'x' },
};

describe('parseProjectConnectionFiles characterization', () => {
  beforeEach(() => {
    process.env['db-url-kin-set'] = 'https://kin.example.com:9191';
    delete process.env['db-url-kin'];
  });
  afterEach(() => {
    delete process.env['db-url-kin-set'];
    cleanTempProjects();
  });

  Object.entries(profiles).forEach(([name, output]) => {
    it(`imports ${name}`, async () => {
      const dir = makeTempProject();
      fs.writeFileSync(
        path.join(dir, 'profiles.yml'),
        yaml.dump({ proj: { target: 'dev', outputs: { dev: output } } }),
      );
      const result = await ConnectorsService.parseProjectConnectionFiles(dir);
      // Temp paths differ per run, so mask the project directory.
      expect(
        JSON.parse(JSON.stringify(result).split(dir).join('<PROJECT_DIR>')),
      ).toMatchSnapshot();
    });
  });

  it('returns nothing without profiles.yml or main.conf', async () => {
    const dir = makeTempProject();
    await expect(
      ConnectorsService.parseProjectConnectionFiles(dir),
    ).resolves.toEqual({});
  });
});
