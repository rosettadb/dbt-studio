import { ConnectionInput } from '../../types/backend';

const V2_SUPPORTED_ADAPTERS = new Set<ConnectionInput['type']>([
  'snowflake',
  'bigquery',
  'databricks',
  'redshift',
  'duckdb',
]);

const adapterLabel = (connectionType: ConnectionInput['type']): string => {
  if (connectionType === 'postgres') return 'Postgres';
  if (connectionType === 'ducklake') return 'DuckLake';
  return connectionType.charAt(0).toUpperCase() + connectionType.slice(1);
};

export const getDbtV2CompatibilityError = (
  dbtVersion: string | undefined,
  connectionType: ConnectionInput['type'],
): string | null => {
  if (
    dbtVersion?.startsWith('2.') &&
    !V2_SUPPORTED_ADAPTERS.has(connectionType)
  ) {
    return `${adapterLabel(connectionType)} is not supported safely by dbt Core v2 preview. Switch the global dbt runtime to a stable v1 release in Settings before running this project.`;
  }
  return null;
};
