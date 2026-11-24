/**
 * Notebooks IPC Handlers
 * Thin wrappers that delegate to NotebooksService
 */

import type { ExtensionMainApi } from '../../../extensionApi/main';
import { NotebooksService } from './notebooks.service';

export function registerNotebooksHandlers(api: ExtensionMainApi) {
  // List notebooks for a connection
  api.ipc.handle('notebooks:list', async (_event, connectionId: string) => {
    return NotebooksService.listNotebooks(connectionId);
  });

  // Get a specific notebook
  api.ipc.handle(
    'notebooks:get',
    async (_event, connectionId: string, notebookId: string) => {
      return NotebooksService.getNotebook(connectionId, notebookId);
    },
  );

  // Create a new notebook
  api.ipc.handle(
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
  api.ipc.handle(
    'notebooks:update',
    async (_event, connectionId: string, notebookId: string, updates: any) => {
      return NotebooksService.updateNotebook(connectionId, notebookId, updates);
    },
  );

  // Rename a notebook
  api.ipc.handle(
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
  api.ipc.handle(
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

  // Select file for import
  api.ipc.handle('notebooks:selectImportFile', async () => {
    return NotebooksService.selectNotebookFile();
  });

  // Peek at an import file (check for embedded connection details) before importing
  api.ipc.handle(
    'notebooks:peekImportFile',
    async (_event, filePath: string) => {
      return NotebooksService.peekImportFile(filePath);
    },
  );

  // Import notebook
  api.ipc.handle(
    'notebooks:import',
    async (_event, connectionId: string, filePath: string) => {
      return NotebooksService.importNotebook(connectionId, filePath);
    },
  );

  // Import all notebooks from bulk export
  api.ipc.handle(
    'notebooks:importAll',
    async (_event, connectionId: string, filePath: string) => {
      return NotebooksService.importAllNotebooks(connectionId, filePath);
    },
  );

  // Delete a notebook
  api.ipc.handle(
    'notebooks:delete',
    async (_event, connectionId: string, notebookId: string) => {
      return NotebooksService.deleteNotebook(connectionId, notebookId);
    },
  );

  // Run a single cell
  api.ipc.handle(
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
  api.ipc.handle(
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
  api.ipc.handle(
    'notebooks:runAll',
    async (_event, connectionId: string, notebookId: string) => {
      return NotebooksService.runAllCells(connectionId, notebookId);
    },
  );

  // List archived notebooks
  api.ipc.handle('notebooks:archived:list', async () => {
    return NotebooksService.listArchivedNotebooks();
  });

  // Restore archived notebook
  api.ipc.handle(
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
  api.ipc.handle(
    'notebooks:archived:delete',
    async (_event, connectionKey: string, notebookId: string) => {
      return NotebooksService.deleteArchivedNotebook(connectionKey, notebookId);
    },
  );

  // Delete all archived notebooks
  api.ipc.handle(
    'notebooks:archived:deleteAll',
    async (_event, connectionKey?: string) => {
      return NotebooksService.deleteAllArchivedNotebooks(connectionKey);
    },
  );
}
