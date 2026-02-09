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
  AutoAwesome as AutoAwesomeIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import {
  useNotebooks,
  useCreateNotebook,
  useDeleteNotebook,
  useUpdateNotebook,
} from '../../controllers/notebook.controller';
import { NotebookCell } from '../../../types/notebook';

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
  const updateNotebook = useUpdateNotebook();
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

  const handleCreateExampleNotebook = async () => {
    try {
      // Create notebook
      const notebook = await createNotebook.mutateAsync({
        instanceId,
        name: 'Example Notebook',
        description: 'Basic DuckDB commands and queries',
      });

      // Create example cells
      const exampleCells: NotebookCell[] = [
        {
          id: uuidv4(),
          type: 'sql',
          content:
            '-- Welcome to DuckDB Notebooks!\n-- This notebook demonstrates basic DuckDB commands for exploring your data lake.\n-- Note: The DuckLake extension is already loaded and connected to the metadata database.\n\n-- List all schemas in the current database\nSELECT * FROM information_schema.schemata\nORDER BY schema_name;',
          order: 0,
        },
        {
          id: uuidv4(),
          type: 'sql',
          content:
            "-- List all tables across all schemas\n-- This shows tables from both your data and the DuckLake metadata\nSELECT \n  table_schema,\n  table_name,\n  table_type\nFROM information_schema.tables\nWHERE table_schema NOT IN ('information_schema', 'pg_catalog')\nORDER BY table_schema, table_name;",
          order: 1,
        },
        {
          id: uuidv4(),
          type: 'sql',
          content:
            "-- List tables with column counts\n-- This provides a summary of each table's structure\nSELECT \n  t.table_schema,\n  t.table_name,\n  COUNT(c.column_name) as column_count\nFROM information_schema.tables t\nLEFT JOIN information_schema.columns c \n  ON t.table_schema = c.table_schema \n  AND t.table_name = c.table_name\nWHERE t.table_schema NOT IN ('information_schema', 'pg_catalog')\nGROUP BY t.table_schema, t.table_name\nORDER BY t.table_schema, t.table_name;",
          order: 2,
        },
        {
          id: uuidv4(),
          type: 'sql',
          content:
            "-- View DuckLake metadata: All tables with their record counts\n-- Note: DuckLake metadata tables are in the __ducklake_metadata_* schema\n-- Replace '__ducklake_metadata_movies' with your actual metadata schema name\nSELECT \n  schema_name,\n  table_name,\n  record_count,\n  file_size_bytes,\n  ROUND(file_size_bytes / 1024.0 / 1024.0, 2) as size_mb\nFROM __ducklake_metadata_movies.ducklake_table\nORDER BY file_size_bytes DESC;",
          order: 3,
        },
        {
          id: uuidv4(),
          type: 'sql',
          content:
            "-- Describe columns for a specific table\n-- Replace 'your_table_name' with an actual table from your catalog\n-- SELECT \n--   column_name,\n--   data_type,\n--   is_nullable\n-- FROM information_schema.columns\n-- WHERE table_name = 'your_table_name'\n-- ORDER BY ordinal_position;",
          order: 4,
        },
        {
          id: uuidv4(),
          type: 'sql',
          content:
            '-- Query data from a table\n-- Replace with your actual schema and table names\n-- SELECT * FROM your_schema.your_table LIMIT 10;',
          order: 5,
        },
        {
          id: uuidv4(),
          type: 'sql',
          content:
            "-- DuckLake Metadata Tables (available for querying):\n--\n-- __ducklake_metadata_*.ducklake_schema      - Schema information\n-- __ducklake_metadata_*.ducklake_table       - Table metadata with record counts\n-- __ducklake_metadata_*.ducklake_column      - Column definitions and statistics\n-- __ducklake_metadata_*.ducklake_snapshot    - Version history\n-- __ducklake_metadata_*.ducklake_data_file   - Physical file information\n--\n-- Note: Replace * with your actual metadata schema name\n\n-- Example: View all DuckLake metadata tables\nSELECT table_schema, table_name \nFROM information_schema.tables \nWHERE table_name LIKE 'ducklake_%'\nORDER BY table_schema, table_name;",
          order: 6,
        },
      ];

      // Update notebook with cells
      await updateNotebook.mutateAsync({
        instanceId,
        notebookId: notebook.id,
        cells: exampleCells,
      });

      // Navigate to the new notebook
      navigate(
        `/app/data-lake/${instanceType}/instances/${instanceId}/notebooks/${notebook.id}`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to create example notebook:', err);
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
      {/* Header with Back Button */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton
            onClick={() =>
              navigate(`/app/data-lake/${instanceType}/instances/${instanceId}`)
            }
            size="small"
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6">Notebooks</Typography>
        </Box>
        {notebooks && notebooks.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<AutoAwesomeIcon />}
              onClick={handleCreateExampleNotebook}
              disabled={createNotebook.isLoading || updateNotebook.isLoading}
            >
              Example Notebook
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateDialogOpen(true)}
            >
              New Notebook
            </Button>
          </Box>
        )}
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
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<AutoAwesomeIcon />}
              onClick={handleCreateExampleNotebook}
              disabled={createNotebook.isLoading || updateNotebook.isLoading}
            >
              Example Notebook
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateDialogOpen(true)}
            >
              Create Notebook
            </Button>
          </Box>
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
