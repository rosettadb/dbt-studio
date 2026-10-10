import type {
  DbtChartsAdapterSupport,
  SupportedConnectionTypes,
} from '../../types/backend';

const unsupported = (type: string): DbtChartsAdapterSupport => ({
  supported: false,
  reason: `dbt Charts does not support ${type} connections yet`,
});

// Typed as a full Record so a new SupportedConnectionTypes member without an
// entry fails to compile (and fails the adapter-map unit test).
const ADAPTER_MAP: Record<SupportedConnectionTypes, DbtChartsAdapterSupport> = {
  postgres: { supported: true, extra: 'postgresql' },
  snowflake: { supported: true, extra: 'snowflake' },
  bigquery: { supported: true, extra: 'bigquery' },
  redshift: { supported: true, extra: 'redshift' },
  // dbt-charts 0.9.1 ships no SQL Server extra.
  mssql: unsupported('mssql'),
  duckdb: { supported: true },
  // dbt-charts 0.9.1 has a databricks extra; not run against a real workspace.
  databricks: { supported: true, extra: 'databricks' },
  // sqlite is a direct dct source type, but dbt_profile support is unconfirmed.
  sqlite: unsupported('sqlite'),
  mysql: unsupported('mysql'),
  oracle: unsupported('oracle'),
  db2: unsupported('db2'),
  kinetica: unsupported('kinetica'),
  googlecloud: unsupported('googlecloud'),
  ducklake: unsupported('ducklake'),
};

/** Pure: maps a Studio connection type to a dct extra or an unsupported reason. */
export function getDbtChartsSupport(
  type: SupportedConnectionTypes | string | undefined,
): DbtChartsAdapterSupport {
  if (!type) {
    return {
      supported: false,
      reason: 'This project has no database connection configured',
    };
  }
  return (
    ADAPTER_MAP[type as SupportedConnectionTypes] ?? unsupported(String(type))
  );
}

export const DBT_CHARTS_ADAPTER_TYPES = Object.keys(
  ADAPTER_MAP,
) as SupportedConnectionTypes[];
