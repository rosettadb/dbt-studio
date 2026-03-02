/**
 * Notebooks Service
 * Frontend service for notebook operations
 */

import { Notebook, NotebookCell, CellOutput } from '../../types/notebooks';

export const notebooksService = {
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
