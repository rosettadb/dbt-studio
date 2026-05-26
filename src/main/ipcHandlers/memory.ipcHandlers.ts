import { ipcMain } from 'electron';
import AgentMemoryService from '../services/agentMemory.service';
import AgentMemorySchedulerService from '../services/agentMemoryScheduler.service';
import type {
  AgentMemoryDreamingReportListFilter,
  AgentMemoryDreamingRunListFilter,
  AgentMemoryEntryIdRequest,
  AgentMemoryListFilter,
  AgentMemorySearchRequest,
  AgentMemoryShortTermRecallListFilter,
  AgentMemoryUpdateEntryRequest,
  NewAgentMemoryEntry,
} from '../../types/backend';

const handlerChannels = [
  'memory:list',
  'memory:search',
  'memory:stats',
  'memory:health',
  'memory:create',
  'memory:update',
  'memory:archive',
  'memory:delete',
  'memory:refresh-database-context',
  'memory:short-term:list',
  'memory:dreaming:run',
  'memory:dreaming:list',
  'memory:dreaming:reports:list',
  'memory:index:rebuild',
];

const removeMemoryHandlers = () => {
  handlerChannels.forEach((channel) => ipcMain.removeHandler(channel));
};

const registerMemoryHandlers = () => {
  removeMemoryHandlers();

  ipcMain.handle('memory:list', async (_event, filter: AgentMemoryListFilter) =>
    AgentMemoryService.listEntries(filter),
  );

  ipcMain.handle(
    'memory:search',
    async (_event, request: AgentMemorySearchRequest) =>
      AgentMemoryService.searchEntries(request),
  );

  ipcMain.handle('memory:stats', async () => AgentMemoryService.getStats());

  ipcMain.handle('memory:health', async () => AgentMemoryService.getHealth());

  ipcMain.handle('memory:create', async (_event, input: NewAgentMemoryEntry) =>
    AgentMemoryService.createEntry(input),
  );

  ipcMain.handle(
    'memory:update',
    async (_event, { id, patch }: AgentMemoryUpdateEntryRequest) =>
      AgentMemoryService.updateEntry(id, patch),
  );

  ipcMain.handle(
    'memory:archive',
    async (_event, { id }: AgentMemoryEntryIdRequest) =>
      AgentMemoryService.archiveEntry(id),
  );

  ipcMain.handle(
    'memory:delete',
    async (_event, { id }: AgentMemoryEntryIdRequest) =>
      AgentMemoryService.deleteEntry(id),
  );

  ipcMain.handle(
    'memory:refresh-database-context',
    async (_event, opts: { dryRun?: boolean } = {}) =>
      AgentMemoryService.refreshDatabaseJsonMemory(opts),
  );

  ipcMain.handle(
    'memory:short-term:list',
    async (_event, filter: AgentMemoryShortTermRecallListFilter) =>
      AgentMemoryService.listShortTermRecall(filter),
  );

  ipcMain.handle('memory:dreaming:run', async () =>
    AgentMemorySchedulerService.runNow(),
  );

  ipcMain.handle(
    'memory:dreaming:list',
    async (_event, filter: AgentMemoryDreamingRunListFilter) =>
      AgentMemoryService.listDreamingRuns(filter),
  );

  ipcMain.handle(
    'memory:dreaming:reports:list',
    async (_event, filter: AgentMemoryDreamingReportListFilter) =>
      AgentMemoryService.listDreamingReports(filter),
  );

  ipcMain.handle('memory:index:rebuild', async () =>
    AgentMemoryService.rebuildIndex(),
  );
};

export default registerMemoryHandlers;
