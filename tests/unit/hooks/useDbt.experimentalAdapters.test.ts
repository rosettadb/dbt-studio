import { getDbtV2CompatibilityError } from '../../../src/renderer/utils/dbtProcessEnvironment';

describe('dbt v2 adapter compatibility', () => {
  it('blocks v2 Postgres and permits supported or v1 adapters', () => {
    expect(getDbtV2CompatibilityError('2.0.0a4', 'postgres')).toContain(
      'Postgres is not supported safely',
    );
    expect(getDbtV2CompatibilityError('1.11.12', 'postgres')).toBeNull();
    expect(getDbtV2CompatibilityError('2.0.0a4', 'duckdb')).toBeNull();
  });
});
