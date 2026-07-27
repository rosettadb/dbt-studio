import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type {
  SecondBrainArchiveRequest,
  SecondBrainDisableResult,
  SecondBrainProgressEvent,
  SecondBrainRestoreRequest,
  SecondBrainWriteRequest,
} from '../../types/secondBrain';
import { loadAISettings, saveAISettings } from '../services/agent.service';
import SecondBrainRefreshCoordinator from '../services/ai/secondBrain/secondBrainRefreshCoordinator.service';
import SecondBrainService, {
  isSecondBrainGeneratedPageId,
  normalizeSecondBrainPageId,
} from '../services/ai/secondBrain/secondBrain.service';
import { SecondBrainError } from '../services/ai/secondBrain/secondBrain.types';

const channels = [
  'second-brain:status',
  'second-brain:tree',
  'second-brain:read',
  'second-brain:write',
  'second-brain:search',
  'second-brain:archive',
  'second-brain:init',
  'second-brain:update-preview',
  'second-brain:update-apply',
  'second-brain:pause',
  'second-brain:clear-and-disable',
  'second-brain:cancel',
  'second-brain:revisions',
  'second-brain:revision-read',
  'second-brain:restore',
  'second-brain:open-wiki-folder',
  'second-brain:open-wiki-terminal',
] as const;

let registered = false;

const requireString = (value: unknown, field: string, max = 500): string => {
  if (typeof value !== 'string' || !value || value.length > max) {
    throw new SecondBrainError(
      'INVALID_CONTENT',
      `Invalid Wiki Memory ${field}.`,
    );
  }
  return value;
};

const requirePageId = (value: unknown): string =>
  normalizeSecondBrainPageId(requireString(value, 'page ID', 240));

const createService = async (): Promise<SecondBrainService> => {
  const settings = await loadAISettings();
  return new SecondBrainService({
    maxPageBytes: settings.secondBrain.maxPageBytes,
    maxTotalBytes: settings.secondBrain.maxTotalBytes,
  });
};

const refreshCoordinator = new SecondBrainRefreshCoordinator({
  isEnabled: async () => (await loadAISettings()).secondBrain.enabled,
  createService,
});

const refreshOwner = (event: IpcMainInvokeEvent) => ({
  ownerId: event.sender.id,
  isDestroyed: () => event.sender.isDestroyed(),
  onDestroyed: (callback: () => void) => {
    event.sender.once('destroyed', callback);
    return () => event.sender.removeListener('destroyed', callback);
  },
  emitProgress: (progress: SecondBrainProgressEvent) =>
    event.sender.send('second-brain:progress', progress),
});

export const registerSecondBrainHandlers = (): void => {
  if (registered) return;
  registered = true;

  ipcMain.handle('second-brain:status', async () => {
    const settings = await loadAISettings();
    const service = await createService();
    const status = await service.getStatus();
    const operationStatus = refreshCoordinator.getStatus();
    return {
      enabled: settings.secondBrain.enabled,
      initialized: status.initialized,
      pageCount: status.pageCount,
      totalBytes: status.totalBytes,
      lastSuccessfulRefreshAt: status.lastSuccessfulRefreshAt,
      busy: operationStatus.busy,
      activeOperationId: operationStatus.activeOperationId,
      layoutVersion: status.layoutVersion,
      okfVersion: status.okfVersion,
    };
  });

  ipcMain.handle('second-brain:tree', async (_event, includeArchived = true) =>
    (await createService()).listManagedPages(Boolean(includeArchived)),
  );

  ipcMain.handle(
    'second-brain:read',
    async (_event, input: { pageId: string; archived?: boolean }) => {
      const pageId = requirePageId(input?.pageId);
      const service = await createService();
      if (input.archived) return service.readArchivedPage(pageId);
      const page = await service.readPage(pageId);
      return {
        ...page,
        archived: false,
        readOnly: isSecondBrainGeneratedPageId(pageId),
      };
    },
  );

  ipcMain.handle(
    'second-brain:write',
    async (_event, input: SecondBrainWriteRequest) =>
      (await createService()).writePage({
        pageId: requirePageId(input?.pageId),
        content: requireString(input?.content, 'Markdown', 128 * 1024),
        expectedHash: input?.expectedHash,
        actor: 'user',
      }),
  );

  ipcMain.handle(
    'second-brain:search',
    async (_event, input: { query: string; limit?: number }) =>
      (await createService()).searchManagedPages(
        requireString(input?.query, 'search query', 500),
        input?.limit,
      ),
  );

  ipcMain.handle(
    'second-brain:archive',
    async (_event, input: SecondBrainArchiveRequest) =>
      (await createService()).archivePage({
        pageId: requirePageId(input?.pageId),
        expectedHash: requireString(input?.expectedHash, 'hash', 64),
        actor: 'user',
      }),
  );

  ipcMain.handle('second-brain:init', (event) =>
    refreshCoordinator.run(refreshOwner(event), { initialize: true }),
  );
  ipcMain.handle('second-brain:update-preview', (event) =>
    refreshCoordinator.run(refreshOwner(event), { dryRun: true }),
  );
  ipcMain.handle('second-brain:update-apply', (event) =>
    refreshCoordinator.run(refreshOwner(event), {}),
  );

  ipcMain.handle(
    'second-brain:pause',
    async (): Promise<SecondBrainDisableResult> => {
      await refreshCoordinator.cancelActiveAndWait();
      const settings = await loadAISettings();
      await saveAISettings({
        ...settings,
        secondBrain: { ...settings.secondBrain, enabled: false },
      });
      return {
        enabled: false,
        initialized: settings.secondBrain.initialized,
        cleared: false,
      };
    },
  );

  ipcMain.handle(
    'second-brain:clear-and-disable',
    async (): Promise<SecondBrainDisableResult> => {
      await refreshCoordinator.cancelActiveAndWait();
      const settings = await loadAISettings();
      await (await createService()).clearAll();
      await saveAISettings({
        ...settings,
        secondBrain: {
          ...settings.secondBrain,
          enabled: false,
          initialized: false,
        },
      });
      return { enabled: false, initialized: false, cleared: true };
    },
  );

  ipcMain.handle(
    'second-brain:cancel',
    (event, input: { operationId: string }) => {
      const operationId = requireString(
        input?.operationId,
        'operation ID',
        100,
      );
      return refreshCoordinator.cancel(event.sender.id, operationId);
    },
  );

  ipcMain.handle('second-brain:revisions', async (_event, pageId: string) =>
    (await createService()).listRevisions(requirePageId(pageId)),
  );

  ipcMain.handle(
    'second-brain:revision-read',
    async (_event, input: { pageId: string; revisionId: string }) =>
      (await createService()).readRevision(
        requirePageId(input?.pageId),
        requireString(input?.revisionId, 'revision ID', 120),
      ),
  );

  ipcMain.handle(
    'second-brain:restore',
    async (_event, input: SecondBrainRestoreRequest) => {
      const service = await createService();
      if (input?.kind === 'archive') {
        return service.restoreArchivedPage(
          requirePageId(input.pageId),
          requireString(input.expectedHash, 'hash', 64),
        );
      }
      if (input?.kind !== 'revision') {
        throw new SecondBrainError(
          'INVALID_CONTENT',
          'Invalid restore request.',
        );
      }
      return service.restoreRevision({
        pageId: requirePageId(input.pageId),
        revisionId: requireString(input.revisionId, 'revision ID', 120),
        expectedHash: requireString(input.expectedHash, 'hash', 64),
        actor: 'user',
      });
    },
  );

  ipcMain.handle('second-brain:open-wiki-folder', async () =>
    (await createService()).openWikiFolder(),
  );
  ipcMain.handle('second-brain:open-wiki-terminal', async () =>
    (await createService()).openWikiTerminal(),
  );
};

export const resetSecondBrainHandlersForTests = (): void => {
  channels.forEach((channel) => ipcMain.removeHandler(channel));
  refreshCoordinator.reset();
  registered = false;
};

export default registerSecondBrainHandlers;
