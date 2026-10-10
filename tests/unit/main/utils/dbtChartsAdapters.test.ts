import type { SupportedConnectionTypes } from '../../../../src/types/backend';
import {
  DBT_CHARTS_ADAPTER_TYPES,
  getDbtChartsSupport,
} from '../../../../src/main/utils/dbtChartsAdapters';

// Adding a member to SupportedConnectionTypes without updating this record is
// a compile error; the runtime check below then forces an adapter-map entry.
const ALL_TYPES: Record<SupportedConnectionTypes, true> = {
  postgres: true,
  snowflake: true,
  bigquery: true,
  redshift: true,
  databricks: true,
  mysql: true,
  oracle: true,
  db2: true,
  mssql: true,
  kinetica: true,
  googlecloud: true,
  duckdb: true,
  sqlite: true,
  ducklake: true,
};

describe('getDbtChartsSupport', () => {
  it('has an entry for every SupportedConnectionTypes member', () => {
    expect([...DBT_CHARTS_ADAPTER_TYPES].sort()).toEqual(
      Object.keys(ALL_TYPES).sort(),
    );
  });

  it.each(Object.keys(ALL_TYPES))(
    'returns an extra or a reason for %s',
    (type) => {
      const support = getDbtChartsSupport(type);
      if (support.supported) {
        expect(typeof support.extra === 'string' || type === 'duckdb').toBe(
          true,
        );
      } else {
        expect(support.reason).toBe(
          `dbt Charts does not support ${type} connections yet`,
        );
      }
    },
  );

  it('maps the documented extras', () => {
    expect(getDbtChartsSupport('postgres').extra).toBe('postgresql');
    expect(getDbtChartsSupport('duckdb')).toEqual({ supported: true });
    expect(getDbtChartsSupport('mssql').supported).toBe(false);
  });

  it('reports missing and unknown types as unsupported', () => {
    expect(getDbtChartsSupport(undefined).supported).toBe(false);
    expect(getDbtChartsSupport('nope').supported).toBe(false);
  });
});
