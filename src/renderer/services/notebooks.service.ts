/**
 * Notebooks Service
 * Frontend service for notebook operations
 */

import {
  Notebook,
  NotebookCell,
  CellOutput,
  NotebookImportPreview,
  PythonNotebookCustomInterpreterRequest,
  PythonNotebookRemoveEnvironmentRequest,
  PythonNotebookRuntimeStatus,
  PythonNotebook,
  PythonNotebookEvent,
  PythonNotebookExecuteRequest,
  PythonNotebookExecuteResponse,
  PythonNotebookPackageActionRequest,
  PythonNotebookPackageInstallRequest,
  PythonNotebookPackageVersionListResponse,
  PythonNotebookPackageStatus,
  PythonNotebookRunAllRequest,
  PythonNotebookSelectEnvironmentRequest,
  PythonNotebookSessionSnapshot,
  PythonNotebookUserPackageActionRequest,
  PythonNotebookUserPackageRequest,
  PythonNotebookUserPackageVersionListResponse,
} from '../../types/notebooks';

import type {
  PythonLanguageDocument,
  PythonLanguageRequest,
  PythonLanguageEvent,
  PythonLanguageServerStatus,
} from '../../types/pythonLanguageServer';

export const notebooksService = {
  pythonLanguageStatus: (): Promise<PythonLanguageServerStatus> =>
    window.electron.ipcRenderer.invoke('notebooks:python:lsp:status'),
  restartPythonLanguageServer: (): Promise<PythonLanguageServerStatus> =>
    window.electron.ipcRenderer.invoke('notebooks:python:lsp:restart'),
  syncPythonLanguageDocument: (
    document: PythonLanguageDocument,
  ): Promise<boolean> =>
    window.electron.ipcRenderer.invoke('notebooks:python:lsp:sync', document),
  requestPythonLanguage: (request: PythonLanguageRequest): Promise<unknown> =>
    window.electron.ipcRenderer.invoke('notebooks:python:lsp:request', request),
  closePythonLanguageDocument: (modelUri: string): Promise<void> =>
    window.electron.ipcRenderer.invoke('notebooks:python:lsp:close', modelUri),
  cancelPythonLanguageRequest: (requestId: string): Promise<void> =>
    window.electron.ipcRenderer.invoke(
      'notebooks:python:lsp:cancel',
      requestId,
    ),
  onPythonLanguageEvent: (
    callback: (event: PythonLanguageEvent) => void,
  ): (() => void) =>
    window.electron.ipcRenderer.on('notebooks:python:lsp:event', (...args) =>
      callback(args[0] as PythonLanguageEvent),
    ),
  listPythonNotebooks: async (): Promise<PythonNotebook[]> => {
    return window.electron.ipcRenderer.invoke('notebooks:python:list');
  },

  getPythonNotebook: async (id: string): Promise<PythonNotebook | null> => {
    return window.electron.ipcRenderer.invoke('notebooks:python:get', id);
  },

  createPythonNotebook: async (name: string): Promise<PythonNotebook> => {
    return window.electron.ipcRenderer.invoke('notebooks:python:create', name);
  },

  savePythonNotebook: async (
    notebook: PythonNotebook,
    expectedRevision: number,
  ): Promise<PythonNotebook> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:python:save',
      notebook,
      expectedRevision,
    );
  },

  renamePythonNotebook: async (
    id: string,
    name: string,
  ): Promise<PythonNotebook> =>
    window.electron.ipcRenderer.invoke('notebooks:python:rename', id, name),

  duplicatePythonNotebook: async (
    id: string,
    name?: string,
  ): Promise<PythonNotebook> =>
    window.electron.ipcRenderer.invoke('notebooks:python:duplicate', id, name),

  deletePythonNotebook: async (id: string): Promise<void> =>
    window.electron.ipcRenderer.invoke('notebooks:python:delete', id),

  clearPythonNotebookOutputs: async (
    id: string,
    revision: number,
  ): Promise<PythonNotebook> =>
    window.electron.ipcRenderer.invoke(
      'notebooks:python:clearOutputs',
      id,
      revision,
    ),

  importPythonNotebook: async (): Promise<PythonNotebook | null> =>
    window.electron.ipcRenderer.invoke('notebooks:python:import'),

  exportPythonNotebook: async (
    id: string,
    revision: number,
  ): Promise<string | null> =>
    window.electron.ipcRenderer.invoke('notebooks:python:export', id, revision),

  getPythonRuntimeStatus: async (
    projectPath?: string,
  ): Promise<PythonNotebookRuntimeStatus> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:python:runtimeStatus',
      projectPath,
    );
  },

  installPythonRuntime: async (): Promise<PythonNotebookRuntimeStatus> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:python:installRuntime',
    );
  },

  updatePythonRuntime: async (
    expectedActiveSessionCount: number,
  ): Promise<PythonNotebookRuntimeStatus> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:python:updateRuntime',
      expectedActiveSessionCount,
    );
  },

  uninstallPythonRuntime: async (
    expectedActiveSessionCount: number,
  ): Promise<PythonNotebookRuntimeStatus> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:python:uninstallRuntime',
      expectedActiveSessionCount,
    );
  },

  checkPythonRuntime: async (): Promise<PythonNotebookRuntimeStatus> => {
    return window.electron.ipcRenderer.invoke('notebooks:python:checkRuntime');
  },

  listPythonPackageVersions: async (
    packageName: PythonNotebookPackageStatus['name'],
  ): Promise<PythonNotebookPackageVersionListResponse> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:python:packageVersions',
      packageName,
    );
  },

  installPythonPackage: async (
    request: PythonNotebookPackageInstallRequest,
  ): Promise<PythonNotebookRuntimeStatus> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:python:installPackage',
      request,
    );
  },

  uninstallPythonPackage: async (
    request: PythonNotebookPackageActionRequest,
  ): Promise<PythonNotebookRuntimeStatus> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:python:uninstallPackage',
      request,
    );
  },

  // Phase 11: IDE-style environment selection and package management.
  selectPythonEnvironment: async (
    request: PythonNotebookSelectEnvironmentRequest,
  ): Promise<PythonNotebookRuntimeStatus> =>
    window.electron.ipcRenderer.invoke(
      'notebooks:python:selectEnvironment',
      request,
    ),

  addCustomPythonInterpreter: async (
    request: PythonNotebookCustomInterpreterRequest,
  ): Promise<PythonNotebookRuntimeStatus> =>
    window.electron.ipcRenderer.invoke(
      'notebooks:python:addCustomInterpreter',
      request,
    ),

  removePythonEnvironment: async (
    request: PythonNotebookRemoveEnvironmentRequest,
  ): Promise<PythonNotebookRuntimeStatus> =>
    window.electron.ipcRenderer.invoke(
      'notebooks:python:removeEnvironment',
      request,
    ),

  installPythonDataProfile: async (
    expectedActiveSessionCount: number,
  ): Promise<PythonNotebookRuntimeStatus> =>
    window.electron.ipcRenderer.invoke(
      'notebooks:python:installDataProfile',
      expectedActiveSessionCount,
    ),

  installPythonUserPackage: async (
    request: PythonNotebookUserPackageRequest,
  ): Promise<PythonNotebookRuntimeStatus> =>
    window.electron.ipcRenderer.invoke(
      'notebooks:python:installUserPackage',
      request,
    ),

  uninstallPythonUserPackage: async (
    request: PythonNotebookUserPackageActionRequest,
  ): Promise<PythonNotebookRuntimeStatus> =>
    window.electron.ipcRenderer.invoke(
      'notebooks:python:uninstallUserPackage',
      request,
    ),

  ensurePythonKernelSupport: async (
    expectedActiveSessionCount: number,
  ): Promise<PythonNotebookRuntimeStatus> =>
    window.electron.ipcRenderer.invoke(
      'notebooks:python:ensureKernelSupport',
      expectedActiveSessionCount,
    ),

  listPythonUserPackageVersions: async (
    packageName: string,
  ): Promise<PythonNotebookUserPackageVersionListResponse> =>
    window.electron.ipcRenderer.invoke(
      'notebooks:python:listUserPackageVersions',
      packageName,
    ),

  executePythonCell: async (
    request: PythonNotebookExecuteRequest,
  ): Promise<PythonNotebookExecuteResponse> =>
    window.electron.ipcRenderer.invoke('notebooks:python:execute', request),

  runAllPythonCells: async (
    request: PythonNotebookRunAllRequest,
  ): Promise<PythonNotebookExecuteResponse> =>
    window.electron.ipcRenderer.invoke('notebooks:python:runAll', request),

  interruptPythonNotebook: async (notebookId: string): Promise<void> =>
    window.electron.ipcRenderer.invoke(
      'notebooks:python:interrupt',
      notebookId,
    ),

  restartPythonNotebook: async (notebookId: string): Promise<void> =>
    window.electron.ipcRenderer.invoke('notebooks:python:restart', notebookId),

  getPythonSessionSnapshot: async (
    notebookId: string,
  ): Promise<PythonNotebookSessionSnapshot> =>
    window.electron.ipcRenderer.invoke(
      'notebooks:python:sessionSnapshot',
      notebookId,
    ),

  shutdownPythonNotebook: async (notebookId: string): Promise<void> =>
    window.electron.ipcRenderer.invoke('notebooks:python:shutdown', notebookId),

  onPythonNotebookEvent: (
    callback: (event: PythonNotebookEvent) => void,
  ): (() => void) =>
    window.electron.ipcRenderer.on('notebooks:python:event', (...args) =>
      callback(args[0] as PythonNotebookEvent),
    ),

  /**
   * List all notebooks for a connection
   */
  listNotebooks: async (connectionId: string): Promise<Notebook[]> => {
    return window.electron.ipcRenderer.invoke('notebooks:list', connectionId);
  },

  /**
   * Get a specific notebook
   */
  getNotebook: async (
    connectionId: string,
    notebookId: string,
  ): Promise<Notebook | null> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:get',
      connectionId,
      notebookId,
    );
  },

  /**
   * Create a new notebook
   */
  createNotebook: async (
    connectionId: string,
    name: string,
    description?: string,
  ): Promise<Notebook> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:create',
      connectionId,
      name,
      description,
    );
  },

  /**
   * Update a notebook
   */
  updateNotebook: async (
    connectionId: string,
    notebookId: string,
    updates: {
      name?: string;
      description?: string;
      cells?: NotebookCell[];
    },
  ): Promise<Notebook> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:update',
      connectionId,
      notebookId,
      updates,
    );
  },

  /**
   * Rename a notebook
   */
  renameNotebook: async (
    connectionId: string,
    notebookId: string,
    newName: string,
  ): Promise<Notebook> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:rename',
      connectionId,
      notebookId,
      newName,
    );
  },

  /**
   * Duplicate a notebook
   */
  duplicateNotebook: async (
    connectionId: string,
    notebookId: string,
    newName?: string,
  ): Promise<Notebook> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:duplicate',
      connectionId,
      notebookId,
      newName,
    );
  },

  /**
   * Select a notebook file to import
   */
  selectImportFile: async (): Promise<string | null> => {
    return window.electron.ipcRenderer.invoke('notebooks:selectImportFile');
  },

  /**
   * Peek at a notebook export JSON file (check for embedded connection
   * details) without importing it
   */
  peekImportFile: async (filePath: string): Promise<NotebookImportPreview> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:peekImportFile',
      filePath,
    );
  },

  /**
   * Import a notebook from JSON file
   */
  importNotebook: async (
    connectionId: string,
    filePath: string,
  ): Promise<Notebook> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:import',
      connectionId,
      filePath,
    );
  },

  /**
   * Import all notebooks from bulk export JSON file
   */
  importAllNotebooks: async (
    connectionId: string,
    filePath: string,
  ): Promise<Notebook[]> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:importAll',
      connectionId,
      filePath,
    );
  },

  /**
   * Delete a notebook
   */
  deleteNotebook: async (
    connectionId: string,
    notebookId: string,
  ): Promise<void> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:delete',
      connectionId,
      notebookId,
    );
  },

  /**
   * Run a single cell
   */
  runCell: async (
    connectionId: string,
    notebookId: string,
    cellId: string,
    sql: string,
    limit?: number,
    offset?: number,
  ): Promise<CellOutput> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:runCell',
      connectionId,
      notebookId,
      cellId,
      sql,
      limit,
      offset,
    );
  },

  /**
   * Fetch a specific page of results for a cell (pagination without saving)
   */
  fetchCellPage: async (
    connectionId: string,
    notebookId: string,
    cellId: string,
    sql: string,
    limit: number,
    offset: number,
  ): Promise<CellOutput> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:fetchCellPage',
      connectionId,
      notebookId,
      cellId,
      sql,
      limit,
      offset,
    );
  },

  /**
   * Run all cells
   */
  runAllCells: async (
    connectionId: string,
    notebookId: string,
  ): Promise<void> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:runAll',
      connectionId,
      notebookId,
    );
  },

  /**
   * Export data (placeholder - to be implemented)
   */
  exportData: async (
    cellId: string,
    format: 'csv' | 'tsv' | 'json' | 'parquet',
    data: any[],
  ): Promise<string> => {
    // TODO: Implement IPC call for data export
    // eslint-disable-next-line no-console
    console.log('Export data:', { cellId, format, rowCount: data.length });
    throw new Error('Export not implemented yet');
  },

  /**
   * List all archived notebooks
   */
  listArchivedNotebooks: async (): Promise<Record<string, Notebook[]>> => {
    return window.electron.ipcRenderer.invoke('notebooks:archived:list');
  },

  /**
   * Restore an archived notebook
   */
  restoreArchivedNotebook: async (
    archivedConnectionKey: string,
    notebookId: string,
    targetConnectionId: string,
  ): Promise<Notebook> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:archived:restore',
      archivedConnectionKey,
      notebookId,
      targetConnectionId,
    );
  },

  /**
   * Delete an archived notebook permanently
   */
  deleteArchivedNotebook: async (
    connectionKey: string,
    notebookId: string,
  ): Promise<void> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:archived:delete',
      connectionKey,
      notebookId,
    );
  },

  /**
   * Delete all archived notebooks (optionally for a specific connection)
   */
  deleteAllArchivedNotebooks: async (connectionKey?: string): Promise<void> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:archived:deleteAll',
      connectionKey,
    );
  },
};

// Source-only context for notebook analysis; outputs and kernel variables never enter LSP.
const pythonLanguageCells = new Map<string, { id: string; source: string }[]>();
const pythonLanguageContextListeners = new Set<() => void>();

export function setPythonLanguageCells(
  notebookId: string,
  cells: PythonNotebook['cells'] | null,
) {
  const sources = cells
    ?.filter((cell) => cell.cellType === 'code')
    .map(({ id, source }) => ({ id, source }));
  if (
    JSON.stringify(pythonLanguageCells.get(notebookId)) ===
    JSON.stringify(sources)
  )
    return;
  if (sources) pythonLanguageCells.set(notebookId, sources);
  else pythonLanguageCells.delete(notebookId);
  pythonLanguageContextListeners.forEach((listener) => listener());
}

export function pythonLanguagePrefix(modelPath: string): string {
  const match = modelPath.match(
    /^\/__rosetta_python_notebooks__\/([^/]+)\/([^/]+)\.py$/,
  );
  if (!match) return '';
  const cells = pythonLanguageCells.get(match[1]) ?? [];
  const index = cells.findIndex((cell) => cell.id === match[2]);
  if (index <= 0) return '';
  const prefix = cells
    .slice(0, index)
    .map((cell) => cell.source)
    .join('\n\n');
  return `${prefix}\n\n`;
}

export function onPythonLanguageContextChange(
  callback: () => void,
): () => void {
  pythonLanguageContextListeners.add(callback);
  return () => {
    pythonLanguageContextListeners.delete(callback);
  };
}
