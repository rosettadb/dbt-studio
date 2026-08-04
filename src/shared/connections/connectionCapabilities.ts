import {
  SUPPORTED_CONNECTION_TYPES,
  SupportedConnectionTypes,
} from '../../types/backend';

export type ConnectionCapabilities = {
  dbt: boolean;
  directQuery: boolean;
  schemaExtraction: boolean;
  rosettaJdbc: boolean;
  sqlEditor: boolean;
  sqlNotebook: boolean;
  dbtCoreV2: boolean;
};

export type ConnectionDefinition = {
  displayName: string;
  adapterPackage?: string;
  capabilities: ConnectionCapabilities;
};

const jdbcDbtCapabilities: ConnectionCapabilities = {
  dbt: true,
  directQuery: true,
  schemaExtraction: true,
  rosettaJdbc: true,
  sqlEditor: true,
  sqlNotebook: true,
  dbtCoreV2: false,
};

const unavailableCapabilities: ConnectionCapabilities = {
  dbt: false,
  directQuery: false,
  schemaExtraction: false,
  rosettaJdbc: false,
  sqlEditor: false,
  sqlNotebook: false,
  dbtCoreV2: false,
};

export const CONNECTION_DEFINITIONS: Record<
  SupportedConnectionTypes,
  ConnectionDefinition
> = {
  postgres: {
    displayName: 'PostgreSQL',
    adapterPackage: 'dbt-postgres',
    capabilities: jdbcDbtCapabilities,
  },
  snowflake: {
    displayName: 'Snowflake',
    adapterPackage: 'dbt-snowflake',
    capabilities: { ...jdbcDbtCapabilities, dbtCoreV2: true },
  },
  bigquery: {
    displayName: 'BigQuery',
    adapterPackage: 'dbt-bigquery',
    capabilities: { ...jdbcDbtCapabilities, dbtCoreV2: true },
  },
  redshift: {
    displayName: 'Redshift',
    adapterPackage: 'dbt-redshift',
    capabilities: { ...jdbcDbtCapabilities, dbtCoreV2: true },
  },
  databricks: {
    displayName: 'Databricks',
    adapterPackage: 'dbt-databricks',
    capabilities: { ...jdbcDbtCapabilities, dbtCoreV2: true },
  },
  mysql: { displayName: 'MySQL', capabilities: unavailableCapabilities },
  oracle: { displayName: 'Oracle', capabilities: unavailableCapabilities },
  db2: { displayName: 'IBM Db2', capabilities: unavailableCapabilities },
  mssql: {
    displayName: 'Microsoft SQL Server',
    capabilities: unavailableCapabilities,
  },
  kinetica: {
    displayName: 'Kinetica',
    capabilities: jdbcDbtCapabilities,
  },
  googlecloud: {
    displayName: 'Google Cloud',
    capabilities: unavailableCapabilities,
  },
  duckdb: {
    displayName: 'DuckDB',
    adapterPackage: 'dbt-duckdb',
    capabilities: { ...jdbcDbtCapabilities, dbtCoreV2: true },
  },
  ducklake: {
    displayName: 'DuckLake',
    adapterPackage: 'dbt-duckdb',
    capabilities: {
      dbt: true,
      directQuery: true,
      schemaExtraction: false,
      rosettaJdbc: false,
      sqlEditor: true,
      sqlNotebook: true,
      dbtCoreV2: false,
    },
  },
  fabricspark: {
    displayName: 'Microsoft Fabric Lakehouse',
    adapterPackage: 'dbt-fabricspark',
    capabilities: {
      dbt: true,
      directQuery: true,
      schemaExtraction: true,
      rosettaJdbc: false,
      sqlEditor: true,
      sqlNotebook: true,
      dbtCoreV2: false,
    },
  },
};

const supportedConnectionTypeSet = new Set<string>(SUPPORTED_CONNECTION_TYPES);

export const isSupportedConnectionType = (
  value: unknown,
): value is SupportedConnectionTypes =>
  typeof value === 'string' && supportedConnectionTypeSet.has(value);

export const getConnectionDefinition = (
  type: SupportedConnectionTypes,
): ConnectionDefinition => CONNECTION_DEFINITIONS[type];

export const getConnectionCapabilities = (
  type: SupportedConnectionTypes,
): ConnectionCapabilities => getConnectionDefinition(type).capabilities;

export const getConnectionDisplayName = (type: unknown): string => {
  if (!isSupportedConnectionType(type)) return 'Unknown connection';
  return getConnectionDefinition(type).displayName;
};
