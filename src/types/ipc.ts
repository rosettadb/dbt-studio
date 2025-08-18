import { ConnectionInput, ConnectionModel } from './backend';

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
  | 'settings:restart';

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
  | 'project:getQuery';

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
  | 'connector:delete';

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
  | 'ai:provider:test-connection'
  | 'ai:provider:test-temp-connection'
  | 'ai:provider:get-models'
  | 'ai:provider:get-all-models'
  | 'ai:provider:get-status'
  | 'ai:provider:get-credential'
  | 'ai:provider:health-check'
  | 'ai:provider:cleanup-api-keys'

  // Provider manager
  | 'ai:provider-manager:initialize'

  // AI completion
  | 'ai:completion:generate'

  // Database operations (using main database - not database.json)
  | 'ai:create-conversation'
  | 'ai:get-conversations'
  | 'ai:update-conversation'
  | 'ai:delete-conversation'
  | 'ai:add-message'
  | 'ai:get-messages'
  | 'ai:update-message'
  | 'ai:delete-message'
  | 'ai:create-template'
  | 'ai:get-templates'
  | 'ai:update-template'
  | 'ai:delete-template'
  | 'ai:log-usage'
  | 'ai:get-usage-stats'
  | 'ai:get-database-info'
  | 'ai:test-provider'

  // Modern chat functionality (standardized naming)
  | 'chat:conversation:list'
  | 'chat:conversation:get'
  | 'chat:conversation:create'
  | 'chat:conversation:update'
  | 'chat:conversation:delete'
  | 'chat:message:list'
  | 'chat:message:send'
  | 'chat:message:update'
  | 'chat:message:delete'

  // Modern template functionality (standardized naming)
  | 'ai:template:list'
  | 'ai:template:save'
  | 'ai:template:update'
  | 'ai:template:delete'

  // Modern usage functionality (standardized naming)
  | 'ai:usage:log'
  | 'ai:usage:stats';

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
  | 'git:fileStatusList';

export type UtilChannels =
  | 'open:external'
  | 'windows:openSelector'
  | 'windows:closeSetup';

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
  | 'cloudExplorer:previewData';

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
  | AIChannels;

export type ConfigureConnectionBody = {
  projectId?: string;
  connection?: ConnectionInput;
  connectionId?: string;
};

export type UpdateConnectionBody = {
  connection: ConnectionModel;
};
