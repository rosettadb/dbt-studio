import {
  DEFAULT_SECRETS,
  type ConnectionCapabilities,
  type ConnectionDescriptor,
  type SecretFieldSpec,
  type SqlRules,
} from './core/descriptor.shared';
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
  spannerDescriptor,
  type SpannerConnection,
} from './spanner/spanner.shared';
import {
  ducklakeDescriptor,
  type DuckLakeConnectionConfig,
} from './ducklake/ducklake.shared';

/**
 * Every connection type that ships with Studio. The order is the add-screen
 * tile order (ducklake has no tile). Adding a database to Studio adds one
 * entry here, one descriptor below, and one line in registry.main.ts and
 * registry.renderer.ts. An extension adds a database at run time with
 * `registerDescriptor` (through `api.connections.register`); its type is not
 * in this list.
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
  'spanner',
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
  | SpannerConnection
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
  spanner: spannerDescriptor,
  ducklake: ducklakeDescriptor,
};

/**
 * The databases known in this process: Studio's own and the ones extensions
 * added. Every lookup below reads this, so a database added at run time is
 * found the same way as a built-in one.
 */
const registeredDescriptors = new Map<string, ConnectionDescriptor>();

/**
 * Adds a database. Studio's own descriptors and those of extensions come in
 * through this one call. Returns the function that takes it out again. A
 * type that is already taken by another descriptor is refused.
 */
export function registerDescriptor(
  descriptor: ConnectionDescriptor,
): () => void {
  const existing = registeredDescriptors.get(descriptor.type);
  if (existing === descriptor) {
    // Already there (its connector and its UI both bring it); whoever added
    // it first takes it out.
    return () => {};
  }
  if (existing) {
    throw new Error(
      `Connection type "${descriptor.type}" is already registered`,
    );
  }
  registeredDescriptors.set(descriptor.type, descriptor);
  return () => {
    if (registeredDescriptors.get(descriptor.type) === descriptor) {
      registeredDescriptors.delete(descriptor.type);
    }
  };
}

Object.values(connectionDescriptors).forEach((descriptor) =>
  registerDescriptor(descriptor),
);

/**
 * The descriptor an extension gives for its database. Only `type` and
 * `displayName` are required; the rest gets the values of a plain SQL
 * database.
 */
export type ExtensionConnectionDescriptor = {
  type: string;
  displayName: string;
  aliases?: readonly string[];
  capabilities?: Partial<ConnectionCapabilities>;
  secrets?: readonly SecretFieldSpec[];
  storedKeys?: readonly string[];
  sql?: Partial<ConnectionDescriptor['sql']> & { rules?: Partial<SqlRules> };
  lineageDialect?: string;
};

/**
 * The full descriptor for a database an extension adds. A dbt project needs
 * a dbt connector (profiles, adapter install), which the extension API does
 * not carry yet, so such a database is never offered to dbt projects.
 */
export function completeExtensionDescriptor(
  input: ExtensionConnectionDescriptor,
): ConnectionDescriptor {
  if (!input || typeof input.type !== 'string' || !input.type.trim()) {
    throw new Error('A connection needs a descriptor with a `type`');
  }
  if (typeof input.displayName !== 'string' || !input.displayName.trim()) {
    throw new Error(`Connection "${input.type}" needs a \`displayName\``);
  }
  return {
    type: input.type,
    displayName: input.displayName,
    aliases: input.aliases,
    capabilities: {
      nativeExport: false,
      icebergCatalog: false,
      listedByDefault: true,
      ...input.capabilities,
      dbt: false,
      dbtV2: false,
    },
    secrets: input.secrets ?? DEFAULT_SECRETS,
    storedKeys: input.storedKeys,
    sql: {
      ...input.sql,
      rules: {
        quote: 'double',
        folding: 'none',
        limit: 'limit',
        ...input.sql?.rules,
      },
    },
    lineageDialect: input.lineageDialect,
  };
}

/** Every known database, Studio's own first, in the order they were added. */
export const listDescriptors = (): ConnectionDescriptor[] =>
  Array.from(registeredDescriptors.values());

/** Exact lookup. Unknown, removed ('db2') and prototype keys ('constructor') return undefined. */
export function getDescriptor(
  type: string | null | undefined,
): ConnectionDescriptor | undefined {
  return type ? registeredDescriptors.get(type) : undefined;
}

/** Exact type or alias ('postgresql' → postgres). */
export function descriptorFor(
  typeOrAlias: string | null | undefined,
): ConnectionDescriptor | undefined {
  if (!typeOrAlias) return undefined;
  return (
    getDescriptor(typeOrAlias) ??
    listDescriptors().find((d) => d.aliases?.includes(typeOrAlias))
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
  Array.from(new Set(listDescriptors().flatMap((d) => d.storedKeys ?? [])));

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
  SpannerConnection,
  DuckLakeConnectionConfig,
};
