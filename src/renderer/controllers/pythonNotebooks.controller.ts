/**
 * Python Notebooks Controller
 * React Query hooks for Python notebooks, environments, kernels and runtimes.
 */

import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { toast } from 'react-toastify';
import {
  pythonNotebooksService,
  pythonRuntimesService,
} from '../services/pythonNotebooks.service';
import type {
  CreatePythonNotebookInput,
  ExecuteCellOptions,
  KernelEvent,
  KernelState,
  NotebookEnvEvent,
  NotebookEnvPackage,
  PythonNotebook,
  PythonRuntimeInfo,
  PythonRuntimeInstallEvent,
  UpdatePythonNotebookInput,
} from '../../types/pythonNotebooks';

export const pythonNotebooksKeys = {
  all: ['pythonNotebooks'] as const,
  lists: () => [...pythonNotebooksKeys.all, 'list'] as const,
  list: (connectionId: string) =>
    [...pythonNotebooksKeys.lists(), connectionId] as const,
  details: () => [...pythonNotebooksKeys.all, 'detail'] as const,
  detail: (connectionId: string, notebookId: string) =>
    [...pythonNotebooksKeys.details(), connectionId, notebookId] as const,
  kernel: (notebookId: string) =>
    [...pythonNotebooksKeys.all, 'kernel', notebookId] as const,
  packages: (notebookId: string) =>
    [...pythonNotebooksKeys.all, 'packages', notebookId] as const,
  runtimes: () => [...pythonNotebooksKeys.all, 'runtimes'] as const,
};

/* ------------------------------------------------------------------ */
/* Runtimes                                                              */
/* ------------------------------------------------------------------ */

export function usePythonRuntimes() {
  return useQuery<PythonRuntimeInfo[]>({
    queryKey: pythonNotebooksKeys.runtimes(),
    queryFn: () => pythonRuntimesService.list(),
    staleTime: 30_000,
  });
}

export function useInstallPythonRuntime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (version: string) => pythonRuntimesService.install(version),
    onSuccess: (runtime) => {
      queryClient.invalidateQueries(pythonNotebooksKeys.runtimes());
      toast.success(`Python ${runtime.version} installed`);
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries(pythonNotebooksKeys.runtimes());
      toast.error(error.message);
    },
  });
}

/** Subscribe to interpreter download progress (FE-03 via service). */
export function usePythonRuntimeInstallEvents(
  handler: (event: PythonRuntimeInstallEvent) => void,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(
    () => pythonRuntimesService.onInstallEvent((e) => handlerRef.current(e)),
    [],
  );
}

/* ------------------------------------------------------------------ */
/* Notebooks                                                             */
/* ------------------------------------------------------------------ */

export function usePythonNotebooks(connectionId: string) {
  return useQuery<PythonNotebook[]>({
    queryKey: pythonNotebooksKeys.list(connectionId),
    queryFn: () => pythonNotebooksService.list(connectionId),
    enabled: !!connectionId,
    staleTime: 30_000,
  });
}

export function usePythonNotebook(connectionId: string, notebookId: string) {
  return useQuery<PythonNotebook | null>({
    queryKey: pythonNotebooksKeys.detail(connectionId, notebookId),
    queryFn: () => pythonNotebooksService.get(connectionId, notebookId),
    enabled: !!connectionId && !!notebookId,
    staleTime: 0,
    cacheTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useCreatePythonNotebook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId,
      input,
    }: {
      connectionId: string;
      input: CreatePythonNotebookInput;
    }) => pythonNotebooksService.create(connectionId, input),
    onSuccess: (notebook, { connectionId }) => {
      queryClient.invalidateQueries(pythonNotebooksKeys.list(connectionId));
      toast.success(`Python notebook "${notebook.name}" created`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create notebook: ${error.message}`);
    },
  });
}

export function useUpdatePythonNotebook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId,
      notebookId,
      updates,
    }: {
      connectionId: string;
      notebookId: string;
      updates: UpdatePythonNotebookInput;
    }) => pythonNotebooksService.update(connectionId, notebookId, updates),
    onSuccess: (_notebook, { connectionId, updates }) => {
      if (updates.name !== undefined) {
        queryClient.invalidateQueries(pythonNotebooksKeys.list(connectionId));
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to save notebook: ${error.message}`);
    },
  });
}

export function useRenamePythonNotebook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId,
      notebookId,
      newName,
    }: {
      connectionId: string;
      notebookId: string;
      newName: string;
    }) => pythonNotebooksService.rename(connectionId, notebookId, newName),
    onSuccess: (notebook, { connectionId }) => {
      queryClient.invalidateQueries(pythonNotebooksKeys.list(connectionId));
      toast.success(`Notebook renamed to "${notebook.name}"`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to rename notebook: ${error.message}`);
    },
  });
}

export function useDuplicatePythonNotebook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId,
      notebookId,
      newName,
    }: {
      connectionId: string;
      notebookId: string;
      newName?: string;
    }) => pythonNotebooksService.duplicate(connectionId, notebookId, newName),
    onSuccess: (notebook, { connectionId }) => {
      queryClient.invalidateQueries(pythonNotebooksKeys.list(connectionId));
      toast.success(`Notebook duplicated as "${notebook.name}"`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to duplicate notebook: ${error.message}`);
    },
  });
}

export function useDeletePythonNotebook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId,
      notebookId,
    }: {
      connectionId: string;
      notebookId: string;
    }) => pythonNotebooksService.delete(connectionId, notebookId),
    onSuccess: (_result, { connectionId, notebookId }) => {
      queryClient.removeQueries(
        pythonNotebooksKeys.detail(connectionId, notebookId),
      );
      queryClient.invalidateQueries(pythonNotebooksKeys.list(connectionId));
      toast.success('Notebook deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete notebook: ${error.message}`);
    },
  });
}

export function useExportPythonNotebook() {
  return useMutation({
    mutationFn: ({
      connectionId,
      notebookId,
    }: {
      connectionId: string;
      notebookId: string;
    }) => pythonNotebooksService.export(connectionId, notebookId),
    onSuccess: (filePath) => {
      if (filePath) toast.success(`Exported to ${filePath}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to export notebook: ${error.message}`);
    },
  });
}

export function useImportPythonNotebook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId,
      filePath,
      pythonVersion,
    }: {
      connectionId: string;
      filePath: string;
      pythonVersion: string;
    }) => pythonNotebooksService.import(connectionId, filePath, pythonVersion),
    onSuccess: (notebook, { connectionId }) => {
      queryClient.invalidateQueries(pythonNotebooksKeys.list(connectionId));
      toast.success(`Notebook "${notebook.name}" imported`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to import notebook: ${error.message}`);
    },
  });
}

/* ------------------------------------------------------------------ */
/* Environment                                                           */
/* ------------------------------------------------------------------ */

export function useNotebookEnvEvents(
  notebookId: string | null,
  handler: (event: NotebookEnvEvent) => void,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(
    () =>
      pythonNotebooksService.onEnvEvent((event) => {
        if (!notebookId || event.notebookId === notebookId) {
          handlerRef.current(event);
        }
      }),
    [notebookId],
  );
}

export function useRecreateNotebookEnv() {
  return useMutation({
    mutationFn: ({
      connectionId,
      notebookId,
      pythonVersion,
    }: {
      connectionId: string;
      notebookId: string;
      pythonVersion?: string;
    }) =>
      pythonNotebooksService.recreateEnv(
        connectionId,
        notebookId,
        pythonVersion,
      ),
    onError: (error: Error) => {
      toast.error(`Failed to recreate environment: ${error.message}`);
    },
  });
}

export function useNotebookPackages(notebookId: string, enabled: boolean) {
  return useQuery<NotebookEnvPackage[]>({
    queryKey: pythonNotebooksKeys.packages(notebookId),
    queryFn: () => pythonNotebooksService.listPackages(notebookId),
    enabled: !!notebookId && enabled,
    staleTime: 10_000,
    retry: false,
  });
}

export function useInstallNotebookPackages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      notebookId,
      specs,
    }: {
      notebookId: string;
      specs: string[];
    }) => pythonNotebooksService.installPackages(notebookId, specs),
    onSuccess: (_log, { notebookId }) => {
      queryClient.invalidateQueries(pythonNotebooksKeys.packages(notebookId));
      toast.success('Packages installed');
    },
    onError: (error: Error) => {
      toast.error(`pip install failed: ${error.message.split('\n').pop()}`);
    },
  });
}

export function useUninstallNotebookPackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ notebookId, name }: { notebookId: string; name: string }) =>
      pythonNotebooksService.uninstallPackage(notebookId, name),
    onSuccess: (_log, { notebookId, name }) => {
      queryClient.invalidateQueries(pythonNotebooksKeys.packages(notebookId));
      toast.success(`Removed ${name}`);
    },
    onError: (error: Error) => {
      toast.error(`pip uninstall failed: ${error.message.split('\n').pop()}`);
    },
  });
}

/* ------------------------------------------------------------------ */
/* Kernel                                                                */
/* ------------------------------------------------------------------ */

export function useKernelState(notebookId: string) {
  return useQuery<KernelState>({
    queryKey: pythonNotebooksKeys.kernel(notebookId),
    queryFn: () => pythonNotebooksService.kernelStatus(notebookId),
    enabled: !!notebookId,
    staleTime: Infinity,
  });
}

/**
 * Subscribe to kernel events for one notebook. Status events also update the
 * cached KernelState so `useKernelState` stays live.
 */
export function useKernelEvents(
  notebookId: string,
  handler: (event: KernelEvent) => void,
) {
  const queryClient = useQueryClient();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(
    () =>
      pythonNotebooksService.onKernelEvent((event) => {
        if (event.notebookId !== notebookId) return;
        if (event.type === 'status') {
          queryClient.setQueryData(
            pythonNotebooksKeys.kernel(notebookId),
            event.state,
          );
        }
        handlerRef.current(event);
      }),
    [notebookId, queryClient],
  );
}

export function useExecutePythonCell() {
  return useMutation({
    mutationFn: ({
      connectionId,
      notebookId,
      cellId,
      code,
      options,
    }: {
      connectionId: string;
      notebookId: string;
      cellId: string;
      code: string;
      options?: ExecuteCellOptions;
    }) =>
      pythonNotebooksService.executeCell(
        connectionId,
        notebookId,
        cellId,
        code,
        options,
      ),
  });
}

function useKernelAction(
  action: (notebookId: string) => Promise<KernelState>,
  label: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notebookId: string) => action(notebookId),
    onSuccess: (state, notebookId) => {
      queryClient.setQueryData(pythonNotebooksKeys.kernel(notebookId), state);
    },
    onError: (error: Error) => {
      toast.error(`${label} failed: ${error.message}`);
    },
  });
}

export function useStartKernel() {
  return useKernelAction(pythonNotebooksService.startKernel, 'Kernel start');
}

export function useInterruptKernel() {
  return useKernelAction(pythonNotebooksService.interruptKernel, 'Interrupt');
}

export function useRestartKernel() {
  return useKernelAction(
    pythonNotebooksService.restartKernel,
    'Kernel restart',
  );
}

export function useShutdownKernel() {
  return useKernelAction(
    pythonNotebooksService.shutdownKernel,
    'Kernel shutdown',
  );
}
