import React, { useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
} from '@mui/material';
import {
  TableChart,
  Visibility,
  QueryStats,
  Delete,
  Edit,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import {
  useDeleteDuckLakeTable,
  useRenameDuckLakeTable,
} from '../../controllers/duckLake.controller';

interface DuckLakeTable {
  id: string;
  name: string;
  instanceId: string;
  instanceName: string;
  schema?: string;
  rowCount?: number;
  sizeBytes?: number;
  lastAccessed?: string;
  createdAt: string;
}

interface DuckLakeTablesProps {
  tables?: DuckLakeTable[];
  selectedInstanceId?: string;
  onPreview?: (tableId: string) => void;
  onQuery?: (tableId: string) => void;
}

export const DataLakeTables: React.FC<DuckLakeTablesProps> = ({
  tables = [],
  selectedInstanceId,
  onPreview,
  onQuery,
}) => {
  const navigate = useNavigate();
  const deleteTableMutation = useDeleteDuckLakeTable();
  const renameTableMutation = useRenameDuckLakeTable();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<DuckLakeTable | null>(
    null,
  );
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [tableToRename, setTableToRename] = useState<DuckLakeTable | null>(
    null,
  );
  const [newTableName, setNewTableName] = useState('');

  const filteredTables = useMemo(() => {
    const result = selectedInstanceId
      ? tables.filter((table) => table.instanceId === selectedInstanceId)
      : [...tables];

    // Sort by createdAt descending (newest first)
    return result.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [tables, selectedInstanceId]);

  const formatBytes = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${sizes[i]}`;
  };

  const formatRowCount = (count?: number) => {
    if (!count) return 'Unknown';
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const handlePreview = (tableId: string) => {
    if (onPreview) {
      onPreview(tableId);
    }
  };

  const handleQuery = (tableId: string) => {
    if (onQuery) {
      onQuery(tableId);
    }
  };

  const handleRequestDelete = (table: DuckLakeTable) => {
    setTableToDelete(table);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!tableToDelete) {
      setDeleteDialogOpen(false);
      return;
    }

    deleteTableMutation.mutate({
      instanceId: tableToDelete.instanceId,
      tableName: tableToDelete.name,
    });

    setDeleteDialogOpen(false);
    setTableToDelete(null);
  };

  const handleRequestRename = (table: DuckLakeTable) => {
    setTableToRename(table);
    setNewTableName(table.name);
    setRenameDialogOpen(true);
  };

  const handleConfirmRename = () => {
    if (!tableToRename) {
      setRenameDialogOpen(false);
      return;
    }

    renameTableMutation.mutate({
      instanceId: tableToRename.instanceId,
      oldName: tableToRename.name,
      newName: newTableName,
    });

    setRenameDialogOpen(false);
    setTableToRename(null);
    setNewTableName('');
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
            Tables
          </Typography>
          <TableChart sx={{ color: 'text.secondary', fontSize: 28 }} />
        </Box>
        {selectedInstanceId && (
          <Chip
            label={`${tables.find((t) => t.instanceId === selectedInstanceId)?.instanceName || selectedInstanceId}`}
            variant="outlined"
            color="primary"
          />
        )}
      </Box>

      {filteredTables.length === 0 ? (
        <Card
          sx={{
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            textAlign: 'center',
            py: 4,
          }}
        >
          <CardContent>
            <TableChart sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
              No Tables Found
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {selectedInstanceId
                ? 'No tables found in the selected ducklakes. Create some tables or connect to a different ducklakes.'
                : 'No tables found across all ducklakes. Create some tables to get started.'}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <TableContainer
          component={Paper}
          sx={{
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            borderRadius: 2,
          }}
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Table Name</TableCell>
                <TableCell>Schema</TableCell>
                <TableCell>Rows</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Last Accessed</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTables.map((table) => (
                <TableRow
                  key={table.id}
                  sx={{
                    '&:hover': {
                      backgroundColor: 'action.hover',
                      cursor: 'pointer',
                    },
                  }}
                  onClick={() =>
                    navigate(
                      `/app/data-lake/duck-lake/instances/${table.instanceId}/tables/${table.name}`,
                    )
                  }
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TableChart
                        sx={{ fontSize: 16, color: 'text.secondary' }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {table.name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {table.schema || 'main'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {formatRowCount(table.rowCount)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {formatBytes(table.sizeBytes)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {table.lastAccessed
                        ? moment(table.lastAccessed).fromNow()
                        : 'Never'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {moment(table.createdAt).fromNow()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Preview Data coming soon">
                        <span>
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePreview(table.id);
                            }}
                            disabled
                          >
                            <Visibility fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Query Table coming soon">
                        <span>
                          <IconButton
                            size="small"
                            color="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuery(table.id);
                            }}
                            disabled
                          >
                            <QueryStats fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Delete Table">
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRequestDelete(table);
                            }}
                            disabled={deleteTableMutation.isLoading}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Rename Table">
                        <span>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRequestRename(table);
                            }}
                            disabled={renameTableMutation.isLoading}
                          >
                            <Edit fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setTableToDelete(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete table</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete{' '}
            <strong>{tableToDelete?.name}</strong>? This will remove the table
            from the DataLake instance.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteDialogOpen(false);
              setTableToDelete(null);
            }}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={!tableToDelete || deleteTableMutation.isLoading}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={renameDialogOpen}
        onClose={() => {
          setRenameDialogOpen(false);
          setTableToRename(null);
          setNewTableName('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rename table</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Rename <strong>{tableToRename?.name}</strong>
          </Typography>
          <TextField
            fullWidth
            label="New table name"
            value={newTableName}
            onChange={(e) => setNewTableName(e.target.value)}
            disabled={renameTableMutation.isLoading}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setRenameDialogOpen(false);
              setTableToRename(null);
              setNewTableName('');
            }}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmRename}
            variant="contained"
            disabled={
              !tableToRename ||
              renameTableMutation.isLoading ||
              !newTableName ||
              newTableName.trim() === ''
            }
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
