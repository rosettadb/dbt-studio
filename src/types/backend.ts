import { QueryResult } from 'pg';

export type SupportedConnectionTypes =
  | 'postgres'
  | 'snowflake'
  | 'bigquery'
  | 'redshift'
  | 'databricks'
  | 'mysql'
  | 'oracle'
  | 'db2'
  | 'mssql'
  | 'kinetica'
  | 'googlecloud'
  | 'duckdb';

export type ConnectionBase = {
  type: SupportedConnectionTypes;
  name: string;
  username: string;
  password: string;
  database: string;
  schema: string;
};

export type PostgresConnection = ConnectionBase & {
  type: 'postgres';
  host: string;
  port: number;
  keepalives_idle?: number;
};

export type SnowflakeConnection = ConnectionBase & {
  type: 'snowflake';
  account: string;
  warehouse: string;
  role?: string;
  client_session_keep_alive?: boolean;
};

export type BigQueryConnection = ConnectionBase & {
  type: 'bigquery';
  project: string;
  dataset: string;
  method: 'service-account';
  keyfile: string;
  location?: string;
  priority?: 'interactive' | 'batch';
  // Base properties that will be ignored for BigQuery but required by interface
  host?: string;
  port?: number;
  database: string; // Will be set to project ID
  schema: string; // Will be set to dataset
  username: string; // Will be set to project ID
  password: string; // Will be empty for BigQuery
};

export type RedshiftConnection = ConnectionBase & {
  type: 'redshift';
  host: string;
  port: number;
  keepalives_idle?: number;
};

export type DatabricksConnection = Omit<
  ConnectionBase,
  'username' | 'password'
> & {
  type: 'databricks';
  host: string;
  port: number;
  httpPath: string;
  token: string; // Replace password with token
  keepalives_idle?: number;
};

export type DuckDBConnection = Omit<ConnectionBase, 'username' | 'password'> & {
  type: 'duckdb';
  database_path: string; // Path to .duckdb file
  // No username/password needed for DuckDB
};

export type ConnectionInput =
  | PostgresConnection
  | SnowflakeConnection
  | BigQueryConnection
  | RedshiftConnection
  | DatabricksConnection
  | DuckDBConnection;

export type DBTConnectionBase = {
  type: SupportedConnectionTypes;
  username: string;
  password: string;
  database: string;
  schema: string;
};

export type PostgresDBTConnection = DBTConnectionBase & {
  type: 'postgres';
  host: string;
  port: number;
  keepalives_idle?: number;
};

export type SnowflakeDBTConnection = DBTConnectionBase & {
  type: 'snowflake';
  account: string;
  warehouse: string;
  role?: string;
  client_session_keep_alive?: boolean;
  query_tag?: string;
};

export type BigQueryDBTConnection = DBTConnectionBase & {
  type: 'bigquery';
  method: 'service-account';
  project: string;
  keyfile?: string;
  location?: string;
  priority?: 'interactive' | 'batch';
};

export type RedshiftDBTConnection = DBTConnectionBase & {
  type: 'redshift';
  host: string;
  port: number;
  keepalives_idle?: number;
};

export type DatabricksDBTConnection = Omit<
  DBTConnectionBase,
  'username' | 'password'
> & {
  type: 'databricks';
  host: string;
  port: number;
  http_path: string;
  schema: string;
  catalog?: string;
  token: string;
  keepalives_idle?: number;
  query_tag?: string;
};

export type DuckDBDBTConnection = Omit<
  DBTConnectionBase,
  'username' | 'password'
> & {
  type: 'duckdb';
  path: string; // Database file path
};

export type DBTConnection =
  | PostgresDBTConnection
  | SnowflakeDBTConnection
  | BigQueryDBTConnection
  | RedshiftDBTConnection
  | DatabricksDBTConnection
  | DuckDBDBTConnection;

export type RosettaConnection = {
  name: string;
  databaseName: string;
  schemaName: string;
  dbType: SupportedConnectionTypes;
  url: string;
  userName?: string; // Make userName optional
  password?: string; // Make password optional
  token?: string; // Add token field
};

export type Project = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  rosettaConnection?: RosettaConnection;
  dbtConnection?: DBTConnection;
  lastOpenedAt?: number;
  isExtracted?: boolean;
  queryEditor?: string;
};

export type SettingsType = {
  rosettaPath: string;
  rosettaVersion: string;
  projectsDirectory: string;
  dbtSampleDirectory: string;
  sampleRosettaMainConf: string;
  dbtPath: string;
  dbtVersion: string;
  openAIApiKey?: string;
  pythonVersion: string;
  pythonPath: string;
  pythonBinary: string;
  isSetup?: string;
};

export type FileDialogProperties = 'openFile' | 'openDirectory';

export type DataBase = {
  projects: Project[];
  settings: SettingsType;
  selectedProject?: Project;
};

export type FileNode = {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
};

export type CustomError = {
  message?: string;
};

export type CliMessage = {
  message: string;
  type: 'error' | 'info' | 'success';
};

type ForeignKey = {
  name: string;
  schema: string;
  tableName: string;
  columnName: string;
  deleteRule: string;
  primaryTableSchema: string;
  primaryTableName: string;
  primaryColumnName: string;
};

export type Column = {
  name: string;
  typeName: string;
  ordinalPosition: number;
  primaryKeySequenceId: number;
  columnDisplaySize: number;
  scale: number;
  precision: number;
  columnProperties: any[];
  autoincrement: boolean;
  primaryKey: boolean;
  nullable: boolean;
  foreignKeys?: ForeignKey[];
};

export type Table = {
  name: string;
  type: 'TABLE' | 'VIEW' | string;
  schema: string;
  columns: Column[];
};

export type QueryResponseType = {
  success: boolean;
  data?: QueryResult[];
  fields?: { name: string; type: number }[];
  rowCount?: number; // Add rowCount for affected rows in INSERT/UPDATE/DELETE operations
  error?: string;
};

export type CliUpdateItem = {
  currentVersion: string;
  latestVersion: string;
  needsUpdate: boolean;
  releaseInfo: any;
  error?: string;
};

export type CliUpdateResponseType = {
  dbt: CliUpdateItem;
  rosetta: CliUpdateItem;
};

export type GenerateDashboardResponseType = {
  description: string;
  query: string;
};

export type EnhanceModelResponseType = {
  content: string;
};

export type GitCredentials = {
  username: string;
  password: string;
};

export type GitBranch = {
  name: string;
  checkedOut: boolean;
};

export type DiffResponse = {
  diff?: string;
  filePath?: string;
  error?: string;
};

export type FileStatus = {
  path: string;
  status:
    | 'untracked'
    | 'modified'
    | 'staged'
    | 'deleted'
    | 'renamed'
    | 'conflicted';
};

export type BigQueryTestResponse = {
  success: boolean;
};
