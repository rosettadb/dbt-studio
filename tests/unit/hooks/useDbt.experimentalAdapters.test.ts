import { getDbtProcessEnvironment } from '../../../src/renderer/utils/dbtProcessEnvironment';

describe('dbt v2 experimental adapter environment', () => {
  it('enables experimental adapters only for dbt v2 Postgres commands', () => {
    expect(getDbtProcessEnvironment('2.0.0a4', 'postgres')).toEqual({
      DBT_ALLOW_EXPERIMENTAL_ADAPTERS: 'true',
    });
    expect(getDbtProcessEnvironment('1.11.12', 'postgres')).toBeUndefined();
    expect(getDbtProcessEnvironment('2.0.0a4', 'duckdb')).toBeUndefined();
  });
});
