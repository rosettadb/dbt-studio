/**
 * Notebooks IPC Handlers
 * Thin wrappers that delegate to NotebooksService
 */

import { app, ipcMain } from 'electron';
import { NotebooksService } from '../services/notebooks.service';
import { PythonNotebookService } from '../services/pythonNotebook.service';
import type {
  PythonNotebook,
  PythonNotebookExecuteRequest,
  PythonNotebookRunAllRequest,
} from '../../types/notebooks';

let appCleanupRegistered = false;

export function registerNotebooksHandlers() {
  if (!appCleanupRegistered) {
    appCleanupRegistered = true;
    app.on('before-quit', () => {
      // The global application cleanup owns its quit timing. Request a clean
      // kernel shutdown here without changing that shared orchestration.
      PythonNotebookService.shutdownAll().catch(() => undefined);
    });
  }

  ipcMain.handle('notebooks:python:runtimeStatus', async () => {
    return PythonNotebookService.getRuntimeStatus();
  });

  ipcMain.handle('notebooks:python:installRuntime', async () => {
    return PythonNotebookService.installRuntime();
  });

  ipcMain.handle('notebooks:python:checkRuntime', async () => {
    return PythonNotebookService.checkRuntime();
  });

  ipcMain.handle('notebooks:python:list', async () => {
    return NotebooksService.listPythonNotebooks();
  });

  ipcMain.handle('notebooks:python:get', async (_event, notebookId: string) => {
    return NotebooksService.getPythonNotebook(notebookId);
  });

  ipcMain.handle('notebooks:python:create', async (_event, name: string) => {
    return NotebooksService.createPythonNotebook(name);
  });

  ipcMain.handle(
    'notebooks:python:save',
    async (_event, notebook: PythonNotebook, expectedRevision: number) => {
      return NotebooksService.savePythonNotebook(notebook, expectedRevision);
    },
  );

  ipcMain.handle(
    'notebooks:python:runAll',
    async (_event, request: PythonNotebookRunAllRequest) =>
      PythonNotebookService.runAll(request, _event.sender),
  );

  ipcMain.handle(
    'notebooks:python:interrupt',
    async (_event, notebookId: string) =>
      PythonNotebookService.interrupt(notebookId, _event.sender),
  );

  ipcMain.handle(
    'notebooks:python:restart',
    async (_event, notebookId: string) =>
      PythonNotebookService.restart(notebookId, _event.sender),
  );

  ipcMain.handle(
    'notebooks:python:sessionSnapshot',
    async (_event, notebookId: string) =>
      PythonNotebookService.sessionSnapshot(notebookId, _event.sender),
  );

  ipcMain.handle(
    'notebooks:python:execute',
    async (_event, request: PythonNotebookExecuteRequest) =>
      PythonNotebookService.execute(request, _event.sender),
  );

  ipcMain.handle(
    'notebooks:python:shutdown',
    async (_event, notebookId: string) =>
      PythonNotebookService.shutdown(notebookId, _event.sender),
  );

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

  // Select file for import
  ipcMain.handle('notebooks:selectImportFile', async () => {
    return NotebooksService.selectNotebookFile();
  });

  // Peek at an import file (check for embedded connection details) before importing
  ipcMain.handle(
    'notebooks:peekImportFile',
    async (_event, filePath: string) => {
      return NotebooksService.peekImportFile(filePath);
    },
  );

  // Import notebook
  ipcMain.handle(
    'notebooks:import',
    async (_event, connectionId: string, filePath: string) => {
      return NotebooksService.importNotebook(connectionId, filePath);
    },
  );

  // Import all notebooks from bulk export
  ipcMain.handle(
    'notebooks:importAll',
    async (_event, connectionId: string, filePath: string) => {
      return NotebooksService.importAllNotebooks(connectionId, filePath);
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
