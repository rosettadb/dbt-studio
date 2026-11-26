import registerCliHandlers from './cli.ipcHandlers';
import registerProjectHandlers from './projects.ipcHandlers';
import registerSettingsHandlers from './settings.ipcHandlers';
import registerConnectorsHandlers from './connectors.ipcHandlers';
import registerGitHandlers from './git.ipcHandlers';
import registerUtilsHandlers from './utils.ipcHandlers';
import registerProcessHandlers from './process.ipcHandlers';
import registerSecureStorageHandlers from './secureStorage.ipcHandlers';
import registerUpdateHandlers from './updates.ipcHandlers';
import registerCloudExplorerHandlers from './cloudExplorer.ipcHandlers';
import registerAIHandlers from './ai.ipcHandlers';
import registerRosettaCloudIpcHandlers from './rosettaCloud.ipcHandlers';
import registerDuckLakeHandlers from './duckLake.ipcHandlers';
import registerLineageHandlers from './lineage.ipcHandlers';
import registerLanguageIntelligenceHandlers from './languageIntelligence.ipcHandlers';
import { registerAgentHandlers } from './agent.ipcHandlers';
import { registerMCPHandlers } from './mcp.ipcHandlers';
import { registerSkillsHandlers } from './skills.ipcHandlers';
import registerFlowfileHandlers from './flowfile.ipcHandlers';
import registerTaskManagerHandlers from './taskManager.ipcHandlers';
import { registerSecondBrainHandlers } from './secondBrain.ipcHandlers';
import { registerIcebergDatalakeHandlers } from './icebergDatalake.ipcHandlers';
import registerBackupHandlers from './backup.ipcHandlers';
import registerPtyHandlers from './pty.ipcHandlers';

export {
  registerPtyHandlers,
  registerCliHandlers,
  registerProjectHandlers,
  registerSettingsHandlers,
  registerConnectorsHandlers,
  registerGitHandlers,
  registerUtilsHandlers,
  registerProcessHandlers,
  registerSecureStorageHandlers,
  registerUpdateHandlers,
  registerCloudExplorerHandlers,
  registerAIHandlers,
  registerRosettaCloudIpcHandlers,
  registerDuckLakeHandlers,
  registerLineageHandlers,
  registerLanguageIntelligenceHandlers,
  registerAgentHandlers,
  registerMCPHandlers,
  registerSkillsHandlers,
  registerFlowfileHandlers,
  registerTaskManagerHandlers,
  registerSecondBrainHandlers,
  registerIcebergDatalakeHandlers,
  registerBackupHandlers,
};
