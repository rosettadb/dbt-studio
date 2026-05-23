import { ipcMain, shell } from 'electron';
import { exec } from 'child_process';
import {
  readMemoryFile,
  writeMemoryFile,
  searchMemory,
  getMemoryStats,
  MEMORY_ROOT,
} from '../services/ai/memory/memoryService';
import { readTreeIndex } from '../services/ai/memory/memoryIndex';

export function registerMemoryHandlers() {
  ipcMain.handle('memory:tree', async () => {
    return readTreeIndex();
  });

  ipcMain.handle('memory:read', async (event, relativePath: string) => {
    return readMemoryFile(relativePath);
  });

  ipcMain.handle(
    'memory:write',
    async (event, relativePath: string, content: string) => {
      await writeMemoryFile(relativePath, content, 'overwrite');
    },
  );

  ipcMain.handle('memory:search', async (event, query: string) => {
    return searchMemory(query);
  });

  ipcMain.handle('memory:stats', async () => {
    return getMemoryStats();
  });

  ipcMain.handle('memory:open-dir', async () => {
    return shell.openPath(MEMORY_ROOT);
  });

  ipcMain.handle('memory:open-terminal', async () => {
    const { platform } = process;
    if (platform === 'darwin') {
      exec(`open -a Terminal "${MEMORY_ROOT}"`);
    } else if (platform === 'win32') {
      exec(`start cmd /K "cd /d ${MEMORY_ROOT}"`);
    } else {
      exec(`x-terminal-emulator -e "cd ${MEMORY_ROOT} && bash"`);
    }
  });
}
