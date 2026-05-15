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
  Code as CodeIcon,
  GetApp as ImportIcon,
  Refresh as RefreshIcon,
  Description as DescriptionIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  FileCopy as FileCopyIcon,
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-toastify';
import { SavedQuery } from '../../../types/backend';
import {
  useGetSavedQueries,
  useDeleteSavedQuery,
  useCreateSavedQuery,
  useUpdateSavedQuery,
} from '../../controllers/savedQueries.controller';

interface SavedQueriesListProps {
  connectionId: string | undefined;
  onOpenQuery: (query: string) => void;
}

export const SavedQueriesList: React.FC<SavedQueriesListProps> = ({
  connectionId,
  onOpenQuery,
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
  const deleteQueryMutation = useDeleteSavedQuery();
  const createQueryMutation = useCreateSavedQuery();
  const updateQueryMutation = useUpdateSavedQuery();

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
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
      onOpenQuery(contextMenu.query.query);
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
      await deleteQueryMutation.mutateAsync({
        connectionId,
        queryId: contextMenu.query.id,
      });
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
              const name =
                file.path.split(/[/\\]/).pop()?.replace('.sql', '') ||
                'Imported Query';
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
        onDoubleClick={() => onOpenQuery(query.query)}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
          px: 1,
          py: 0.5,
          borderRadius: 1,
          cursor: 'pointer',
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
      >
        <CodeIcon sx={{ fontSize: 16, color: 'primary.main', mt: 0.5 }} />
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {query.name}
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.5 }}>
            {formatDistanceToNow(new Date(query.updatedAt || query.createdAt))}{' '}
            ago
          </Typography>
        </Box>
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
        <IconButton size="small" sx={{ p: 0.5 }} onClick={() => refetch()}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* List Area */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 0.5 }}>
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
