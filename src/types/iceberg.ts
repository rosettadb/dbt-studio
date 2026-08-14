// src/types/iceberg.ts
// Iceberg Data Lake — Phase 1: TypeScript type definitions

export type IcebergCatalogType =
  | 'sqlite'
  | 'sql'
  | 'rest'
  | 'polaris'
  | 'lakekeeper'
  | 'hive'
  | 'glue'
  | 'biglake'
  | 'onelake'
  | 'unity'
  | 'snowflake'
  | 'cloudflare'
  | 'nessie';

export type IcebergStorageType = 'server-managed' | 'local' | 'nfs' | 'cloud';

export type IcebergCatalogAuthMode =
  | 'none'
  | 'token'
  | 'oauth-client-credentials';

export type IcebergCloudProvider =
  | 'aws'
  | 'azure'
  | 'gcs'
  | 'minio'
  | 'cloudflare-r2'
  | 'backblaze-b2'
  | 'rustfs'
  | 'garage';

export interface IcebergCatalogCapability {
  type: IcebergCatalogType;
  label: string;
  pyicebergType: 'sql' | 'rest' | 'hive' | 'glue' | 'custom';
  enabled: boolean;
  disabledReason?: string;
  requiredFields: Array<
    | 'catalogPath'
    | 'endpoint'
    | 'catalogName'
    | 'databaseConnectionId'
    | 'hiveUri'
    | 'nessieReference'
  >;
  authModes: IcebergCatalogAuthMode[];
  allowedStorageTypes: IcebergStorageType[];
}

export interface IcebergCapabilities {
  catalogs: IcebergCatalogCapability[];
  cloudProviders: IcebergCloudProvider[];
}

export interface IcebergInstanceConfig {
  id: string;
  name: string;
  description?: string;
  // Catalog
  catalogType: IcebergCatalogType;
  catalogPath?: string; // local testing: path to the SQLite catalog database
  endpoint?: string; // REST: Polaris/Lakekeeper endpoint URL
  catalogName?: string; // REST: catalog name or warehouse
  catalogAuthMode?: IcebergCatalogAuthMode;
  oauthClientId?: string;
  oauthClientSecretKey?: `iceberg-oauth-secret-${string}`;
  oauthServerUri?: string;
  oauthScope?: string;
  nessieReference?: string; // Nessie branch or tag, usually "main"
  nessieWarehouse?: string; // optional named Nessie warehouse
  hiveUri?: string; // Hive Metastore Thrift URI, e.g. thrift://localhost:9083
  hiveUgi?: string; // optional Hive user:group identity for non-Kerberos HMS
  databaseConnectionId?: string; // Existing PostgreSQL/Neon connection
  catalogAccessTokenKey?: `iceberg-catalog-token-${string}`;
  catalogConnectionId?: string; // Cloud Explorer connectionId for vended credentials
  catalogBucket?: string;
  catalogPrefix?: string;
  // Storage
  storageType: IcebergStorageType;
  localPath?: string;
  cloudProvider?: IcebergCloudProvider;
  storageConnectionId?: string; // Cloud Explorer connectionId for data files
  storageBucket?: string;
  storagePrefix?: string;
  // DuckDB Iceberg SQL access for REST catalogs. Secrets remain owned by the
  // referenced Cloud Explorer connection and are never copied here.
  sqlEnabled?: boolean;
  sqlStorageConnectionId?: string;
  sqlStorageProvider?: IcebergCloudProvider;
  sqlStorageBucket?: string;
  sqlStoragePrefix?: string;
  sqlWarehouseMatchAcknowledged?: boolean;
  sqlAccessVerifiedAt?: string;
  sqlRuntimeFingerprint?: string;
  // Metadata
  createdAt: string;
  updatedAt: string;
}

export interface IcebergInstanceListItem {
  id: string;
  name: string;
  description?: string;
  catalogType: IcebergCatalogType;
  storageType: IcebergStorageType;
  catalogPath?: string;
  localPath?: string;
  storageBucket?: string;
  sqlAvailable: boolean;
  sqlUnavailableReason?: string;
  createdAt: string;
  updatedAt: string;
}

// DTOs
export type CreateIcebergInstanceDTO = Omit<
  IcebergInstanceConfig,
  'id' | 'createdAt' | 'updatedAt'
> & {
  accessToken?: string; // raw token — service stores in keytar, strips before saving
  oauthClientSecret?: string; // raw secret — service stores in keytar, strips before saving
};

export type UpdateIcebergInstanceDTO = Partial<CreateIcebergInstanceDTO>;

// Bridge types
export interface IcebergFieldSpec {
  fieldId: number;
  name: string;
  type: string;
  required: boolean;
  doc?: string;
}

export interface IcebergSchemaResult {
  fields: IcebergFieldSpec[];
  properties: Record<string, string>;
}

export interface IcebergSnapshotInfo {
  snapshotId: string;
  isCurrent?: boolean;
  parentId?: string;
  operation: string;
  committedAt: string;
  manifestList: string;
  summary: Record<string, string>;
}

export interface IcebergPreviewResult {
  columns: string[];
  rows: unknown[][];
  total?: number;
}

export type IcebergImportFileFormat = 'csv' | 'parquet' | 'json';

export interface IcebergImportTableResult {
  namespace: string[];
  table: string;
  rowCount: number;
  columns: string[];
}

export interface IcebergTableOperationResult {
  namespace: string[];
  table: string;
}

export interface IcebergTestResult {
  success: boolean;
  error?: string;
  catalogConnected?: boolean;
  warehouseConnected?: boolean;
  namespaceCount?: number;
  tableCount?: number;
  checkedAt?: string;
}

export interface IcebergTestStorageParams {
  connectionId: string;
  bucket: string;
  prefix?: string;
}

export type IcebergSqlStatementClass =
  | 'select'
  | 'create'
  | 'drop'
  | 'insert'
  | 'update'
  | 'delete';

export interface IcebergSqlCapability {
  available: boolean;
  reason?: string;
  runtimeFingerprint?: string;
  canRead: boolean;
  canWrite: boolean;
  supportedStatements: IcebergSqlStatementClass[];
}

export interface IcebergSqlExecutionParams {
  instanceId: string;
  executionId: string;
  sql: string;
  maxRows?: number;
}

export interface IcebergSqlExecutionResult {
  executionId: string;
  statementClass: IcebergSqlStatementClass;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowsChanged: number;
  truncated: boolean;
}

export interface IcebergSqlSchemaInfo {
  catalogName: string;
  namespaces: Array<{
    name: string;
    tables: Array<{
      name: string;
      type: string;
      columns: Array<{ name: string; type: string; position: number }>;
    }>;
  }>;
}

export interface IcebergListStorageBucketsParams {
  connectionId: string;
}

export interface IcebergLocalCatalogResult {
  catalogPath: string;
  warehousePath: string;
  namespaces: string[][];
  tables: string[][];
}

export interface IcebergImportTableParams {
  id: string;
  namespace: string[];
  table: string;
  filePath: string;
  fileFormat: IcebergImportFileFormat;
}

export interface IcebergNamespaceOperationResult {
  namespace: string[];
}

export interface IcebergCreateNamespaceParams {
  id: string;
  namespace: string[];
}

export interface IcebergDropNamespaceParams {
  id: string;
  namespace: string[];
}

export interface IcebergTestCatalogParams {
  instanceId?: string; // edit mode: resolve the existing instance-scoped secret
  catalogType: IcebergCatalogType;
  catalogPath?: string;
  endpoint?: string;
  catalogName?: string;
  connectionId?: string; // resolves credentials from Cloud Explorer
  accessToken?: string; // raw token (not stored yet at test time)
  authMode?: IcebergCatalogAuthMode;
  oauthClientId?: string;
  oauthClientSecret?: string; // raw secret (not stored yet at test time)
  oauthServerUri?: string;
  oauthScope?: string;
  nessieReference?: string;
  nessieWarehouse?: string;
  hiveUri?: string;
  hiveUgi?: string;
  databaseConnectionId?: string;
  storageType?: IcebergStorageType;
}
