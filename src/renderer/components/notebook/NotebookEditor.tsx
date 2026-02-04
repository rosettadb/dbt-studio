/**
 * Notebook Editor Component
 * Main container for notebook editing with cells and toolbar
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Alert,
  Typography,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { v4 as uuidv4 } from 'uuid';
import {
  useNotebook,
  useUpdateNotebook,
  useRunCell,
  useRunAllCells,
  useInterruptExecution,
} from '../../controllers/notebook.controller';
import { NotebookCell as NotebookCellType } from '../../../types/notebook';
import { NotebookToolbar } from './NotebookToolbar';
import { NotebookCell } from './NotebookCell';

interface NotebookEditorProps {
  instanceId: string;
  notebookId: string;
}

export const NotebookEditor: React.FC<NotebookEditorProps> = ({
  instanceId,
  notebookId,
}) => {
  const {
    data: notebook,
    isLoading,
    error,
  } = useNotebook(instanceId, notebookId);
  const updateNotebook = useUpdateNotebook();
  const runCell = useRunCell();
  const runAllCells = useRunAllCells();
  const interruptExecution = useInterruptExecution();

  const [executingCells, setExecutingCells] = useState<Set<string>>(new Set());
  const [isRunningAll, setIsRunningAll] = useState(false);

  const handleSave = useCallback(() => {
    // Notebook is auto-saved on every change, so this is just a visual confirmation
    // eslint-disable-next-line no-console
    console.log('Notebook saved');
  }, []);

  const handleRunAll = useCallback(async () => {
    if (!notebook) return;

    setIsRunningAll(true);
    try {
      await runAllCells.mutateAsync({ instanceId, notebookId });
    } finally {
      setIsRunningAll(false);
    }
  }, [notebook, instanceId, notebookId, runAllCells]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd/Ctrl + S: Save
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        handleSave();
      }

      // Cmd/Ctrl + Shift + Enter: Run All
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key === 'Enter'
      ) {
        event.preventDefault();
        handleRunAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebook]);

  const handleAddCell = useCallback(
    (type: 'sql' | 'markdown') => {
      if (!notebook) return;

      const newCell: NotebookCellType = {
        id: uuidv4(),
        type,
        content: '',
        order: notebook.cells.length,
      };

      updateNotebook.mutate({
        instanceId,
        notebookId,
        cells: [...notebook.cells, newCell],
      });
    },
    [notebook, notebookId, updateNotebook],
  );

  const handleUpdateCell = useCallback(
    (cellId: string, content: string) => {
      if (!notebook) return;

      const updatedCells = notebook.cells.map((cell) =>
        cell.id === cellId ? { ...cell, content } : cell,
      );

      updateNotebook.mutate({
        instanceId,
        notebookId,
        cells: updatedCells,
      });
    },
    [instanceId, notebook, notebookId, updateNotebook],
  );

  const handleDeleteCell = useCallback(
    (cellId: string) => {
      if (!notebook) return;

      const updatedCells = notebook.cells
        .filter((cell) => cell.id !== cellId)
        .map((cell, index) => ({ ...cell, order: index }));

      updateNotebook.mutate({
        instanceId,
        notebookId,
        cells: updatedCells,
      });
    },
    [instanceId, notebook, notebookId, updateNotebook],
  );

  const handleDuplicateCell = useCallback(
    (cellId: string) => {
      if (!notebook) return;

      const cellToDuplicate = notebook.cells.find((c) => c.id === cellId);
      if (!cellToDuplicate) return;

      const newCell: NotebookCellType = {
        ...cellToDuplicate,
        id: uuidv4(),
        output: undefined,
        order: cellToDuplicate.order + 1,
      };

      const updatedCells = [
        ...notebook.cells.slice(0, cellToDuplicate.order + 1),
        newCell,
        ...notebook.cells.slice(cellToDuplicate.order + 1),
      ].map((cell, index) => ({ ...cell, order: index }));

      updateNotebook.mutate({
        instanceId,
        notebookId,
        cells: updatedCells,
      });
    },
    [instanceId, notebook, notebookId, updateNotebook],
  );

  const handleMoveCell = useCallback(
    (cellId: string, direction: 'up' | 'down') => {
      if (!notebook) return;

      const cellIndex = notebook.cells.findIndex((c) => c.id === cellId);
      if (cellIndex === -1) return;

      const newIndex = direction === 'up' ? cellIndex - 1 : cellIndex + 1;
      if (newIndex < 0 || newIndex >= notebook.cells.length) return;

      const updatedCells = [...notebook.cells];
      [updatedCells[cellIndex], updatedCells[newIndex]] = [
        updatedCells[newIndex],
        updatedCells[cellIndex],
      ];

      const reorderedCells = updatedCells.map((cell, index) => ({
        ...cell,
        order: index,
      }));

      updateNotebook.mutate({
        instanceId,
        notebookId,
        cells: reorderedCells,
      });
    },
    [instanceId, notebook, notebookId, updateNotebook],
  );

  const handleClearOutput = useCallback(
    (cellId: string) => {
      if (!notebook) return;

      const updatedCells = notebook.cells.map((cell) =>
        cell.id === cellId ? { ...cell, output: undefined } : cell,
      );

      updateNotebook.mutate({
        instanceId,
        notebookId,
        cells: updatedCells,
      });
    },
    [instanceId, notebook, notebookId, updateNotebook],
  );

  const handleRunCell = useCallback(
    async (cellId: string, content: string) => {
      setExecutingCells((prev) => new Set(prev).add(cellId));

      try {
        await runCell.mutateAsync({
          instanceId,
          notebookId,
          cellId,
          sql: content,
        });
      } catch (err) {
        // Error is already handled by React Query and displayed in output
        // Just log it for debugging
        // eslint-disable-next-line no-console
        console.error('Cell execution error:', err);
      } finally {
        setExecutingCells((prev) => {
          const next = new Set(prev);
          next.delete(cellId);
          return next;
        });
      }
    },
    [instanceId, notebookId, runCell],
  );

  const handleInterrupt = useCallback(() => {
    interruptExecution.mutate(notebookId);
    setExecutingCells(new Set());
    setIsRunningAll(false);
  }, [notebookId, interruptExecution]);

  const handleExport = useCallback(() => {
    if (!notebook) return;

    // Export as JSON
    const dataStr = JSON.stringify(notebook, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${notebook.name}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [notebook]);

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Failed to load notebook: {error.message}</Alert>
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
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <NotebookToolbar
        notebook={notebook}
        isExecuting={isRunningAll || executingCells.size > 0}
        onRunAll={handleRunAll}
        onSave={handleSave}
        onExport={handleExport}
        onAddCell={handleAddCell}
        onInterrupt={handleInterrupt}
      />

      {/* Cells */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        {notebook.cells.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 2,
            }}
          >
            <Typography variant="h6" color="text.secondary">
              Empty Notebook
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Add your first cell to get started
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleAddCell('sql')}
              >
                Add SQL Cell
              </Button>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => handleAddCell('markdown')}
              >
                Add Markdown Cell
              </Button>
            </Box>
          </Box>
        ) : (
          <>
            {notebook.cells
              .sort((a, b) => a.order - b.order)
              .map((cell, index) => (
                <NotebookCell
                  key={cell.id}
                  cell={cell}
                  isFirst={index === 0}
                  isLast={index === notebook.cells.length - 1}
                  isExecuting={executingCells.has(cell.id) || isRunningAll}
                  onRun={(content) => handleRunCell(cell.id, content)}
                  onUpdate={(content) => handleUpdateCell(cell.id, content)}
                  onDelete={() => handleDeleteCell(cell.id)}
                  onDuplicate={() => handleDuplicateCell(cell.id)}
                  onMoveUp={() => handleMoveCell(cell.id, 'up')}
                  onMoveDown={() => handleMoveCell(cell.id, 'down')}
                  onClearOutput={() => handleClearOutput(cell.id)}
                />
              ))}

            {/* Add Cell Button */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => handleAddCell('sql')}
              >
                Add Cell
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};
