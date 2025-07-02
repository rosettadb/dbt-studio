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
};

export default registerHandlers;
