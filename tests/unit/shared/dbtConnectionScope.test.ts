import { canUseAsDbtConnection } from '../../../src/types/backend';

describe('dbt connection scope', () => {
  it('rejects saved connection types the app no longer supports', () => {
    expect(canUseAsDbtConnection('removed-type')).toBe(false);
    expect(canUseAsDbtConnection('')).toBe(false);
    expect(canUseAsDbtConnection('constructor')).toBe(false);
    expect(canUseAsDbtConnection('db2')).toBe(false);
  });

  it('keeps the query-only types out of dbt projects', () => {
    ['sqlite', 'mysql', 'oracle'].forEach((type) => {
      expect(canUseAsDbtConnection(type)).toBe(false);
    });
  });

  it('keeps every dbt-capable type selectable', () => {
    [
      'postgres',
      'snowflake',
      'bigquery',
      'redshift',
      'databricks',
      'kinetica',
      'duckdb',
      'ducklake',
    ].forEach((type) => {
      expect(canUseAsDbtConnection(type)).toBe(true);
    });
  });
});
