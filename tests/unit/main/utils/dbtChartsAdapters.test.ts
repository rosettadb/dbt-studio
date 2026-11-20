import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import {
  extraForAdapter,
  readTargetAdapterType,
} from '../../../../src/main/utils/dbtChartsAdapters';

describe('extraForAdapter', () => {
  it.each([
    ['postgres', 'postgresql'],
    ['snowflake', 'snowflake'],
    ['bigquery', 'bigquery'],
    ['redshift', 'redshift'],
    ['databricks', 'databricks'],
    ['sqlserver', 'sqlserver'],
    ['fabric', 'fabric'],
    ['trino', 'trino'],
    ['athena', 'athena'],
    ['spark', 'spark'],
    ['clickhouse', 'clickhouse'],
  ])('%s needs the %s extra', (adapter, extra) => {
    expect(extraForAdapter(adapter)).toEqual({ supported: true, extra });
  });

  it('needs no extra for DuckDB', () => {
    expect(extraForAdapter('duckdb')).toEqual({ supported: true });
  });

  it('names an unsupported adapter', () => {
    const support = extraForAdapter('oracle');
    expect(support.supported).toBe(false);
    expect(support.reason).toContain('oracle');
  });

  it('reports a missing target', () => {
    expect(extraForAdapter(null)).toEqual({
      supported: false,
      reason: 'No dbt target found in profiles.yml.',
    });
  });
});

describe('readTargetAdapterType', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-charts-adapters-'));
  });

  afterEach(async () => {
    await fs.remove(dir);
  });

  it('reads the active target type', async () => {
    await fs.writeFile(path.join(dir, 'dbt_project.yml'), "profile: 'shop'\n");
    await fs.writeFile(
      path.join(dir, 'profiles.yml'),
      [
        'shop:',
        '  target: prod',
        '  outputs:',
        '    dev: { type: duckdb, path: dev.duckdb }',
        '    prod:',
        '      type: postgres',
        '      password: "{{ env_var(\'db-password-shop\') }}"',
      ].join('\n'),
    );
    await expect(readTargetAdapterType(dir)).resolves.toBe('postgres');
  });

  it('falls back to the first output when the target is a Jinja expression', async () => {
    await fs.writeFile(path.join(dir, 'dbt_project.yml'), 'profile: shop\n');
    await fs.writeFile(
      path.join(dir, 'profiles.yml'),
      [
        'shop:',
        "  target: \"{{ env_var('DBT_TARGET', 'dev') }}\"",
        '  outputs:',
        '    dev: { type: snowflake }',
      ].join('\n'),
    );
    await expect(readTargetAdapterType(dir)).resolves.toBe('snowflake');
  });

  it('returns null without profiles.yml', async () => {
    await fs.writeFile(path.join(dir, 'dbt_project.yml'), 'profile: shop\n');
    await expect(readTargetAdapterType(dir)).resolves.toBeNull();
  });
});
