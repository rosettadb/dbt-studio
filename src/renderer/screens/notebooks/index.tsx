import React, { useState, useCallback, useMemo, useContext } from 'react';
import {
  Box,
  FormControl,
  Select,
  MenuItem,
  Tooltip,
  Typography,
  useTheme,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  IconButton,
} from '@mui/material';
import {
  Add,
  TableChart,
  Link as LinkIcon,
  Warning,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../../layouts';
import { useGetConnections } from '../../controllers';
import { useDuckLakeInstances } from '../../controllers/duckLake.controller';
import {
  useArchivedNotebooks,
  useRestoreNotebook,
  useDeleteArchivedNotebook,
  useDeleteAllArchivedNotebooks,
  useCreateNotebook,
  useNotebooks,
  useDeleteNotebook,
  useRenameNotebook,
  useDuplicateNotebook,
} from '../../controllers/notebooks.controller';
import connectionIcons, {
  defaultIcon,
} from '../../../../assets/connectionIcons';
import { AppContext } from '../../context/AppProvider';
import { connectorsServices } from '../../services';
import { DuckLakeService } from '../../services/duckLake.service';
import { NotebooksSidebar } from '../../components/notebook/NotebooksSidebar';
import { NotebookTabManager } from '../../components/notebook/NotebookTabManager';
import { NotebookEditor } from '../../components/notebook/NotebookEditor';
import { Table, SupportedConnectionTypes } from '../../../types/backend';
import useNotebookTabManager from '../../hooks/useNotebookTabManager';

const Notebooks = () => {
  const theme = useTheme();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const navigate = useNavigate();
  const { selectedProject } = useContext(AppContext);
  const { data: connections = [] } = useGetConnections();
  const { data: duckLakeInstances = [] } = useDuckLakeInstances();

  // Active connection state
  const [activeConnectionId, setActiveConnectionId] = useState<string>('');

  // Schema state
  const [schema, setSchema] = useState<Table[]>([]);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);

  // Notebooks state - fetch from backend
  const { data: notebooks = [], isLoading: isLoadingNotebooks } =
    useNotebooks(activeConnectionId);
  const deleteNotebook = useDeleteNotebook();
  const renameNotebook = useRenameNotebook();
  const duplicateNotebook = useDuplicateNotebook();

  // Archived notebooks state
  const [showArchived, setShowArchived] = useState(false);
  const { data: archivedNotebooks = {} } = useArchivedNotebooks();
  const restoreNotebook = useRestoreNotebook();
  const deleteArchivedNotebook = useDeleteArchivedNotebook();
  const deleteAllArchived = useDeleteAllArchivedNotebooks();
  const createNotebook = useCreateNotebook();

  // Confirmation dialogs state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [createNotebookOpen, setCreateNotebookOpen] = useState(false);
  const [deleteNotebookConfirmOpen, setDeleteNotebookConfirmOpen] =
    useState(false);
  const [renameNotebookOpen, setRenameNotebookOpen] = useState(false);
  const [duplicateNotebookOpen, setDuplicateNotebookOpen] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState('');
  const [newNotebookDescription, setNewNotebookDescription] = useState('');
  const [renameNotebookId, setRenameNotebookId] = useState<string | null>(null);
  const [renameNotebookName, setRenameNotebookName] = useState('');
  const [duplicateNotebookId, setDuplicateNotebookId] = useState<string | null>(
    null,
  );
  const [duplicateNotebookName, setDuplicateNotebookName] = useState('');
  const [notebookToDelete, setNotebookToDelete] = useState<{
    connectionKey: string;
    notebookId: string;
    notebookName: string;
  } | null>(null);
  const [activeNotebookToDelete, setActiveNotebookToDelete] = useState<{
    notebookId: string;
    notebookName: string;
  } | null>(null);
  const [connectionKeyToDeleteAll, setConnectionKeyToDeleteAll] = useState<
    string | null
  >(null);

  // Notebook tab manager
  const notebookTabManager = useNotebookTabManager();

  // Get active connection details
  const activeConnection = useMemo(() => {
    if (activeConnectionId.startsWith('ducklake-')) {
      const instanceId = activeConnectionId.replace('ducklake-', '');
      const instance = duckLakeInstances.find((inst) => inst.id === instanceId);
      if (instance) {
        return {
          id: activeConnectionId,
          connection: {
            name: instance.name,
            type: 'ducklake',
          },
        };
      }
    }
    return connections.find((c) => c.id === activeConnectionId);
  }, [connections, duckLakeInstances, activeConnectionId]);

  // Load schema for connection
  const loadSchema = useCallback(async (connectionId: string) => {
    setIsLoadingSchema(true);
    try {
      if (connectionId.startsWith('ducklake-')) {
        // DuckLake schema extraction
        const instanceId = connectionId.replace('ducklake-', '');
        const duckLakeSchema = await DuckLakeService.extractSchema(instanceId);

        // Convert DuckLake schema to Table[] format
        const tables: Table[] = [];
        duckLakeSchema.schemas.forEach((schemaInfo) => {
          schemaInfo.tables.forEach((table) => {
            tables.push({
              name: table.name,
              type: table.type || 'TABLE',
              schema: schemaInfo.name,
              columns:
                table.columns?.map((col, index) => ({
                  name: col.name,
                  typeName: col.type,
                  type: col.type,
                  ordinalPosition: index + 1,
                  primaryKeySequenceId: 0,
                  columnDisplaySize: 0,
                  scale: 0,
                  precision: 0,
                  columnProperties: [],
                  autoincrement: false,
                  nullable: true,
                  defaultValue: undefined,
                  primaryKey: false,
                  foreignKeys: [],
                })) || [],
            });
          });
        });

        setSchema(tables);
      } else {
        // Regular DB connection schema extraction
        const result =
          await connectorsServices.extractSchemaFromConnection(connectionId);
        if (result.error) {
          // eslint-disable-next-line no-console
          console.error('Failed to fetch schema:', result.error);
          setSchema([]);
        } else {
          setSchema(result.tables);
        }
      }
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch schema:', error);
      setSchema([]);
    } finally {
      setIsLoadingSchema(false);
    }
  }, []);

  // Handle connection selection
  const handleConnectionSelect = useCallback(
    (connectionId: string) => {
      // Close all tabs from previous connection
      if (activeConnectionId) {
        notebookTabManager.closeTabsByConnection(activeConnectionId);
      }

      // Clear previous connection state
      setSchema([]);

      // Set new connection
      setActiveConnectionId(connectionId);

      // Load schema for new connection
      if (connectionId) {
        loadSchema(connectionId);
      }
    },
    [loadSchema, activeConnectionId, notebookTabManager],
  );

  // Handle schema refresh
  const handleRefreshSchema = useCallback(() => {
    if (activeConnectionId) {
      loadSchema(activeConnectionId);
    }
  }, [activeConnectionId, loadSchema]);

  // Helper: Check if connection exists
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const connectionExists = useCallback(
    (connectionKey: string) => {
      if (connectionKey.startsWith('ducklake:')) {
        const instanceId = connectionKey.replace('ducklake:', '');
        return duckLakeInstances.some((inst) => inst.id === instanceId);
      }
      if (connectionKey.startsWith('db:')) {
        const connId = connectionKey.replace('db:', '');
        return connections.some((conn) => conn.id === connId);
      }
      return false;
    },
    [connections, duckLakeInstances],
  );

  // Helper: Get connection name from connectionKey
  const getConnectionName = useCallback(
    (connectionKey: string) => {
      if (connectionKey.startsWith('ducklake:')) {
        const instanceId = connectionKey.replace('ducklake:', '');
        const instance = duckLakeInstances.find(
          (inst) => inst.id === instanceId,
        );
        return instance?.name || 'Unknown DuckLake';
      }
      if (connectionKey.startsWith('db:')) {
        const connId = connectionKey.replace('db:', '');
        const conn = connections.find((c) => c.id === connId);
        return conn?.connection.name || 'Unknown Connection';
      }
      return 'Unknown';
    },
    [connections, duckLakeInstances],
  );

  // Handle restore archived notebook
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleRestoreNotebook = useCallback(
    (connectionKey: string, notebookId: string) => {
      // Determine target connection ID
      let targetConnectionId: string;
      if (connectionKey.startsWith('ducklake:')) {
        const instanceId = connectionKey.replace('ducklake:', '');
        targetConnectionId = `ducklake-${instanceId}`;
      } else {
        targetConnectionId = connectionKey.replace('db:', '');
      }

      restoreNotebook.mutate({
        archivedConnectionKey: connectionKey,
        notebookId,
        targetConnectionId,
      });
    },
    [restoreNotebook],
  );

  // Handle delete archived notebook
  const handleDeleteArchivedNotebook = useCallback(() => {
    if (!notebookToDelete) return;

    deleteArchivedNotebook.mutate(
      {
        connectionKey: notebookToDelete.connectionKey,
        notebookId: notebookToDelete.notebookId,
      },
      {
        onSuccess: () => {
          setDeleteConfirmOpen(false);
          setNotebookToDelete(null);
        },
      },
    );
  }, [notebookToDelete, deleteArchivedNotebook]);

  // Handle delete all archived notebooks
  const handleDeleteAllArchived = useCallback(() => {
    deleteAllArchived.mutate(connectionKeyToDeleteAll || undefined, {
      onSuccess: () => {
        setDeleteAllConfirmOpen(false);
        setConnectionKeyToDeleteAll(null);
      },
    });
  }, [connectionKeyToDeleteAll, deleteAllArchived]);

  // Handle create notebook
  const handleCreateNotebook = useCallback(() => {
    if (!activeConnectionId || !newNotebookName.trim()) return;

    createNotebook.mutate(
      {
        connectionId: activeConnectionId,
        name: newNotebookName.trim(),
        description: newNotebookDescription.trim() || undefined,
      },
      {
        onSuccess: () => {
          setCreateNotebookOpen(false);
          setNewNotebookName('');
          setNewNotebookDescription('');
        },
      },
    );
  }, [
    activeConnectionId,
    newNotebookName,
    newNotebookDescription,
    createNotebook,
  ]);

  // Handle open notebook (placeholder - will navigate to notebook editor)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleOpenNotebook = useCallback(
    (notebookId: string) => {
      const notebook = notebooks.find((n) => n.id === notebookId);
      if (notebook) {
        notebookTabManager.openNotebook(notebook, activeConnectionId);
      }
    },
    [notebooks, activeConnectionId, notebookTabManager],
  );

  // Handle delete notebook
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDeleteNotebook = useCallback(
    (notebookId: string, notebookName: string) => {
      setActiveNotebookToDelete({ notebookId, notebookName });
      setDeleteNotebookConfirmOpen(true);
    },
    [],
  );

  // Handle rename notebook
  const handleRenameNotebook = useCallback(
    (notebookId: string, currentName: string) => {
      setRenameNotebookId(notebookId);
      setRenameNotebookName(currentName);
      setRenameNotebookOpen(true);
    },
    [],
  );

  // Handle duplicate notebook
  const handleDuplicateNotebook = useCallback(
    (notebookId: string, currentName: string) => {
      setDuplicateNotebookId(notebookId);
      setDuplicateNotebookName(`${currentName} (Copy)`);
      setDuplicateNotebookOpen(true);
    },
    [],
  );

  // Confirm delete notebook
  const confirmDeleteNotebook = useCallback(() => {
    if (!activeNotebookToDelete) return;

    deleteNotebook.mutate(
      {
        connectionId: activeConnectionId,
        notebookId: activeNotebookToDelete.notebookId,
      },
      {
        onSuccess: () => {
          // Close the tab if it's open
          notebookTabManager.closeTab(activeNotebookToDelete.notebookId);
          setDeleteNotebookConfirmOpen(false);
          setActiveNotebookToDelete(null);
        },
      },
    );
  }, [
    activeNotebookToDelete,
    activeConnectionId,
    deleteNotebook,
    notebookTabManager,
  ]);

  // Confirm rename notebook
  const confirmRenameNotebook = useCallback(() => {
    if (!renameNotebookId || !renameNotebookName.trim()) return;

    renameNotebook.mutate(
      {
        connectionId: activeConnectionId,
        notebookId: renameNotebookId,
        newName: renameNotebookName.trim(),
      },
      {
        onSuccess: () => {
          // Update the tab name if it's open
          notebookTabManager.updateTabName(
            renameNotebookId,
            renameNotebookName.trim(),
          );
          setRenameNotebookOpen(false);
          setRenameNotebookId(null);
          setRenameNotebookName('');
        },
      },
    );
  }, [
    renameNotebookId,
    renameNotebookName,
    activeConnectionId,
    renameNotebook,
    notebookTabManager,
  ]);

  // Confirm duplicate notebook
  const confirmDuplicateNotebook = useCallback(() => {
    if (!duplicateNotebookId || !duplicateNotebookName.trim()) return;

    duplicateNotebook.mutate(
      {
        connectionId: activeConnectionId,
        notebookId: duplicateNotebookId,
        newName: duplicateNotebookName.trim(),
      },
      {
        onSuccess: (newNotebook) => {
          // Optionally open the duplicated notebook
          notebookTabManager.openNotebook(newNotebook, activeConnectionId);
          setDuplicateNotebookOpen(false);
          setDuplicateNotebookId(null);
          setDuplicateNotebookName('');
        },
      },
    );
  }, [
    duplicateNotebookId,
    duplicateNotebookName,
    activeConnectionId,
    duplicateNotebook,
    notebookTabManager,
  ]);

  // Handle export all notebooks
  const handleExportAllNotebooks = useCallback(() => {
    if (notebooks.length === 0) {
      // eslint-disable-next-line no-console
      console.log('No notebooks to export');
      return;
    }

    // Create JSON export
    const exportData = {
      exportDate: new Date().toISOString(),
      connectionId: activeConnectionId,
      connectionName: activeConnection?.connection.name,
      notebooks: notebooks.map((notebook) => ({
        id: notebook.id,
        name: notebook.name,
        description: notebook.description,
        cells: notebook.cells,
        createdAt: notebook.createdAt,
        updatedAt: notebook.updatedAt,
      })),
    };

    // Download as JSON file
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `notebooks-${activeConnection?.connection.name || 'export'}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // eslint-disable-next-line no-console
    console.log('Exported', notebooks.length, 'notebooks');
  }, [notebooks, activeConnectionId, activeConnection]);

  return (
    <AppLayout
      data-testid="notebooks-screen"
      sidebarContent={
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
          }}
        >
          {/* Connection Selection & Actions */}
          <Box
            sx={{
              p: '8px',
              display: 'flex',
              gap: '4px',
              alignItems: 'center',
              bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
              borderBottom: `1px solid ${theme.palette.divider}`,
            }}
          >
            <FormControl fullWidth size="small">
              <Select
                data-testid="notebooks-connection-select"
                value={activeConnectionId}
                onChange={(e) => handleConnectionSelect(e.target.value)}
                displayEmpty
                renderValue={(selected) => {
                  if (!selected) return 'Select Connection';
                  const conn = connections.find((c) => c.id === selected);
                  if (conn) {
                    const icon =
                      connectionIcons.images[conn.connection.type] ||
                      defaultIcon;
                    const isProjectConnection =
                      conn.id === selectedProject?.connectionId;
                    return (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          width: '100%',
                        }}
                      >
                        <img
                          src={icon}
                          alt=""
                          style={{
                            width: 14,
                            height: 14,
                            objectFit: 'contain',
                          }}
                        />
                        <span
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            flex: 1,
                          }}
                        >
                          {conn.connection.name}
                        </span>
                        {isProjectConnection && (
                          <Tooltip title="Project Connection">
                            <LinkIcon
                              sx={{
                                ml: 'auto',
                                fontSize: 16,
                                color: 'primary.main',
                                mr: 2,
                                transform: 'rotate(-45deg)',
                              }}
                            />
                          </Tooltip>
                        )}
                      </Box>
                    );
                  }

                  // Check DuckLake instances
                  if (selected.startsWith('ducklake-')) {
                    const instanceId = selected.replace('ducklake-', '');
                    const instance = duckLakeInstances.find(
                      (inst) => inst.id === instanceId,
                    );
                    if (instance) {
                      return (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            width: '100%',
                          }}
                        >
                          <img
                            src={connectionIcons.images.ducklake || defaultIcon}
                            alt=""
                            style={{
                              width: 14,
                              height: 14,
                              objectFit: 'contain',
                            }}
                          />
                          <span
                            style={{
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              flex: 1,
                            }}
                          >
                            {instance.name}
                          </span>
                        </Box>
                      );
                    }
                  }

                  return 'Select Connection';
                }}
                sx={{
                  height: 28,
                  bgcolor:
                    theme.palette.mode === 'dark' ? '#2d2d2d' : '#e0e0e0',
                  '& .MuiSelect-select': {
                    py: 0,
                    px: 1,
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                  },
                  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                }}
              >
                <MenuItem value="" disabled sx={{ fontSize: '0.8rem' }}>
                  Select Connection
                </MenuItem>
                {connections.map((conn) => {
                  const isProjectConnection =
                    conn.id === selectedProject?.connectionId;
                  return (
                    <MenuItem
                      key={conn.id}
                      value={conn.id}
                      sx={{
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        justifyContent: 'space-between',
                      }}
                    >
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <img
                          src={
                            connectionIcons.images[conn.connection.type] ||
                            defaultIcon
                          }
                          alt=""
                          style={{
                            width: 14,
                            height: 14,
                            objectFit: 'contain',
                          }}
                        />
                        {conn.connection.name}
                      </Box>
                      {isProjectConnection && (
                        <Tooltip title="Project Connection">
                          <LinkIcon
                            sx={{
                              fontSize: 16,
                              color: 'primary.main',
                              transform: 'rotate(-45deg)',
                            }}
                          />
                        </Tooltip>
                      )}
                    </MenuItem>
                  );
                })}
                {/* DuckLake Instances */}
                {duckLakeInstances.length > 0 && (
                  <MenuItem
                    disabled
                    sx={{ fontSize: '0.75rem', opacity: 0.6, mt: 1 }}
                  >
                    <strong>DuckLake Instances</strong>
                  </MenuItem>
                )}
                {duckLakeInstances.map((instance) => (
                  <MenuItem
                    key={`ducklake-${instance.id}`}
                    value={`ducklake-${instance.id}`}
                    sx={{
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <img
                      src={connectionIcons.images.ducklake || defaultIcon}
                      alt=""
                      style={{ width: 14, height: 14, objectFit: 'contain' }}
                    />
                    {instance.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip title="Add Connection">
              <IconButton
                size="small"
                onClick={() => navigate('/app/add-connection')}
                sx={{
                  width: 28,
                  height: 28,
                  bgcolor: 'transparent',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' },
                }}
              >
                <Add sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Tabbed Sidebar */}
          {!activeConnectionId ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 2,
                height: '100%',
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  textAlign: 'center',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'normal',
                }}
              >
                Select a connection to view schema and notebooks
              </Typography>
            </Box>
          ) : (
            <NotebooksSidebar
              connectionName={activeConnection?.connection.name || 'Database'}
              connectionType={
                (activeConnectionId.startsWith('ducklake-')
                  ? 'ducklake'
                  : activeConnection?.connection
                      .type) as SupportedConnectionTypes
              }
              schema={schema}
              isLoadingSchema={isLoadingSchema}
              notebooks={notebooks}
              isLoadingNotebooks={isLoadingNotebooks}
              archivedNotebooks={archivedNotebooks}
              showArchived={showArchived}
              onRefresh={handleRefreshSchema}
              onCreateNotebook={() => setCreateNotebookOpen(true)}
              onOpenNotebook={handleOpenNotebook}
              onRenameNotebook={handleRenameNotebook}
              onDuplicateNotebook={handleDuplicateNotebook}
              onDeleteNotebook={handleDeleteNotebook}
              onRestoreNotebook={handleRestoreNotebook}
              onDeleteArchivedNotebook={(
                connectionKey,
                notebookId,
                notebookName,
              ) => {
                setNotebookToDelete({
                  connectionKey,
                  notebookId,
                  notebookName,
                });
                setDeleteConfirmOpen(true);
              }}
              onToggleArchived={setShowArchived}
              getConnectionName={getConnectionName}
              onExportAllNotebooks={handleExportAllNotebooks}
            />
          )}
        </Box>
      }
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {!activeConnectionId ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'text.secondary',
              p: 2,
            }}
          >
            <TableChart sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
            <Typography
              variant="h6"
              color="text.secondary"
              sx={{
                mb: 1,
                textAlign: 'center',
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
              }}
            >
              No Connection Selected
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                textAlign: 'center',
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                whiteSpace: 'normal',
              }}
            >
              Select a connection from the sidebar to start working with
              notebooks
            </Typography>
          </Box>
        ) : (
          <>
            {/* Notebook Tabs */}
            <NotebookTabManager
              tabs={notebookTabManager.tabs}
              activeTabId={notebookTabManager.activeTabId}
              onSelect={notebookTabManager.switchTab}
              onClose={notebookTabManager.closeTab}
              onReorder={notebookTabManager.reorderTabs}
            />

            {/* Notebook Content */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              {notebookTabManager.activeTabId ? (
                <NotebookEditor
                  instanceId={activeConnectionId}
                  notebookId={notebookTabManager.activeTabId}
                />
              ) : (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'text.secondary',
                    p: 2,
                  }}
                >
                  <TableChart sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
                  <Typography
                    variant="h6"
                    color="text.secondary"
                    sx={{
                      mb: 1,
                      textAlign: 'center',
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word',
                    }}
                  >
                    No Notebook Open
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mb: 2,
                      textAlign: 'center',
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word',
                      whiteSpace: 'normal',
                    }}
                  >
                    Select a notebook from the sidebar to start editing
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={() => setCreateNotebookOpen(true)}
                  >
                    Create New Notebook
                  </Button>
                </Box>
              )}
            </Box>
          </>
        )}
      </Box>

      {/* Delete Notebook Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="error" />
            Delete Archived Notebook
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to permanently delete the notebook &quot;
            {notebookToDelete?.notebookName}&quot;? This action cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteArchivedNotebook}
            color="error"
            variant="contained"
            disabled={deleteArchivedNotebook.isLoading}
          >
            {deleteArchivedNotebook.isLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Active Notebook Confirmation Dialog */}
      <Dialog
        open={deleteNotebookConfirmOpen}
        onClose={() => setDeleteNotebookConfirmOpen(false)}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="error" />
            Delete Notebook
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the notebook &quot;
            {activeNotebookToDelete?.notebookName}&quot;? It will be moved to
            archived notebooks.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteNotebookConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={confirmDeleteNotebook}
            color="error"
            variant="contained"
            disabled={deleteNotebook.isLoading}
          >
            {deleteNotebook.isLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Notebook Dialog */}
      <Dialog
        open={createNotebookOpen}
        onClose={() => {
          setCreateNotebookOpen(false);
          setNewNotebookName('');
          setNewNotebookDescription('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Notebook</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              autoFocus
              label="Notebook Name"
              fullWidth
              value={newNotebookName}
              onChange={(e) => setNewNotebookName(e.target.value)}
              placeholder="My Notebook"
              required
              onKeyPress={(e) => {
                if (e.key === 'Enter' && newNotebookName.trim()) {
                  handleCreateNotebook();
                }
              }}
            />
            <TextField
              label="Description (optional)"
              fullWidth
              multiline
              rows={3}
              value={newNotebookDescription}
              onChange={(e) => setNewNotebookDescription(e.target.value)}
              placeholder="Describe what this notebook is for..."
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setCreateNotebookOpen(false);
              setNewNotebookName('');
              setNewNotebookDescription('');
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateNotebook}
            variant="contained"
            disabled={!newNotebookName.trim() || createNotebook.isLoading}
          >
            {createNotebook.isLoading ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete All Archived Notebooks Confirmation Dialog */}
      <Dialog
        open={deleteAllConfirmOpen}
        onClose={() => setDeleteAllConfirmOpen(false)}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="error" />
            Delete All Archived Notebooks
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {connectionKeyToDeleteAll
              ? `Are you sure you want to permanently delete all archived notebooks for "${getConnectionName(connectionKeyToDeleteAll)}"?`
              : 'Are you sure you want to permanently delete ALL archived notebooks?'}{' '}
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteAllConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteAllArchived}
            color="error"
            variant="contained"
            disabled={deleteAllArchived.isLoading}
          >
            {deleteAllArchived.isLoading ? 'Deleting...' : 'Delete All'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Notebook Dialog */}
      <Dialog
        open={renameNotebookOpen}
        onClose={() => {
          setRenameNotebookOpen(false);
          setRenameNotebookId(null);
          setRenameNotebookName('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rename Notebook</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              autoFocus
              label="Notebook Name"
              fullWidth
              value={renameNotebookName}
              onChange={(e) => setRenameNotebookName(e.target.value)}
              placeholder="Enter new name"
              required
              onKeyPress={(e) => {
                if (e.key === 'Enter' && renameNotebookName.trim()) {
                  confirmRenameNotebook();
                }
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setRenameNotebookOpen(false);
              setRenameNotebookId(null);
              setRenameNotebookName('');
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmRenameNotebook}
            variant="contained"
            disabled={!renameNotebookName.trim() || renameNotebook.isLoading}
          >
            {renameNotebook.isLoading ? 'Renaming...' : 'Rename'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Duplicate Notebook Dialog */}
      <Dialog
        open={duplicateNotebookOpen}
        onClose={() => {
          setDuplicateNotebookOpen(false);
          setDuplicateNotebookId(null);
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
                  confirmDuplicateNotebook();
                }
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDuplicateNotebookOpen(false);
              setDuplicateNotebookId(null);
              setDuplicateNotebookName('');
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmDuplicateNotebook}
            variant="contained"
            disabled={
              !duplicateNotebookName.trim() || duplicateNotebook.isLoading
            }
          >
            {duplicateNotebook.isLoading ? 'Duplicating...' : 'Duplicate'}
          </Button>
        </DialogActions>
      </Dialog>
    </AppLayout>
  );
};

export default Notebooks;
