import { canUseAsDbtConnection } from '../../../src/types/backend';

describe('SQLite connection scope', () => {
  it('keeps SQLite out of dbt projects without changing existing types', () => {
    expect(canUseAsDbtConnection('sqlite')).toBe(false);
    expect(canUseAsDbtConnection('postgres')).toBe(true);
    expect(canUseAsDbtConnection('duckdb')).toBe(true);
    expect(canUseAsDbtConnection('ducklake')).toBe(true);
  });
});
