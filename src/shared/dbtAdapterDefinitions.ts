export type DbtAdapterPackageDefinition = {
  name: string;
  description: string;
  selectedByDefault: boolean;
};

export const DBT_ADAPTER_PACKAGE_DEFINITIONS = [
  {
    name: 'dbt-core',
    description: 'The core dbt™ package',
    selectedByDefault: true,
  },
  {
    name: 'dbt-postgres',
    description: 'Adapter for PostgreSQL databases',
    selectedByDefault: true,
  },
  {
    name: 'dbt-snowflake',
    description: 'Adapter for Snowflake databases',
    selectedByDefault: true,
  },
  {
    name: 'dbt-bigquery',
    description: 'Adapter for Google BigQuery',
    selectedByDefault: true,
  },
  {
    name: 'dbt-redshift',
    description: 'Adapter for Amazon Redshift',
    selectedByDefault: true,
  },
  {
    name: 'dbt-databricks',
    description: 'Adapter for Databricks',
    selectedByDefault: true,
  },
  {
    name: 'dbt-duckdb',
    description: 'Adapter for DuckDB - embedded analytics database',
    selectedByDefault: true,
  },
  {
    name: 'dbt-fabricspark',
    description: 'Adapter for Microsoft Fabric Lakehouse through Livy',
    selectedByDefault: true,
  },
  {
    name: 'sqlglot',
    description: 'SQL Parser and Transpiler (Required for Lineage)',
    selectedByDefault: true,
  },
] as const satisfies readonly DbtAdapterPackageDefinition[];

export type DbtAdapterPackageName =
  (typeof DBT_ADAPTER_PACKAGE_DEFINITIONS)[number]['name'];

export const DBT_ADAPTER_PACKAGE_NAMES = DBT_ADAPTER_PACKAGE_DEFINITIONS.map(
  (adapter) => adapter.name,
);

export const DBT_V1_ADAPTER_PACKAGE_NAMES = DBT_ADAPTER_PACKAGE_NAMES.filter(
  (name) => name !== 'dbt-core' && name !== 'sqlglot',
);

export const DBT_DEFAULT_SELECTED_PACKAGES =
  DBT_ADAPTER_PACKAGE_DEFINITIONS.reduce(
    (packages, adapter) => ({
      ...packages,
      [adapter.name]: adapter.selectedByDefault,
    }),
    {} as Record<DbtAdapterPackageName, boolean>,
  );

export const DBT_PACKAGE_DESCRIPTIONS = DBT_ADAPTER_PACKAGE_DEFINITIONS.reduce(
  (descriptions, adapter) => ({
    ...descriptions,
    [adapter.name]: adapter.description,
  }),
  {} as Record<DbtAdapterPackageName, string>,
);
