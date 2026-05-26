import type {
  AgentMemoryDreamingReport,
  AgentMemoryDreamingReportListFilter,
  AgentMemoryDreamingRun,
  AgentMemoryDreamingRunListFilter,
  AgentMemoryDreamingRunNowResult,
  AgentMemoryEntry,
  AgentMemoryHealth,
  AgentMemoryListFilter,
  AgentMemoryRefreshResult,
  AgentMemorySearchRequest,
  AgentMemorySearchResult,
  AgentMemoryStats,
  NewAgentMemoryEntry,
} from '../../types/backend';

export const getMemoryStats = async (): Promise<AgentMemoryStats> =>
  window.electron.ipcRenderer.invoke('memory:stats');

export const getMemoryHealth = async (): Promise<AgentMemoryHealth> =>
  window.electron.ipcRenderer.invoke('memory:health');

export const listMemoryEntries = async (
  filter: AgentMemoryListFilter = {},
): Promise<AgentMemoryEntry[]> =>
  window.electron.ipcRenderer.invoke('memory:list', filter);

export const searchMemory = async (
  request: AgentMemorySearchRequest,
): Promise<AgentMemorySearchResult[]> =>
  window.electron.ipcRenderer.invoke('memory:search', request);

export const createMemoryEntry = async (
  input: NewAgentMemoryEntry,
): Promise<AgentMemoryEntry> =>
  window.electron.ipcRenderer.invoke('memory:create', input);

export const updateMemoryEntry = async (
  id: number,
  patch: Partial<NewAgentMemoryEntry>,
): Promise<void> =>
  window.electron.ipcRenderer.invoke('memory:update', { id, patch });

export const archiveMemoryEntry = async (id: number): Promise<void> =>
  window.electron.ipcRenderer.invoke('memory:archive', { id });

export const deleteMemoryEntry = async (id: number): Promise<void> =>
  window.electron.ipcRenderer.invoke('memory:delete', { id });

export const refreshDatabaseContext = async (
  opts: { dryRun?: boolean } = {},
): Promise<AgentMemoryRefreshResult> =>
  window.electron.ipcRenderer.invoke('memory:refresh-database-context', opts);

export const runDreaming = async (): Promise<AgentMemoryDreamingRunNowResult> =>
  window.electron.ipcRenderer.invoke('memory:dreaming:run');

export const listDreamingRuns = async (
  filter: AgentMemoryDreamingRunListFilter = {},
): Promise<AgentMemoryDreamingRun[]> =>
  window.electron.ipcRenderer.invoke('memory:dreaming:list', filter);

export const listDreamingReports = async (
  filter: AgentMemoryDreamingReportListFilter = {},
): Promise<AgentMemoryDreamingReport[]> =>
  window.electron.ipcRenderer.invoke('memory:dreaming:reports:list', filter);

export const rebuildIndex = async (): Promise<void> =>
  window.electron.ipcRenderer.invoke('memory:index:rebuild');
