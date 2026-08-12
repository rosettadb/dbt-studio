import { ReactNode } from 'react';
import type * as Monaco from 'monaco-editor';
import { Project, QueryResponseType, Table } from './backend';
import { UserProfile } from './profile';

export type AppContextType = {
  projects: Project[];
  selectedProject: Project;
  sidebarContent: ReactNode;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  setSidebarContent: (sideBarContent: ReactNode) => void;
  schema?: Table[];
  fetchSchema: () => Promise<void>;
  isLoadingSchema?: boolean;
  isAiProviderSet: boolean;
  // Chat sidebar toggle
  isChatOpen?: boolean;
  setIsChatOpen?: (open: boolean) => void;
  pendingMessage: string | null;
  setPendingMessage: (message: string | null) => void;
  openChatWithMessage: (message: string) => void;
  editingFilePath?: string;
  setEditingFilePath: (filePath: string | undefined) => void;
  syncEditorContent?: (path: string, content: string) => void;
  registerSyncEditorContent?: (
    handler?: (path: string, content: string) => void,
  ) => void;
  openFile?: (filePath: string) => void;
  registerOpenFile?: (handler?: (filePath: string) => void) => void;
  closeFile?: (filePath: string) => void;
  registerCloseFile?: (handler?: (filePath: string) => void) => void;
  refreshFileTree?: () => Promise<void>;
  registerRefreshFileTree?: (handler?: () => Promise<void>) => void;
  authenticatedUser?: UserProfile | null;
  env: 'local' | 'cloud';
};

export type ItemProps = {
  label: string;
  typeName?: string;
  primaryKey?: boolean;
  foreignKey?: boolean;
  icon?: string;
};

export type QueryHistoryType = {
  id: string;
  query: string;
  executedAt: Date;
  results?: QueryResponseType;
  // Project-based fields (optional for backwards compatibility)
  projectId?: string;
  projectName?: string;
  // Connection-based fields (new)
  connectionId?: string;
  connectionName?: string;
  // DuckLake-specific fields (new)
  isDuckLake?: boolean;
  instanceId?: string;
};

export type CompletionItem = Monaco.languages.CompletionItem;

export type SecureStorageAccount =
  | 'openai-api-key'
  | `db-user-${string}`
  | `db-password-${string}`
  | `db-token-${string}`
  | `cloud-gcs-${string}`
  | `cloud-aws-${string}`
  | `cloud-azure-${string}`
  | `cloud-minio-${string}`
  | `cloud-cloudflare-r2-${string}`
  | `cloud-backblaze-b2-${string}`
  | `cloud-rustfs-${string}`
  | `cloud-garage-${string}`
  | `iceberg-oauth-secret-${string}`
  | `iceberg-catalog-token-${string}`
  | `db-bigquery-${string}`
  | `db-host-${string}`
  | `db-port-${string}`
  | `db-dbname-${string}`
  | `db-schema-${string}`
  | `db-account-${string}`
  | `db-warehouse-${string}`
  | `db-role-${string}`
  | `db-project-${string}`
  | `db-dataset-${string}`
  | `db-httppath-${string}`
  | `db-catalog-${string}`
  | 'cloud-api-key';

// Cloud Explorer Types
export interface Bucket {
  name: string;
  created?: Date;
  location?: string;
  objectCount?: number;
  size?: number;
}

export interface StorageObject {
  name: string;
  size: number;
  updated?: Date;
  contentType?: string;
  isDirectory: boolean;
}

export interface CloudListResult {
  objects: StorageObject[];
  nextPageToken?: string;
}

export interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export interface AzureConfig {
  accountName: string;
  accountKey?: string;
  connectionString?: string;
}

export interface GCSConfig {
  projectId: string;
  credentials?: any;
}

export interface MinIOConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  useSSL?: boolean;
  region?: string;
}

export interface MinIOPersistedConfig {
  endpoint: string;
  accessKeyId: string;
  useSSL?: boolean;
  region?: string;
}

export interface CloudflareR2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  jurisdiction?: 'eu';
}

export interface CloudflareR2PersistedConfig {
  accountId: string;
  accessKeyId: string;
  jurisdiction?: 'eu';
}

export interface BackblazeB2Config {
  applicationKeyId: string;
  applicationKey: string;
  endpoint?: string;
}

export interface BackblazeB2PersistedConfig {
  applicationKeyId: string;
  endpoint?: string;
}

export interface RustfsConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  useSSL?: boolean;
  region?: string;
}

export interface RustfsPersistedConfig {
  endpoint: string;
  accessKeyId: string;
  useSSL?: boolean;
  region?: string;
}

export interface GarageConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  useSSL?: boolean;
  region?: string;
  urlStyle?: 'path' | 'virtual-host';
}

export interface GaragePersistedConfig {
  endpoint: string;
  accessKeyId: string;
  useSSL?: boolean;
  region?: string;
  urlStyle?: 'path' | 'virtual-host';
}

export type CloudStorageConfig =
  | S3Config
  | AzureConfig
  | GCSConfig
  | MinIOConfig
  | CloudflareR2Config
  | BackblazeB2Config
  | RustfsConfig
  | GarageConfig;

export type CloudStoragePersistedConfig =
  | S3Config
  | AzureConfig
  | GCSConfig
  | MinIOPersistedConfig
  | CloudflareR2PersistedConfig
  | BackblazeB2PersistedConfig
  | RustfsPersistedConfig
  | GaragePersistedConfig;

export type CloudProvider =
  | 'aws'
  | 'azure'
  | 'gcs'
  | 'minio'
  | 'cloudflare-r2'
  | 'backblaze-b2'
  | 'rustfs'
  | 'garage';

export type CloudConnection = {
  id: string;
  name: string;
  provider: CloudProvider;
  config: CloudStoragePersistedConfig;
  created: Date;
  lastUsed?: Date;
};

export type RecentItem = {
  id: string;
  name: string;
  path: string;
  connectionId: string;
  connectionName: string;
  provider: CloudProvider;
  accessedAt: Date;
};

// Cloud Preview Types
export type PreviewResult = {
  success: boolean;
  data?: any[];
  columns?: Array<{ name: string; type: string; nullable?: boolean }>;
  totalRows?: number;
  isEstimatedCount?: boolean;
  page?: number;
  pageSize?: number;
  executionTimeMs?: number;
  detectedFormat?:
    | 'csv'
    | 'json'
    | 'jsonl'
    | 'parquet'
    | 'avro'
    | 'xlsx'
    | 'xls';
  activeWhereClause?: string;
  error?: string;
  objectPath: string;
  previewType: 'sample' | 'schema' | 'stats';
};

export type FilterCondition = {
  id: string;
  column: string;
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE';
  value: string;
};

export type PreviewOptions = {
  provider: CloudProvider;
  cloudConfig: CloudStorageConfig;
  objectPath: string;
  previewType?: 'sample' | 'schema' | 'stats';
  limit?: number;
  page?: number;
  pageSize?: number;
  whereClause?: string;
  filterConditions?: FilterCondition[];
  knownTotalRows?: number;
};

export type ColumnStat = {
  columnName: string;
  columnType: string;
  nullCount: number | null;
  distinctCount: number | null;
  min: string | null;
  max: string | null;
  mean: string | null;
  isSampleBased: boolean;
};

export type DatabaseSources = {
  cloudConnections: CloudConnection[];
  recentItems: RecentItem[];
};

// ── Analytics Query Types ──────────────────────────────────────────────────
export type AnalyticsQueryCache = Record<string, Record<string, unknown>[]>;
export type AnalyticsQueryStatus = 'idle' | 'running' | 'success' | 'error';
export type AnalyticsQueryStatuses = Record<string, AnalyticsQueryStatus>;
export type AnalyticsQueryErrors = Record<string, string | null>;
export type AnalyticsQueryDurations = Record<string, number | undefined>;
