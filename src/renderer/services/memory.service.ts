import type { TreeNode } from '../../main/services/ai/memory/memoryIndex';
import type { SearchResult } from '../../main/services/ai/memory/memoryService';

export const getMemoryTree = async (): Promise<TreeNode[]> => {
  return window.electron.ipcRenderer.invoke('memory:tree');
};

export const readMemoryFile = async (relativePath: string): Promise<string> => {
  return window.electron.ipcRenderer.invoke('memory:read', relativePath);
};

export const writeMemoryFile = async (
  relativePath: string,
  content: string,
): Promise<void> => {
  return window.electron.ipcRenderer.invoke(
    'memory:write',
    relativePath,
    content,
  );
};

export const searchMemory = async (query: string): Promise<SearchResult[]> => {
  return window.electron.ipcRenderer.invoke('memory:search', query);
};

export const getMemoryStats = async (): Promise<{
  fileCount: number;
  totalLines: number;
  lastModified: string;
}> => {
  return window.electron.ipcRenderer.invoke('memory:stats');
};

export const openMemoryDir = async (): Promise<string> => {
  return window.electron.ipcRenderer.invoke('memory:open-dir');
};

export const openMemoryTerminal = async (): Promise<void> => {
  return window.electron.ipcRenderer.invoke('memory:open-terminal');
};
