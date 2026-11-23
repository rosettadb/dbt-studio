import { BrowserWindow } from 'electron';
import {
  registerCliHandlers,
  registerConnectorsHandlers,
  registerProjectHandlers,
  registerSettingsHandlers,
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
  registerNotebooksHandlers,
  registerLanguageIntelligenceHandlers,
  registerAgentHandlers,
  registerMCPHandlers,
  registerSkillsHandlers,
  registerAnalyticsPagesHandlers,
  registerStaticSiteHandlers,
  registerFlowfileHandlers,
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
  registerAnalyticsPagesHandlers();
  registerStaticSiteHandlers(mainWindow);
  registerFlowfileHandlers();
  registerDbtChartsHandlers();
  registerTaskManagerHandlers(mainWindow);
  registerSecondBrainHandlers();
  registerIcebergDatalakeHandlers();
  registerBackupHandlers(mainWindow);
  // Last, so extensions start after Studio's own handlers are in place.
  registerExtensionHostHandlers(mainWindow);
};

export default registerHandlers;
