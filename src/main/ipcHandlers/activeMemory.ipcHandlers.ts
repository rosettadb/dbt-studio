import { ipcMain } from 'electron';
import ActiveMemoryService from '../services/activeMemory.service';

export const registerActiveMemoryHandlers = () => {
  ipcMain.handle(
    'active-memory:diagnostics:list',
    async (_event, limit: number) => ActiveMemoryService.listDiagnostics(limit),
  );
  ipcMain.handle('active-memory:diagnostics:clear', async () =>
    ActiveMemoryService.clearDiagnostics(),
  );
};
