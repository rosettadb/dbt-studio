/**
 * Pure, process-neutral facts about one database. Imported by both the main
 * process and the renderer, so this file and every *.shared.ts it pulls in may
 * import only types and other *.shared.ts files.
 */

export type ConnectionCapabilities = {
  /** Can back a dbt project. Replaces DBT_CONNECTION_SUPPORT (types/backend.ts). */
  dbt: boolean;
  /** Query results offer the Parquet COPY export (queryResult.tsx). */
  nativeExport: boolean;
  /** Can back an Iceberg SQL catalog (icebergDatalake.service.ts). */
  icebergCatalog: boolean;
  /** Returned by ConnectorsService.loadConnections() without includeDataLake. */
  listedByDefault: boolean;
  /** dbt Core v2 preview supports this adapter (dbtProcessEnvironment.ts). */
  dbtV2: boolean;
};

/** Same shape as DialectRules in renderer/utils/sql/schemaObjectSql.ts. */
export type SqlRules = {
  quote: 'double' | 'backtick' | 'bracket';
  folding: 'lower' | 'upper' | 'none';
  limit: 'limit' | 'top' | 'fetch';
};

export type SecretFieldSpec = {
  /** Property on the connection object, e.g. 'password', 'keyfile'. */
  field: string;
  /** keytar key part: the stored key is `db-${key}-${connectionName}`. */
  key: string;
  /** Copied into notebook exports. Default true. */
  exportable?: boolean;
};

/** The four keys every hydration path reads today, in today's order. */
export const DEFAULT_SECRETS: readonly SecretFieldSpec[] = [
  { field: 'username', key: 'user' },
  { field: 'password', key: 'password' },
  { field: 'token', key: 'token' },
  { field: 'keyfile', key: 'bigquery' },
];

export type ConnectionDescriptor<Type extends string = string, Conn = any> = {
  type: Type;
  /** UI label and main-process messages ("MySQL connections cannot be used by dbt projects"). */
  displayName: string;
  /** Other spellings consumers receive, e.g. 'postgresql'. */
  aliases?: readonly string[];
  capabilities: ConnectionCapabilities;
  /** keytar fields: main-process hydration and notebook export/import. */
  secrets: readonly SecretFieldSpec[];
  /** Extra keytar key parts deleted with the connection (beyond the base list in secureStorage.service.ts). */
  storedKeys?: readonly string[];
  sql: {
    rules: SqlRules;
    /** Per-connection rules (e.g. Spanner GoogleSQL vs PostgreSQL). Unused today. */
    rulesFor?: (conn: Conn) => SqlRules;
    /** Table rename when it isn't `ALTER TABLE … RENAME TO …` (MySQL). Receives qualified names. */
    renameTable?: (fromQualified: string, toQualified: string) => string;
  };
  /** sqlglot dialect for lineage (lineage.service.ts). */
  lineageDialect?: string;
  /** Label in the dbt Core v2 warning when it differs from the capitalized type. */
  dbtAdapterLabel?: string;
};
