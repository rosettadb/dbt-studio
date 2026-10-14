import { canUseAsDbtConnection } from '../../../src/types/backend';

describe('SQLite connection scope', () => {
  it('keeps SQLite out of dbt projects without changing existing types', () => {
    expect(canUseAsDbtConnection('sqlite')).toBe(false);
    expect(canUseAsDbtConnection('postgres')).toBe(true);
    expect(canUseAsDbtConnection('duckdb')).toBe(true);
    expect(canUseAsDbtConnection('ducklake')).toBe(true);
  });

  it('keeps Spanner and MySQL out of dbt project pickers', () => {
    expect(canUseAsDbtConnection('spanner')).toBe(false);
    expect(canUseAsDbtConnection('mysql')).toBe(false);
  });
});
