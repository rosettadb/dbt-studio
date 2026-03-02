/**
 * Notebooks IPC Handlers
 * Thin wrappers that delegate to NotebooksService
 */

import { ipcMain } from 'electron';
import { NotebooksService } from '../services/notebooks.service';

export function registerNotebooksHandlers() {
  // List notebooks for a connection
  ipcMain.handle('notebooks:list', async (_event, connectionId: string) => {
    return NotebooksService.listNotebooks(connectionId);
  });

  // Get a specific notebook
  ipcMain.handle(
    'notebooks:get',
    async (_event, connectionId: string, notebookId: string) => {
      return NotebooksService.getNotebook(connectionId, notebookId);
    },
  );

  // Create a new notebook
  ipcMain.handle(
    'notebooks:create',
    async (
      _event,
      connectionId: string,
      name: string,
      description?: string,
    ) => {
      return NotebooksService.createNotebook(connectionId, name, description);
    },
  );

  // Update a notebook
  ipcMain.handle(
    'notebooks:update',
    async (_event, connectionId: string, notebookId: string, updates: any) => {
      return NotebooksService.updateNotebook(connectionId, notebookId, updates);
    },
  );

  // Rename a notebook
  ipcMain.handle(
    'notebooks:rename',
    async (
      _event,
      connectionId: string,
      notebookId: string,
      newName: string,
    ) => {
      return NotebooksService.renameNotebook(connectionId, notebookId, newName);
    },
  );

  // Duplicate a notebook
  ipcMain.handle(
    'notebooks:duplicate',
    async (
      _event,
      connectionId: string,
      notebookId: string,
      newName?: string,
    ) => {
      return NotebooksService.duplicateNotebook(
        connectionId,
        notebookId,
        newName,
      );
    },
  );

  // Delete a notebook
  ipcMain.handle(
    'notebooks:delete',
    async (_event, connectionId: string, notebookId: string) => {
      return NotebooksService.deleteNotebook(connectionId, notebookId);
    },
  );

  // Run a single cell
  ipcMain.handle(
    'notebooks:runCell',
    async (
      _event,
      connectionId: string,
      notebookId: string,
      cellId: string,
      sql: string,
      limit?: number,
      offset?: number,
    ) => {
      return NotebooksService.runCell(
        connectionId,
        notebookId,
        cellId,
        sql,
        limit,
        offset,
      );
    },
  );

  // Fetch a specific page of results for a cell (pagination without saving)
  ipcMain.handle(
    'notebooks:fetchCellPage',
    async (
      _event,
      connectionId: string,
      notebookId: string,
      cellId: string,
      sql: string,
      limit: number,
      offset: number,
    ) => {
      return NotebooksService.fetchCellPage(
        connectionId,
        notebookId,
        cellId,
        sql,
        limit,
        offset,
      );
    },
  );

  // Run all cells
  ipcMain.handle(
    'notebooks:runAll',
    async (_event, connectionId: string, notebookId: string) => {
      return NotebooksService.runAllCells(connectionId, notebookId);
    },
  );

  // List archived notebooks
  ipcMain.handle('notebooks:archived:list', async () => {
    return NotebooksService.listArchivedNotebooks();
  });

  // Restore archived notebook
  ipcMain.handle(
    'notebooks:archived:restore',
    async (
      _event,
      archivedConnectionKey: string,
      notebookId: string,
      targetConnectionId: string,
    ) => {
      return NotebooksService.restoreNotebook(
        archivedConnectionKey,
        notebookId,
        targetConnectionId,
      );
    },
  );

  // Delete archived notebook
  ipcMain.handle(
    'notebooks:archived:delete',
    async (_event, connectionKey: string, notebookId: string) => {
      return NotebooksService.deleteArchivedNotebook(connectionKey, notebookId);
    },
  );

  // Delete all archived notebooks
  ipcMain.handle(
    'notebooks:archived:deleteAll',
    async (_event, connectionKey?: string) => {
      return NotebooksService.deleteAllArchivedNotebooks(connectionKey);
    },
  );
}
