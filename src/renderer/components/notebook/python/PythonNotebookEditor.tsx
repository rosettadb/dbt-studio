/**
 * Python Notebook Editor
 * Colab-style editor for `.ipynb` notebooks backed by a per-notebook venv and
 * an ipykernel. Cells are edited locally and auto-saved; execution streams
 * outputs from the kernel via pythonNotebooks:kernel:event.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import {
  DragDropContext,
  Draggable,
  DraggableProvided,
  DraggableStateSnapshot,
  Droppable,
  DroppableProvided,
  DropResult,
} from '@hello-pangea/dnd';
import { toast } from 'react-toastify';
import { v4 as uuidv4 } from 'uuid';
import type { Notebook } from '../../../../types/notebooks';
import type {
  KernelEvent,
  NotebookRuntime,
  PythonCellOutput,
  PythonCellType,
  PythonNotebook,
  PythonNotebookCell,
} from '../../../../types/pythonNotebooks';
import {
  useDeletePythonNotebook,
  useDuplicatePythonNotebook,
  useExecutePythonCell,
  useExportPythonNotebook,
  useInstallNotebookPackages,
  useInterruptKernel,
  useKernelEvents,
  useKernelState,
  useNotebookEnvEvents,
  usePythonNotebook,
  useRecreateNotebookEnv,
  useRestartKernel,
  useShutdownKernel,
  useUpdatePythonNotebook,
} from '../../../controllers/pythonNotebooks.controller';
import { KernelBar } from './KernelBar';
import { PythonCell, CellRunState } from './PythonCell';
import { CellInsertBar } from './CellInsertBar';
import { PackagesDialog } from './PackagesDialog';
import { PythonRuntimePicker } from './PythonRuntimePicker';
import type { RunMode } from './PythonCodeCell';

const SAVE_DEBOUNCE_MS = 600;
const PYTHON_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const pythonSaveFlushers = new Map<string, () => Promise<void>>();

export async function flushPythonNotebookPendingSave(notebookId: string) {
  const flush = pythonSaveFlushers.get(notebookId);
  if (flush) await flush();
}

export function pythonNotebookToSummary(notebook: PythonNotebook): Notebook {
  return {
    id: notebook.id,
    kind: 'python',
    name: notebook.name,
    description: notebook.description,
    cells: [],
    createdAt: notebook.createdAt,
    updatedAt: notebook.updatedAt,
    lastExecutedAt: notebook.lastExecutedAt,
    cellCount: notebook.cellCount,
  };
}

/** First of df, df_2, df_3… not used by another SQL cell. */
function nextSqlVariable(cells: PythonNotebookCell[]): string {
  const taken = new Set(
    cells
      .filter((c) => c.cell_type === 'sql')
      .map((c) => c.metadata.rosetta?.variable),
  );
  if (!taken.has('df')) return 'df';
  let n = 2;
  while (taken.has(`df_${n}`)) n += 1;
  return `df_${n}`;
}

/** Cell metadata for `type`: sql cells carry the language + result variable. */
function metadataForType(
  type: PythonCellType,
  metadata: PythonNotebookCell['metadata'],
  cells: PythonNotebookCell[],
): PythonNotebookCell['metadata'] {
  const { rosetta, ...rest } = metadata;
  if (type !== 'sql') return rest;
  return {
    ...rest,
    rosetta: {
      ...rosetta,
      language: 'sql',
      variable: rosetta?.variable || nextSqlVariable(cells),
    },
  };
}

function newCell(
  type: PythonCellType,
  cells: PythonNotebookCell[],
): PythonNotebookCell {
  return {
    id: uuidv4(),
    cell_type: type,
    source: '',
    outputs: [],
    execution_count: null,
    metadata: metadataForType(type, {}, cells),
  };
}

function appendOutput(
  outputs: PythonCellOutput[],
  output: PythonCellOutput,
): PythonCellOutput[] {
  const last = outputs[outputs.length - 1];
  if (
    output.output_type === 'stream' &&
    last?.output_type === 'stream' &&
    last.name === output.name
  ) {
    return [
      ...outputs.slice(0, -1),
      { ...last, text: `${last.text}${output.text}` },
    ];
  }
  return [...outputs, output];
}

interface PythonNotebookEditorProps {
  connectionId: string;
  notebookId: string;
  onOpenNotebook?: (notebook: Notebook, connectionId: string) => void;
  onRenamed?: (notebookId: string, name: string) => void;
  onDeleted?: (notebookId: string) => void;
}

export const PythonNotebookEditor: React.FC<PythonNotebookEditorProps> = ({
  connectionId,
  notebookId,
  onOpenNotebook,
  onRenamed,
  onDeleted,
}) => {
  const {
    data: notebook,
    isLoading,
    error,
  } = usePythonNotebook(connectionId, notebookId);
  const updateNotebook = useUpdatePythonNotebook();
  const executeCell = useExecutePythonCell();
  const interruptKernel = useInterruptKernel();
  const restartKernel = useRestartKernel();
  const shutdownKernel = useShutdownKernel();
  const recreateEnv = useRecreateNotebookEnv();
  const exportNotebook = useExportPythonNotebook();
  const duplicateNotebook = useDuplicatePythonNotebook();
  const deleteNotebook = useDeletePythonNotebook();
  const installPackages = useInstallNotebookPackages();
  const { data: kernel } = useKernelState(notebookId);

  const [cells, setCells] = useState<PythonNotebookCell[]>([]);
  const cellsRef = useRef<PythonNotebookCell[]>([]);
  const [runtime, setRuntime] = useState<NotebookRuntime | null>(null);
  const [envMessage, setEnvMessage] = useState('');
  const [activeCells, setActiveCells] = useState<string[]>([]);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [focusRequests, setFocusRequests] = useState<Record<string, number>>(
    {},
  );
  const [freshCellId, setFreshCellId] = useState<string | null>(null);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [packagesOpen, setPackagesOpen] = useState(false);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [newVersion, setNewVersion] = useState('');
  const [newVersionReady, setNewVersionReady] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateValue, setDuplicateValue] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedForRef = useRef<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!notebook || loadedForRef.current === notebook.id) return;
    loadedForRef.current = notebook.id;
    setCells(notebook.cells);
    cellsRef.current = notebook.cells;
    setRuntime(notebook.runtime);
    setSelectedCellId(notebook.cells[0]?.id ?? null);
  }, [notebook]);

  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  // ── Persistence ─────────────────────────────────────────────────
  const persist = useCallback(
    (nextCells: PythonNotebookCell[]) => {
      updateNotebook.mutate({
        connectionId,
        notebookId,
        updates: { cells: nextCells },
      });
    },
    [connectionId, notebookId, updateNotebook],
  );

  const cancelPendingSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }, []);

  const flushPendingSave = useCallback(async () => {
    if (!saveTimer.current) return;
    cancelPendingSave();
    await updateNotebook.mutateAsync({
      connectionId,
      notebookId,
      updates: { cells: cellsRef.current },
    });
  }, [cancelPendingSave, connectionId, notebookId, updateNotebook]);

  useEffect(() => {
    pythonSaveFlushers.set(notebookId, flushPendingSave);
    return () => {
      pythonSaveFlushers.delete(notebookId);
    };
  }, [notebookId, flushPendingSave]);

  // Flush unsaved edits when the editor unmounts (tab closed / switched)
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        updateNotebook.mutate({
          connectionId,
          notebookId,
          updates: { cells: cellsRef.current },
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Structural change: apply + save immediately. */
  const commitCells = useCallback(
    (updater: (prev: PythonNotebookCell[]) => PythonNotebookCell[]) => {
      cancelPendingSave();
      setCells((prev) => {
        const next = updater(prev);
        cellsRef.current = next;
        persist(next);
        return next;
      });
    },
    [cancelPendingSave, persist],
  );

  /** Content change: apply now, save debounced. */
  const patchCellDebounced = useCallback(
    (
      cellId: string,
      patch: (cell: PythonNotebookCell) => PythonNotebookCell,
    ) => {
      setCells((prev) => {
        const next = prev.map((c) => (c.id === cellId ? patch(c) : c));
        cellsRef.current = next;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          saveTimer.current = null;
          persist(cellsRef.current);
        }, SAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [persist],
  );

  const handleChangeSource = useCallback(
    (cellId: string, source: string) =>
      patchCellDebounced(cellId, (c) => ({ ...c, source })),
    [patchCellDebounced],
  );

  const handleChangeVariable = useCallback(
    (cellId: string, variable: string) =>
      patchCellDebounced(cellId, (c) => ({
        ...c,
        metadata: {
          ...c.metadata,
          rosetta: { ...c.metadata.rosetta, language: 'sql', variable },
        },
      })),
    [patchCellDebounced],
  );

  // ── Environment + kernel events ─────────────────────────────────
  useNotebookEnvEvents(notebookId, (event) => {
    if (event.message) setEnvMessage(event.message);
    setRuntime((prev) =>
      prev
        ? { ...prev, status: event.status, error: event.error }
        : {
            pythonVersion: '',
            venvPath: '',
            status: event.status,
            error: event.error,
          },
    );
    if (event.status === 'error' && event.error) {
      toast.error(`Environment error: ${event.error}`);
    }
  });

  const handleKernelEvent = useCallback((event: KernelEvent) => {
    switch (event.type) {
      case 'execute_start':
        setActiveCells((prev) =>
          prev.includes(event.cellId) ? prev : [...prev, event.cellId],
        );
        break;
      case 'output':
        setCells((prev) => {
          const next = prev.map((c) =>
            c.id === event.cellId
              ? { ...c, outputs: appendOutput(c.outputs, event.output) }
              : c,
          );
          cellsRef.current = next;
          return next;
        });
        break;
      case 'clear_output':
        setCells((prev) => {
          const next = prev.map((c) =>
            c.id === event.cellId ? { ...c, outputs: [] } : c,
          );
          cellsRef.current = next;
          return next;
        });
        break;
      case 'execute_done':
        setActiveCells((prev) => prev.filter((id) => id !== event.cellId));
        setCells((prev) => {
          const next = prev.map((c) =>
            c.id === event.cellId
              ? { ...c, execution_count: event.execution_count }
              : c,
          );
          cellsRef.current = next;
          return next;
        });
        break;
      case 'status':
        if (
          event.state.status === 'stopped' ||
          event.state.status === 'error'
        ) {
          setActiveCells([]);
        }
        break;
      default:
        break;
    }
  }, []);
  useKernelEvents(notebookId, handleKernelEvent);

  // ── Cell operations ─────────────────────────────────────────────
  const focusCell = useCallback((cellId: string) => {
    setSelectedCellId(cellId);
    setFocusRequests((prev) => ({
      ...prev,
      [cellId]: (prev[cellId] ?? 0) + 1,
    }));
  }, []);

  const insertCell = useCallback(
    (type: PythonCellType, index: number) => {
      const cell = newCell(type, cellsRef.current);
      commitCells((prev) => [
        ...prev.slice(0, index),
        cell,
        ...prev.slice(index),
      ]);
      setFreshCellId(cell.id);
      focusCell(cell.id);
      return cell.id;
    },
    [commitCells, focusCell],
  );

  const deleteCell = useCallback(
    (cellId: string) => {
      const index = cellsRef.current.findIndex((c) => c.id === cellId);
      commitCells((prev) => prev.filter((c) => c.id !== cellId));
      const remaining = cellsRef.current.filter((c) => c.id !== cellId);
      const neighbour = remaining[Math.min(index, remaining.length - 1)];
      setSelectedCellId(neighbour?.id ?? null);
    },
    [commitCells],
  );

  const duplicateCell = useCallback(
    (cellId: string) => {
      commitCells((prev) => {
        const index = prev.findIndex((c) => c.id === cellId);
        if (index === -1) return prev;
        const original = prev[index];
        const copy: PythonNotebookCell = {
          ...original,
          id: uuidv4(),
          outputs: [],
          execution_count: null,
          // A duplicated SQL cell gets its own result variable
          metadata:
            original.cell_type === 'sql'
              ? metadataForType(
                  'sql',
                  { ...original.metadata, rosetta: { language: 'sql' } },
                  prev,
                )
              : original.metadata,
        };
        return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
      });
    },
    [commitCells],
  );

  const moveCell = useCallback(
    (cellId: string, delta: -1 | 1) => {
      commitCells((prev) => {
        const index = prev.findIndex((c) => c.id === cellId);
        const target = index + delta;
        if (index === -1 || target < 0 || target >= prev.length) return prev;
        const next = [...prev];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      });
    },
    [commitCells],
  );

  const changeCellType = useCallback(
    (cellId: string, type: PythonCellType) => {
      commitCells((prev) =>
        prev.map((c) =>
          c.id === cellId
            ? {
                ...c,
                cell_type: type,
                outputs: [],
                execution_count: null,
                metadata: metadataForType(type, c.metadata, prev),
              }
            : c,
        ),
      );
      if (type === 'markdown') setFreshCellId(cellId);
    },
    [commitCells],
  );

  const clearCellOutputs = useCallback(
    (cellId: string) => {
      commitCells((prev) =>
        prev.map((c) =>
          c.id === cellId ? { ...c, outputs: [], execution_count: null } : c,
        ),
      );
    },
    [commitCells],
  );

  const clearAllOutputs = useCallback(() => {
    commitCells((prev) =>
      prev.map((c) => ({ ...c, outputs: [], execution_count: null })),
    );
  }, [commitCells]);

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;
      const from = result.source.index;
      const to = result.destination.index;
      if (from === to) return;
      commitCells((prev) => {
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
    },
    [commitCells],
  );

  // ── Execution ───────────────────────────────────────────────────
  const runCell = useCallback(
    async (cellId: string): Promise<boolean> => {
      const cell = cellsRef.current.find((c) => c.id === cellId);
      if (!cell || cell.cell_type === 'markdown') return true;
      const variable = cell.metadata.rosetta?.variable ?? '';
      if (cell.cell_type === 'sql' && !PYTHON_IDENTIFIER.test(variable)) {
        toast.warn(`"${variable}" is not a valid Python variable name.`);
        return false;
      }
      if (runtime && runtime.status !== 'ready') {
        toast.warn(
          runtime.status === 'creating'
            ? 'The environment is still being created.'
            : 'The environment is not ready. Recreate it from the kernel bar.',
        );
        return false;
      }
      if (!cell.source.trim()) return true;

      await flushPendingSave();
      setActiveCells((prev) =>
        prev.includes(cellId) ? prev : [...prev, cellId],
      );
      setCells((prev) => {
        const next = prev.map((c) =>
          c.id === cellId ? { ...c, outputs: [], execution_count: null } : c,
        );
        cellsRef.current = next;
        return next;
      });

      try {
        const result = await executeCell.mutateAsync({
          connectionId,
          notebookId,
          cellId,
          code: cell.source,
          options:
            cell.cell_type === 'sql'
              ? { cellType: 'sql', variable }
              : undefined,
        });
        setCells((prev) => {
          const next = prev.map((c) =>
            c.id === cellId
              ? {
                  ...c,
                  outputs: result.outputs,
                  execution_count: result.execution_count,
                }
              : c,
          );
          cellsRef.current = next;
          return next;
        });
        return result.status === 'ok';
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(`Execution failed: ${message}`);
        return false;
      } finally {
        setActiveCells((prev) => prev.filter((id) => id !== cellId));
      }
    },
    [connectionId, notebookId, executeCell, flushPendingSave, runtime],
  );

  const handleRun = useCallback(
    (cellId: string, mode: RunMode) => {
      const index = cellsRef.current.findIndex((c) => c.id === cellId);
      const cell = cellsRef.current[index];
      if (!cell) return;

      if (cell.cell_type !== 'markdown') {
        runCell(cellId).catch(() => undefined);
      }

      if (mode === 'insert') {
        insertCell('code', index + 1);
      } else if (mode === 'advance') {
        const next = cellsRef.current[index + 1];
        if (next) focusCell(next.id);
        else insertCell('code', index + 1);
      }
    },
    [runCell, insertCell, focusCell],
  );

  const handleRunAll = useCallback(async () => {
    setIsRunningAll(true);
    try {
      const codeCells = cellsRef.current.filter(
        (c) => c.cell_type !== 'markdown',
      );
      // eslint-disable-next-line no-restricted-syntax
      for (const cell of codeCells) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await runCell(cell.id);
        if (!ok) {
          toast.warn('Run all stopped at the first error.');
          break;
        }
      }
    } finally {
      setIsRunningAll(false);
    }
  }, [runCell]);

  /** "Install pandas" from a SQL cell's fallback notice: pip install, re-run. */
  const handleInstallPandas = useCallback(
    (cellId: string) => {
      installPackages.mutate(
        { notebookId, specs: ['pandas'] },
        { onSuccess: () => runCell(cellId).catch(() => undefined) },
      );
    },
    [installPackages, notebookId, runCell],
  );

  // ── Keyboard (command mode) ─────────────────────────────────────
  const pendingD = useRef(false);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        !selectedCellId ||
        !target ||
        target.closest('.monaco-editor') ||
        target.closest('input, textarea, [contenteditable="true"]') ||
        target.closest('.MuiDialog-root')
      ) {
        return;
      }
      const index = cellsRef.current.findIndex((c) => c.id === selectedCellId);
      if (index === -1) return;

      switch (event.key) {
        case 'a':
          event.preventDefault();
          insertCell('code', index);
          break;
        case 'b':
          event.preventDefault();
          insertCell('code', index + 1);
          break;
        case 'm':
          event.preventDefault();
          changeCellType(selectedCellId, 'markdown');
          break;
        case 'y':
          event.preventDefault();
          changeCellType(selectedCellId, 'code');
          break;
        case 'd':
          if (pendingD.current) {
            event.preventDefault();
            pendingD.current = false;
            deleteCell(selectedCellId);
          } else {
            pendingD.current = true;
            setTimeout(() => {
              pendingD.current = false;
            }, 600);
          }
          break;
        case 'Enter':
          if (event.shiftKey || event.metaKey || event.ctrlKey) {
            event.preventDefault();
            handleRun(selectedCellId, event.shiftKey ? 'advance' : 'stay');
          } else {
            event.preventDefault();
            focusCell(selectedCellId);
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    selectedCellId,
    insertCell,
    changeCellType,
    deleteCell,
    handleRun,
    focusCell,
  ]);

  // ── Notebook-level actions ──────────────────────────────────────
  const handleRenameConfirm = () => {
    const name = renameValue.trim();
    setRenameOpen(false);
    if (!name || !notebook || name === notebook.name) return;
    updateNotebook.mutate(
      { connectionId, notebookId, updates: { name } },
      {
        onSuccess: () => {
          onRenamed?.(notebookId, name);
          toast.success(`Notebook renamed to "${name}"`);
        },
      },
    );
  };

  const handleDuplicateConfirm = async () => {
    const name = duplicateValue.trim();
    if (!name) return;
    setDuplicateOpen(false);
    await flushPendingSave();
    try {
      const duplicated = await duplicateNotebook.mutateAsync({
        connectionId,
        notebookId,
        newName: name,
      });
      onOpenNotebook?.(pythonNotebookToSummary(duplicated), connectionId);
    } catch {
      // handled by mutation
    }
  };

  const handleDeleteConfirm = async () => {
    setDeleteOpen(false);
    cancelPendingSave();
    try {
      await deleteNotebook.mutateAsync({ connectionId, notebookId });
      onDeleted?.(notebookId);
    } catch {
      // handled by mutation
    }
  };

  const handleExport = async () => {
    await flushPendingSave();
    exportNotebook.mutate({ connectionId, notebookId });
  };

  const handleChangeVersionConfirm = () => {
    setVersionDialogOpen(false);
    if (!newVersion) return;
    setRuntime((prev) =>
      prev ? { ...prev, pythonVersion: newVersion, status: 'creating' } : prev,
    );
    recreateEnv.mutate({ connectionId, notebookId, pythonVersion: newVersion });
  };

  const runStates = useMemo(() => {
    const map: Record<string, CellRunState> = {};
    activeCells.forEach((id, i) => {
      map[id] = i === 0 ? 'running' : 'queued';
    });
    return map;
  }, [activeCells]);

  const displayName = notebook?.name ?? '';
  const effectiveRuntime: NotebookRuntime = runtime ??
    notebook?.runtime ?? {
      pythonVersion: '',
      venvPath: '',
      status: 'missing',
    };

  // ── Render ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Failed to load notebook: {(error as Error).message}
        </Alert>
      </Box>
    );
  }
  if (!notebook) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">Notebook not found</Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      data-testid="python-notebook-editor"
    >
      <KernelBar
        name={displayName}
        cellCount={cells.length}
        runtime={effectiveRuntime}
        envMessage={envMessage}
        kernel={kernel}
        isRunningAll={isRunningAll}
        onRunAll={handleRunAll}
        onInterrupt={() => interruptKernel.mutate(notebookId)}
        onRestart={() => {
          setActiveCells([]);
          restartKernel.mutate(notebookId);
        }}
        onShutdown={() => {
          setActiveCells([]);
          shutdownKernel.mutate(notebookId);
        }}
        onRecreateEnv={() => {
          setRuntime((prev) => (prev ? { ...prev, status: 'creating' } : prev));
          recreateEnv.mutate({ connectionId, notebookId });
        }}
        onChangeVersion={() => {
          setNewVersion(effectiveRuntime.pythonVersion);
          setVersionDialogOpen(true);
        }}
        onOpenPackages={() => setPackagesOpen(true)}
        onClearOutputs={clearAllOutputs}
        onRename={() => {
          setRenameValue(notebook.name);
          setRenameOpen(true);
        }}
        onDuplicate={() => {
          setDuplicateValue(`${notebook.name} (Copy)`);
          setDuplicateOpen(true);
        }}
        onExport={handleExport}
        onDelete={() => setDeleteOpen(true)}
      />

      {effectiveRuntime.status === 'error' && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          Environment setup failed: {effectiveRuntime.error}
        </Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 3, py: 2 }}>
        {cells.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 1,
            }}
          >
            <Typography variant="h6" color="text.secondary">
              Empty notebook
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Add a code, SQL or text cell to get started
            </Typography>
            <CellInsertBar
              persistent
              onAddCode={() => insertCell('code', 0)}
              onAddSql={() => insertCell('sql', 0)}
              onAddText={() => insertCell('markdown', 0)}
            />
          </Box>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="python-notebook-cells">
              {(droppable: DroppableProvided) => (
                <Box
                  ref={droppable.innerRef}
                  // eslint-disable-next-line react/jsx-props-no-spreading
                  {...droppable.droppableProps}
                  sx={{ maxWidth: 1100, mx: 'auto' }}
                >
                  <CellInsertBar
                    onAddCode={() => insertCell('code', 0)}
                    onAddSql={() => insertCell('sql', 0)}
                    onAddText={() => insertCell('markdown', 0)}
                  />
                  {cells.map((cell, index) => (
                    <Draggable
                      key={cell.id}
                      draggableId={cell.id}
                      index={index}
                    >
                      {(
                        draggable: DraggableProvided,
                        snapshot: DraggableStateSnapshot,
                      ) => (
                        <Box
                          ref={draggable.innerRef}
                          // eslint-disable-next-line react/jsx-props-no-spreading
                          {...draggable.draggableProps}
                          sx={{ opacity: snapshot.isDragging ? 0.85 : 1 }}
                        >
                          <PythonCell
                            cell={cell}
                            index={index}
                            isSelected={selectedCellId === cell.id}
                            runState={runStates[cell.id] ?? 'idle'}
                            kernelBusy={activeCells.length > 0}
                            focusRequest={focusRequests[cell.id]}
                            startEditing={freshCellId === cell.id}
                            dragHandleProps={draggable.dragHandleProps}
                            installingPandas={installPackages.isLoading}
                            onSelect={() => setSelectedCellId(cell.id)}
                            onChange={(source) =>
                              handleChangeSource(cell.id, source)
                            }
                            onChangeVariable={(variable) =>
                              handleChangeVariable(cell.id, variable)
                            }
                            onInstallPandas={() => handleInstallPandas(cell.id)}
                            onRun={(mode) => handleRun(cell.id, mode)}
                            onInterrupt={() =>
                              interruptKernel.mutate(notebookId)
                            }
                            onDelete={() => deleteCell(cell.id)}
                            onDuplicate={() => duplicateCell(cell.id)}
                            onMoveUp={() => moveCell(cell.id, -1)}
                            onMoveDown={() => moveCell(cell.id, 1)}
                            onClearOutputs={() => clearCellOutputs(cell.id)}
                            onChangeType={(type) =>
                              changeCellType(cell.id, type)
                            }
                          />
                          <CellInsertBar
                            onAddCode={() => insertCell('code', index + 1)}
                            onAddSql={() => insertCell('sql', index + 1)}
                            onAddText={() => insertCell('markdown', index + 1)}
                          />
                        </Box>
                      )}
                    </Draggable>
                  ))}
                  {droppable.placeholder}
                </Box>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </Box>

      <PackagesDialog
        open={packagesOpen}
        notebookId={notebookId}
        envReady={effectiveRuntime.status === 'ready'}
        onClose={() => setPackagesOpen(false)}
      />

      {/* Change Python version */}
      <Dialog
        open={versionDialogOpen}
        onClose={() => setVersionDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Change Python version</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            The notebook&apos;s environment will be recreated with the selected
            interpreter. Installed packages are not carried over.
          </DialogContentText>
          <PythonRuntimePicker
            value={newVersion}
            onChange={setNewVersion}
            onReadyChange={setNewVersionReady}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVersionDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleChangeVersionConfirm}
            disabled={!newVersionReady}
          >
            Recreate environment
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename */}
      <Dialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rename Notebook</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Notebook Name"
            fullWidth
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRenameConfirm();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleRenameConfirm}
            disabled={!renameValue.trim()}
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Duplicate */}
      <Dialog
        open={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Duplicate Notebook</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>
            A new environment with the same Python version and packages is
            created for the copy.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="New Notebook Name"
            fullWidth
            value={duplicateValue}
            onChange={(e) => setDuplicateValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && duplicateValue.trim()) {
                e.preventDefault();
                handleDuplicateConfirm();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDuplicateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleDuplicateConfirm}
            disabled={!duplicateValue.trim() || duplicateNotebook.isLoading}
          >
            Duplicate
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete Notebook</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete &quot;{notebook.name}&quot; and its virtual environment? This
            cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDeleteConfirm}
            disabled={deleteNotebook.isLoading}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PythonNotebookEditor;
