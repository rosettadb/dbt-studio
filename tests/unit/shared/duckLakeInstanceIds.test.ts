/**
 * DuckLake instance ids (`ducklake-<instanceId>`): how the SQL Editor,
 * Notebooks and Analytics projects address an instance (plan 95).
 */
import {
  duckLakeInstanceConnectionId,
  duckLakeInstanceIdOf,
} from '../../../src/shared/duckLakeInstanceIds';

describe('duckLakeInstanceIds', () => {
  it('round-trips an instance id', () => {
    const id = duckLakeInstanceConnectionId('abc-123');
    expect(id).toBe('ducklake-abc-123');
    expect(duckLakeInstanceIdOf(id)).toBe('abc-123');
  });

  it('ignores saved connection ids and missing ids', () => {
    expect(duckLakeInstanceIdOf('1731000000000')).toBeUndefined();
    expect(duckLakeInstanceIdOf(undefined)).toBeUndefined();
  });
});
