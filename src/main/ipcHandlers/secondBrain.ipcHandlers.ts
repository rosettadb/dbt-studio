import { randomUUID } from 'crypto';
import path from 'path';
import { ipcMain, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type {
  SecondBrainArchiveRequest,
  SecondBrainOperationResponse,
  SecondBrainProgressEvent,
  SecondBrainRefreshResult,
  SecondBrainRestoreRequest,
  SecondBrainWriteRequest,
} from '../../types/secondBrain';
import { loadAISettings } from '../services/agent.service';
import SecondBrainRefreshService from '../services/ai/secondBrain/secondBrainRefresh.service';
import SecondBrainService, {
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
  'second-brain:cancel',
  'second-brain:revisions',
  'second-brain:revision-read',
  'second-brain:restore',
  'second-brain:open-folder',
] as const;

type ActiveOperation = {
  operationId: string;
  ownerWebContentsId: number;
  controller: AbortController;
};

let activeOperation: ActiveOperation | null = null;
let registered = false;

const requireString = (value: unknown, field: string, max = 500): string => {
  if (typeof value !== 'string' || !value || value.length > max) {
    throw new SecondBrainError(
      'INVALID_CONTENT',
      `Invalid Second Brain ${field}.`,
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

const cancelledResult = (dryRun: boolean): SecondBrainRefreshResult => ({
  status: 'cancelled',
  dryRun,
  modelCalled: false,
  itemsCollected: 0,
  operationsProposed: 0,
  operationsApplied: 0,
  changedPageIds: [],
  truncated: false,
});

const runRefresh = async (
  event: IpcMainInvokeEvent,
  options: { initialize?: boolean; dryRun?: boolean },
): Promise<SecondBrainOperationResponse> => {
  const settings = await loadAISettings();
  if (!settings.secondBrain.enabled) {
    throw new SecondBrainError(
      'DISABLED',
      'Enable Second Brain before initializing or refreshing memory.',
    );
  }
  if (activeOperation) {
    throw new SecondBrainError(
      'BUSY',
      'Another Second Brain operation is already running.',
      { operationId: activeOperation.operationId },
    );
  }
  const operationId = randomUUID();
  const controller = new AbortController();
  activeOperation = {
    operationId,
    ownerWebContentsId: event.sender.id,
    controller,
  };
  const abortOnOwnerDestroyed = () => controller.abort();
  event.sender.once('destroyed', abortOnOwnerDestroyed);
  try {
    const service = await createService();
    const refresh = new SecondBrainRefreshService(service);
    const result = await refresh.refresh({
      ...options,
      abortSignal: controller.signal,
      onProgress: (progress) => {
        if (event.sender.isDestroyed()) return;
        const payload: SecondBrainProgressEvent = {
          operationId,
          ...progress,
          timestamp: new Date().toISOString(),
          cancellable: !['completed', 'cancelled', 'failed'].includes(
            progress.stage,
          ),
        };
        event.sender.send('second-brain:progress', payload);
      },
    });
    return { operationId, result };
  } catch (error) {
    if (error instanceof SecondBrainError && error.code === 'CANCELLED') {
      return { operationId, result: cancelledResult(Boolean(options.dryRun)) };
    }
    throw error;
  } finally {
    event.sender.removeListener('destroyed', abortOnOwnerDestroyed);
    if (activeOperation?.operationId === operationId) activeOperation = null;
  }
};

export const registerSecondBrainHandlers = (): void => {
  if (registered) return;
  registered = true;

  ipcMain.handle('second-brain:status', async () => {
    const settings = await loadAISettings();
    const service = await createService();
    const status = await service.getStatus();
    return {
      enabled: settings.secondBrain.enabled,
      initialized: status.initialized,
      pageCount: status.pageCount,
      totalBytes: status.totalBytes,
      rootDisplayName: path.basename(status.rootPath),
      lastSuccessfulRefreshAt: status.lastSuccessfulRefreshAt,
      busy: Boolean(activeOperation),
      activeOperationId: activeOperation?.operationId,
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
      return { ...page, archived: false, readOnly: false };
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
    runRefresh(event, { initialize: true }),
  );
  ipcMain.handle('second-brain:update-preview', (event) =>
    runRefresh(event, { dryRun: true }),
  );
  ipcMain.handle('second-brain:update-apply', (event) => runRefresh(event, {}));

  ipcMain.handle(
    'second-brain:cancel',
    (event, input: { operationId: string }) => {
      const operationId = requireString(
        input?.operationId,
        'operation ID',
        100,
      );
      if (
        !activeOperation ||
        activeOperation.operationId !== operationId ||
        activeOperation.ownerWebContentsId !== event.sender.id
      ) {
        throw new SecondBrainError(
          'NOT_FOUND',
          'Active Second Brain operation not found.',
        );
      }
      activeOperation.controller.abort();
      return { cancelled: true };
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

  ipcMain.handle('second-brain:open-folder', async () => {
    const service = await createService();
    const status = await service.getStatus();
    if (!status.initialized) {
      throw new SecondBrainError(
        'NOT_INITIALIZED',
        'Initialize Second Brain before opening its folder.',
      );
    }
    const error = await shell.openPath(service.getRootPath());
    if (error) throw new Error(error);
  });
};

export const resetSecondBrainHandlersForTests = (): void => {
  channels.forEach((channel) => ipcMain.removeHandler(channel));
  activeOperation?.controller.abort();
  activeOperation = null;
  registered = false;
};

export default registerSecondBrainHandlers;
