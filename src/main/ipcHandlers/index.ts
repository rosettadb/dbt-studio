import registerCliHandlers from './cli.ipcHandlers';
import registerProjectHandlers from './projects.ipcHandlers';
import registerSettingsHandlers from './settings.ipcHandlers';
import registerConnectorsHandlers from './connectors.ipcHandlers';
import registerGitHandlers from './git.ipcHandlers';
import registerUtilsHandlers from './utils.ipcHandlers';
import registerProcessHandlers from './process.ipcHandlers';
import registerRunnerHandlers from './runner.ipcHandlers';
import registerSecureStorageHandlers from './secureStorage.ipcHandlers';
import registerUpdateHandlers from './updates.ipcHandlers';
import registerCloudExplorerHandlers from './cloudExplorer.ipcHandlers';
import registerAIHandlers from './ai.ipcHandlers';
import registerRosettaCloudIpcHandlers from './rosettaCloud.ipcHandlers';
import registerDuckLakeHandlers from './duckLake.ipcHandlers';
import registerLineageHandlers from './lineage.ipcHandlers';
import { registerNotebooksHandlers } from './notebooks.ipcHandlers';
import registerLanguageIntelligenceHandlers from './languageIntelligence.ipcHandlers';
import { registerAgentHandlers } from './agent.ipcHandlers';
import { registerMCPHandlers } from './mcp.ipcHandlers';
import { registerSkillsHandlers } from './skills.ipcHandlers';
import registerSavedQueriesHandlers from './savedQueries.ipcHandlers';
import { registerAnalyticsPagesHandlers } from './analyticsPages.ipcHandlers';
import { registerStaticSiteHandlers } from './staticSite.ipcHandlers';
import registerFlowfileHandlers from './flowfile.ipcHandlers';
import { registerPipelineTemplatesHandlers } from './pipelineTemplates.ipcHandlers';
import registerTaskManagerHandlers from './taskManager.ipcHandlers';
import { registerSecondBrainHandlers } from './secondBrain.ipcHandlers';
import registerBackupHandlers from './backup.ipcHandlers';

export {
  registerCliHandlers,
  registerProjectHandlers,
  registerSettingsHandlers,
  registerConnectorsHandlers,
  registerGitHandlers,
  registerUtilsHandlers,
  registerProcessHandlers,
  registerRunnerHandlers,
  registerSecureStorageHandlers,
  registerUpdateHandlers,
  registerCloudExplorerHandlers,
  registerAIHandlers,
  registerRosettaCloudIpcHandlers,
  registerDuckLakeHandlers,
  registerLineageHandlers,
  registerNotebooksHandlers,
  registerLanguageIntelligenceHandlers,
  registerAgentHandlers,
  registerMCPHandlers,
  registerSkillsHandlers,
  registerSavedQueriesHandlers,
  registerAnalyticsPagesHandlers,
  registerStaticSiteHandlers,
  registerFlowfileHandlers,
  registerPipelineTemplatesHandlers,
  registerTaskManagerHandlers,
  registerSecondBrainHandlers,
  registerBackupHandlers,
};
