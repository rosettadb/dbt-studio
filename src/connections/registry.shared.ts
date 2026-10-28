import type { ConnectionDescriptor } from './core/descriptor.shared';
import {
  postgresDescriptor,
  type PostgresConnection,
  type PostgresDBTConnection,
} from './postgres/postgres.shared';
import {
  snowflakeDescriptor,
  type SnowflakeConnection,
  type SnowflakeDBTConnection,
} from './snowflake/snowflake.shared';
import {
  bigqueryDescriptor,
  type BigQueryConnection,
  type BigQueryDBTConnection,
} from './bigquery/bigquery.shared';
import {
  redshiftDescriptor,
  type RedshiftConnection,
  type RedshiftDBTConnection,
} from './redshift/redshift.shared';
import {
  databricksDescriptor,
  type DatabricksConnection,
  type DatabricksDBTConnection,
} from './databricks/databricks.shared';
import {
  duckdbDescriptor,
  type DuckDBConnection,
  type DuckDBDBTConnection,
} from './duckdb/duckdb.shared';
import {
  sqliteDescriptor,
  type SQLiteConnection,
} from './sqlite/sqlite.shared';
import {
  kineticaDescriptor,
  type KineticaConnection,
  type KineticaDBTConnection,
} from './kinetica/kinetica.shared';
import {
  oracleDescriptor,
  type OracleConnection,
} from './oracle/oracle.shared';
import {
  mysqlDescriptor,
  type MySqlConnection,
  type MySqlDBTConnection,
} from './mysql/mysql.shared';
import {
  ducklakeDescriptor,
  type DuckLakeConnectionConfig,
} from './ducklake/ducklake.shared';

/**
 * Every connection type. The order is the add-screen tile order (ducklake has
 * no tile). Adding a database adds one entry here, one descriptor below, and
 * one line in registry.main.ts and registry.renderer.ts.
 */
export const CONNECTION_TYPES = [
  'postgres',
  'snowflake',
  'bigquery',
  'redshift',
  'databricks',
  'duckdb',
  'sqlite',
  'kinetica',
  'oracle',
  'mysql',
  'ducklake',
] as const;

export type SupportedConnectionTypes = (typeof CONNECTION_TYPES)[number];

export type ConnectionInput =
  | PostgresConnection
  | SnowflakeConnection
  | BigQueryConnection
  | RedshiftConnection
  | DatabricksConnection
  | DuckDBConnection
  | SQLiteConnection
  | KineticaConnection
  | MySqlConnection
  | OracleConnection
  | DuckLakeConnectionConfig;

/** Same members as today (MySqlDBTConnection is unused but kept). */
export type DBTConnection =
  | PostgresDBTConnection
  | SnowflakeDBTConnection
  | BigQueryDBTConnection
  | RedshiftDBTConnection
  | DatabricksDBTConnection
  | DuckDBDBTConnection
  | KineticaDBTConnection
  | MySqlDBTConnection;

export const connectionDescriptors: {
  readonly [K in SupportedConnectionTypes]: ConnectionDescriptor<K>;
} = {
  postgres: postgresDescriptor,
  snowflake: snowflakeDescriptor,
  bigquery: bigqueryDescriptor,
  redshift: redshiftDescriptor,
  databricks: databricksDescriptor,
  duckdb: duckdbDescriptor,
  sqlite: sqliteDescriptor,
  kinetica: kineticaDescriptor,
  oracle: oracleDescriptor,
  mysql: mysqlDescriptor,
  ducklake: ducklakeDescriptor,
};

const isKnown = (type: string): type is SupportedConnectionTypes =>
  Object.prototype.hasOwnProperty.call(connectionDescriptors, type);

/** Exact lookup. Unknown, removed ('db2') and prototype keys ('constructor') return undefined. */
export function getDescriptor(
  type: string | null | undefined,
): ConnectionDescriptor | undefined {
  return type && isKnown(type) ? connectionDescriptors[type] : undefined;
}

/** Exact type or alias ('postgresql' → postgres). */
export function descriptorFor(
  typeOrAlias: string | null | undefined,
): ConnectionDescriptor | undefined {
  if (!typeOrAlias) return undefined;
  return (
    getDescriptor(typeOrAlias) ??
    Object.values(connectionDescriptors).find((d) =>
      d.aliases?.includes(typeOrAlias),
    )
  );
}

/**
 * True only for dbt-capable types. Same answers as DBT_CONNECTION_SUPPORT for
 * every supported type, and false for removed or unknown types and aliases.
 */
export const canUseAsDbtConnection = (type: string): boolean =>
  getDescriptor(type)?.capabilities.dbt === true;

/** Extra keytar key parts deleted with a connection (secureStorage.service.ts). */
export const extraStoredKeyParts = (): string[] =>
  Array.from(
    new Set(
      Object.values(connectionDescriptors).flatMap((d) => d.storedKeys ?? []),
    ),
  );

export type {
  PostgresConnection,
  PostgresDBTConnection,
  SnowflakeConnection,
  SnowflakeDBTConnection,
  BigQueryConnection,
  BigQueryDBTConnection,
  RedshiftConnection,
  RedshiftDBTConnection,
  DatabricksConnection,
  DatabricksDBTConnection,
  DuckDBConnection,
  DuckDBDBTConnection,
  SQLiteConnection,
  KineticaConnection,
  KineticaDBTConnection,
  OracleConnection,
  MySqlConnection,
  MySqlDBTConnection,
  DuckLakeConnectionConfig,
};
