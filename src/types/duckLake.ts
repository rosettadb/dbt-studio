/**
 * Column definition from ducklake_column table
 */
export interface DuckLakeColumnDetail {
  columnId: number;
  columnName: string;
  columnType: string;
  columnOrder: number;
  nullsAllowed: boolean;
  defaultValue?: string;
  initialDefault?: string;
  parentColumn?: number;
  beginSnapshot: number;
  endSnapshot: number | null;
}

/**
 * Table-level statistics from ducklake_table_stats
 */
export interface DuckLakeTableStats {
  tableId: number;
  recordCount: number;
  nextRowId: number;
  fileSizeBytes: number;
}

/**
 * Column-level statistics from ducklake_table_column_stats
 */
export interface DuckLakeColumnStats {
  tableId: number;
  columnId: number;
  columnName: string; // Joined from ducklake_column
  containsNull: boolean;
  containsNan: boolean;
  minValue?: string;
  maxValue?: string;
  extraStats?: string;
}

/**
 * Data file information from ducklake_data_file
 */
export interface DuckLakeDataFileInfo {
  dataFileId: number;
  tableId: number;
  path: string;
  pathIsRelative: boolean;
  fileFormat: string;
  recordCount: number;
  fileSizeBytes: number;
  footerSize: number;
  rowIdStart: number;
  fileOrder: number;
  beginSnapshot: number;
  endSnapshot: number | null;
  partitionId?: number;
  encryptionKey?: string;
  partialFileInfo?: string;
  mappingId?: number;
}

/**
 * File-level column statistics from ducklake_file_column_stats
 */
export interface DuckLakeFileColumnStats {
  dataFileId: number;
  tableId: number;
  columnId: number;
  columnName: string; // Joined from ducklake_column
  columnSizeBytes: number;
  valueCount: number;
  nullCount: number;
  minValue?: string;
  maxValue?: string;
  containsNan: boolean;
  extraStats?: string;
}

/**
 * Partition column from ducklake_partition_column
 */
export interface DuckLakePartitionColumn {
  partitionId: number;
  tableId: number;
  partitionKeyIndex: number;
  columnId: number;
  columnName: string; // Joined from ducklake_column
  transform?: string;
}

/**
 * File partition values from ducklake_file_partition_value
 */
export interface DuckLakeFilePartitionValue {
  dataFileId: number;
  tableId: number;
  partitionKeyIndex: number;
  partitionValue: string;
}

/**
 * Partition information aggregated from multiple tables
 */
export interface DuckLakePartitionDetail {
  partitionId: number;
  tableId: number;
  beginSnapshot: number;
  endSnapshot: number | null;
  columns: DuckLakePartitionColumn[];
  filePartitionValues: DuckLakeFilePartitionValue[];
}

/**
 * Snapshot information from ducklake_snapshot + ducklake_snapshot_changes
 */
export interface DuckLakeSnapshotDetail {
  snapshotId: number;
  snapshotTime: Date;
  schemaVersion: number;
  nextCatalogId: number;
  nextFileId: number;
  changesMade?: string;
  author?: string;
  commitMessage?: string;
  commitExtraInfo?: string;
}

export type DuckLakeChangeOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export interface DuckLakeTableChange {
  operation: DuckLakeChangeOperation;
  snapshotId?: number;
  row: Record<string, unknown>;
}

/**
 * Table-level tag from ducklake_tag
 */
export interface DuckLakeTag {
  objectId: number;
  key: string;
  value: string;
  beginSnapshot: number;
  endSnapshot: number | null;
}

/**
 * Column-level tag from ducklake_column_tag
 */
export interface DuckLakeColumnTag {
  tableId: number;
  columnId: number;
  columnName: string; // Joined from ducklake_column
  key: string;
  value: string;
  beginSnapshot: number;
  endSnapshot: number | null;
}

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

  // NEW: Cloud Explorer connection integration
  // Reference to CloudConnection.id for reusing existing connections
  connectionId?: string;

  // DataLake-specific properties (used with connectionId)
  bucket?: string; // Bucket/container name
  prefix?: string; // Folder prefix within bucket

  // Local storage (no connection needed)
  local?: {
    path: string;
  };

  // Legacy: Inline configs for backward compatibility
  // These are used when connectionId is not provided
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
  lastChecked: Date | string;
  catalogConnected: boolean;
  extensionLoaded: boolean;
  dataPathAccessible: boolean;
  storageConnected?: boolean;
  storageLocation?: string;
  errors?: string[];
  warnings?: string[];
  metrics?: DuckLakeInstanceMetrics;
}

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
  createdAt: Date | string;
  updatedAt: Date | string;
  /**
   * Operational status of the instance configuration
   *
   * - `'active'`: Configuration validated and ready to use
   * - `'inactive'`: Not yet validated or disabled by user
   * - `'error'`: Configuration issue detected, needs attention
   * - `'connecting'`: Currently establishing initial connection (rarely used)
   *
   * **Important**: This represents configuration/operational state, NOT connection state.
   * Connections are managed lazily by the ConnectionManager and auto-cleanup after idle timeout.
   *
   * **When to update:**
   * - ✅ Instance created successfully → 'active'
   * - ✅ Configuration validated → 'active'
   * - ✅ Health check fails → 'error'
   * - ✅ User disables instance → 'inactive'
   * - ❌ Do NOT update on connection establish/close (lazy connections)
   */
  status: DuckLakeInstanceStatus;
  tags?: string[];
  runtimeOptions?: DuckLakeRuntimeOptions;
  runtime?: DuckLakeRuntimeOptions; // Alias for UI components

  // Hydrated data for UI
  health?: DuckLakeInstanceHealth;
  stats?: {
    tableCount: number;
    totalSize: number;
    lastQuery: string;
    queryCount: number;
  };
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
  author?: string;
  commitMessage?: string;
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

// ============================================================================
// Phase 8b: Table Detail Types (Metadata Catalog Integration)
// ============================================================================

/**
 * Comprehensive table details from DuckLake metadata catalog
 * Aggregates information from multiple metadata tables
 */
export interface DuckLakeTableDetails {
  // Basic Info (from ducklake_table)
  tableId: number;
  tableUuid: string;
  tableName: string;
  schemaId: number;
  schemaName: string;
  beginSnapshot: number;
  endSnapshot: number | null;
  path?: string;
  pathIsRelative?: boolean;

  // Schema (from ducklake_column)
  columns: DuckLakeColumnDetail[];

  // Statistics (from ducklake_table_stats)
  stats: DuckLakeTableStats;

  // Column Statistics (from ducklake_table_column_stats)
  columnStats: DuckLakeColumnStats[];

  // Data Files (from ducklake_data_file)
  dataFiles: DuckLakeDataFileInfo[];

  // Partitioning (from ducklake_partition_info, ducklake_partition_column, ducklake_file_partition_value)
  partitionInfo?: DuckLakePartitionDetail;

  // Snapshots (from ducklake_snapshot + ducklake_snapshot_changes)
  snapshots: DuckLakeSnapshotDetail[];

  // Tags (from ducklake_tag and ducklake_column_tag)
  tags: DuckLakeTag[];
  columnTags: DuckLakeColumnTag[];
}

export interface DuckLakeSnapshotParams {
  page: number;
  pageSize: number;
  filter?: string;
}

export interface DuckLakePaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

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
  'ducklake:table:rename': (
    instanceId: string,
    oldName: string,
    newName: string,
  ) => Promise<void>;
  'ducklake:table:addColumn': (
    instanceId: string,
    tableName: string,
    columnDef: any,
  ) => Promise<void>;
  'ducklake:table:dropColumn': (
    instanceId: string,
    tableName: string,
    columnName: string,
  ) => Promise<void>;
  'ducklake:table:renameColumn': (
    instanceId: string,
    tableName: string,
    oldName: string,
    newName: string,
  ) => Promise<void>;
  'ducklake:table:alterColumnType': (
    instanceId: string,
    tableName: string,
    columnName: string,
    newType: string,
  ) => Promise<void>;
  'ducklake:table:setPartitionedBy': (
    instanceId: string,
    tableName: string,
    columnNames: string[],
  ) => Promise<void>;
  'ducklake:table:updateRows': (
    instanceId: string,
    tableName: string,
    filter: any,
    updates: any,
  ) => Promise<number>;
  'ducklake:table:deleteRows': (
    instanceId: string,
    tableName: string,
    filter: any,
  ) => Promise<number>;
  'ducklake:table:upsertRows': (
    instanceId: string,
    tableName: string,
    rows: any[],
  ) => Promise<number>;
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

  // Table Details (Phase 8b)
  'ducklake:table:getDetails': (
    instanceId: string,
    tableName: string,
  ) => Promise<DuckLakeTableDetails>;

  // Instance Snapshots (Phase: History Fix)
  'ducklake:instance:listSnapshots': (
    instanceId: string,
    params: DuckLakeSnapshotParams,
  ) => Promise<DuckLakePaginatedResult<DuckLakeSnapshotDetail>>;

  // Cloud Connection Management (Phase: Connection Integration)
  'ducklake:connection:list': () => Promise<any[]>; // Returns CloudConnection[]
  'ducklake:connection:get': (id: string) => Promise<any | null>; // Returns CloudConnection | null
  'ducklake:connection:create': (connection: any) => Promise<any>; // CloudConnection
  'ducklake:connection:test': (params: {
    provider: 'aws' | 'azure' | 'gcs';
    config: any;
  }) => Promise<boolean>;
}
