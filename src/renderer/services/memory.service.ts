import type { TreeNode } from '../../main/services/ai/memory/memoryIndex';
import type { SearchResult } from '../../main/services/ai/memory/memoryService';
import type {
  ScanProgress,
  ScanResult,
} from '../../main/services/ai/memory/memoryScanner';

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

export const startMemoryScan = async (
  projectPath?: string,
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScanResult> => {
  const cleanup = onProgress
    ? window.electron.ipcRenderer.on(
        'memory:scan-progress',
        (...args: unknown[]) => {
          const data = args[0] as ScanProgress;
          onProgress(data);
        },
      )
    : null;
  const result = await window.electron.ipcRenderer.invoke('memory:scan-start', {
    projectPath,
  });
  if (cleanup) cleanup();
  return result as ScanResult;
};

export const cancelMemoryScan = async (): Promise<void> => {
  await window.electron.ipcRenderer.invoke('memory:scan-cancel');
};
