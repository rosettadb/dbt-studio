import React, { useState, MouseEvent } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  CircularProgress,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import {
  GetApp as ImportIcon,
  Refresh as RefreshIcon,
  Description as DescriptionIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  FileCopy as FileCopyIcon,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { toast } from 'react-toastify';
import { useQueryClient } from 'react-query';
import { SavedQuery } from '../../../types/backend';
import { path, toPosix } from '../../lib/path';
import {
  useGetSavedQueries,
  useDeleteSavedQuery,
  useCreateSavedQuery,
  useUpdateSavedQuery,
} from '../../controllers/savedQueries.controller';
import { projectsServices } from '../../services';
import {
  ProjectFolderTree,
  SavedInStudioHeading,
  useConnectionProject,
} from '../projectFolders/ProjectFolderTree';
import { PROJECT_QUERIES_DIR } from '../../../shared/projectFolders';
import { FileIcon } from '../fileIcon';
import type { SqlTabSource } from '../../../types/editor';
import { SaveQueryDialog } from './SaveQueryDialog';
import { QUERY_KEYS } from '../../config/constants';

interface SavedQueriesListProps {
  connectionId: string | undefined;
  /**
   * Load a saved query into the connection's tab; the tab stays linked to it
   * so Save updates it (plan 95d).
   */
  onOpenQuery: (source: SqlTabSource, query: string) => void;
  /** The saved query the tab is linked to, highlighted in the list. */
  selectedSource?: SqlTabSource;
  /** Saved queries were renamed or moved: keep the tab linked. */
  onQueryRenamed?: (
    matches: (source: SqlTabSource) => boolean,
    next: (source: SqlTabSource) => SqlTabSource,
  ) => void;
  /** Saved queries were deleted: unlink the tab. */
  onQueriesDeleted?: (matches: (source: SqlTabSource) => boolean) => void;
}

const localSource = (query: SavedQuery): SqlTabSource => ({
  kind: 'local',
  queryId: query.id,
  name: query.name,
});

// A project file at `filePath`, or inside the folder at `filePath`
const isUnderPath = (source: SqlTabSource, filePath: string) => {
  if (source.kind !== 'project') return false;
  const target = toPosix(filePath);
  const own = toPosix(source.filePath);
  return own === target || own.startsWith(`${target}/`);
};

export const SavedQueriesList: React.FC<SavedQueriesListProps> = ({
  connectionId,
  onOpenQuery,
  selectedSource,
  onQueryRenamed,
  onQueriesDeleted,
}) => {
  const [filterText, setFilterText] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    query: SavedQuery | null;
  } | null>(null);

  const {
    data: savedQueries,
    isLoading,
    refetch,
  } = useGetSavedQueries(connectionId);
  // Queries saved as .sql files in the connection's project (plan 95d)
  const project = useConnectionProject(connectionId);
  const queryClient = useQueryClient();
  const deleteQueryMutation = useDeleteSavedQuery();
  const createQueryMutation = useCreateSavedQuery();
  const updateQueryMutation = useUpdateSavedQuery();

  const isSelectedLocal = (query: SavedQuery) =>
    selectedSource?.kind === 'local' && selectedSource.queryId === query.id;

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  // + on the Local folder: a new, empty local query, as the project
  // folder's + makes an empty .sql file
  const [newLocalOpen, setNewLocalOpen] = useState(false);

  const handleCreateLocalQuery = async (name: string) => {
    if (!connectionId) return;
    try {
      await createQueryMutation.mutateAsync({
        connectionId,
        name,
        query: `-- ${name}\n`,
      });
      toast.success(`Query "${name}" created`);
    } catch {
      toast.error('Failed to create query');
    }
  };
  const [renameQueryId, setRenameQueryId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleContextMenu = (event: MouseEvent, query: SavedQuery) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      query,
    });
  };

  const handleClose = () => {
    setContextMenu(null);
  };

  const handleOpen = () => {
    if (contextMenu?.query) {
      onOpenQuery(localSource(contextMenu.query), contextMenu.query.query);
    }
    handleClose();
  };

  const handleRename = () => {
    if (contextMenu?.query) {
      setRenameQueryId(contextMenu.query.id);
      setRenameValue(contextMenu.query.name);
      setRenameDialogOpen(true);
    }
    handleClose();
  };

  const handleRenameSubmit = async () => {
    if (connectionId && renameQueryId && renameValue.trim()) {
      try {
        await updateQueryMutation.mutateAsync({
          connectionId,
          queryId: renameQueryId,
          updates: { name: renameValue.trim() },
        });
        const newName = renameValue.trim();
        onQueryRenamed?.(
          (source) =>
            source.kind === 'local' && source.queryId === renameQueryId,
          (source) => ({ ...source, name: newName }),
        );
        toast.success('Query renamed successfully');
        setRenameDialogOpen(false);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to rename query', e);
        toast.error('Failed to rename query');
      }
    }
  };

  const handleDelete = async () => {
    if (contextMenu?.query && connectionId) {
      const deletedId = contextMenu.query.id;
      await deleteQueryMutation.mutateAsync({
        connectionId,
        queryId: deletedId,
      });
      onQueriesDeleted?.(
        (source) => source.kind === 'local' && source.queryId === deletedId,
      );
    }
    handleClose();
  };

  const handleExport = () => {
    if (contextMenu?.query) {
      const element = document.createElement('a');
      const file = new Blob([contextMenu.query.query], { type: 'text/sql' });
      element.href = URL.createObjectURL(file);
      element.download = `${contextMenu.query.name}.sql`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
    handleClose();
  };

  const handleImport = async () => {
    if (!connectionId) return;

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'dialog:showOpenDialog',
        {
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'SQL Files', extensions: ['sql'] }],
        },
      );

      if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        const fileContents = await window.electron.ipcRenderer.invoke(
          'utils:getFileContentList',
          result.filePaths,
        );

        const validFiles = fileContents.filter((f: any) => f.content.trim());

        if (validFiles.length > 0) {
          await Promise.all(
            validFiles.map((file: any) => {
              const name = path.basename(file.path, '.sql') || 'Imported Query';
              return createQueryMutation.mutateAsync({
                connectionId,
                name,
                query: file.content,
              });
            }),
          );
          toast.success(`Successfully imported ${validFiles.length} queries`);
        } else {
          toast.info('No valid queries found to import');
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to import SQL files', e);
      toast.error('Failed to import SQL files');
    }
  };

  if (!connectionId) {
    return (
      <Box sx={{ p: 2, textAlign: 'center', opacity: 0.6 }}>
        <Typography variant="body2">
          Select a connection to view saved queries
        </Typography>
      </Box>
    );
  }

  const filteredQueries = (savedQueries || []).filter((q: SavedQuery) =>
    q.name.toLowerCase().includes(filterText.toLowerCase()),
  );

  const renderListContent = () => {
    if (isLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
          <CircularProgress size={20} />
        </Box>
      );
    }

    if (filteredQueries.length === 0) {
      return (
        <Typography variant="caption" sx={{ opacity: 0.5, pl: 1 }}>
          No saved queries found.
        </Typography>
      );
    }

    return filteredQueries.map((query: SavedQuery) => (
      <Box
        key={query.id}
        onContextMenu={(e) => handleContextMenu(e, query)}
        onClick={() => onOpenQuery(localSource(query), query.query)}
        data-selected={isSelectedLocal(query) ? 'true' : undefined}
        sx={{
          display: 'flex',
          alignItems: 'center',
          // One 22px row, icon at 12px with a 6px gap, like the .sql files
          // in the project tree above (FileIcon adds its own 2px left margin)
          height: 22,
          gap: '6px',
          pl: '10px',
          pr: 1,
          cursor: 'pointer',
          // The query the tab is linked to (Save updates it), highlighted
          // like the selected file in the tree above
          bgcolor: (theme) =>
            isSelectedLocal(query)
              ? alpha(theme.palette.primary.main, 0.12)
              : 'transparent',
          '&:hover': {
            bgcolor: (theme) =>
              alpha(
                theme.palette.primary.main,
                isSelectedLocal(query) ? 0.12 : 0.08,
              ),
          },
        }}
      >
        {/* Same .sql file icon as the project's queries/ tree above */}
        <Box sx={{ display: 'flex', fontSize: 14 }}>
          <FileIcon fileName={`${query.name}.sql`} />
        </Box>
        <Typography
          noWrap
          title={query.name}
          sx={{ fontSize: 13, minWidth: 0, color: 'text.primary' }}
        >
          {query.name}
        </Typography>
      </Box>
    ));
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
      }}
    >
      {/* Top Header */}
      <Box
        sx={{
          p: '8px',
          display: 'flex',
          gap: 1,
          alignItems: 'center',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <TextField
          size="small"
          placeholder="Filter"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          fullWidth
          sx={{
            '& .MuiOutlinedInput-root': {
              height: 28,
              fontSize: '0.8rem',
            },
          }}
        />
        <Tooltip title="Import .sql files into Saved Queries">
          <IconButton size="small" sx={{ p: 0.5 }} onClick={handleImport}>
            <ImportIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <IconButton
          size="small"
          sx={{ p: 0.5 }}
          onClick={() => {
            refetch();
            // The project's queries/ folder may have changed outside Studio
            if (project) {
              queryClient.invalidateQueries([QUERY_KEYS.GET_FILE_STRUCTURE]);
            }
          }}
        >
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* List Area: the project's queries/ folder, then the queries saved
          in Studio; both scroll together */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 0.5 }}>
        {project && (
          <>
            <ProjectFolderTree
              project={project}
              folderName={PROJECT_QUERIES_DIR}
              fileExtension=".sql"
              filter={filterText}
              onOpenFile={async (file) => {
                try {
                  onOpenQuery(
                    { kind: 'project', filePath: file.path, name: file.name },
                    await projectsServices.getFileContent({ path: file.path }),
                  );
                } catch {
                  toast.error(`Could not read ${file.name}`);
                }
              }}
              selectedPath={
                selectedSource?.kind === 'project'
                  ? selectedSource.filePath
                  : undefined
              }
              onRenamed={(oldPath, newPath) =>
                onQueryRenamed?.(
                  (source) => isUnderPath(source, oldPath),
                  (source) => {
                    if (source.kind !== 'project') return source;
                    const filePath = `${toPosix(newPath)}${toPosix(source.filePath).slice(toPosix(oldPath).length)}`;
                    return {
                      ...source,
                      filePath,
                      name: path.basename(filePath),
                    };
                  },
                )
              }
              onDeleted={(deletedPath) =>
                onQueriesDeleted?.((source) => isUnderPath(source, deletedPath))
              }
              emptyText="No queries yet."
              testId="project-queries"
            />
            <SavedInStudioHeading
              onCreate={() => setNewLocalOpen(true)}
              createTitle="New Local Query"
            />
          </>
        )}
        {renderListContent()}
      </Box>

      <Menu
        open={contextMenu !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        PaperProps={{
          sx: { minWidth: 150 },
        }}
      >
        <MenuItem onClick={handleOpen} sx={{ fontSize: '0.85rem' }}>
          <ListItemIcon>
            <DescriptionIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.85rem' }}>
            Open
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={handleRename} sx={{ fontSize: '0.85rem' }}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.85rem' }}>
            Rename
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={handleExport} sx={{ fontSize: '0.85rem' }}>
          <ListItemIcon>
            <FileCopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.85rem' }}>
            Export
          </ListItemText>
        </MenuItem>
        <MenuItem
          onClick={handleDelete}
          sx={{ fontSize: '0.85rem', color: 'error.main' }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.85rem' }}>
            Delete
          </ListItemText>
        </MenuItem>
      </Menu>

      <SaveQueryDialog
        open={newLocalOpen}
        initialName={`Query #${(savedQueries?.length ?? 0) + 1}`}
        onClose={() => setNewLocalOpen(false)}
        onSave={handleCreateLocalQuery}
      />

      {/* Rename Dialog */}
      <Dialog
        open={renameDialogOpen}
        onClose={() => setRenameDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: '1rem' }}>Rename Query</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRenameSubmit();
              }
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleRenameSubmit}
            variant="contained"
            disabled={!renameValue.trim() || updateQueryMutation.isLoading}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
