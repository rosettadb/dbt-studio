import React from 'react';
import Editor from '@monaco-editor/react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ArrowDownward,
  ArrowUpward,
  Delete,
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
  const { data: notebook, isLoading } = usePythonNotebook(notebookId);
  const save = useSavePythonNotebook();
  const { data: runtime } = usePythonNotebookRuntimeStatus();
  const {
    cells: executionCells,
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
    <Box sx={{ p: 2, overflow: 'auto', height: '100%' }}>
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
              <IconButton
                size="small"
                aria-label="Clear outputs"
                sx={toolbarActionSx(4)}
                disabled={clearOutputs.isLoading}
                onClick={() =>
                  clearOutputs.mutate(
                    { id: draft.id, revision: draft.revision },
                    {
                      onSuccess: (saved) => {
                        if (saved) setDraft(saved);
                      },
                    },
                  )
                }
              >
                <CleaningServices fontSize="small" />
              </IconButton>
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
      <Alert
        severity={runtime?.state === 'ready' ? 'info' : 'warning'}
        sx={{ mb: 2 }}
      >
        {runtime?.state === 'ready'
          ? 'Run saves the latest source before executing it in this notebook kernel.'
          : 'Set up Jupyter packages in Settings → Python before running cells.'}
      </Alert>
      {restart.isSuccess && sessionState === 'idle' && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          The kernel was restarted. Existing output may be stale.
        </Alert>
      )}
      {draft.cells.map((cell, index) => (
        <Box
          key={cell.id}
          sx={{
            mb: 2,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              px: 1,
              py: 0.5,
              display: 'flex',
              alignItems: 'center',
              bgcolor: 'action.hover',
            }}
          >
            <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>
              {cell.cellType} cell
            </Typography>
            <Box sx={{ flex: 1 }} />
            {cell.cellType === 'code' && (
              <Button
                size="small"
                startIcon={<PlayArrow fontSize="small" />}
                disabled={
                  runtime?.state !== 'ready' || execute.isLoading || isBusy
                }
                onClick={() => runCell(cell.id)}
              >
                Run
              </Button>
            )}
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
            >
              <ArrowUpward fontSize="small" />
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
            >
              <ArrowDownward fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Delete cell"
              onClick={() =>
                updateCells(
                  draft.cells.filter((_, cellIndex) => cellIndex !== index),
                )
              }
            >
              <Delete fontSize="small" />
            </IconButton>
          </Box>
          {cell.cellType === 'code' && (
            <Editor
              height="180px"
              defaultLanguage="python"
              value={cell.source}
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
                automaticLayout: true,
                scrollBeyondLastLine: false,
              }}
            />
          )}
          {cell.cellType === 'markdown' && (
            <Box sx={{ p: 1 }}>
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
                  return mime && data ? `data:${mime};base64,${data}` : null;
                }}
                onUpdate={(source) =>
                  updateCells(
                    draft.cells.map((item) =>
                      item.id === cell.id ? { ...item, source } : item,
                    ),
                  )
                }
              />
            </Box>
          )}
          {cell.cellType === 'raw' && (
            <textarea
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
              style={{
                boxSizing: 'border-box',
                border: 0,
                minHeight: 120,
                padding: 12,
                resize: 'vertical',
                width: '100%',
              }}
            />
          )}
          {(cell.outputs?.length || executionCells[cell.id]) && (
            <Box
              sx={{
                m: 0,
                p: 1,
                bgcolor:
                  executionCells[cell.id].status === 'error'
                    ? 'error.dark'
                    : 'action.hover',
                color:
                  executionCells[cell.id].status === 'error'
                    ? 'error.contrastText'
                    : 'text.primary',
              }}
            >
              {(executionCells[cell.id]?.outputs ?? cell.outputs ?? []).map(
                (output, outputIndex) => (
                  <PythonOutput
                    key={`${cell.id}-${outputIndex}`}
                    output={output}
                  />
                ),
              )}
              {executionCells[cell.id]?.status === 'running' && 'Running…'}
              {executionCells[cell.id]?.truncated && (
                <Alert severity="warning">Output truncated.</Alert>
              )}
            </Box>
          )}
        </Box>
      ))}
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
