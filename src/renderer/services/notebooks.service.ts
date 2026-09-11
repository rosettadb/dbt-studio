/**
 * Notebooks Service
 * Frontend service for notebook operations
 */

import {
  Notebook,
  NotebookCell,
  CellOutput,
  NotebookImportPreview,
  PythonNotebookRuntimeStatus,
  PythonNotebook,
  PythonNotebookEvent,
  PythonNotebookExecuteRequest,
  PythonNotebookExecuteResponse,
  PythonNotebookRunAllRequest,
  PythonNotebookSessionSnapshot,
} from '../../types/notebooks';

export const notebooksService = {
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

  getPythonRuntimeStatus: async (): Promise<PythonNotebookRuntimeStatus> => {
    return window.electron.ipcRenderer.invoke('notebooks:python:runtimeStatus');
  },

  installPythonRuntime: async (): Promise<PythonNotebookRuntimeStatus> => {
    return window.electron.ipcRenderer.invoke(
      'notebooks:python:installRuntime',
    );
  },

  checkPythonRuntime: async (): Promise<PythonNotebookRuntimeStatus> => {
    return window.electron.ipcRenderer.invoke('notebooks:python:checkRuntime');
  },

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
