/**
 * Notebooks List Component
 * Grid/list view of notebooks for a DataLake instance
 */

import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardActions,
  Typography,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Chip,
  Alert,
  CircularProgress,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  Add as AddIcon,
  MoreVert as MoreIcon,
  Description as NotebookIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import {
  useNotebooks,
  useCreateNotebook,
  useDeleteNotebook,
} from '../../controllers/notebook.controller';

interface NotebooksListProps {
  instanceId: string;
  instanceType: string;
}

export const NotebooksList: React.FC<NotebooksListProps> = ({
  instanceId,
  instanceType,
}) => {
  const navigate = useNavigate();
  const { data: notebooks, isLoading, error } = useNotebooks(instanceId);
  const createNotebook = useCreateNotebook();
  const deleteNotebook = useDeleteNotebook();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState('');
  const [newNotebookDescription, setNewNotebookDescription] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<{
    element: HTMLElement;
    notebookId: string;
  } | null>(null);

  const handleCreateNotebook = async () => {
    if (!newNotebookName.trim()) return;

    try {
      const notebook = await createNotebook.mutateAsync({
        instanceId,
        name: newNotebookName.trim(),
        description: newNotebookDescription.trim() || undefined,
      });

      setCreateDialogOpen(false);
      setNewNotebookName('');
      setNewNotebookDescription('');

      // Navigate to the new notebook
      navigate(
        `/app/data-lake/${instanceType}/instances/${instanceId}/notebooks/${notebook.id}`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to create notebook:', err);
    }
  };

  const handleDeleteNotebook = async (notebookId: string) => {
    // eslint-disable-next-line no-alert, no-restricted-globals
    if (!window.confirm('Are you sure you want to delete this notebook?'))
      return;

    try {
      await deleteNotebook.mutateAsync({ instanceId, notebookId });
      setMenuAnchor(null);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete notebook:', err);
    }
  };

  const handleOpenNotebook = (notebookId: string) => {
    navigate(
      `/app/data-lake/${instanceType}/instances/${instanceId}/notebooks/${notebookId}`,
    );
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: 400,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">Failed to load notebooks: {error.message}</Alert>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h6">Notebooks</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          New Notebook
        </Button>
      </Box>

      {/* Notebooks Grid */}
      {notebooks && notebooks.length > 0 ? (
        <Grid container spacing={2}>
          {notebooks.map((notebook) => (
            <Grid item xs={12} sm={6} md={4} key={notebook.id}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  '&:hover': {
                    boxShadow: 4,
                  },
                }}
                onClick={() => handleOpenNotebook(notebook.id)}
              >
                <CardContent sx={{ flex: 1 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      mb: 2,
                    }}
                  >
                    <NotebookIcon color="primary" />
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuAnchor({
                          element: e.currentTarget,
                          notebookId: notebook.id,
                        });
                      }}
                    >
                      <MoreIcon fontSize="small" />
                    </IconButton>
                  </Box>

                  <Typography variant="h6" gutterBottom noWrap>
                    {notebook.name}
                  </Typography>

                  {notebook.description && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        mb: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {notebook.description}
                    </Typography>
                  )}

                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip
                      label={`${notebook.cellCount} cells`}
                      size="small"
                      variant="outlined"
                    />
                  </Box>
                </CardContent>

                <CardActions sx={{ justifyContent: 'space-between', px: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    {notebook.lastExecutedAt
                      ? `Last run: ${new Date(
                          notebook.lastExecutedAt,
                        ).toLocaleDateString()}`
                      : 'Never executed'}
                  </Typography>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: 300,
            gap: 2,
          }}
        >
          <NotebookIcon sx={{ fontSize: 64, color: 'text.secondary' }} />
          <Typography variant="h6" color="text.secondary">
            No Notebooks Yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create your first notebook to start exploring data
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create Notebook
          </Button>
        </Box>
      )}

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor?.element}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            if (menuAnchor) {
              handleDeleteNotebook(menuAnchor.notebookId);
            }
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Create Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Notebook</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Notebook Name"
            fullWidth
            value={newNotebookName}
            onChange={(e) => setNewNotebookName(e.target.value)}
            placeholder="My Analysis Notebook"
          />
          <TextField
            margin="dense"
            label="Description (optional)"
            fullWidth
            multiline
            rows={3}
            value={newNotebookDescription}
            onChange={(e) => setNewNotebookDescription(e.target.value)}
            placeholder="Describe what this notebook is for..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreateNotebook}
            variant="contained"
            disabled={!newNotebookName.trim() || createNotebook.isLoading}
          >
            {createNotebook.isLoading ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
