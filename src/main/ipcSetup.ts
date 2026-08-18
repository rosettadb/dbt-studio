import { BrowserWindow } from 'electron';
import {
  registerCliHandlers,
  registerConnectorsHandlers,
  registerProjectHandlers,
  registerSettingsHandlers,
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
} from './ipcHandlers';
import { installIpcErrorHandling } from './utils/ipcErrorHandler';

const registerHandlers = (mainWindow: BrowserWindow) => {
  installIpcErrorHandling();
  registerCliHandlers(mainWindow);
  registerSettingsHandlers(mainWindow);
  registerProjectHandlers();
  registerConnectorsHandlers();
  registerGitHandlers();
  registerUtilsHandlers();
  registerProcessHandlers(mainWindow);
  registerRunnerHandlers(mainWindow);
  registerSecureStorageHandlers();
  registerUpdateHandlers();
  registerCloudExplorerHandlers();
  registerAIHandlers();
  registerRosettaCloudIpcHandlers();
  registerDuckLakeHandlers();
  registerLineageHandlers();
  registerNotebooksHandlers();
  registerLanguageIntelligenceHandlers();
  registerAgentHandlers();
  registerMCPHandlers();
  registerSkillsHandlers();
  registerSavedQueriesHandlers();
  registerAnalyticsPagesHandlers();
  registerStaticSiteHandlers(mainWindow);
  registerFlowfileHandlers();
  registerPipelineTemplatesHandlers();
  registerTaskManagerHandlers(mainWindow);
  registerSecondBrainHandlers();
};

export default registerHandlers;
