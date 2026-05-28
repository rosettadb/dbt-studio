import { ipcMain } from 'electron';
import AgentMemoryWikiService from '../services/agentMemoryWiki.service';
import { AgentMemoryScope } from '../../types/backend';

export const registerMemoryWikiHandlers = () => {
  ipcMain.handle('memory-wiki:status', async () => {
    return await AgentMemoryWikiService.getStatus();
  });

  ipcMain.handle('memory-wiki:compile', async () => {
    return await AgentMemoryWikiService.compilePending();
  });

  ipcMain.handle('memory-wiki:lint', async (_, scope: AgentMemoryScope) => {
    return await AgentMemoryWikiService.lintScope(scope);
  });
};
