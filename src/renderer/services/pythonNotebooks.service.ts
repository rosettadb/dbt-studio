/**
 * Python Notebooks Service (renderer)
 *
 * Thin wrappers over window.electron.ipcRenderer for Python notebooks, their
 * environments, kernels and the managed interpreter registry.
 *
 * FE-03: every `ipcRenderer.on` subscription lives here and returns an
 * unsubscribe closure; components never subscribe directly.
 */

import type {
  CreatePythonNotebookInput,
  ExecuteCellOptions,
  ExecuteCellResult,
  KernelEvent,
  KernelState,
  NotebookEnvEvent,
  NotebookEnvPackage,
  NotebookRuntime,
  PythonNotebook,
  PythonRuntimeInfo,
  PythonRuntimeInstallEvent,
  UpdatePythonNotebookInput,
} from '../../types/pythonNotebooks';

const { ipcRenderer } = window.electron;

export const pythonRuntimesService = {
  list: (): Promise<PythonRuntimeInfo[]> =>
    ipcRenderer.invoke('pythonRuntimes:list'),

  install: (version: string): Promise<PythonRuntimeInfo> =>
    ipcRenderer.invoke('pythonRuntimes:install', version),

  onInstallEvent: (
    handler: (event: PythonRuntimeInstallEvent) => void,
  ): (() => void) =>
    ipcRenderer.on('pythonRuntimes:event', (...args: unknown[]) =>
      handler(args[0] as PythonRuntimeInstallEvent),
    ),
};

export const pythonNotebooksService = {
  list: (connectionId: string): Promise<PythonNotebook[]> =>
    ipcRenderer.invoke('pythonNotebooks:list', connectionId),

  get: (
    connectionId: string,
    notebookId: string,
  ): Promise<PythonNotebook | null> =>
    ipcRenderer.invoke('pythonNotebooks:get', connectionId, notebookId),

  create: (
    connectionId: string,
    input: CreatePythonNotebookInput,
  ): Promise<PythonNotebook> =>
    ipcRenderer.invoke('pythonNotebooks:create', connectionId, input),

  update: (
    connectionId: string,
    notebookId: string,
    updates: UpdatePythonNotebookInput,
  ): Promise<PythonNotebook> =>
    ipcRenderer.invoke(
      'pythonNotebooks:update',
      connectionId,
      notebookId,
      updates,
    ),

  rename: (
    connectionId: string,
    notebookId: string,
    newName: string,
  ): Promise<PythonNotebook> =>
    ipcRenderer.invoke(
      'pythonNotebooks:rename',
      connectionId,
      notebookId,
      newName,
    ),

  duplicate: (
    connectionId: string,
    notebookId: string,
    newName?: string,
  ): Promise<PythonNotebook> =>
    ipcRenderer.invoke(
      'pythonNotebooks:duplicate',
      connectionId,
      notebookId,
      newName,
    ),

  delete: (connectionId: string, notebookId: string): Promise<void> =>
    ipcRenderer.invoke('pythonNotebooks:delete', connectionId, notebookId),

  export: (connectionId: string, notebookId: string): Promise<string | null> =>
    ipcRenderer.invoke('pythonNotebooks:export', connectionId, notebookId),

  selectImportFile: (): Promise<string | null> =>
    ipcRenderer.invoke('pythonNotebooks:selectImportFile'),

  import: (
    connectionId: string,
    filePath: string,
    pythonVersion: string,
  ): Promise<PythonNotebook> =>
    ipcRenderer.invoke(
      'pythonNotebooks:import',
      connectionId,
      filePath,
      pythonVersion,
    ),

  // ── Environment ────────────────────────────────────────────────
  envStatus: (notebookId: string): Promise<NotebookRuntime> =>
    ipcRenderer.invoke('pythonNotebooks:env:status', notebookId),

  recreateEnv: (
    connectionId: string,
    notebookId: string,
    pythonVersion?: string,
  ): Promise<{ pythonVersion: string }> =>
    ipcRenderer.invoke(
      'pythonNotebooks:env:recreate',
      connectionId,
      notebookId,
      pythonVersion,
    ),

  listPackages: (notebookId: string): Promise<NotebookEnvPackage[]> =>
    ipcRenderer.invoke('pythonNotebooks:env:packages:list', notebookId),

  installPackages: (notebookId: string, specs: string[]): Promise<string> =>
    ipcRenderer.invoke(
      'pythonNotebooks:env:packages:install',
      notebookId,
      specs,
    ),

  uninstallPackage: (notebookId: string, name: string): Promise<string> =>
    ipcRenderer.invoke(
      'pythonNotebooks:env:packages:uninstall',
      notebookId,
      name,
    ),

  onEnvEvent: (handler: (event: NotebookEnvEvent) => void): (() => void) =>
    ipcRenderer.on('pythonNotebooks:env:event', (...args: unknown[]) =>
      handler(args[0] as NotebookEnvEvent),
    ),

  // ── Kernel ─────────────────────────────────────────────────────
  startKernel: (notebookId: string): Promise<KernelState> =>
    ipcRenderer.invoke('pythonNotebooks:kernel:start', notebookId),

  executeCell: (
    connectionId: string,
    notebookId: string,
    cellId: string,
    code: string,
    options?: ExecuteCellOptions,
  ): Promise<ExecuteCellResult> =>
    ipcRenderer.invoke(
      'pythonNotebooks:kernel:execute',
      connectionId,
      notebookId,
      cellId,
      code,
      options,
    ),

  interruptKernel: (notebookId: string): Promise<KernelState> =>
    ipcRenderer.invoke('pythonNotebooks:kernel:interrupt', notebookId),

  restartKernel: (notebookId: string): Promise<KernelState> =>
    ipcRenderer.invoke('pythonNotebooks:kernel:restart', notebookId),

  shutdownKernel: (notebookId: string): Promise<KernelState> =>
    ipcRenderer.invoke('pythonNotebooks:kernel:shutdown', notebookId),

  kernelStatus: (notebookId: string): Promise<KernelState> =>
    ipcRenderer.invoke('pythonNotebooks:kernel:status', notebookId),

  onKernelEvent: (handler: (event: KernelEvent) => void): (() => void) =>
    ipcRenderer.on('pythonNotebooks:kernel:event', (...args: unknown[]) =>
      handler(args[0] as KernelEvent),
    ),
};
