/**
 * Notebook Service (Renderer)
 * IPC client wrappers for notebook operations
 */

import {
  Notebook,
  NotebookListItem,
  CellOutput,
  CreateNotebookRequest,
  UpdateNotebookRequest,
  RunCellRequest,
  RunAllCellsRequest,
  RunAllCellsResponse,
  SchemaInfo,
} from '../../types/notebook';

export const notebookService = {
  /**
   * Create a new notebook
   */
  createNotebook: (request: CreateNotebookRequest): Promise<Notebook> => {
    return window.electron.ipcRenderer.invoke('notebook:create', request);
  },

  /**
   * Get a notebook by ID
   */
  getNotebook: (instanceId: string, notebookId: string): Promise<Notebook> => {
    return window.electron.ipcRenderer.invoke(
      'notebook:get',
      instanceId,
      notebookId,
    );
  },

  /**
   * List all notebooks for an instance
   */
  listNotebooks: (instanceId: string): Promise<NotebookListItem[]> => {
    return window.electron.ipcRenderer.invoke('notebook:list', instanceId);
  },

  /**
   * Update a notebook
   */
  updateNotebook: (request: UpdateNotebookRequest): Promise<Notebook> => {
    return window.electron.ipcRenderer.invoke('notebook:update', request);
  },

  /**
   * Delete a notebook
   */
  deleteNotebook: (instanceId: string, notebookId: string): Promise<void> => {
    return window.electron.ipcRenderer.invoke(
      'notebook:delete',
      instanceId,
      notebookId,
    );
  },

  /**
   * Create or get existing session
   */
  createSession: (instanceId: string, notebookId: string): Promise<string> => {
    return window.electron.ipcRenderer.invoke(
      'notebook:session:create',
      instanceId,
      notebookId,
    );
  },

  /**
   * Dispose a session
   */
  disposeSession: (notebookId: string): Promise<void> => {
    return window.electron.ipcRenderer.invoke(
      'notebook:session:dispose',
      notebookId,
    );
  },

  /**
   * Run a single cell
   */
  runCell: (request: RunCellRequest): Promise<CellOutput> => {
    return window.electron.ipcRenderer.invoke('notebook:cell:run', request);
  },

  /**
   * Run all cells in a notebook
   */
  runAllCells: (request: RunAllCellsRequest): Promise<RunAllCellsResponse> => {
    return window.electron.ipcRenderer.invoke('notebook:cells:runAll', request);
  },

  /**
   * Interrupt execution
   */
  interruptExecution: (notebookId: string): Promise<void> => {
    return window.electron.ipcRenderer.invoke(
      'notebook:execution:interrupt',
      notebookId,
    );
  },

  /**
   * Get active session count
   */
  getActiveSessionCount: (): Promise<number> => {
    return window.electron.ipcRenderer.invoke('notebook:sessions:count');
  },

  /**
   * Export cell data to file
   */
  exportData: (
    cellId: string,
    format: 'csv' | 'tsv' | 'json' | 'parquet',
    data: any[],
  ): Promise<string> => {
    return window.electron.ipcRenderer.invoke('notebook:export', {
      cellId,
      format,
      data,
    });
  },

  /**
   * Get schema metadata for autocomplete (Phase 4)
   */
  getSchema: (instanceId: string): Promise<SchemaInfo> => {
    return window.electron.ipcRenderer.invoke(
      'notebook:schema:get',
      instanceId,
    );
  },

  /**
   * Get schema summary statistics (Phase 4)
   */
  getSchemaSummary: (
    instanceId: string,
  ): Promise<{
    schemaCount: number;
    tableCount: number;
    columnCount: number;
    totalRows: number;
    totalSize: number;
  }> => {
    return window.electron.ipcRenderer.invoke(
      'notebook:schema:summary',
      instanceId,
    );
  },
};
