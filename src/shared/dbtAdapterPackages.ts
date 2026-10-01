/**
 * Single source of truth for the dbt adapter packages the Studio installs into
 * its managed Python environment, and for where each one is fetched from.
 *
 * Most adapters come from PyPI. Adapters that are not published there declare a
 * direct install source (a GitHub source archive), which pip can install
 * without a local git executable.
 */
export const DBT_ADAPTER_PACKAGES = [
  'dbt-postgres',
  'dbt-snowflake',
  'dbt-bigquery',
  'dbt-redshift',
  'dbt-databricks',
  'dbt-duckdb',
  'dbt-kinetica',
] as const;

export type DbtAdapterPackage = (typeof DBT_ADAPTER_PACKAGES)[number];

export const DBT_ADAPTER_PACKAGE_DESCRIPTIONS: Record<
  DbtAdapterPackage,
  string
> = {
  'dbt-postgres': 'Adapter for PostgreSQL databases',
  'dbt-snowflake': 'Adapter for Snowflake databases',
  'dbt-bigquery': 'Adapter for Google BigQuery',
  'dbt-redshift': 'Adapter for Amazon Redshift',
  'dbt-databricks': 'Adapter for Databricks',
  'dbt-duckdb': 'Adapter for DuckDB - embedded analytics database',
  'dbt-kinetica': 'Adapter for Kinetica (installed from GitHub, dbt-core 1.8+)',
};

export type PackageInstallSource = {
  /** Human-readable project page. */
  homepage: string;
  /** Requirement passed to `pip install`. */
  requirement: string;
};

/**
 * Packages that pip cannot resolve from PyPI. The requirement is a source
 * archive pinned to a reviewed commit SHA (never a mutable branch) so the
 * installed code cannot change under us. To pick up upstream changes, review
 * the new commit and bump the SHA here; `docs/adapters/kinetica.md` shows the
 * same command.
 */
export const DBT_PACKAGE_INSTALL_SOURCES: Partial<
  Record<DbtAdapterPackage, PackageInstallSource>
> = {
  'dbt-kinetica': {
    homepage: 'https://github.com/rosettadb/kinetica-dbt-adapter',
    requirement:
      'dbt-kinetica @ https://github.com/rosettadb/kinetica-dbt-adapter/archive/92f4866dad614d24aa1f771585d249ab30a4ac6a.zip',
  },
};

export const isSourceInstalledPackage = (packageName: string): boolean =>
  packageName in DBT_PACKAGE_INSTALL_SOURCES;

export const getPackageInstallSource = (
  packageName: string,
): PackageInstallSource | undefined =>
  DBT_PACKAGE_INSTALL_SOURCES[packageName as DbtAdapterPackage];

/** The argument to hand to `pip install` for the given package name. */
export const getPipInstallRequirement = (packageName: string): string =>
  getPackageInstallSource(packageName)?.requirement ?? packageName;
