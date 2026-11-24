/**
 * Python Notebooks IPC Handlers
 * Thin wrappers (BE-01) delegating to PythonNotebooksService,
 * NotebookEnvService, NotebookKernelService and PythonRuntimesService.
 */

import type { ExtensionMainApi } from '../../../extensionApi/main';
import PythonNotebooksService from './pythonNotebooks.service';
import NotebookEnvService from './notebookEnv.service';
import NotebookKernelService from './notebookKernel.service';
import PythonRuntimesService from '../../../extensionApi/studioMain/pythonRuntimesService';
import type {
  CreatePythonNotebookInput,
  ExecuteCellOptions,
  UpdatePythonNotebookInput,
} from '../../../extensionApi/studioMain/pythonNotebooksTypes';

export function registerPythonNotebooksHandlers(api: ExtensionMainApi) {
  // ── Managed interpreters ─────────────────────────────────────────
  api.ipc.handle('pythonRuntimes:list', () =>
    PythonRuntimesService.listRuntimes(),
  );
  api.ipc.handle('pythonRuntimes:install', (_e, version: string) =>
    PythonRuntimesService.installRuntime(version),
  );

  // ── Notebook files ───────────────────────────────────────────────
  api.ipc.handle('pythonNotebooks:list', (_e, connectionId: string) =>
    PythonNotebooksService.listNotebooks(connectionId),
  );
  api.ipc.handle(
    'pythonNotebooks:get',
    (_e, connectionId: string, notebookId: string) =>
      PythonNotebooksService.getNotebook(connectionId, notebookId),
  );
  api.ipc.handle(
    'pythonNotebooks:create',
    (_e, connectionId: string, input: CreatePythonNotebookInput) =>
      PythonNotebooksService.createNotebook(connectionId, input),
  );
  api.ipc.handle(
    'pythonNotebooks:update',
    (
      _e,
      connectionId: string,
      notebookId: string,
      updates: UpdatePythonNotebookInput,
    ) =>
      PythonNotebooksService.updateNotebook(connectionId, notebookId, updates),
  );
  api.ipc.handle(
    'pythonNotebooks:rename',
    (_e, connectionId: string, notebookId: string, newName: string) =>
      PythonNotebooksService.renameNotebook(connectionId, notebookId, newName),
  );
  api.ipc.handle(
    'pythonNotebooks:duplicate',
    (_e, connectionId: string, notebookId: string, newName?: string) =>
      PythonNotebooksService.duplicateNotebook(
        connectionId,
        notebookId,
        newName,
      ),
  );
  api.ipc.handle(
    'pythonNotebooks:delete',
    (_e, connectionId: string, notebookId: string) =>
      PythonNotebooksService.deleteNotebook(connectionId, notebookId),
  );
  api.ipc.handle(
    'pythonNotebooks:export',
    (_e, connectionId: string, notebookId: string) =>
      PythonNotebooksService.exportNotebook(connectionId, notebookId),
  );
  api.ipc.handle('pythonNotebooks:selectImportFile', () =>
    PythonNotebooksService.selectImportFile(),
  );
  api.ipc.handle(
    'pythonNotebooks:import',
    (_e, connectionId: string, filePath: string, pythonVersion: string) =>
      PythonNotebooksService.importNotebook(
        connectionId,
        filePath,
        pythonVersion,
      ),
  );
  api.ipc.handle(
    'pythonNotebooks:convertFromSql',
    (_e, connectionId: string, notebookId: string) =>
      PythonNotebooksService.convertSqlNotebook(connectionId, notebookId),
  );

  // ── Environment ──────────────────────────────────────────────────
  api.ipc.handle('pythonNotebooks:env:status', (_e, notebookId: string) =>
    NotebookEnvService.getStatus(notebookId),
  );
  api.ipc.handle(
    'pythonNotebooks:env:recreate',
    (_e, connectionId: string, notebookId: string, pythonVersion?: string) =>
      PythonNotebooksService.recreateEnv(
        connectionId,
        notebookId,
        pythonVersion,
      ),
  );
  api.ipc.handle(
    'pythonNotebooks:env:packages:list',
    (_e, notebookId: string) => NotebookEnvService.listPackages(notebookId),
  );
  api.ipc.handle(
    'pythonNotebooks:env:packages:install',
    (_e, notebookId: string, specs: string[]) =>
      NotebookEnvService.installPackages(notebookId, specs),
  );
  api.ipc.handle(
    'pythonNotebooks:env:packages:uninstall',
    (_e, notebookId: string, name: string) =>
      NotebookEnvService.uninstallPackage(notebookId, name),
  );

  // ── Kernel ───────────────────────────────────────────────────────
  api.ipc.handle('pythonNotebooks:kernel:start', (_e, notebookId: string) =>
    NotebookKernelService.start(notebookId),
  );
  api.ipc.handle(
    'pythonNotebooks:kernel:execute',
    (
      _e,
      connectionId: string,
      notebookId: string,
      cellId: string,
      code: string,
      options?: ExecuteCellOptions,
    ) =>
      PythonNotebooksService.executeCell(
        connectionId,
        notebookId,
        cellId,
        code,
        options,
      ),
  );
  api.ipc.handle('pythonNotebooks:kernel:interrupt', (_e, notebookId: string) =>
    NotebookKernelService.interrupt(notebookId),
  );
  api.ipc.handle('pythonNotebooks:kernel:restart', (_e, notebookId: string) =>
    NotebookKernelService.restart(notebookId),
  );
  api.ipc.handle('pythonNotebooks:kernel:shutdown', (_e, notebookId: string) =>
    NotebookKernelService.shutdown(notebookId),
  );
  api.ipc.handle('pythonNotebooks:kernel:status', (_e, notebookId: string) =>
    NotebookKernelService.getStatus(notebookId),
  );
}

export default registerPythonNotebooksHandlers;
