import { ipcMain } from 'electron';
import LanguageIntelligenceService from '../services/languageIntelligence.service';

const handlerChannels = [
  'language-intel:manifest:version',
  'language-intel:models:list',
  'language-intel:sources:list',
  'language-intel:macros:list',
  'language-intel:docs:list',
  'language-intel:variables:list',
  'language-intel:env-vars:list',
] as const;

const removeLanguageIntelligenceHandlers = () => {
  handlerChannels.forEach((channel) => ipcMain.removeHandler(channel));
};

const registerLanguageIntelligenceHandlers = () => {
  removeLanguageIntelligenceHandlers();
  ipcMain.handle('language-intel:manifest:version', (_e, projectId?: string) =>
    LanguageIntelligenceService.getManifestVersion(projectId),
  );
  ipcMain.handle('language-intel:models:list', (_e, projectId?: string) =>
    LanguageIntelligenceService.listModels(projectId),
  );
  ipcMain.handle('language-intel:sources:list', (_e, projectId?: string) =>
    LanguageIntelligenceService.listSources(projectId),
  );
  ipcMain.handle('language-intel:macros:list', (_e, projectId?: string) =>
    LanguageIntelligenceService.listMacros(projectId),
  );
  ipcMain.handle('language-intel:docs:list', (_e, projectId?: string) =>
    LanguageIntelligenceService.listDocs(projectId),
  );
  ipcMain.handle('language-intel:variables:list', (_e, projectId?: string) =>
    LanguageIntelligenceService.listVariables(projectId),
  );
  ipcMain.handle('language-intel:env-vars:list', (_e, projectId?: string) =>
    LanguageIntelligenceService.listEnvVars(projectId),
  );
};

export default registerLanguageIntelligenceHandlers;
