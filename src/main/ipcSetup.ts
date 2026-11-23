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
  registerIcebergDatalakeHandlers,
  registerBackupHandlers,
  registerPythonNotebooksHandlers,
  registerPtyHandlers,
} from './ipcHandlers';
import registerDbtChartsHandlers from './ipcHandlers/dbtCharts.ipcHandlers';
import { installIpcErrorHandling } from './utils/ipcErrorHandler';
import { registerExtensionHostHandlers } from '../extensionHost/main/ipc.main';

const registerHandlers = (mainWindow: BrowserWindow) => {
  installIpcErrorHandling();
  registerCliHandlers(mainWindow);
  registerSettingsHandlers(mainWindow);
  registerProjectHandlers();
  registerConnectorsHandlers();
  registerGitHandlers();
  registerUtilsHandlers();
  registerProcessHandlers(mainWindow);
  registerPtyHandlers(mainWindow);
  registerRunnerHandlers(mainWindow);
  registerSecureStorageHandlers();
  registerUpdateHandlers();
  registerCloudExplorerHandlers();
  registerAIHandlers();
  registerRosettaCloudIpcHandlers();
  registerDuckLakeHandlers();
  registerLineageHandlers();
  registerNotebooksHandlers();
  registerPythonNotebooksHandlers();
  registerLanguageIntelligenceHandlers();
  registerAgentHandlers();
  registerMCPHandlers();
  registerSkillsHandlers();
  registerSavedQueriesHandlers();
  registerAnalyticsPagesHandlers();
  registerStaticSiteHandlers(mainWindow);
  registerFlowfileHandlers();
  registerDbtChartsHandlers();
  registerPipelineTemplatesHandlers();
  registerTaskManagerHandlers(mainWindow);
  registerSecondBrainHandlers();
  registerIcebergDatalakeHandlers();
  registerBackupHandlers(mainWindow);
  // Last, so extensions start after Studio's own handlers are in place.
  registerExtensionHostHandlers();
};

export default registerHandlers;
