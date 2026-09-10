import React from 'react';
import Editor from '@monaco-editor/react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Typography,
} from '@mui/material';
import {
  Add,
  ArrowDownward,
  ArrowUpward,
  Delete,
  PlayArrow,
} from '@mui/icons-material';
import { v4 as uuidv4 } from 'uuid';
import { PythonNotebook, PythonNotebookCell } from '../../../types/notebooks';
import {
  usePythonNotebook,
  useSavePythonNotebook,
} from '../../controllers/notebooks.controller';
import { MarkdownCell } from './MarkdownCell';

export const PythonNotebookEditor: React.FC<{ notebookId: string }> = ({
  notebookId,
}) => {
  const { data: notebook, isLoading } = usePythonNotebook(notebookId);
  const save = useSavePythonNotebook();
  const [draft, setDraft] = React.useState<PythonNotebook | null>(null);
  const saveTimer = React.useRef<number | null>(null);

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

  if (isLoading || !draft)
    return <Typography sx={{ p: 2 }}>Loading notebook…</Typography>;

  return (
    <Box sx={{ p: 2, overflow: 'auto', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="h6">{draft.name}</Typography>
        <Chip size="small" label="Python" color="primary" />
        <Box sx={{ flex: 1 }} />
        <Button size="small" disabled startIcon={<PlayArrow />}>
          Set up packages to run
        </Button>
        <Button
          size="small"
          startIcon={<Add />}
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
          Code cell
        </Button>
        <Button
          size="small"
          startIcon={<Add />}
          onClick={() =>
            updateCells([
              ...draft.cells,
              { id: uuidv4(), cellType: 'markdown', source: '' },
            ])
          }
        >
          Markdown cell
        </Button>
        <Button
          size="small"
          startIcon={<Add />}
          onClick={() =>
            updateCells([
              ...draft.cells,
              { id: uuidv4(), cellType: 'raw', source: '' },
            ])
          }
        >
          Raw cell
        </Button>
      </Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Python execution is available in the next phase. Your edits are saved
        automatically.
      </Alert>
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
        </Box>
      ))}
    </Box>
  );
};
