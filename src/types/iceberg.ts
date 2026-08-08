// src/types/iceberg.ts
// Iceberg Data Lake — Phase 1: TypeScript type definitions

export type IcebergCatalogType =
  | 'sqlite'
  | 'sql'
  | 'rest'
  | 'polaris'
  | 'hive'
  | 'hadoop'
  | 'glue'
  | 'nessie';

export type IcebergStorageType =
  | 'server-managed'
  | 'local'
  | 'nfs'
  | 'hdfs'
  | 'cloud';

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
    'catalogPath' | 'endpoint' | 'catalogName' | 'databaseConnectionId'
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
  databaseConnectionId?: string; // Existing PostgreSQL/Neon connection
  catalogAccessTokenKey?: string; // keytar key: "iceberg-catalog-token-{id}"
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
  createdAt: string;
  updatedAt: string;
}

// DTOs
export type CreateIcebergInstanceDTO = Omit<
  IcebergInstanceConfig,
  'id' | 'createdAt' | 'updatedAt'
> & {
  accessToken?: string; // raw token — service stores in keytar, strips before saving
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

export interface IcebergSnapshotInfo {
  snapshotId: string;
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

export interface IcebergTestResult {
  success: boolean;
  error?: string;
}

export interface IcebergLocalCatalogResult {
  catalogPath: string;
  warehousePath: string;
  namespaces: string[][];
  tables: string[][];
}

export interface IcebergTestCatalogParams {
  catalogType: IcebergCatalogType;
  catalogPath?: string;
  endpoint?: string;
  catalogName?: string;
  connectionId?: string; // resolves credentials from Cloud Explorer
  accessToken?: string; // raw token (not stored yet at test time)
  databaseConnectionId?: string;
  storageType?: IcebergStorageType;
}
