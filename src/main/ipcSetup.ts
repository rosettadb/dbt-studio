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
  registerDuckLakeHandlers,
  registerLineageHandlers,
  registerLanguageIntelligenceHandlers,
} from './ipcHandlers';

const registerHandlers = (mainWindow: BrowserWindow) => {
  registerCliHandlers(mainWindow);
  registerSettingsHandlers(mainWindow);
  registerProjectHandlers();
  registerConnectorsHandlers();
  registerGitHandlers();
  registerUtilsHandlers();
  registerProcessHandlers(mainWindow);
  registerSecureStorageHandlers();
  registerUpdateHandlers();
  registerCloudExplorerHandlers();
  registerAIHandlers();
  registerDuckLakeHandlers();
  registerLineageHandlers();
  registerLanguageIntelligenceHandlers();
};

export default registerHandlers;
