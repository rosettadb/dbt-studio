import type {
  SecondBrainArchiveRequest,
  SecondBrainManagedPage,
  SecondBrainManagerStatus,
  SecondBrainOperationResponse,
  SecondBrainProgressEvent,
  SecondBrainRestoreRequest,
  SecondBrainRevisionContent,
  SecondBrainSearchHit,
  SecondBrainTreeItem,
  SecondBrainWriteRequest,
} from '../../types/secondBrain';
import type {
  SecondBrainPage,
  SecondBrainRevisionSummary,
} from '../../types/backend';

export const getStatus = (): Promise<SecondBrainManagerStatus> =>
  window.electron.ipcRenderer.invoke('second-brain:status');

export const listPages = (
  includeArchived = true,
): Promise<SecondBrainTreeItem[]> =>
  window.electron.ipcRenderer.invoke('second-brain:tree', includeArchived);

export const readPage = (
  pageId: string,
  archived = false,
): Promise<SecondBrainManagedPage> =>
  window.electron.ipcRenderer.invoke('second-brain:read', {
    pageId,
    archived,
  });

export const writePage = (
  input: SecondBrainWriteRequest,
): Promise<SecondBrainPage> =>
  window.electron.ipcRenderer.invoke('second-brain:write', input);

export const searchPages = (
  query: string,
  limit = 20,
): Promise<SecondBrainSearchHit[]> =>
  window.electron.ipcRenderer.invoke('second-brain:search', { query, limit });

export const archivePage = (input: SecondBrainArchiveRequest): Promise<void> =>
  window.electron.ipcRenderer.invoke('second-brain:archive', input);

export const initialize = (): Promise<SecondBrainOperationResponse> =>
  window.electron.ipcRenderer.invoke('second-brain:init');

export const previewRefresh = (): Promise<SecondBrainOperationResponse> =>
  window.electron.ipcRenderer.invoke('second-brain:update-preview');

export const applyRefresh = (): Promise<SecondBrainOperationResponse> =>
  window.electron.ipcRenderer.invoke('second-brain:update-apply');

export const cancel = (operationId: string): Promise<{ cancelled: boolean }> =>
  window.electron.ipcRenderer.invoke('second-brain:cancel', { operationId });

export const listRevisions = (
  pageId: string,
): Promise<SecondBrainRevisionSummary[]> =>
  window.electron.ipcRenderer.invoke('second-brain:revisions', pageId);

export const readRevision = (
  pageId: string,
  revisionId: string,
): Promise<SecondBrainRevisionContent> =>
  window.electron.ipcRenderer.invoke('second-brain:revision-read', {
    pageId,
    revisionId,
  });

export const restore = (
  input: SecondBrainRestoreRequest,
): Promise<SecondBrainPage> =>
  window.electron.ipcRenderer.invoke('second-brain:restore', input);

export const openFolder = (): Promise<void> =>
  window.electron.ipcRenderer.invoke('second-brain:open-folder');

export const onProgress = (
  callback: (event: SecondBrainProgressEvent) => void,
): (() => void) =>
  window.electron.ipcRenderer.on(
    'second-brain:progress',
    (...args: unknown[]) => callback(args[0] as SecondBrainProgressEvent),
  );
