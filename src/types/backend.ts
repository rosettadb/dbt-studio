import { QueryResult } from 'pg';
import { CloudConnection, RecentItem } from './frontend';

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
  | 'duckdb'
  | 'ducklake';

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
  ssl?: boolean;
  sslRejectUnauthorized?: boolean;
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
  ssl?: boolean;
  sslrootcert?: string;
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
  short_database_path: string;
  // No username/password needed for DuckDB
};

export type KineticaConnection = ConnectionBase & {
  type: 'kinetica';
  host: string;
  port: number;
  timeout?: number;
  useSSL?: boolean;
  bypassSslCertCheck?: boolean;
};

export type DuckLakeConnectionConfig = Omit<
  ConnectionBase,
  'username' | 'password' | 'database' | 'schema'
> & {
  type: 'ducklake';
  instanceId: string;
  // Metadata from instance
  catalogType?: 'duckdb' | 'postgresql' | 'sqlite';
  dataPath?: string;
  status?: 'active' | 'inactive' | 'error' | 'connecting';
};

export type ConnectionInput =
  | PostgresConnection
  | SnowflakeConnection
  | BigQueryConnection
  | RedshiftConnection
  | DatabricksConnection
  | DuckDBConnection
  | KineticaConnection
  | DuckLakeConnectionConfig;

export type ConnectionModel = {
  id: string;
  connection: ConnectionInput;
};

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
  ssl?: boolean;
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
  ssl?: boolean;
  sslrootcert?: string;
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

export type KineticaDBTConnection = DBTConnectionBase & {
  type: 'kinetica';
  host: string;
  port: number;
  timeout?: number;
  useSSL?: boolean;
  bypassSslCertCheck?: boolean;
};

export type DBTConnection =
  | PostgresDBTConnection
  | SnowflakeDBTConnection
  | BigQueryDBTConnection
  | RedshiftDBTConnection
  | DatabricksDBTConnection
  | DuckDBDBTConnection
  | KineticaDBTConnection;

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
  connectionId?: string;
  rosettaConnection?: RosettaConnection;
  dbtConnection?: DBTConnection;
  lastOpenedAt?: number;
  isExtracted?: boolean;
  queryEditor?: string;
  connection?: ConnectionInput;
  rawLayerDir?: string;
  stagingDir?: string;
  incrementalDir?: string;
  businessDir?: string;
  createTemplateFolders?: boolean;
  externalId?: string;
  lastRun?: string;
  /**
   * Maps a pipeline file name (e.g. "pipeline.yml") to the cloud action id of
   * the last run we triggered for it. Used to drive the CI/CD view — runs are
   * triggered exclusively from this app, so we are the source of truth.
   */
  pipelineRuns?: Record<string, string>;
};

export type CloudDeploymentPayload = {
  id: string;
  title: string;
  gitUrl: string;
  gitBranch: string;
  githubUsername?: string;
  githubPassword?: string;
  secrets: Record<string, string>;
  CUSTOM_DBT_COMMANDS?: string;
  EXECUTION_MODE?: 'command' | 'pipeline';
  PIPELINE_FILE?: string;
  ROSETTA_RUN_TEARDOWN?: boolean;
};

export type DuckDBStatus =
  | 'ready'
  | 'stopped'
  | 'missing'
  | 'initializing'
  | 'error'
  | 'fallback_memory';
export type DuckDBLockStatus = 'idle' | 'active' | 'contended' | 'unknown';
export type DuckDBMetadataPayload = {
  path: string;
  sizeBytes: number;
  sizeHumanReadable: string;
  status: DuckDBStatus;
  lockStatus: DuckDBLockStatus;
  lastCheckedAt: string;
  initialized: boolean;
  poolSize: number;
  activeConnections: number;
  maxConnections: number;
  fileExists: boolean;
  duckdbVersion?: string;
};
export type DuckDBLeakInfo = {
  id: string;
  heldForMs: number;
  acquiredBy: string[];
  acquiredAt: string;
};
export type DuckDBConnectionSample = {
  id: string;
  inUse: boolean;
  refCount: number;
  acquiredBy: string[];
  holdTimeMs: number;
};
export type DuckDBDiagnostics = {
  metadata: DuckDBMetadataPayload;
  leaks: DuckDBLeakInfo[];
  pool: {
    activeConnections: number;
    totalConnections: number;
    maxConnections: number;
    peakActive: number;
    averageHoldTime: number;
  };
  connectionsSample: DuckDBConnectionSample[];
};

export type SettingsType = {
  rosettaPath: string;
  rosettaVersion: string;
  runnerPath?: string;
  runnerVersion?: string;
  runnerHome?: string;
  projectsDirectory: string;
  dbtSampleDirectory: string;
  sampleRosettaMainConf: string;
  dbtPath: string;
  dbtVersion: string;
  pythonVersion: string;
  pythonPath: string;
  pythonBinary: string;
  isSetup?: string;
  // AI Database Information (read-only)
  mainDatabasePath?: string;
  mainDatabaseSize?: string | number;
  sqliteVersion?: string;
  mainDatabaseStatus?: 'connected' | 'disconnected' | 'error';

  env?: 'local' | 'cloud';
  // DuckDB metadata (read-only)
  duckdbPath?: string;
  duckdbSize?: string | number;
  duckdbStatus?: DuckDBStatus;
  duckdbVersion?: string;
  duckdbLockStatus?: DuckDBLockStatus;
  duckdbLastCheckedAt?: string;
  duckdbActiveConnections?: number;
  duckdbPoolSize?: number;
  duckdbMaxConnections?: number;
  cloudWorkspaceUrl?: string;
  cloudWorkspaceLastSyncedAt?: string;
  flowfileVersion?: string;
  flowfilePort?: string;
  flowfileAutoStart?: string;
};

export type FileDialogProperties = 'openFile' | 'openDirectory';

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  connectionId: string;
  createdAt: string;
  updatedAt: string;
}

export type DataBase = {
  projects: Project[];
  settings: SettingsType;
  selectedProject?: Project;
  queries: Record<string, string>;
  savedQueries?: Record<string, SavedQuery[]>;
  connections: ConnectionModel[];
  sources: CloudConnection[];
  recentItems: RecentItem[];
};

// Rosetta Version Management Types
export type RosettaVersionInfo = {
  currentVersion: string | null;
  currentPath: string | null;
  availableVersions: {
    version: string;
    releaseDate: string;
    isPrerelease: boolean;
    downloadUrl: string;
    isNewer: boolean;
    isOlder: boolean;
    releaseNotes?: string;
  }[];
  latestStable: string;
  latestPrerelease?: string;
};

export type RunnerVersionInfo = {
  currentVersion: string | null;
  currentPath: string | null;
  availableVersions: {
    version: string;
    releaseDate: string;
    isPrerelease: boolean;
    downloadUrl: string;
    isNewer: boolean;
    isOlder: boolean;
    releaseNotes?: string;
  }[];
  latestStable: string;
  latestPrerelease?: string;
};

export type RunnerPluginId =
  | 'dbt'
  | 'rosetta'
  | 'git'
  | 'terraform'
  | 's3'
  | 'kinetica_cli'
  | 'command';

export type RunnerPluginStatus = {
  id: RunnerPluginId;
  label: string;
  plugin: string;
  available: boolean;
  version?: string;
  path?: string;
  managedInStudio?: boolean;
  downloadUrl?: string;
};

export type DbtCoreVersionListItem = {
  version: string;
  isPrerelease: boolean;
  isLatestStable: boolean;
  isInstalled: boolean;
  channel: 'stable' | 'preview';
};

export type DbtVersionListOptions = {
  includePrerelease?: boolean;
  limit?: number;
};

export type DbtVersionListResponse = {
  versions: DbtCoreVersionListItem[];
  latestStable: string | null;
  currentVersion: string | null;
};

export type PythonPackageVersionListItem = {
  version: string;
  isPrerelease?: boolean;
};

export type PythonPackageVersionListRequest = {
  packageName: string;
};

export type PythonPackageVersionListResponse = {
  packageName: string;
  versions: PythonPackageVersionListItem[];
  latestStable: string | null;
};

export type PythonPackageInstallVersionRequest = {
  pythonPath?: string;
  packageName: string;
  version: string;
};

export type DbtAdapterCompatibility = {
  packageName: string;
  installedVersion: string;
  status: 'likely-compatible' | 'warning' | 'unknown';
  message: string;
};

export type PythonPackageInstallVersionResponse = {
  ok: boolean;
  error?: string;
  installedVersion?: string;
  dbtPath?: string;
  previousVersion?: string | null;
  previousDbtPath?: string | null;
  adapterWarnings?: DbtAdapterCompatibility[];
};

export type PythonPackageActionRequest = {
  pythonPath?: string;
  packageName: string;
};

export type InstalledPythonPackagesResponse = {
  packages: Record<string, string>;
};

export type InstalledDbtCoreInfo = {
  version: string | null;
  pythonPath: string;
  dbtPath: string | null;
  dbtVersionOutput?: string;
  isDbtCorePackage: boolean;
  isExecutableVerified: boolean;
  hasProprietaryDbtPackage?: boolean;
  error?: string;
};

export type DbtVersionChangeDirection =
  | 'upgrade'
  | 'downgrade'
  | 'reinstall'
  | 'preview-install';

export type DbtVersionChangePlanRequest = {
  targetVersion: string;
  includeAdapters?: boolean;
};

export type DbtVersionChangePlan = {
  currentVersion: string | null;
  targetVersion: string;
  direction: DbtVersionChangeDirection;
  channel: 'stable' | 'preview';
  isMajorVersionChange: boolean;
  globalImpactWarning: string;
  warnings: string[];
  adapters: DbtAdapterCompatibility[];
  rollbackVersion: string | null;
};

export type DbtVersionChangeRequest = DbtVersionChangePlanRequest & {
  pythonPath?: string;
};

export type DbtCompatibilityDiagnostic = {
  command: 'parse' | 'compile';
  ok: boolean;
  exitCode: number | null;
  summary: string;
};

export type DbtProjectCompatibilityResult = {
  ok: boolean;
  projectName?: string;
  projectPath?: string;
  diagnostics: DbtCompatibilityDiagnostic[];
  recommendations: string[];
  error?: string;
};

export type DbtAdapterSupportStatus =
  | 'supported'
  | 'preview'
  | 'experimental'
  | 'unsupported'
  | 'unknown';

export type DbtAdapterDriver = 'builtin' | 'adbc' | 'native' | 'unknown';

export type DbtAdapterCapability = {
  adapter: string | null;
  displayName: string;
  status: DbtAdapterSupportStatus;
  driver: DbtAdapterDriver;
  requiresNetworkOnFirstUse: boolean;
  canExecute: boolean;
  source: 'connection' | 'profiles.yml' | 'unresolved';
  notes: string;
};

export type DbtAdapterCapabilityResponse = {
  dbtCoreVersion: string | null;
  runtime: 'v1' | 'v2' | 'unknown';
  packageProvenance: 'apache-dbt-core' | 'unverified';
  projectPath?: string;
  adapters: DbtAdapterCapability[];
};

export type DbtProjectAdapterCheck = DbtAdapterCapabilityResponse & {
  adapter: DbtAdapterCapability;
};

export type InstallResult = {
  success: boolean;
  version: string;
  path: string;
  error?: string;
  warnings?: string[];
  installLog?: string[];
};

export type FileNode = {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
};

export type FileNodeWithContent = FileNode & { content: string };

export type CustomError = {
  message?: string;
};

export type CliMessage = {
  message: string;
  type: 'error' | 'info' | 'success';
};

export type CliProcessEnvironment = {
  DBT_ALLOW_EXPERIMENTAL_ADAPTERS?: 'true';
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
  duration?: number;
  isCommand?: boolean;
  commandType?: string;
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
  sshPassphrase?: string;
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
    | 'staged-deleted'
    | 'renamed'
    | 'conflicted';
};

export type BigQueryTestResponse = {
  success: boolean;
};

export type UpdateInfo = {
  currentVersion: string;
  newVersion: string;
  releaseNotes: string;
};

export type UpdateSettingsInfo = {
  currentVersion: string;
  newVersion: string;
  lastInstalledVersion: string;
  releaseNotes: string;
};

export type StoreSchema = {
  clientId: string;
  clientIdCreatedAt: string;
  lastVersion: string;
  lastVersionUpdatedAt: string;
};

export type UpdateEvent = {
  event: string;
  version: string;
  previousVersion?: string;
  platform: string;
  arch: string;
  timestamp: string;
  hostname?: string;
  clientId: string;
};

export type AnalyticsEvent = {
  category: string;
  action: string;
  label?: string;
  timestamp: string;
  response?: {
    status?: number;
    statusText?: string;
    serverResponse: any;
  };
  error?: {
    message: string;
    code?: string;
    status?: number;
    statusText?: string;
  };
};

export type ExecuteStatementType = {
  connection: ConnectionInput;
  query: string;
  projectName: string;
  queryId?: string;
};

// AI Provider Types
export type AIProviderType =
  | 'openai'
  | 'ollama'
  | 'gemini'
  | 'anthropic'
  | 'openai-compatible'
  | 'lmstudio';

// Chat-related types
export interface ChatConversation {
  id: number;
  title: string;
  projectId?: number; // Reference to existing project
  providerId: number;
  createdAt: string;
  updatedAt: string;
  messageCount?: number; // Computed field
  lastMessageAt?: string; // Computed field
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    model?: string;
    tokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cost?: number;
    duration?: number;
    error?: string;
  };
  createdAt: string;
}

export interface PromptTemplate {
  id: number;
  name: string;
  description?: string;
  template: string;
  category:
    | 'model_enhancement'
    | 'dashboard'
    | 'chat'
    | 'custom'
    | 'sql_optimization';
  providerType?: AIProviderType; // null for universal templates
  isSystem: boolean;
  variables?: string[]; // Extracted template variables
  createdAt: string;
}

export interface AIUsageLog {
  id: number;
  providerId: number;
  conversationId?: number;
  operationType:
    | 'chat'
    | 'enhance_model'
    | 'generate_dashboard'
    | 'sql_optimization';
  tokensUsed?: number;
  costEstimate?: number;
  durationMs: number;
  status: 'success' | 'error' | 'partial';
  errorMessage?: string;
  createdAt: string;
}

export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageResponseTime: number;
  successRate: number;
  byProvider: {
    [providerId: number]: {
      requests: number;
      tokens: number;
      cost: number;
      avgResponseTime: number;
    };
  };
  byOperation: {
    [operation: string]: {
      requests: number;
      tokens: number;
      avgResponseTime: number;
    };
  };
}

// Main Database Information Types
export interface MainDatabaseInfo {
  path: string;
  size: string;
  sqliteVersion: string;
  status: 'connected' | 'disconnected' | 'error';
  tablesCount: number;
  conversationsCount: number;
  messagesCount: number;
  providersCount: number;
  templatesCount: number;
  lastBackup?: string;
  createdAt: string;
  lastModified: string;
}

export type DbtCommandType =
  | 'run'
  | 'test'
  | 'compile'
  | 'build'
  | 'list'
  | 'debug'
  | 'docs:generate'
  | 'docs:serve'
  | 'deps'
  | 'clean'
  | 'seed'
  | 'pipeline';

enum RosettaCommands {
  Config = 'config',
  Init = 'init',
  Extract = 'extract',
  Validate = 'validate',
  Compile = 'compile',
  Apply = 'apply',
  Diff = 'diff',
  Test = 'test',
  Generate = 'generate',
  Query = 'query',
  DBT = 'dbt',
  DBT_NEXT = 'dbt_next',
  Drivers = 'drivers',
}

export type DbtNextCommandType =
  | 'extract'
  | 'staging'
  | 'incremental'
  | 'business';

export enum CommandType {
  Rosetta = 'rosetta',
  Dbt = 'dbt',
  DBTNext = 'dbt-next',
}

export type Command =
  | {
      command: RosettaCommands;
      commandType: CommandType.Rosetta;
      arguments: Map<string, string | number>;
      options?: Map<string, string | number>;
    }
  | {
      command: DbtCommandType;
      commandType: CommandType.Dbt;
      arguments: Map<string, string | number>;
      options?: Map<string, string | number>;
    }
  | {
      command: DbtNextCommandType;
      commandType: CommandType.DBTNext;
      arguments: Map<string, string | number>;
      options?: Map<string, string | number>;
    };

export type GitChangesRes = {
  hasUntracked: boolean;
  hasUncommitted: boolean;
  hasUnpushed: boolean;
  untrackedCount: number;
  uncommittedCount: number;
  unpushedCount: number;
};

export type RepoInfoRes = {
  remoteUrl: string | null;
  currentBranch: string;
  branchExistsOnRemote: boolean;
};

export type Secret = {
  id: string;
  name: string;
  value: string;
};

// MCP Config types (mcp.config.json)
export type MCPTransportType = 'stdio' | 'sse' | 'http';

export interface MCPServerFileEntry {
  name: string;
  description?: string;
  disabled: boolean;
  transport: MCPTransportType;
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // sse / http
  url?: string;
  headers?: Record<string, string>;
}

export interface MCPFileConfig {
  mcpServers: Record<string, MCPServerFileEntry>;
}

export interface MCPServerWithStatus extends MCPServerFileEntry {
  id: string;
  connected: boolean;
  isBuiltIn?: boolean;
  tools?: { name: string; description: string }[];
}

export type SecondBrainSettings = {
  enabled: boolean;
  initialized: boolean;
  maxPromptChars: number;
  maxPageBytes: number;
  maxTotalBytes: number;
  includeGlobalPages: boolean;
  inlineSelfLearning: boolean;
};

export type SecondBrainScope = {
  screenKey: 'project' | 'sql' | 'notebooks' | 'analytics';
  projectId?: number | null;
  projectPath?: string | null;
  connectionId?: string | null;
  notebookId?: string | null;
  pageId?: string | null;
};

export type SecondBrainActor = 'user' | 'agent' | 'refresh';

export type SecondBrainFrontmatter = Record<string, unknown>;

export type SecondBrainPageSummary = {
  pageId: string;
  title: string;
  hash: string;
  modifiedAt: string;
  sizeBytes: number;
  frontmatter: SecondBrainFrontmatter;
};

export type SecondBrainPage = SecondBrainPageSummary & {
  content: string;
  body: string;
};

export type SecondBrainRevisionSummary = {
  revisionId: string;
  pageId: string;
  createdAt: string;
  sizeBytes: number;
};

export type SecondBrainStatus = {
  initialized: boolean;
  pageCount: number;
  totalBytes: number;
  stateVersion?: number;
  lastSuccessfulRefreshAt?: string;
  layoutVersion: 'okf-v0.2' | 'empty';
  okfVersion?: '0.2';
};

export type SecondBrainWriteInput = {
  pageId: string;
  content: string;
  expectedHash?: string;
  actor: SecondBrainActor;
};

export type SecondBrainArchiveInput = {
  pageId: string;
  expectedHash: string;
  actor: SecondBrainActor;
};

export type SecondBrainRestoreInput = {
  pageId: string;
  revisionId: string;
  expectedHash: string;
  actor: SecondBrainActor;
};

export type AISettingsConfig = {
  chat: {
    streamResponses: boolean;
    autoIncludeFileContext: boolean;
    showTokenCount: boolean;
    autoScrollToLatest: boolean;
  };
  tools: Record<string, boolean>;
  configuration: {
    allowAIInBackground: boolean;
    autoExecution: 'disabled' | 'allowlist' | 'auto' | 'turbo';
    autoContinue: boolean;
    autoGenerateMemories: boolean;
  };
  advanced: {
    maxWorkspaceFileCount: number;
  };
  secondBrain: SecondBrainSettings;
};

// ---------------------------------------------------------------------------
// AI Agent — SQL Editor query-result snapshot
// Used by studio_sql_get_query_results tool to read back query output.
// ---------------------------------------------------------------------------

/** A compact snapshot of the current SQL Editor result pane, served to the AI Agent. */
export interface QueryResultSnapshot {
  /** Overall outcome of the last query execution. */
  status: 'success' | 'error' | 'command' | 'empty' | 'pending';
  /** Column names returned by the query (empty for commands/errors). */
  columns: string[];
  /** First N data rows (capped at maxRows, never the full dataset). */
  rows: Record<string, any>[];
  /** Total number of rows in the result set (may exceed rows.length). */
  totalRowCount: number;
  /** Query execution time in milliseconds. */
  duration?: number;
  /** The SQL that produced this result (sanitised, first 500 chars). */
  sql?: string;
  /** Error message when status === 'error'. */
  error?: string;
  /** DDL or DML when status === 'command'. */
  commandType?: string;
  /** Number of rows affected when status === 'command'. */
  rowsAffected?: number;
  /** True when rows[] was capped at maxRows and more rows exist. */
  truncated?: boolean;
  /** The SQL tab ID this snapshot belongs to. */
  tabId?: string;
  /** Date.now() timestamp when snapshot was captured. */
  capturedAt?: number;
}

/** Request payload for the agent:editor:get-query-results IPC channel. */
export interface GetQueryResultsRequest {
  /** Target SQL tab ID; defaults to the most-recently-executed tab. */
  tabId?: string;
  /** Maximum rows to include in the summary (1–50, default 20). */
  maxRows?: number;
}
