/**
 * Notebook IPC Handlers
 * Thin wrappers that delegate to NotebookService
 * NO business logic, NO try-catch blocks, NO console.log
 */

import { ipcMain } from 'electron';
import { NotebookService } from '../services/notebook.service';
import { DataExportService, ExportFormat } from '../services/notebook/export.service';
import {
  CreateNotebookRequest,
  UpdateNotebookRequest,
  RunCellRequest,
  RunAllCellsRequest,
} from '../../types/notebook';

export const registerNotebookHandlers = (): void => {
  // Lifecycle
  ipcMain.handle(
    'notebook:create',
    async (_event, request: CreateNotebookRequest) =>
      NotebookService.createNotebook(request),
  );

  ipcMain.handle(
    'notebook:get',
    async (_event, instanceId: string, notebookId: string) =>
      NotebookService.getNotebook(instanceId, notebookId),
  );

  ipcMain.handle('notebook:list', async (_event, instanceId: string) =>
    NotebookService.listNotebooks(instanceId),
  );

  ipcMain.handle(
    'notebook:update',
    async (_event, request: UpdateNotebookRequest) =>
      NotebookService.updateNotebook(request),
  );

  ipcMain.handle(
    'notebook:delete',
    async (_event, instanceId: string, notebookId: string) =>
      NotebookService.deleteNotebook(instanceId, notebookId),
  );

  // Session management
  ipcMain.handle(
    'notebook:session:create',
    async (_event, instanceId: string, notebookId: string) =>
      NotebookService.createSession(instanceId, notebookId),
  );

  ipcMain.handle(
    'notebook:session:dispose',
    async (_event, notebookId: string) =>
      NotebookService.disposeSession(notebookId),
  );

  // Execution
  ipcMain.handle('notebook:cell:run', async (_event, request: RunCellRequest) =>
    NotebookService.runCell(request),
  );

  ipcMain.handle(
    'notebook:cells:runAll',
    async (_event, request: RunAllCellsRequest) =>
      NotebookService.runAllCells(request),
  );

  ipcMain.handle(
    'notebook:execution:interrupt',
    async (_event, notebookId: string) =>
      NotebookService.interruptExecution(notebookId),
  );

  // Monitoring
  ipcMain.handle('notebook:sessions:count', async () =>
    NotebookService.getActiveSessionCount(),
  );

  // Export cell data
  ipcMain.handle(
    'notebook:export',
    async (
      _event,
      {
        cellId,
        format,
        data,
      }: { cellId: string; format: ExportFormat; data: any[] },
    ) => {
      return DataExportService.exportData(cellId, format, data);
    },
  );
};
