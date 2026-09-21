/**
 * Python Notebooks IPC Handlers
 * Thin wrappers (BE-01) delegating to PythonNotebooksService,
 * NotebookEnvService, NotebookKernelService and PythonRuntimesService.
 */

import { app, ipcMain } from 'electron';
import PythonNotebooksService from '../services/pythonNotebooks.service';
import NotebookEnvService from '../services/notebookEnv.service';
import NotebookKernelService from '../services/notebookKernel.service';
import PythonRuntimesService from '../services/pythonRuntimes.service';
import type {
  CreatePythonNotebookInput,
  UpdatePythonNotebookInput,
} from '../../types/pythonNotebooks';

let lifecycleRegistered = false;

export function registerPythonNotebooksHandlers() {
  // ── Managed interpreters ─────────────────────────────────────────
  ipcMain.handle('pythonRuntimes:list', () =>
    PythonRuntimesService.listRuntimes(),
  );
  ipcMain.handle('pythonRuntimes:install', (_e, version: string) =>
    PythonRuntimesService.installRuntime(version),
  );

  // ── Notebook files ───────────────────────────────────────────────
  ipcMain.handle('pythonNotebooks:list', (_e, connectionId: string) =>
    PythonNotebooksService.listNotebooks(connectionId),
  );
  ipcMain.handle(
    'pythonNotebooks:get',
    (_e, connectionId: string, notebookId: string) =>
      PythonNotebooksService.getNotebook(connectionId, notebookId),
  );
  ipcMain.handle(
    'pythonNotebooks:create',
    (_e, connectionId: string, input: CreatePythonNotebookInput) =>
      PythonNotebooksService.createNotebook(connectionId, input),
  );
  ipcMain.handle(
    'pythonNotebooks:update',
    (
      _e,
      connectionId: string,
      notebookId: string,
      updates: UpdatePythonNotebookInput,
    ) =>
      PythonNotebooksService.updateNotebook(connectionId, notebookId, updates),
  );
  ipcMain.handle(
    'pythonNotebooks:rename',
    (_e, connectionId: string, notebookId: string, newName: string) =>
      PythonNotebooksService.renameNotebook(connectionId, notebookId, newName),
  );
  ipcMain.handle(
    'pythonNotebooks:duplicate',
    (_e, connectionId: string, notebookId: string, newName?: string) =>
      PythonNotebooksService.duplicateNotebook(
        connectionId,
        notebookId,
        newName,
      ),
  );
  ipcMain.handle(
    'pythonNotebooks:delete',
    (_e, connectionId: string, notebookId: string) =>
      PythonNotebooksService.deleteNotebook(connectionId, notebookId),
  );
  ipcMain.handle(
    'pythonNotebooks:export',
    (_e, connectionId: string, notebookId: string) =>
      PythonNotebooksService.exportNotebook(connectionId, notebookId),
  );
  ipcMain.handle('pythonNotebooks:selectImportFile', () =>
    PythonNotebooksService.selectImportFile(),
  );
  ipcMain.handle(
    'pythonNotebooks:import',
    (_e, connectionId: string, filePath: string, pythonVersion: string) =>
      PythonNotebooksService.importNotebook(
        connectionId,
        filePath,
        pythonVersion,
      ),
  );

  // ── Environment ──────────────────────────────────────────────────
  ipcMain.handle('pythonNotebooks:env:status', (_e, notebookId: string) =>
    NotebookEnvService.getStatus(notebookId),
  );
  ipcMain.handle(
    'pythonNotebooks:env:recreate',
    (_e, connectionId: string, notebookId: string, pythonVersion?: string) =>
      PythonNotebooksService.recreateEnv(
        connectionId,
        notebookId,
        pythonVersion,
      ),
  );
  ipcMain.handle(
    'pythonNotebooks:env:packages:list',
    (_e, notebookId: string) => NotebookEnvService.listPackages(notebookId),
  );
  ipcMain.handle(
    'pythonNotebooks:env:packages:install',
    (_e, notebookId: string, specs: string[]) =>
      NotebookEnvService.installPackages(notebookId, specs),
  );
  ipcMain.handle(
    'pythonNotebooks:env:packages:uninstall',
    (_e, notebookId: string, name: string) =>
      NotebookEnvService.uninstallPackage(notebookId, name),
  );

  // ── Kernel ───────────────────────────────────────────────────────
  ipcMain.handle('pythonNotebooks:kernel:start', (_e, notebookId: string) =>
    NotebookKernelService.start(notebookId),
  );
  ipcMain.handle(
    'pythonNotebooks:kernel:execute',
    (
      _e,
      connectionId: string,
      notebookId: string,
      cellId: string,
      code: string,
    ) =>
      PythonNotebooksService.executeCell(
        connectionId,
        notebookId,
        cellId,
        code,
      ),
  );
  ipcMain.handle('pythonNotebooks:kernel:interrupt', (_e, notebookId: string) =>
    NotebookKernelService.interrupt(notebookId),
  );
  ipcMain.handle('pythonNotebooks:kernel:restart', (_e, notebookId: string) =>
    NotebookKernelService.restart(notebookId),
  );
  ipcMain.handle('pythonNotebooks:kernel:shutdown', (_e, notebookId: string) =>
    NotebookKernelService.shutdown(notebookId),
  );
  ipcMain.handle('pythonNotebooks:kernel:status', (_e, notebookId: string) =>
    NotebookKernelService.getStatus(notebookId),
  );

  if (!lifecycleRegistered) {
    lifecycleRegistered = true;
    app.on('before-quit', () => {
      NotebookKernelService.shutdownAll().catch(() => undefined);
    });
  }
}

export default registerPythonNotebooksHandlers;
