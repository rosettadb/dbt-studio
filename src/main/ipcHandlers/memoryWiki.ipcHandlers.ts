import { ipcMain } from 'electron';
import AgentMemoryWikiService from '../services/agentMemoryWiki.service';
import type { AgentMemoryScope } from '../../types/backend';

export const registerMemoryWikiHandlers = () => {
  ipcMain.handle('memory-wiki:status', () =>
    AgentMemoryWikiService.getStatus(),
  );

  ipcMain.handle('memory-wiki:compile', () =>
    AgentMemoryWikiService.compilePending(),
  );

  ipcMain.handle('memory-wiki:lint', (_, scope: AgentMemoryScope) =>
    AgentMemoryWikiService.lintScope(scope),
  );

  ipcMain.handle('memory-wiki:open-vault', () =>
    AgentMemoryWikiService.openVaultInObsidian(),
  );

  ipcMain.handle(
    'memory-wiki:open-note',
    (_, input: { scopeKey?: string; memoryId?: number }) =>
      AgentMemoryWikiService.openNoteInObsidian(input),
  );

  ipcMain.handle('memory-wiki:open-search', (_, input: { query: string }) =>
    AgentMemoryWikiService.openSearchInObsidian(input),
  );
};
