import { SupportedConnectionTypes } from '../../types/backend';
import { getConnectionDisplayName } from '../../shared/connections/connectionCapabilities';

const CONNECTION_COLORS: Record<SupportedConnectionTypes, string> = {
  postgres: '#336791',
  snowflake: '#29b5e8',
  bigquery: '#4285f4',
  redshift: '#8c4fff',
  databricks: '#ff3621',
  mysql: '#4479a1',
  oracle: '#c74634',
  db2: '#0f62fe',
  mssql: '#cc2927',
  kinetica: '#6042f5',
  googlecloud: '#4285f4',
  duckdb: '#fff000',
  ducklake: '#f3c614',
  fabricspark: '#0078d4',
};

export { getConnectionDisplayName };

export const getConnectionTypeColor = (
  type: SupportedConnectionTypes | string | undefined,
): string => {
  if (!type || !(type in CONNECTION_COLORS)) return '#666';
  return CONNECTION_COLORS[type as SupportedConnectionTypes];
};
