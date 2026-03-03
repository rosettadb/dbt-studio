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
  DialogContentText,
  Backdrop,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
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
  useDeleteNotebook,
  useDuplicateNotebook,
} from '../../controllers/notebooks.controller';
import {
  NotebookCell as NotebookCellType,
  Notebook,
} from '../../../types/notebooks';
import { NotebookToolbar } from './NotebookToolbar';
import { NotebookCell } from './NotebookCell';
import { useSchemaForConnection, useMonacoAutocomplete } from '../../hooks';

interface NotebookEditorProps {
  instanceId: string; // This is actually the connectionId
  notebookId: string;
  onOpenNotebook?: (notebook: Notebook, connectionId: string) => void; // Callback to open notebook in new tab
}

export const NotebookEditor: React.FC<NotebookEditorProps> = ({
  instanceId, // Rename for clarity: this is the connectionId
  notebookId,
  onOpenNotebook, // Callback to open notebook in new tab
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
  const deleteNotebook = useDeleteNotebook();
  const duplicateNotebook = useDuplicateNotebook();

  const [executingCells, setExecutingCells] = useState<Set<string>>(new Set());
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [runningCellIndex, setRunningCellIndex] = useState<number | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState('');
  const [duplicateNotebookName, setDuplicateNotebookName] = useState('');

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

        return undefined;
      })
      .catch((err: any) => {
        // eslint-disable-next-line no-console
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
    if (!notebook || localCells.length === 0) return;

    setIsRunningAll(true);
    setRunningCellIndex(0);

    try {
      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < localCells.length; i++) {
        const cell = localCells[i];

        // Only run SQL cells with content
        if (cell.type === 'sql' && cell.content.trim()) {
          setRunningCellIndex(i);

          try {
            // eslint-disable-next-line no-await-in-loop
            await runCell.mutateAsync({
              connectionId,
              notebookId,
              cellId: cell.id,
              sql: cell.content,
            });

            // Small delay between cells for better UX
            // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (cellError) {
            // eslint-disable-next-line no-console
            console.error(`Failed to execute cell ${i + 1}:`, cellError);

            // Ask user if they want to continue
            // eslint-disable-next-line no-alert
            const continueExecution = window.confirm(
              `Cell ${i + 1} failed to execute. Continue with remaining cells?`,
            );

            if (!continueExecution) {
              break;
            }
          }
        }
      }

      toast.success('All cells executed');
    } catch (runAllError) {
      // eslint-disable-next-line no-console
      console.error('Run all failed:', runAllError);
      toast.error('Failed to execute all cells');
    } finally {
      setIsRunningAll(false);
      setRunningCellIndex(null);
    }
  }, [notebook, localCells, connectionId, notebookId, runCell]);

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
          limit: 10, // Default pagination: first 10 rows
          offset: 0,
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

    // Create export data without cell output data (to keep file size small)
    const exportData = {
      ...notebook,
      cells: notebook.cells.map((cell) => ({
        ...cell,
        output: cell.output
          ? {
              ...cell.output,
              data: [], // Remove data array to reduce file size
            }
          : undefined,
      })),
    };

    // Export as JSON
    const dataStr = JSON.stringify(exportData, null, 2);
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

  const handleDuplicate = useCallback(() => {
    if (!notebook) return;
    setDuplicateNotebookName(`${notebook.name} (Copy)`);
    setDuplicateDialogOpen(true);
  }, [notebook]);

  const handleDuplicateConfirm = useCallback(async () => {
    if (!notebook || !duplicateNotebookName.trim()) return;

    try {
      const duplicated = await duplicateNotebook.mutateAsync({
        connectionId,
        notebookId,
        newName: duplicateNotebookName.trim(),
      });

      // Open the duplicated notebook in a new tab (without navigation/reload)
      if (onOpenNotebook) {
        // Pass the duplicated notebook object directly
        onOpenNotebook(duplicated, connectionId);
      } else {
        // Fallback to navigation if callback not provided
        navigate(`/app/notebooks/${connectionId}/${duplicated.id}`);
      }

      setDuplicateDialogOpen(false);
      setDuplicateNotebookName('');
    } catch (err) {
      // Error handled by mutation
    }
  }, [
    notebook,
    connectionId,
    notebookId,
    duplicateNotebook,
    duplicateNotebookName,
    onOpenNotebook,
    navigate,
  ]);

  const handleDeleteAllCells = useCallback(() => {
    if (!notebook) return;
    setDeleteAllDialogOpen(true);
  }, [notebook]);

  const handleDeleteAllConfirm = useCallback(() => {
    // Update local state immediately
    setLocalCells([]);

    // Update backend
    updateNotebook.mutate({
      connectionId,
      notebookId,
      cells: [],
    });

    setDeleteAllDialogOpen(false);
    toast.success('All cells deleted');
  }, [connectionId, notebookId, updateNotebook]);

  const handleDeleteNotebook = useCallback(async () => {
    if (!notebook) return;

    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(
      `Are you sure you want to delete the notebook "${notebook.name}"? This action cannot be undone.`,
    );

    if (confirmed) {
      try {
        // Delete the notebook using notebook.id (not notebookId param)
        await deleteNotebook.mutateAsync({
          connectionId,
          notebookId: notebook.id,
        });

        // Navigate back to notebooks list with replace to prevent back navigation
        navigate('/app/notebooks', { replace: true });

        toast.success(`Notebook "${notebook.name}" deleted`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to delete notebook:', err);
        toast.error('Failed to delete notebook');
      }
    }
  }, [notebook, connectionId, deleteNotebook, navigate]);

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
        onDuplicate={handleDuplicate}
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
                              notebookId={notebookId}
                              isExecuting={
                                executingCells.has(cell.id) ||
                                (isRunningAll && runningCellIndex === index)
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

      {/* Delete All Cells Dialog */}
      <Dialog
        open={deleteAllDialogOpen}
        onClose={() => setDeleteAllDialogOpen(false)}
      >
        <DialogTitle>Delete All Cells?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete all {localCells.length} cells in this
            notebook. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteAllDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteAllConfirm}
            color="error"
            variant="contained"
          >
            Delete All
          </Button>
        </DialogActions>
      </Dialog>

      {/* Duplicate Notebook Dialog */}
      <Dialog
        open={duplicateDialogOpen}
        onClose={() => {
          setDuplicateDialogOpen(false);
          setDuplicateNotebookName('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Duplicate Notebook</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              autoFocus
              label="New Notebook Name"
              fullWidth
              value={duplicateNotebookName}
              onChange={(e) => setDuplicateNotebookName(e.target.value)}
              placeholder="Enter name for duplicate"
              required
              onKeyPress={(e) => {
                if (e.key === 'Enter' && duplicateNotebookName.trim()) {
                  handleDuplicateConfirm();
                }
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDuplicateDialogOpen(false);
              setDuplicateNotebookName('');
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDuplicateConfirm}
            variant="contained"
            disabled={
              !duplicateNotebookName.trim() || duplicateNotebook.isLoading
            }
          >
            {duplicateNotebook.isLoading ? 'Duplicating...' : 'Duplicate'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Run All Backdrop */}
      <Backdrop
        sx={{
          color: '#fff',
          zIndex: (theme) => theme.zIndex.drawer + 999,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
        open={isRunningAll}
      >
        <CircularProgress color="inherit" />
        <Typography variant="h6">
          Executing cells...{' '}
          {runningCellIndex !== null &&
            `(${runningCellIndex + 1}/${localCells.length})`}
        </Typography>
        <Typography variant="body2">
          Please wait while all cells are executed sequentially
        </Typography>
      </Backdrop>
    </Box>
  );
};
