/**
 * Notebooks Service
 * Frontend service for notebook operations
 */

import { v4 as uuidv4 } from 'uuid';
import { executeIcebergSql, getIcebergInstance } from './iceberg.service';
import { Notebook, NotebookCell, CellOutput } from '../../types/notebooks';

type RunOptions = { executionId?: string; signal?: AbortSignal };

async function runConfirmedIcebergCell(
  connectionId: string,
  notebookId: string,
  cellId: string,
  sql: string,
  options: RunOptions = {},
  runAll = false,
): Promise<CellOutput> {
  const executionId = options.executionId ?? `notebook-${uuidv4()}`;
  const checkCancelled = () => {
    if (options.signal?.aborted)
      throw new Error('Iceberg execution cancelled.');
  };
  checkCancelled();
  const instanceId = connectionId.slice(8);
  const classification = await executeIcebergSql({
    instanceId,
    executionId,
    sql,
    validateOnly: true,
  });
  checkCancelled();
  const mutating = classification.statementClass !== 'select';
  if (mutating) {
    const instance = await getIcebergInstance(instanceId);
    checkCancelled();
    if (
      // eslint-disable-next-line no-alert
      !window.confirm(
        `Run ${classification.statementClass.toUpperCase()} on Iceberg "${instance.name}"? This modifies the catalog or its data.`,
      )
    ) {
      throw new Error('Iceberg mutation confirmation declined.');
    }
  }
  checkCancelled();
  const cancel = () => {
    window.electron.ipcRenderer
      .invoke('notebooks:cancelIcebergCell', executionId)
      .catch(() => undefined);
  };
  options.signal?.addEventListener('abort', cancel);
  try {
    const execution = { executionId, mutationConfirmed: mutating };
    if (runAll) {
      await window.electron.ipcRenderer.invoke(
        'notebooks:runAll',
        connectionId,
        notebookId,
        { ...execution, cellId, sql },
      );
      return { type: 'empty', statementClass: classification.statementClass };
    }
    return await window.electron.ipcRenderer.invoke(
      'notebooks:runCell',
      connectionId,
      notebookId,
      cellId,
      sql,
      undefined,
      undefined,
      execution,
    );
  } finally {
    options.signal?.removeEventListener('abort', cancel);
  }
}

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
   * Select a notebook file to import
   */
  selectImportFile: async (): Promise<string | null> => {
    return window.electron.ipcRenderer.invoke('notebooks:selectImportFile');
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
    options?: RunOptions,
  ): Promise<CellOutput> => {
    if (connectionId.startsWith('iceberg-'))
      return runConfirmedIcebergCell(
        connectionId,
        notebookId,
        cellId,
        sql,
        options,
      );
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
    options?: RunOptions,
  ): Promise<void> => {
    if (connectionId.startsWith('iceberg-')) {
      const notebook = await notebooksService.getNotebook(
        connectionId,
        notebookId,
      );
      if (!notebook) throw new Error('Notebook not found');
      // Sequential confirmation is intentional: rejection/failure stops the batch.
      // eslint-disable-next-line no-restricted-syntax
      for (const cell of [...notebook.cells].sort(
        (a, b) => a.order - b.order,
      )) {
        if (cell.type === 'sql' && cell.content.trim()) {
          // eslint-disable-next-line no-await-in-loop
          await runConfirmedIcebergCell(
            connectionId,
            notebookId,
            cell.id,
            cell.content,
            { signal: options?.signal },
            true,
          );
        }
      }
      return;
    }
    await window.electron.ipcRenderer.invoke(
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
