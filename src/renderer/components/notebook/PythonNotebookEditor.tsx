import React from 'react';
import Editor from '@monaco-editor/react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowDownward,
  ArrowUpward,
  Clear,
  Delete,
  ExpandLess,
  ExpandMore,
  Pause,
  PlayArrow,
  RestartAlt,
  Stop,
  FileDownload,
  FileUpload,
  ContentCopy,
  DriveFileRenameOutline,
  CleaningServices,
  Code,
  Description,
  MoreVert,
  TextSnippet,
} from '@mui/icons-material';
import { v4 as uuidv4 } from 'uuid';
import {
  PythonNotebook,
  PythonNotebookCell,
  PythonCellOutput,
} from '../../../types/notebooks';
import {
  usePythonNotebook,
  usePythonNotebookExecution,
  usePythonNotebookRuntimeStatus,
  useSavePythonNotebook,
  useClearPythonNotebookOutputs,
} from '../../controllers/notebooks.controller';
import { notebooksService } from '../../services/notebooks.service';
import { JupyterBridgeHandlers } from '../../services/notebookBridge.service';
import { useJupyterBridge } from '../../hooks/useNotebookBridge';
import { MarkdownCell } from './MarkdownCell';

const pythonNotebookSaveFlushers = new Map<
  string,
  () => Promise<PythonNotebook>
>();

const toolbarIconSx = {
  width: 28,
  height: 28,
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  color: 'text.secondary',
  '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
};

const toolbarActionSx = (order: number) => ({ ...toolbarIconSx, order });

type PythonCellSection = 'all' | 'code' | 'output';

const safeHtmlDocument = (html: string) => {
  const sanitized = html
    .replace(/<\/?(?:script|iframe|object|embed|svg|style)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(
      /\s(?:src|href)\s*=\s*(?:"(?!data:image\/(?:png|jpeg);base64)[^"]*"|'(?!data:image\/(?:png|jpeg);base64)[^']*'|[^\s>]+)/gi,
      '',
    );
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><body>${sanitized}</body>`;
};

const PythonOutput: React.FC<{ output: PythonCellOutput }> = ({ output }) => {
  if (output.type === 'truncated')
    return <Alert severity="warning">Output truncated.</Alert>;
  if (output.mime === 'image/png' || output.mime === 'image/jpeg') {
    return (
      <Box
        component="img"
        alt="Python output"
        src={`data:${output.mime};base64,${output.data ?? ''}`}
        sx={{ maxWidth: '100%', display: 'block' }}
      />
    );
  }
  if (output.mime === 'text/html' && output.data) {
    return (
      <Box
        component="iframe"
        title="Python HTML output"
        sandbox=""
        srcDoc={safeHtmlDocument(output.data)}
        sx={{
          border: 0,
          width: '100%',
          minHeight: 80,
          bgcolor: 'background.paper',
        }}
      />
    );
  }
  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: output.type === 'error' ? 'error.main' : 'text.primary',
      }}
    >
      {output.name ? `${output.name}: ` : ''}
      {output.text}
    </Box>
  );
};

export async function flushPythonNotebookPendingSave(notebookId: string) {
  return pythonNotebookSaveFlushers.get(notebookId)?.();
}

export const PythonNotebookEditor: React.FC<{
  notebookId: string;
  onDeleted?: (notebookId: string) => void;
  onImported?: (notebook: PythonNotebook) => void;
}> = ({ notebookId, onDeleted, onImported }) => {
  const muiTheme = useTheme();
  const { data: notebook, isLoading } = usePythonNotebook(notebookId);
  const save = useSavePythonNotebook();
  const { data: runtime } = usePythonNotebookRuntimeStatus();
  const {
    cells: executionCells,
    clearCellOutput: clearExecutionCellOutput,
    clearOutputs: clearExecutionOutputs,
    execute,
    hasActiveSession,
    interrupt,
    restart,
    runAll,
    sessionState,
    shutdown,
  } = usePythonNotebookExecution(notebookId);
  const [draft, setDraft] = React.useState<PythonNotebook | null>(null);
  const saveTimer = React.useRef<number | null>(null);
  const [restartOpen, setRestartOpen] = React.useState(false);
  const [documentAction, setDocumentAction] = React.useState<
    'rename' | 'duplicate' | 'delete' | null
  >(null);
  const [documentName, setDocumentName] = React.useState('');
  const clearOutputs = useClearPythonNotebookOutputs();
  const persistedOutputs = React.useRef<Record<string, string>>({});
  const [collapsedCells, setCollapsedCells] = React.useState<
    Record<string, boolean>
  >({});
  const [cellSections, setCellSections] = React.useState<
    Record<string, PythonCellSection>
  >({});
  const [cellMenu, setCellMenu] = React.useState<{
    anchorEl: HTMLElement;
    cellId: string;
  } | null>(null);
  const monacoTheme =
    muiTheme.palette.mode === 'dark'
      ? 'sql-enhanced-dark'
      : 'sql-enhanced-light';

  React.useEffect(() => setDraft(notebook ?? null), [notebook]);

  const updateCells = (cells: PythonNotebookCell[]) => {
    if (!draft) return;
    const next = { ...draft, cells };
    setDraft(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      save.mutate(
        { notebook: next, expectedRevision: next.revision },
        {
          onSuccess: (saved) => setDraft(saved),
        },
      );
    }, 500);
  };

  const flushPendingSave = React.useCallback(async () => {
    if (!draft) throw new Error('Python notebook is not available.');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const saved = await save.mutateAsync({
      notebook: draft,
      expectedRevision: draft.revision,
    });
    setDraft(saved);
    return saved;
  }, [draft, save]);

  React.useEffect(() => {
    pythonNotebookSaveFlushers.set(notebookId, flushPendingSave);
    return () => {
      pythonNotebookSaveFlushers.delete(notebookId);
    };
  }, [flushPendingSave, notebookId]);

  React.useEffect(() => {
    if (!draft) return;
    const completed = Object.entries(executionCells).filter(
      ([, cell]) => cell.status === 'success' || cell.status === 'error',
    );
    if (!completed.length) return;
    const fingerprint = JSON.stringify(
      completed.map(([id, cell]) => [id, cell.outputs]),
    );
    if (persistedOutputs.current[notebookId] === fingerprint) return;
    persistedOutputs.current[notebookId] = fingerprint;
    const cells = draft.cells.map((cell) => {
      const execution = executionCells[cell.id];
      return execution &&
        (execution.status === 'success' || execution.status === 'error')
        ? {
            ...cell,
            outputs: execution.outputs.slice(0, 200),
            outputProvenance: {
              documentRevision: draft.revision,
              executedAt: new Date().toISOString(),
            },
          }
        : cell;
    });
    save.mutate(
      { notebook: { ...draft, cells }, expectedRevision: draft.revision },
      { onSuccess: setDraft },
    );
  }, [draft, executionCells, notebookId, save]);

  const runCell = async (cellId: string) => {
    if (!draft || execute.isLoading) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const saved = await save.mutateAsync({
      notebook: draft,
      expectedRevision: draft.revision,
    });
    setDraft(saved);
    await execute.mutateAsync({
      notebookId: saved.id,
      cellId,
      revision: saved.revision,
      requestId: uuidv4(),
    });
  };

  const runAllCells = async () => {
    if (!draft || runAll.isLoading) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const saved = await save.mutateAsync({
      notebook: draft,
      expectedRevision: draft.revision,
    });
    setDraft(saved);
    await runAll.mutateAsync({
      notebookId: saved.id,
      revision: saved.revision,
      requestId: uuidv4(),
    });
  };

  const navigate = useNavigate();
  const getCellSummary = (cell: PythonNotebookCell): string => {
    const firstLine = cell.source.split('\n')[0].trim();
    const preview =
      firstLine.length > 80 ? `${firstLine.substring(0, 80)}...` : firstLine;
    if (preview) return preview;
    return `Empty ${cell.cellType} cell`;
  };

  // Phase 11: surface the first missing third-party import so the user can
  // install it from Settings instead of re-running a failing cell.
  const missingPackageName = React.useMemo(() => {
    const fromExecution = Object.values(executionCells).flatMap((cell) => [
      cell.text,
      cell.error ?? '',
      ...(cell.outputs ?? []).map((output) => output.text ?? ''),
    ]);
    const fromDraft = (draft?.cells ?? []).flatMap((cell) =>
      (cell.outputs ?? []).map((output) => output.text ?? ''),
    );
    const found = [...fromExecution, ...fromDraft]
      .map(
        (text) =>
          text
            .match(
              /ModuleNotFoundError:\s*No module named ['"]([^'"]+)['"]/,
            )?.[1]
            ?.split('.')[0],
      )
      .find((name): name is string => Boolean(name));
    return found ?? null;
  }, [executionCells, draft]);

  // Phase 10 — Jupyter AI Agent bridge (read/edit only, no execution).
  // Edits flow through updateCells so they persist via the normal debounced
  // revision-aware save path. Result snapshots are bounded and never expose
  // live kernel variables.
  const jupyterBridgeHandlers = React.useMemo<JupyterBridgeHandlers>(
    () => ({
      getJupyterState: () => {
        if (!draft) throw new Error('Python notebook is not available.');
        return {
          notebookId: draft.id,
          notebookName: draft.name,
          cells: draft.cells.map((cell, order) => ({
            id: cell.id,
            cellType: cell.cellType,
            order,
            sourcePreview: cell.source.split('\n')[0].slice(0, 100),
            hasOutput:
              (executionCells[cell.id]?.outputs ?? cell.outputs ?? []).length >
              0,
          })),
        };
      },
      getCellSource: (cellId: string) => {
        const cell = draft?.cells.find((c) => c.id === cellId);
        if (!cell) {
          throw new Error(`Cell "${cellId}" was not found in this notebook.`);
        }
        return { source: cell.source, cellType: cell.cellType };
      },
      addCell: (cellType: 'code' | 'markdown', source: string) => {
        if (!draft) throw new Error('Python notebook is not available.');
        const cellId = uuidv4();
        updateCells([
          ...draft.cells,
          { id: cellId, cellType, source, executionCount: null },
        ]);
        return cellId;
      },
      setCellSource: (cellId: string, source: string) => {
        if (!draft) throw new Error('Python notebook is not available.');
        if (!draft.cells.some((c) => c.id === cellId)) {
          throw new Error(`Cell "${cellId}" was not found in this notebook.`);
        }
        clearExecutionCellOutput(cellId);
        updateCells(
          draft.cells.map((cell) =>
            cell.id === cellId
              ? {
                  ...cell,
                  source,
                  executionCount:
                    cell.cellType === 'code' ? null : cell.executionCount,
                  outputs: cell.cellType === 'code' ? [] : cell.outputs,
                }
              : cell,
          ),
        );
      },
      getCellResultSnapshot: (cellId: string) => {
        const execution = executionCells[cellId];
        const cell = draft?.cells.find((c) => c.id === cellId);
        if (!execution && !cell) {
          throw new Error(`Cell "${cellId}" was not found in this notebook.`);
        }
        const outputs = execution?.outputs ?? cell?.outputs ?? [];
        const text = outputs
          .map((output) => output.text ?? '')
          .join('')
          .slice(0, 4000);
        return {
          status:
            execution?.status ?? (outputs.length > 0 ? 'success' : 'not-run'),
          executionCount: cell?.executionCount ?? null,
          truncated: Boolean(execution?.truncated),
          text,
          error: execution?.error,
          hasImage: outputs.some(
            (output) =>
              output.mime === 'image/png' || output.mime === 'image/jpeg',
          ),
          hasHtml: outputs.some((output) => output.mime === 'text/html'),
          outputCount: outputs.length,
        };
      },
    }),
    // updateCells closes over the current draft, so draft in deps is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, executionCells],
  );

  useJupyterBridge(jupyterBridgeHandlers, Boolean(draft));

  const getSourceEditorHeight = (source: string): number => {
    const lineCount = Math.max(3, source.split('\n').length);
    return lineCount * 20 + 18;
  };

  const closeCellMenu = () => setCellMenu(null);

  const duplicateCell = (cellId: string) => {
    if (!draft) return;
    const index = draft.cells.findIndex((cell) => cell.id === cellId);
    if (index < 0) return;
    const cell = draft.cells[index];
    const duplicated: PythonNotebookCell = {
      ...cell,
      id: uuidv4(),
      executionCount: cell.cellType === 'code' ? null : cell.executionCount,
    };
    updateCells([
      ...draft.cells.slice(0, index + 1),
      duplicated,
      ...draft.cells.slice(index + 1),
    ]);
    closeCellMenu();
  };

  const clearCellOutput = (cellId: string) => {
    if (!draft) return;
    clearExecutionCellOutput(cellId);
    updateCells(
      draft.cells.map((cell) =>
        cell.id === cellId
          ? {
              ...cell,
              executionCount: null,
              outputs: [],
              outputProvenance: undefined,
            }
          : cell,
      ),
    );
    closeCellMenu();
  };

  const deleteCell = (cellId: string) => {
    if (!draft) return;
    updateCells(draft.cells.filter((cell) => cell.id !== cellId));
    closeCellMenu();
  };

  const isBusy = ['running', 'interrupting', 'restarting'].includes(
    sessionState,
  );
  const documentActionTitle = {
    rename: 'Rename Python notebook',
    duplicate: 'Duplicate Python notebook',
    delete: 'Delete Python notebook?',
  }[documentAction ?? 'rename'];
  const documentActionLabel = {
    rename: 'Rename',
    duplicate: 'Duplicate',
    delete: 'Delete',
  }[documentAction ?? 'rename'];

  if (isLoading || !draft)
    return <Typography sx={{ p: 2 }}>Loading notebook…</Typography>;

  return (
    <Box
      sx={{
        py: 2,
        px: { xs: 2, md: 5 },
        overflow: 'auto',
        height: '100%',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="h6">{draft.name}</Typography>
        <Chip size="small" label="Python" color="primary" />
        <Box sx={{ flex: 1 }} />
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            flexWrap: 'nowrap',
          }}
        >
          <Tooltip title="Run all">
            <span style={{ order: 5 }}>
              <Button
                size="small"
                aria-label="Run all"
                startIcon={<PlayArrow fontSize="small" />}
                sx={{
                  order: 5,
                  minWidth: 0,
                  height: 32,
                  px: 1.25,
                  textTransform: 'none',
                  bgcolor: 'action.selected',
                  color: 'text.primary',
                  '&:hover': { bgcolor: 'action.focus' },
                  '&.Mui-disabled': { color: 'text.disabled' },
                }}
                disabled={
                  runtime?.state !== 'ready' || isBusy || runAll.isLoading
                }
                onClick={runAllCells}
              >
                Run All
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Interrupt">
            <span style={{ order: 3 }}>
              <IconButton
                size="small"
                aria-label="Interrupt"
                sx={toolbarActionSx(3)}
                disabled={sessionState !== 'running' || interrupt.isLoading}
                onClick={() => interrupt.mutate()}
              >
                <Pause fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Restart kernel">
            <span style={{ order: 3 }}>
              <IconButton
                size="small"
                aria-label="Restart kernel"
                sx={toolbarActionSx(3)}
                disabled={
                  (!hasActiveSession && sessionState !== 'dead') ||
                  sessionState === 'restarting'
                }
                onClick={() => setRestartOpen(true)}
              >
                <RestartAlt fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Shut down kernel">
            <span style={{ order: 3 }}>
              <IconButton
                size="small"
                aria-label="Shut down kernel"
                sx={toolbarActionSx(3)}
                disabled={
                  shutdown.isLoading ||
                  (!hasActiveSession &&
                    (runtime?.activeSessionCount ?? 0) === 0)
                }
                onClick={() => shutdown.mutate()}
              >
                <Stop fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Clear outputs">
            <span style={{ order: 4 }}>
              <Button
                size="small"
                aria-label="Clear outputs"
                startIcon={<CleaningServices sx={{ fontSize: 14 }} />}
                variant="outlined"
                sx={{
                  textTransform: 'none',
                  fontSize: '0.8125rem',
                  height: 28,
                  px: 1.5,
                  minWidth: 'auto',
                  order: 4,
                  borderColor:
                    muiTheme.palette.mode === 'dark' ? 'grey.700' : 'grey.300',
                  color:
                    muiTheme.palette.mode === 'dark' ? 'grey.300' : 'grey.700',
                  '&:hover': {
                    borderColor:
                      muiTheme.palette.mode === 'dark'
                        ? 'grey.600'
                        : 'grey.400',
                    bgcolor:
                      muiTheme.palette.mode === 'dark'
                        ? 'grey.800'
                        : 'grey.100',
                  },
                  '&.Mui-disabled': {
                    borderColor:
                      muiTheme.palette.mode === 'dark'
                        ? 'grey.800'
                        : 'grey.200',
                    color:
                      muiTheme.palette.mode === 'dark'
                        ? 'grey.700'
                        : 'grey.400',
                  },
                }}
                disabled={clearOutputs.isLoading}
                onClick={() =>
                  clearOutputs.mutate(
                    { id: draft.id, revision: draft.revision },
                    {
                      onSuccess: (saved) => {
                        if (saved) {
                          setDraft(saved);
                          clearExecutionOutputs();
                        }
                      },
                    },
                  )
                }
              >
                Clear
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Export notebook">
            <IconButton
              size="small"
              aria-label="Export notebook"
              sx={toolbarActionSx(2)}
              onClick={async () => {
                const saved = await flushPendingSave();
                if (!saved) return;
                await notebooksService.exportPythonNotebook(
                  saved.id,
                  saved.revision,
                );
              }}
            >
              <FileDownload fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Import notebook">
            <IconButton
              size="small"
              aria-label="Import notebook"
              sx={toolbarActionSx(3)}
              onClick={async () => {
                const imported = await notebooksService.importPythonNotebook();
                if (imported) onImported?.(imported);
              }}
            >
              <FileUpload fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Rename notebook">
            <IconButton
              size="small"
              aria-label="Rename notebook"
              sx={toolbarActionSx(2)}
              onClick={() => {
                setDocumentName(draft.name);
                setDocumentAction('rename');
              }}
            >
              <DriveFileRenameOutline fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Duplicate notebook">
            <IconButton
              size="small"
              aria-label="Duplicate notebook"
              sx={toolbarActionSx(2)}
              onClick={() => {
                setDocumentName(`${draft.name} (Copy)`);
                setDocumentAction('duplicate');
              }}
            >
              <ContentCopy fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete notebook">
            <IconButton
              size="small"
              aria-label="Delete notebook"
              color="error"
              sx={{
                ...toolbarActionSx(2),
                '&:hover': { bgcolor: 'error.dark' },
              }}
              onClick={() => setDocumentAction('delete')}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add code cell">
            <IconButton
              size="small"
              aria-label="Add code cell"
              sx={toolbarActionSx(2)}
              onClick={() =>
                updateCells([
                  ...draft.cells,
                  {
                    id: uuidv4(),
                    cellType: 'code',
                    source: '',
                    executionCount: null,
                  },
                ])
              }
            >
              <Code fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add Markdown cell">
            <IconButton
              size="small"
              aria-label="Add Markdown cell"
              sx={toolbarActionSx(3)}
              onClick={() =>
                updateCells([
                  ...draft.cells,
                  { id: uuidv4(), cellType: 'markdown', source: '' },
                ])
              }
            >
              <Description fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add raw cell">
            <IconButton
              size="small"
              aria-label="Add raw cell"
              sx={toolbarActionSx(3)}
              onClick={() =>
                updateCells([
                  ...draft.cells,
                  { id: uuidv4(), cellType: 'raw', source: '' },
                ])
              }
            >
              <TextSnippet fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      {runtime?.state !== 'ready' && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Set up Jupyter packages in Settings → Python before running cells.
        </Alert>
      )}
      {runtime?.selectedEnvironment && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Chip
            size="small"
            label={runtime.selectedEnvironment.label}
            color="default"
          />
          <Typography variant="caption" color="text.secondary">
            Python {runtime.selectedEnvironment.pythonVersion ?? 'unknown'}
            {sessionState !== 'stopped' ? ` · kernel ${sessionState}` : ''}
            {!runtime.selectedEnvironment.writable ? ' · read-only' : ''}
          </Typography>
        </Box>
      )}
      {missingPackageName && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button
              size="small"
              onClick={() => navigate('/app/settings/python')}
            >
              Open package settings
            </Button>
          }
        >
          Python package &quot;{missingPackageName}&quot; is not installed in
          the active notebook environment. Install it from Settings → Python →
          Jupyter Notebooks instead of re-running this cell.
        </Alert>
      )}
      {restart.isSuccess && sessionState === 'idle' && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          The kernel was restarted. Existing output may be stale.
        </Alert>
      )}
      {draft.cells.map((cell, index) => {
        const collapsed = collapsedCells[cell.id] ?? false;
        const section = cellSections[cell.id] ?? 'all';
        const execution = executionCells[cell.id];
        const outputs = execution?.outputs ?? cell.outputs ?? [];
        const hasOutput =
          outputs.length > 0 ||
          execution?.status === 'running' ||
          Boolean(execution?.truncated);
        const showCode = section === 'all' || section === 'code';
        const showOutput = section === 'all' || section === 'output';
        const cellTypeLabel = cell.cellType.toUpperCase();

        return (
          <Box
            key={cell.id}
            sx={{
              mb: 2,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              overflow: collapsed ? 'hidden' : 'visible',
              '&:hover': { borderColor: 'primary.main' },
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                py: 0.5,
                bgcolor: (theme) =>
                  theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                borderBottom: collapsed ? 'none' : '1px solid',
                borderColor: 'divider',
                minHeight: '32px',
              }}
            >
              <IconButton
                size="small"
                aria-label={collapsed ? 'Expand cell' : 'Collapse cell'}
                onClick={() =>
                  setCollapsedCells((previous) => ({
                    ...previous,
                    [cell.id]: !collapsed,
                  }))
                }
                sx={{ p: 0.25 }}
              >
                {collapsed ? (
                  <ExpandMore sx={{ fontSize: 18 }} />
                ) : (
                  <ExpandLess sx={{ fontSize: 18 }} />
                )}
              </IconButton>

              <Chip
                label={cellTypeLabel}
                size="small"
                color={cell.cellType === 'code' ? 'primary' : 'default'}
                sx={{
                  height: '20px',
                  fontSize: '10px',
                  '& .MuiChip-label': { px: 0.75, py: 0 },
                }}
              />

              {collapsed ? (
                <Typography
                  variant="body2"
                  sx={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily:
                      cell.cellType === 'code' || cell.cellType === 'raw'
                        ? 'monospace'
                        : 'inherit',
                    fontSize: 11,
                  }}
                >
                  {getCellSummary(cell)}
                </Typography>
              ) : (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: 10 }}
                >
                  [{index + 1}]
                </Typography>
              )}

              {!collapsed && cell.cellType === 'code' && hasOutput && (
                <Box sx={{ display: 'flex', gap: 0.25 }}>
                  {(['all', 'code', 'output'] as PythonCellSection[]).map(
                    (value) => (
                      <Chip
                        key={value}
                        label={value[0].toUpperCase() + value.slice(1)}
                        size="small"
                        variant={section === value ? 'filled' : 'outlined'}
                        onClick={() =>
                          setCellSections((previous) => ({
                            ...previous,
                            [cell.id]: value,
                          }))
                        }
                        sx={{
                          cursor: 'pointer',
                          height: '20px',
                          fontSize: '10px',
                          '& .MuiChip-label': { px: 0.75, py: 0 },
                        }}
                      />
                    ),
                  )}
                </Box>
              )}

              <Box sx={{ flex: 1 }} />

              {!collapsed && (
                <>
                  <IconButton
                    size="small"
                    aria-label="Move cell up"
                    disabled={index === 0}
                    onClick={() => {
                      const cells = [...draft.cells];
                      [cells[index - 1], cells[index]] = [
                        cells[index],
                        cells[index - 1],
                      ];
                      updateCells(cells);
                    }}
                    sx={{ p: 0.25 }}
                  >
                    <ArrowUpward sx={{ fontSize: 18 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label="Move cell down"
                    disabled={index === draft.cells.length - 1}
                    onClick={() => {
                      const cells = [...draft.cells];
                      [cells[index], cells[index + 1]] = [
                        cells[index + 1],
                        cells[index],
                      ];
                      updateCells(cells);
                    }}
                    sx={{ p: 0.25 }}
                  >
                    <ArrowDownward sx={{ fontSize: 18 }} />
                  </IconButton>
                  {cell.cellType === 'code' && (
                    <Button
                      size="small"
                      startIcon={<PlayArrow sx={{ fontSize: 16 }} />}
                      disabled={
                        runtime?.state !== 'ready' ||
                        execute.isLoading ||
                        isBusy
                      }
                      onClick={() => runCell(cell.id)}
                      sx={{
                        minWidth: 0,
                        px: 1,
                        py: 0,
                        height: 24,
                        fontSize: 12,
                        textTransform: 'none',
                      }}
                    >
                      Run
                    </Button>
                  )}
                </>
              )}

              <IconButton
                size="small"
                aria-label="Cell actions"
                onClick={(event) =>
                  setCellMenu({
                    anchorEl: event.currentTarget,
                    cellId: cell.id,
                  })
                }
                sx={{ p: 0.25 }}
              >
                <MoreVert sx={{ fontSize: 18 }} />
              </IconButton>

              <Menu
                anchorEl={cellMenu?.anchorEl ?? null}
                open={cellMenu?.cellId === cell.id}
                onClose={closeCellMenu}
              >
                <MenuItem
                  onClick={() => duplicateCell(cell.id)}
                  sx={{ py: 0.5, fontSize: 13 }}
                >
                  <ContentCopy sx={{ fontSize: 16, mr: 1 }} /> Duplicate
                </MenuItem>
                {hasOutput && (
                  <MenuItem
                    onClick={() => clearCellOutput(cell.id)}
                    sx={{ py: 0.5, fontSize: 13 }}
                  >
                    <Clear sx={{ fontSize: 16, mr: 1 }} /> Clear Output
                  </MenuItem>
                )}
                <MenuItem
                  onClick={() => deleteCell(cell.id)}
                  sx={{ py: 0.5, fontSize: 13 }}
                >
                  <Delete sx={{ fontSize: 16, mr: 1 }} /> Delete
                </MenuItem>
              </Menu>
            </Box>

            <Collapse in={!collapsed}>
              <Box sx={{ p: 0.75 }}>
                {showCode && cell.cellType === 'code' && (
                  <Box sx={{ mb: showOutput && hasOutput ? 0.5 : 0 }}>
                    <Editor
                      height={`${getSourceEditorHeight(cell.source)}px`}
                      path={`/__rosetta_python_notebooks__/${notebookId}/${cell.id}.py`}
                      defaultLanguage="python"
                      value={cell.source}
                      theme={monacoTheme}
                      onChange={(source) =>
                        updateCells(
                          draft.cells.map((item) =>
                            item.id === cell.id
                              ? { ...item, source: source ?? '' }
                              : item,
                          ),
                        )
                      }
                      options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        fontSize: 13,
                        tabSize: 2,
                        automaticLayout: true,
                        fixedOverflowWidgets: true,
                        padding: { top: 8, bottom: 12 },
                        lineHeight: 20,
                        scrollbar: {
                          vertical: 'hidden',
                          horizontal: 'auto',
                          alwaysConsumeMouseWheel: false,
                        },
                        renderLineHighlight: 'all',
                        cursorBlinking: 'smooth',
                        cursorSmoothCaretAnimation: 'on',
                        smoothScrolling: true,
                        fontLigatures: true,
                        bracketPairColorization: { enabled: true },
                        occurrencesHighlight: 'off',
                      }}
                    />
                  </Box>
                )}
                {showCode && cell.cellType === 'markdown' && (
                  <MarkdownCell
                    content={cell.source}
                    attachmentResolver={(href) => {
                      const attachmentName = href.slice('attachment:'.length);
                      const attachments = cell.metadata?.attachments as
                        | Record<string, Record<string, string>>
                        | undefined;
                      const attachment = attachments?.[attachmentName];
                      const [mime, data] =
                        Object.entries(attachment ?? {})[0] ?? [];
                      return mime && data
                        ? `data:${mime};base64,${data}`
                        : null;
                    }}
                    onUpdate={(source) =>
                      updateCells(
                        draft.cells.map((item) =>
                          item.id === cell.id ? { ...item, source } : item,
                        ),
                      )
                    }
                  />
                )}
                {showCode && cell.cellType === 'raw' && (
                  <Box
                    component="textarea"
                    value={cell.source}
                    onChange={(event) =>
                      updateCells(
                        draft.cells.map((item) =>
                          item.id === cell.id
                            ? { ...item, source: event.target.value }
                            : item,
                        ),
                      )
                    }
                    sx={{
                      boxSizing: 'border-box',
                      border: 0,
                      bgcolor:
                        muiTheme.palette.mode === 'dark'
                          ? '#121212'
                          : '#fafafa',
                      color:
                        muiTheme.palette.mode === 'dark'
                          ? '#D4D4D4'
                          : '#000000',
                      caretColor:
                        muiTheme.palette.mode === 'dark'
                          ? '#AEAFAD'
                          : '#000000',
                      fontFamily:
                        '"Menlo", "Monaco", "Consolas", "Courier New", monospace',
                      fontSize: 13,
                      lineHeight: '20px',
                      height: getSourceEditorHeight(cell.source),
                      outline: 'none',
                      px: 2,
                      py: 1.5,
                      resize: 'none',
                      width: '100%',
                      '&::selection': {
                        bgcolor:
                          muiTheme.palette.mode === 'dark'
                            ? '#264F78'
                            : '#ADD6FF',
                      },
                    }}
                  />
                )}
                {showOutput && hasOutput && (
                  <Box
                    sx={{
                      m: 0,
                      p: 1,
                      bgcolor:
                        execution?.status === 'error'
                          ? 'error.dark'
                          : 'action.hover',
                      color:
                        execution?.status === 'error'
                          ? 'error.contrastText'
                          : 'text.primary',
                    }}
                  >
                    {outputs.map((output, outputIndex) => (
                      <PythonOutput
                        key={`${cell.id}-${outputIndex}`}
                        output={output}
                      />
                    ))}
                    {execution?.status === 'running' && 'Running…'}
                    {execution?.truncated && (
                      <Alert severity="warning">Output truncated.</Alert>
                    )}
                  </Box>
                )}
              </Box>
            </Collapse>
          </Box>
        );
      })}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          mt: 2,
          pb: 4,
        }}
      >
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() =>
            updateCells([
              ...draft.cells,
              {
                id: uuidv4(),
                cellType: 'code',
                source: '',
                executionCount: null,
              },
            ])
          }
        >
          Add Cell
        </Button>
      </Box>
      <Dialog open={restartOpen} onClose={() => setRestartOpen(false)}>
        <DialogTitle>Restart Python kernel?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Restarting clears all Python variables. Saved cells and visible
            output remain, but existing output may be stale.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestartOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              restart.mutate(undefined, {
                onSuccess: () => setRestartOpen(false),
              });
            }}
          >
            Restart
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(documentAction)}
        onClose={() => setDocumentAction(null)}
      >
        <DialogTitle>{documentActionTitle}</DialogTitle>
        <DialogContent>
          {documentAction === 'delete' ? (
            <DialogContentText>
              Delete {draft.name}? Its kernel is stopped before its managed
              document is removed.
            </DialogContentText>
          ) : (
            <TextField
              autoFocus
              fullWidth
              label="Notebook name"
              value={documentName}
              onChange={(event) => setDocumentName(event.target.value)}
              sx={{ mt: 1 }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDocumentAction(null)}>Cancel</Button>
          <Button
            color={documentAction === 'delete' ? 'error' : 'primary'}
            variant="contained"
            disabled={documentAction !== 'delete' && !documentName.trim()}
            onClick={async () => {
              if (documentAction === 'rename') {
                const saved = await notebooksService.renamePythonNotebook(
                  draft.id,
                  documentName.trim(),
                );
                setDraft(saved);
              } else if (documentAction === 'duplicate') {
                await notebooksService.duplicatePythonNotebook(
                  draft.id,
                  documentName.trim(),
                );
              } else if (documentAction === 'delete') {
                await notebooksService.deletePythonNotebook(draft.id);
                onDeleted?.(draft.id);
              }
              setDocumentAction(null);
            }}
          >
            {documentActionLabel}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
