// src/types/iceberg.ts
// Iceberg Data Lake — Phase 1: TypeScript type definitions

export type IcebergCatalogType =
  | 'file'
  | 'polaris'
  | 'glue'
  | 'hive'
  | 'dynamodb'
  | 'sql'
  | 'bigquery'
  | 'in-memory';

export type IcebergStorageType = 'local' | 'cloud';

export type IcebergCloudProvider = 's3-compatible' | 'aws' | 'azure' | 'gcs';

export interface IcebergInstanceConfig {
  id: string;
  name: string;
  description?: string;
  // Catalog
  catalogType: IcebergCatalogType;
  catalogPath?: string; // file-based: path to metadata.json
  endpoint?: string; // REST: Polaris/Lakekeeper endpoint URL
  catalogName?: string; // REST: catalog name or warehouse
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

export interface IcebergTestCatalogParams {
  catalogType: IcebergCatalogType;
  catalogPath?: string;
  endpoint?: string;
  catalogName?: string;
  connectionId?: string; // resolves credentials from Cloud Explorer
  accessToken?: string; // raw token (not stored yet at test time)
}
