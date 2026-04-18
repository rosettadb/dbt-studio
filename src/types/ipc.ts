import { ConnectionInput, ConnectionModel } from './backend';

// ─── Cloud Explorer Operations ───────────────────────────────────────────────
// Requirements: 4.1, 4.6

import { CloudProvider, CloudStorageConfig } from './frontend';

export type TestChannels = 'test:create' | 'test:getAll';

export type SettingsChannels =
  | 'settings:load'
  | 'settings:load-with-db-info'
  | 'settings:save'
  | 'settings:dialog'
  | 'settings:checkCliUpdates'
  | 'settings:updateCli'
  | 'settings:getDbtPath'
  | 'settings:usePathJoin'
  | 'version:rosetta:check'
  | 'version:rosetta:install'
  | 'version:rosetta:uninstall'
  | 'settings:reset-factory'
  | 'settings:restart'
  | 'settings:getFileName'
  | 'settings:getBasename'
  | 'settings:getDirname'
  | 'settings:duckdb:metadata'
  | 'settings:duckdb:refresh'
  | 'settings:duckdb:reinitialize'
  | 'settings:duckdb:diagnose'
  | 'settings:installSqlGlot'
  | 'dbt:versions:list'
  | 'dbt:packageVersions:list'
  | 'dbt:packageVersion:install';

export type ProjectChannels =
  | 'project:get'
  | 'project:list'
  | 'project:add'
  | 'project:update'
  | 'project:delete'
  | 'project:getPath'
  | 'project:getDirectory'
  | 'project:readFile'
  | 'project:updateFile'
  | 'project:configureConnection'
  | 'project:postRosettaDBTCopy'
  | 'project:createFile'
  | 'project:deleteItem'
  | 'project:createFolder'
  | 'project:copyPath'
  | 'project:select'
  | 'project:selected'
  | 'project:extractSchema'
  | 'project:generateDashboardsQuery'
  | 'project:enhanceModelQuery'
  | 'project:extractSchemaFromModelYaml'
  | 'project:zipDir'
  | 'project:addFromVCS'
  | 'project:updateQuery'
  | 'project:getQuery'
  | 'project:chooseDir'
  | 'project:renamePath'
  | 'project:downloadSeed';

export type RosettaCloudChannels =
  | 'rosettaCloud:push'
  | 'rosettaCloud:getProfile'
  | 'rosettaCloud:refreshProfile'
  | 'rosettaCloud:getCachedProfile'
  | 'rosettaCloud:login'
  | 'rosettaCloud:logout'
  | 'rosettaCloud:getApiKey'
  | 'rosettaCloud:storeApiKey'
  | 'rosettaCloud:validateApiKey'
  | 'rosettaCloud:authSuccess'
  | 'rosettaCloud:authError'
  | 'rosettaCloud:apiKeyUpdated'
  | 'rosettaCloud:getSecrets'
  | 'rosettaCloud:deleteSecret';

export type ConnectorChannels =
  | 'connector:configure'
  | 'connector:remove'
  | 'connector:test'
  | 'connector:generateProfiles'
  | 'connector:generateRosetta'
  | 'connector:validate'
  | 'connector:query'
  | 'project:addFromFolder'
  | 'connector:setConnectionEnvVariable'
  | 'connector:list'
  | 'connector:get'
  | 'connector:update'
  | 'connector:delete'
  | 'connector:cancel-query'
  | 'connector:extractSchema'
  | 'connector:updateQuery'
  | 'connector:getQuery'
  | 'connector:executeQuery'
  | 'connector:save';

export type SourcesChannels =
  | 'sources:create'
  | 'sources:update'
  | 'sources:delete'
  | 'sources:getAll'
  | 'sources:test'
  | 'source:list'
  | 'source:create'
  | 'source:delete'
  | 'source:get'
  | 'source:recentItems'
  | 'source:addRecentItem'
  | 'source:deleteRecentItem'
  | 'source:clearRecentItems';

export type AIChannels =
  // Modern provider management channels (standardized)
  | 'ai:provider:list'
  | 'ai:provider:get'
  | 'ai:provider:save'
  | 'ai:provider:update'
  | 'ai:provider:delete'
  | 'ai:provider:get-active'
  | 'ai:provider:set-active'
  | 'ai:provider:deactivate-all'
  | 'ai:provider:test-connection'
  | 'ai:provider:test-temp-connection'
  | 'ai:provider:get-models'
  | 'ai:provider:get-all-models'
  | 'ai:provider:get-credential'
  | 'ai:provider:cleanup-api-keys'

  // AI completion
  | 'ai:completion:generate'

  // Modern chat functionality (standardized naming)
  | 'chat:conversation:list'
  | 'chat:conversation:get'
  | 'chat:conversation:get-with-context'
  | 'chat:conversation:create'
  | 'chat:conversation:update'
  | 'chat:conversation:delete'
  | 'chat:message:list'
  | 'chat:message:list-with-context'
  | 'chat:message:get-with-context'
  | 'chat:message:send'
  | 'chat:message:stream'
  | 'chat:message:stream-chunk'
  | 'chat:message:cancel'
  | 'chat:message:update'
  | 'chat:message:delete'
  | 'chat:message:regenerate'
  | 'chat:message:add-with-context'

  // Continue.dev context management
  | 'chat:context:add-items'
  | 'chat:context:get-items'
  | 'chat:context:resolve-file'
  | 'chat:context:resolve-selected-file'
  | 'chat:context:get-file-metadata'
  | 'chat:context:resolve-folder'
  | 'chat:context:search-codebase'
  | 'chat:context:resolve-url'

  // Continue.dev tool calls
  | 'chat:tool:add-calls'
  | 'chat:tool:get-calls'
  | 'chat:tool:update-call'
  | 'chat:tool:execute'
  | 'chat:tool:cancel'

  // Continue.dev session metadata
  | 'chat:session:set-metadata'
  | 'chat:session:get-metadata'
  | 'chat:session:delete-metadata'

  // Modern template functionality (standardized naming)
  | 'ai:template:list'
  | 'ai:template:save'
  | 'ai:template:update'
  | 'ai:template:delete'

  // Modern usage functionality (standardized naming)
  | 'ai:usage:log'
  | 'ai:usage:stats'
  | 'ai:generateCompletion';

export type CliChannels =
  | 'cli:run'
  | 'cli:input'
  | 'cli:stop'
  | 'cli:output'
  | 'cli:error'
  | 'cli:done'
  | 'cli:setPath'
  | 'cli:status'
  | 'cli:inputRequest'
  | 'cli:clear';

export type GitChannels =
  | 'git:init'
  | 'git:clone'
  | 'git:listBranches'
  | 'git:addRemote'
  | 'git:isInitialized'
  | 'git:getRemotes'
  | 'git:pull'
  | 'git:push'
  | 'git:add'
  | 'git:commit'
  | 'git:checkout'
  | 'git:fileDiff'
  | 'git:fileStatusList'
  | 'git:getLocalChanges'
  | 'git:repoInfo'
  | 'git:fileStatus'
  | 'git:unstage'
  | 'git:stageAll'
  | 'git:unstageAll'
  | 'git:discardChanges'
  | 'git:aheadBehind'
  | 'git:createBranch'
  | 'git:deleteBranch'
  | 'git:renameBranch';

export type UtilChannels =
  | 'open:external'
  | 'windows:openSelector'
  | 'windows:closeSetup'
  | 'utils:getFileContentList'
  | 'utils:open-path'
  | 'utils:run-in-terminal'
  | 'dialog:showOpenDialog'
  | 'dialog:showSaveDialog';

export type ProcessChannels =
  | 'process:start'
  | 'process:status'
  | 'process:stop'
  | 'process:output'
  | 'process:error'
  | 'process:forceStop'
  | 'process:started'
  | 'process:exit'
  | 'process:done';

export type SecureStorageChannels =
  | 'secure-storage:set'
  | 'secure-storage:get'
  | 'secure-storage:delete';

export type UpdateChannels =
  | 'updates:check'
  | 'updates:check-settings'
  | 'updates:download'
  | 'updates:restart'
  | 'updates:reject-version';

export type CloudExplorerChannels =
  | 'cloudExplorer:listBuckets'
  | 'cloudExplorer:listObjects'
  | 'cloudExplorer:getDownloadUrl'
  | 'cloudExplorer:testConnection'
  | 'cloudExplorer:previewData'
  | 'cloudExplorer:uploadFile'
  | 'cloudExplorer:uploadFolder'
  | 'cloudExplorer:createBucket'
  | 'cloudExplorer:deleteObject'
  | 'cloudExplorer:uploadProgress'
  | 'cloudExplorer:createFolder'
  | 'cloudExplorer:deleteBucket';

export type DuckLakeChannels =
  // Extension Management
  | 'ducklake:extension:load'
  | 'ducklake:extension:verify'

  // Instance Management
  | 'ducklake:instance:list'
  | 'ducklake:instance:get'
  | 'ducklake:instance:create'
  | 'ducklake:instance:update'
  | 'ducklake:instance:delete'
  | 'ducklake:instance:health'

  // Instance Attachment (new terminology matching DuckLake SQL)
  | 'ducklake:instance:attach'
  | 'ducklake:instance:detach'

  // Catalog Management (legacy, kept for backward compatibility)
  | 'ducklake:catalog:connect'
  | 'ducklake:catalog:disconnect'
  | 'ducklake:catalog:test'

  // Table Management
  | 'ducklake:table:list'
  | 'ducklake:table:get'
  | 'ducklake:table:import'
  | 'ducklake:table:delete'
  | 'ducklake:table:rename'
  | 'ducklake:table:addColumn'
  | 'ducklake:table:dropColumn'
  | 'ducklake:table:renameColumn'
  | 'ducklake:table:alterColumnType'
  | 'ducklake:table:setPartitionedBy'
  | 'ducklake:table:updateRows'
  | 'ducklake:table:deleteRows'
  | 'ducklake:table:upsertRows'
  | 'ducklake:table:getDetails' // Phase 8b: Table Detail View

  // Snapshot Management
  | 'ducklake:snapshot:list'
  | 'ducklake:instance:listSnapshots'
  | 'ducklake:snapshot:restore'

  // View Management
  | 'ducklake:view:list'
  | 'ducklake:view:getSchema'

  // Query Execution
  | 'ducklake:query:execute'
  | 'ducklake:query:cancel'

  // Schema Extraction
  | 'ducklake:schema:extract'

  // Maintenance Operations
  | 'ducklake:maintenance:optimize'
  | 'ducklake:maintenance:vacuum'
  | 'ducklake:maintenance:checkpoint'
  | 'ducklake:maintenance:status'

  // Storage Management
  | 'ducklake:storage:stats'
  | 'ducklake:storage:validate'

  // Cloud Connection Management
  | 'ducklake:connection:list'
  | 'ducklake:connection:get'
  | 'ducklake:connection:create'
  | 'ducklake:connection:test'
  | 'ducklake:connection:acquire'
  | 'ducklake:connection:release';

export type LineageChannels =
  | 'lineage:getUpstream'
  | 'lineage:getDownstream'
  | 'lineage:getFullLineage'
  | 'lineage:getModelMetadata'
  | 'lineage:getColumnLineage'
  | 'lineage:getCurrentModelId'
  | 'language-intel:manifest:version'
  | 'language-intel:models:list'
  | 'language-intel:sources:list'
  | 'language-intel:macros:list'
  | 'language-intel:docs:list'
  | 'language-intel:variables:list'
  | 'language-intel:env-vars:list';

export type NotebookChannels =
  | 'notebooks:list'
  | 'notebooks:get'
  | 'notebooks:create'
  | 'notebooks:update'
  | 'notebooks:rename'
  | 'notebooks:duplicate'
  | 'notebooks:selectImportFile'
  | 'notebooks:import'
  | 'notebooks:importAll'
  | 'notebooks:delete'
  | 'notebooks:runCell'
  | 'notebooks:fetchCellPage'
  | 'notebooks:runAll'
  | 'notebooks:archived:list'
  | 'notebooks:archived:restore'
  | 'notebooks:archived:delete'
  | 'notebooks:archived:deleteAll';

export type AgentChannels =
  | 'agent:run'
  | 'agent:cancel'
  | 'agent:tool-call'
  | 'agent:step-start'
  | 'agent:terminal-confirm'
  | 'agent:terminal-resolve'
  | 'agent:terminal:confirm-response'
  | 'agent:context-usage'
  | 'agent:context-compacted'
  | 'agent:tools:list'
  | 'ai-settings:load'
  | 'ai-settings:save'
  | 'ai-settings:file-path';

export type MCPChannels =
  | 'mcp:servers:list'
  | 'mcp:server:connect'
  | 'mcp:server:disconnect'
  | 'mcp:server:tools'
  | 'mcp:config:load'
  | 'mcp:config:save'
  | 'mcp:server:add'
  | 'mcp:server:remove'
  | 'mcp:server:toggle'
  | 'mcp:config:file-path';

export type SkillsChannels =
  | 'skills:list'
  | 'skills:get-directory'
  | 'skills:delete'
  | 'skills:create'
  | 'skills:import';

export type Channels =
  | TestChannels
  | CliChannels
  | ProjectChannels
  | SettingsChannels
  | ConnectorChannels
  | GitChannels
  | UtilChannels
  | ProcessChannels
  | SecureStorageChannels
  | UpdateChannels
  | CloudExplorerChannels
  | SourcesChannels
  | RosettaCloudChannels
  | AIChannels
  | DuckLakeChannels
  | LineageChannels
  | NotebookChannels
  | AgentChannels
  | MCPChannels
  | SkillsChannels;

export type ConfigureConnectionBody = {
  projectId?: string;
  connection?: ConnectionInput;
  connectionId?: string;
};

export type UpdateConnectionBody = {
  connection: ConnectionModel;
};

export interface UploadFileRequest {
  provider: CloudProvider;
  config: CloudStorageConfig;
  bucketName: string;
  prefix: string;
  localFilePath: string;
  fileName: string;
}

export interface UploadFileResponse {
  success: boolean;
  objectKey: string;
}

export interface UploadFolderRequest {
  provider: CloudProvider;
  config: CloudStorageConfig;
  bucketName: string;
  prefix: string;
  localFolderPath: string;
}

export interface UploadFolderResponse {
  success: boolean;
  uploadedCount: number;
  failedCount: number;
}

export interface CreateBucketRequest {
  provider: CloudProvider;
  config: CloudStorageConfig;
  bucketName: string;
  region?: string;
}

export interface CreateBucketResponse {
  success: boolean;
  bucketName: string;
}

export interface DeleteObjectRequest {
  provider: CloudProvider;
  config: CloudStorageConfig;
  bucketName: string;
  objectKey: string;
  isPrefix: boolean;
}

export interface DeleteObjectResponse {
  success: boolean;
  deletedCount: number;
}

export interface UploadProgressEvent {
  loaded: number;
  total: number;
  percentage: number;
  // folder upload extras
  fileName?: string;
  fileIndex?: number;
  fileCount?: number;
}

export const UPLOAD_SIZE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
export const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024; // 100 MB
export const S3_BATCH_DELETE_LIMIT = 1000;

export interface CreateFolderRequest {
  provider: CloudProvider;
  config: CloudStorageConfig;
  bucketName: string;
  prefix: string;
  folderName: string;
}

export interface CreateFolderResponse {
  success: boolean;
  objectKey: string;
}

export interface DeleteBucketRequest {
  provider: CloudProvider;
  config: CloudStorageConfig;
  bucketName: string;
}

export interface DeleteBucketResponse {
  success: boolean;
}
