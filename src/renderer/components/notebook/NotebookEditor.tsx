/**
 * Notebook Editor Component
 * Main container for notebook editing with cells and toolbar
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Alert,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import { loader } from '@monaco-editor/react';
import {
  useNotebook,
  useUpdateNotebook,
  useRunCell,
  useRunAllCells,
  useDeleteNotebook,
} from '../../controllers/notebooks.controller';
import { NotebookCell as NotebookCellType } from '../../../types/notebooks';
import { NotebookToolbar } from './NotebookToolbar';
import { NotebookCell } from './NotebookCell';
import { useSchemaForConnection, useMonacoAutocomplete } from '../../hooks';

interface NotebookEditorProps {
  instanceId: string; // This is actually the connectionId
  notebookId: string;
}

export const NotebookEditor: React.FC<NotebookEditorProps> = ({
  instanceId, // Rename for clarity: this is the connectionId
  notebookId,
}) => {
  const navigate = useNavigate();
  const connectionId = instanceId; // Use connectionId internally for clarity
  const {
    data: notebook,
    isLoading,
    error,
  } = useNotebook(connectionId, notebookId);
  const updateNotebook = useUpdateNotebook();
  const runCell = useRunCell();
  const runAllCells = useRunAllCells();
  const deleteNotebook = useDeleteNotebook();

  const [executingCells, setExecutingCells] = useState<Set<string>>(new Set());
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState('');

  // Local state for cells to enable immediate UI updates
  const [localCells, setLocalCells] = useState<NotebookCellType[]>([]);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global completion provider registration (once per notebook/connection)
  const completionProviderRef = useRef<any>(null);
  const { data: schemaData } = useSchemaForConnection(connectionId);
  const completions = useMonacoAutocomplete(
    schemaData?.tables || null,
    schemaData?.duckLakeSchema || null,
  );

  // Store completions in a ref so the provider can access the latest without re-registering
  const completionsRef = useRef(completions);
  useEffect(() => {
    completionsRef.current = completions;
  }, [completions]);

  // Register global completion provider for all SQL cells in this notebook
  // Only re-register when completions COUNT changes, not on every render
  const completionsCount = completions.length;
  useEffect(() => {
    loader
      .init()
      .then((monaco: any) => {
        // Dispose existing provider
        if (completionProviderRef.current) {
          completionProviderRef.current.dispose();
        }

        // Register new completion provider
        completionProviderRef.current =
          monaco.languages.registerCompletionItemProvider('sql', {
            provideCompletionItems: (model: any, position: any) => {
              const word = model.getWordUntilPosition(position);
              const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
              };

              // Use ref to get latest completions without re-registering
              const suggestions = completionsRef.current.map((item) => ({
                ...item,
                range,
              }));

              return { suggestions };
            },
          });

        console.log(
          '[NotebookEditor] Registered global completion provider with',
          completionsCount,
          'items',
        );
        return undefined;
      })
      .catch((err: any) => {
        console.error('[NotebookEditor] Failed to initialize Monaco:', err);
      });

    // Cleanup on unmount
    return () => {
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
      }
    };
  }, [completionsCount, connectionId]); // Only depend on COUNT, not the array

  // Sync local cells with notebook data
  useEffect(() => {
    if (notebook?.cells) {
      setLocalCells(notebook.cells);
    }
  }, [notebook?.cells]);

  // Sync local cells with notebook data
  useEffect(() => {
    if (notebook?.cells) {
      setLocalCells(notebook.cells);
    }
  }, [notebook?.cells]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  const handleSave = useCallback(() => {
    // Notebook is auto-saved on every change, so this is just a visual confirmation
    // eslint-disable-next-line no-console
    console.log('Notebook saved');
  }, []);

  const handleRunAll = useCallback(async () => {
    if (!notebook) return;

    setIsRunningAll(true);
    try {
      await runAllCells.mutateAsync({ connectionId, notebookId });
    } finally {
      setIsRunningAll(false);
    }
  }, [notebook, connectionId, notebookId, runAllCells]);

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

      // Use functional update to avoid stale closure
      setLocalCells((prevCells) => {
        const newCell: NotebookCellType = {
          id: uuidv4(),
          type,
          content: '',
          order: prevCells.length,
        };

        const updatedCells = [...prevCells, newCell];

        // Update backend
        updateNotebook.mutate({
          connectionId,
          notebookId,
          cells: updatedCells,
        });

        return updatedCells;
      });
    },
    [notebook, connectionId, notebookId, updateNotebook], // Removed localCells dependency
  );

  const handleUpdateCell = useCallback(
    (cellId: string, content: string) => {
      if (!notebook) return;

      // Update local state immediately for responsive UI
      setLocalCells((prevCells) => {
        const updatedCells = prevCells.map((cell) =>
          cell.id === cellId ? { ...cell, content } : cell,
        );

        // Clear existing timeout
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
        }

        // Debounce the API call (500ms delay)
        updateTimeoutRef.current = setTimeout(() => {
          updateNotebook.mutate({
            connectionId,
            notebookId,
            cells: updatedCells,
          });
        }, 500);

        return updatedCells;
      });
    },
    [connectionId, notebook, notebookId, updateNotebook],
  );

  const handleDeleteCell = useCallback(
    (cellId: string) => {
      if (!notebook) return;

      // Use functional update to avoid stale closure
      setLocalCells((prevCells) => {
        const updatedCells = prevCells
          .filter((cell) => cell.id !== cellId)
          .map((cell, index) => ({ ...cell, order: index }));

        // Update backend
        updateNotebook.mutate({
          connectionId,
          notebookId,
          cells: updatedCells,
        });

        return updatedCells;
      });
    },
    [connectionId, notebook, notebookId, updateNotebook], // Removed localCells dependency
  );

  const handleDuplicateCell = useCallback(
    (cellId: string) => {
      if (!notebook) return;

      // Use functional update to avoid stale closure
      setLocalCells((prevCells) => {
        const cellToDuplicate = prevCells.find((c) => c.id === cellId);
        if (!cellToDuplicate) {
          return prevCells;
        }

        const newCell: NotebookCellType = {
          ...cellToDuplicate,
          id: uuidv4(),
          output: undefined,
          order: cellToDuplicate.order + 1,
        };

        const updatedCells = [
          ...prevCells.slice(0, cellToDuplicate.order + 1),
          newCell,
          ...prevCells.slice(cellToDuplicate.order + 1),
        ].map((cell, index) => ({ ...cell, order: index }));

        // Update backend
        updateNotebook.mutate({
          connectionId,
          notebookId,
          cells: updatedCells,
        });

        return updatedCells;
      });
    },
    [connectionId, notebook, notebookId, updateNotebook], // Removed localCells dependency
  );

  // Drag-and-drop cell reordering
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!notebook || !result.destination) {
        return;
      }

      const { source, destination } = result;
      if (source.index === destination.index) {
        return;
      }

      // Reorder cells using functional update to avoid stale closure
      setLocalCells((prevCells) => {
        const reorderedCells = Array.from(prevCells);
        const [movedCell] = reorderedCells.splice(source.index, 1);
        reorderedCells.splice(destination.index, 0, movedCell);

        // Update order property
        const updatedCells = reorderedCells.map((cell, index) => ({
          ...cell,
          order: index,
        }));

        // Save to backend
        updateNotebook.mutate({
          connectionId,
          notebookId,
          cells: updatedCells,
        });

        return updatedCells;
      });
    },
    [connectionId, notebook, notebookId, updateNotebook], // Removed localCells dependency
  );

  const handleClearOutput = useCallback(
    (cellId: string) => {
      if (!notebook) return;

      // Use functional update to avoid stale closure
      setLocalCells((prevCells) => {
        const updatedCells = prevCells.map((cell) =>
          cell.id === cellId ? { ...cell, output: undefined } : cell,
        );

        // Update backend
        updateNotebook.mutate({
          connectionId,
          notebookId,
          cells: updatedCells,
        });

        return updatedCells;
      });
    },
    [connectionId, notebook, notebookId, updateNotebook], // Removed localCells dependency
  );

  const handleRunCell = useCallback(
    async (cellId: string, content: string) => {
      setExecutingCells((prev) => new Set(prev).add(cellId));

      try {
        await runCell.mutateAsync({
          connectionId,
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
    [connectionId, notebookId, runCell],
  );

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

  const handleRename = useCallback(() => {
    if (!notebook) return;
    setNewNotebookName(notebook.name);
    setRenameDialogOpen(true);
  }, [notebook]);

  const handleRenameConfirm = useCallback(() => {
    if (
      !notebook ||
      !newNotebookName.trim() ||
      newNotebookName === notebook.name
    ) {
      setRenameDialogOpen(false);
      return;
    }

    updateNotebook.mutate({
      connectionId,
      notebookId,
      name: newNotebookName.trim(),
    });
    setRenameDialogOpen(false);
  }, [notebook, newNotebookName, connectionId, notebookId, updateNotebook]);

  const handleRenameCancel = useCallback(() => {
    setRenameDialogOpen(false);
    setNewNotebookName('');
  }, []);

  const handleClone = useCallback(() => {
    if (!notebook) return;

    // TODO: Implement clone functionality
    // This would require creating a new notebook with the same cells
    // eslint-disable-next-line no-console
    console.log('Clone functionality not yet implemented');
  }, [notebook]);

  const handleDeleteAllCells = useCallback(() => {
    if (!notebook) return;

    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(
      'Are you sure you want to delete all cells? This action cannot be undone.',
    );

    if (confirmed) {
      updateNotebook.mutate({
        connectionId,
        notebookId,
        cells: [],
      });
    }
  }, [notebook, connectionId, notebookId, updateNotebook]);

  const handleDeleteNotebook = useCallback(async () => {
    if (!notebook) return;

    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(
      `Are you sure you want to delete the notebook "${notebook.name}"? This action cannot be undone.`,
    );

    if (confirmed) {
      try {
        await deleteNotebook.mutateAsync({ connectionId, notebookId });
        // Navigate back to notebooks list
        navigate(`/app/notebooks`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to delete notebook:', err);
      }
    }
  }, [notebook, connectionId, notebookId, deleteNotebook, navigate]);

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
        <Alert severity="error">
          Failed to load notebook: {(error as Error).message || 'Unknown error'}
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
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <NotebookToolbar
        notebook={notebook}
        isExecuting={isRunningAll || executingCells.size > 0}
        onRunAll={handleRunAll}
        onExport={handleExport}
        onRename={handleRename}
        onClone={handleClone}
        onDeleteAllCells={handleDeleteAllCells}
        onDeleteNotebook={handleDeleteNotebook}
        onAddCell={() => handleAddCell('sql')}
        onClearOutputs={() => {
          const updatedCells = localCells.map((cell) => ({
            ...cell,
            output: undefined,
          }));
          setLocalCells(updatedCells);
          updateNotebook.mutate({
            connectionId,
            notebookId,
            cells: updatedCells,
          });
        }}
      />

      {/* Cells */}
      <Box
        sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        {localCells.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 2,
              p: 3,
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
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="notebook-cells">
              {(droppableProvided) => (
                <Box
                  ref={droppableProvided.innerRef}
                  // eslint-disable-next-line react/jsx-props-no-spreading
                  {...droppableProvided.droppableProps}
                  sx={{ overflowY: 'auto', height: '100%', p: 3 }}
                >
                  {localCells
                    .sort((a, b) => a.order - b.order)
                    .map((cell, index) => (
                      <Draggable
                        key={cell.id}
                        draggableId={cell.id}
                        index={index}
                      >
                        {(draggableProvided, snapshot) => (
                          <Box
                            ref={draggableProvided.innerRef}
                            // eslint-disable-next-line react/jsx-props-no-spreading
                            {...draggableProvided.draggableProps}
                            sx={{
                              opacity: snapshot.isDragging ? 0.8 : 1,
                              transform: snapshot.isDragging
                                ? 'rotate(2deg)'
                                : 'none',
                            }}
                          >
                            <NotebookCell
                              cell={cell}
                              index={index}
                              connectionId={connectionId}
                              isExecuting={
                                executingCells.has(cell.id) || isRunningAll
                              }
                              onRun={() => handleRunCell(cell.id, cell.content)}
                              onUpdate={(content: string) =>
                                handleUpdateCell(cell.id, content)
                              }
                              onDelete={() => handleDeleteCell(cell.id)}
                              onDuplicate={() => handleDuplicateCell(cell.id)}
                              onClearOutput={() => handleClearOutput(cell.id)}
                              dragHandleProps={
                                draggableProvided.dragHandleProps
                              }
                            />
                          </Box>
                        )}
                      </Draggable>
                    ))}
                  {droppableProvided.placeholder}

                  {/* Add Cell Button - inside scrollable area */}
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
                      onClick={() => handleAddCell('sql')}
                    >
                      Add Cell
                    </Button>
                  </Box>
                </Box>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </Box>

      {/* Rename Dialog */}
      <Dialog
        open={renameDialogOpen}
        onClose={handleRenameCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rename Notebook</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Notebook Name"
            type="text"
            fullWidth
            variant="outlined"
            value={newNotebookName}
            onChange={(e) => setNewNotebookName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRenameConfirm();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleRenameCancel}>Cancel</Button>
          <Button
            onClick={handleRenameConfirm}
            variant="contained"
            disabled={
              !newNotebookName.trim() || newNotebookName === notebook?.name
            }
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
