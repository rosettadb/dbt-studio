/**
 * DuckLake Integration Types
 * Core TypeScript interfaces for DuckLake multi-instance management
 */

// Catalog Types
export type DuckLakeCatalogType = 'duckdb' | 'sqlite' | 'postgresql';

export interface DuckLakeCatalogConfig {
  type: DuckLakeCatalogType;
  duckdb?: {
    metadataPath: string;
  };
  sqlite?: {
    metadataPath: string;
  };
  postgresql?: {
    host: string;
    port: number;
    database: string;
    username: string;
    password?: string; // Stored securely via keytar
    ssl: boolean;
  };
}

// Storage Configuration Types
export type DuckLakeStorageType = 'local' | 's3' | 'azure' | 'gcs';

export interface DuckLakeStorageConfig {
  type: DuckLakeStorageType;
  local?: {
    path: string;
  };
  s3?: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string;
    prefix?: string;
  };
  azure?: {
    container: string;
    accountName: string;
    accountKey: string;
    connectionString?: string;
    prefix?: string;
  };
  gcs?: {
    bucket: string;
    projectId: string;
    credentials?: string;
    prefix?: string;
  };
}

// Instance Configuration Types
export type DuckLakeInstanceStatus =
  | 'active'
  | 'inactive'
  | 'error'
  | 'connecting';

export interface DuckLakeRuntimeOptions {
  maxMemory?: string;
  threads?: number;
  enableOptimizer?: boolean;
  tempDirectory?: string;
}

export interface DuckLakeInstance {
  id: string;
  name: string;
  description?: string;
  dataPath: string;
  storage?: DuckLakeStorageConfig;
  catalog: DuckLakeCatalogConfig;
  createdAt: Date;
  updatedAt: Date;
  status: DuckLakeInstanceStatus;
  tags?: string[];
  runtimeOptions?: DuckLakeRuntimeOptions;
}

// Snapshot and Time Travel Types
export type DuckLakeOperation =
  | 'append'
  | 'overwrite'
  | 'delete'
  | 'merge'
  | 'replace';

export interface DuckLakeSnapshotSummary {
  addedFiles: number;
  deletedFiles: number;
  addedRows: number;
  deletedRows: number;
  totalFiles: number;
  totalRows: number;
  totalSize: number;
}

export interface DuckLakeSnapshotInfo {
  id: string;
  tableId: string;
  timestamp: Date;
  operation: DuckLakeOperation;
  summary: DuckLakeSnapshotSummary;
  parentSnapshotId?: string;
}

// Table and Schema Types
export interface DuckLakeColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  comment?: string;
  tags?: Record<string, string>;
}

export interface DuckLakePartitionInfo {
  column: string;
  transform?: string;
  values?: string[];
}

export interface DuckLakeTableInfo {
  name: string;
  schema: string;
  instanceId: string;
  columns: DuckLakeColumnInfo[];
  partitions?: DuckLakePartitionInfo[];
  snapshots: DuckLakeSnapshotInfo[];
  createdAt: Date;
  updatedAt: Date;
  rowCount?: number;
  sizeBytes?: number;
}

// Maintenance and Operations Types
export type DuckLakeMaintenanceType =
  | 'optimize'
  | 'vacuum'
  | 'checkpoint'
  | 'expire_snapshots'
  | 'rewrite_data_files'
  | 'merge_adjacent_files';

export type DuckLakeTaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface DuckLakeMaintenanceResult {
  filesProcessed?: number;
  bytesProcessed?: number;
  filesRemoved?: number;
  bytesRemoved?: number;
  duration: number;
  message?: string;
}

export interface DuckLakeMaintenanceTask {
  id: string;
  instanceId: string;
  type: DuckLakeMaintenanceType;
  status: DuckLakeTaskStatus;
  tableName?: string;
  progress?: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: DuckLakeMaintenanceResult;
}

// Query and Data Access Types
export interface DuckLakeQueryRequest {
  instanceId: string;
  sql: string;
  snapshotId?: string; // For time travel queries
  limit?: number;
  offset?: number;
}

export interface DuckLakeQueryResult {
  columns: Array<{ name: string; type: string }>;
  rows: any[][];
  totalRows?: number;
  executionTime: number;
  snapshotId?: string;
}

// Health and Status Types
export interface DuckLakeInstanceMetrics {
  tableCount: number;
  totalRows: number;
  totalSize: number;
  snapshotCount: number;
  lastActivity?: Date;
}

export interface DuckLakeInstanceHealth {
  instanceId: string;
  status: DuckLakeInstanceStatus;
  lastChecked: Date;
  catalogConnected: boolean;
  extensionLoaded: boolean;
  dataPathAccessible: boolean;
  errors?: string[];
  warnings?: string[];
  metrics?: DuckLakeInstanceMetrics;
}

// Configuration and Settings Types
export interface DuckLakeMaintenanceSchedule {
  enabled: boolean;
  optimizeInterval: number; // hours
  vacuumInterval: number; // hours
  checkpointInterval: number; // hours
  expireSnapshotsAfter: number; // days
}

export interface DuckLakeGlobalConfig {
  defaultCatalogType: DuckLakeCatalogType;
  extensionPath?: string;
  enableExperimentalFeatures: boolean;

  maintenanceSchedule?: DuckLakeMaintenanceSchedule;
}

// Error Types - moved to separate file to avoid class limit
export * from './duckLakeErrors';

// Utility Types
export type DuckLakeInstanceCreateRequest = Omit<
  DuckLakeInstance,
  'id' | 'createdAt' | 'updatedAt' | 'status'
>;
export type DuckLakeInstanceUpdateRequest = Partial<
  Pick<
    DuckLakeInstance,
    | 'name'
    | 'description'
    | 'dataPath'
    | 'catalog'
    | 'storage'
    | 'tags'
    | 'runtimeOptions'
  >
>;

// IPC Channel Types (for type-safe IPC communication)
export interface DuckLakeIpcChannels {
  // Instance Management
  'ducklake:instance:list': () => Promise<DuckLakeInstance[]>;
  'ducklake:instance:get': (id: string) => Promise<DuckLakeInstance>;
  'ducklake:instance:create': (
    request: DuckLakeInstanceCreateRequest,
  ) => Promise<DuckLakeInstance>;
  'ducklake:instance:update': (
    id: string,
    request: DuckLakeInstanceUpdateRequest,
  ) => Promise<DuckLakeInstance>;
  'ducklake:instance:delete': (id: string) => Promise<void>;
  'ducklake:instance:health': (id: string) => Promise<DuckLakeInstanceHealth>;

  // Catalog Management
  'ducklake:catalog:connect': (instanceId: string) => Promise<void>;
  'ducklake:catalog:disconnect': (instanceId: string) => Promise<void>;
  'ducklake:catalog:test': (
    config: DuckLakeCatalogConfig,
  ) => Promise<{ success: boolean; error?: string }>;

  // Table Management
  'ducklake:table:list': (instanceId: string) => Promise<DuckLakeTableInfo[]>;
  'ducklake:table:get': (
    instanceId: string,
    tableName: string,
  ) => Promise<DuckLakeTableInfo>;
  'ducklake:table:create': (
    instanceId: string,
    tableName: string,
    schema: DuckLakeColumnInfo[],
  ) => Promise<void>;
  'ducklake:table:delete': (
    instanceId: string,
    tableName: string,
  ) => Promise<void>;

  // Snapshot Management
  'ducklake:snapshot:list': (
    instanceId: string,
    tableName: string,
  ) => Promise<DuckLakeSnapshotInfo[]>;
  'ducklake:snapshot:restore': (
    instanceId: string,
    tableName: string,
    snapshotId: string,
  ) => Promise<void>;

  // Query Execution
  'ducklake:query:execute': (
    request: DuckLakeQueryRequest,
  ) => Promise<DuckLakeQueryResult>;

  // Maintenance Operations
  'ducklake:maintenance:optimize': (
    instanceId: string,
    tableName?: string,
  ) => Promise<DuckLakeMaintenanceTask>;
  'ducklake:maintenance:vacuum': (
    instanceId: string,
    tableName?: string,
  ) => Promise<DuckLakeMaintenanceTask>;
  'ducklake:maintenance:checkpoint': (
    instanceId: string,
  ) => Promise<DuckLakeMaintenanceTask>;
  'ducklake:maintenance:status': (
    taskId: string,
  ) => Promise<DuckLakeMaintenanceTask>;

  // Storage Management
  'ducklake:storage:stats': () => Promise<{
    instanceCount: number;
    storageSize: number;
    lastModified: Date;
  }>;
  'ducklake:storage:validate': (
    storageConfig: DuckLakeStorageConfig,
  ) => Promise<{ success: boolean; error?: string }>;
}
