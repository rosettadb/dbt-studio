import { ipcMain } from 'electron';
import {
  readMemoryFile,
  searchMemory,
  getMemoryStats,
} from '../services/ai/memory/memoryService';
import { readTreeIndex } from '../services/ai/memory/memoryIndex';

export function registerMemoryHandlers() {
  ipcMain.handle('memory:tree', async () => {
    return readTreeIndex();
  });

  ipcMain.handle('memory:read', async (event, relativePath: string) => {
    return readMemoryFile(relativePath);
  });

  ipcMain.handle('memory:search', async (event, query: string) => {
    return searchMemory(query);
  });

  ipcMain.handle('memory:stats', async () => {
    return getMemoryStats();
  });
}
