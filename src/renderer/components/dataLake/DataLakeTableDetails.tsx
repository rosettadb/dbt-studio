/**
 * DuckLake Table Details Component (Phase 8b)
 * Displays comprehensive table metadata from DuckLake catalog
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Grid,
  CircularProgress,
  Alert,
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
  ArrowBack,
  TableChart,
  Schema,
  BarChart,
  InsertDriveFile,
  Splitscreen,
  History,
  Label,
  Restore,
  Add,
  Delete,
  DriveFileRenameOutline,
  SwapHoriz,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import moment from 'moment';
import {
  useAddDuckLakeColumn,
  useAlterDuckLakeColumnType,
  useDuckLakeTableDetails,
  useDropDuckLakeColumn,
  useDeleteDuckLakeRows,
  useRenameDuckLakeColumn,
  useRestoreDuckLakeSnapshot,
  useUpdateDuckLakeRows,
  useUpsertDuckLakeRows,
} from '../../controllers/duckLake.controller';
import {
  DuckLakeColumnDetail,
  DuckLakeColumnStats,
  DuckLakeDataFileInfo,
  DuckLakePartitionColumn,
  DuckLakeFilePartitionValue,
  DuckLakeSnapshotDetail,
  DuckLakeTag,
  DuckLakeColumnTag,
} from '../../../types/duckLake';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`table-details-tabpanel-${index}`}
      aria-labelledby={`table-details-tab-${index}`}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export const DataLakeTableDetails: React.FC = () => {
  const navigate = useNavigate();
  const { instanceId, tableName } = useParams<{
    instanceId: string;
    tableName: string;
  }>();
  const [currentTab, setCurrentTab] = useState(0);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [snapshotToRestore, setSnapshotToRestore] =
    useState<DuckLakeSnapshotDetail | null>(null);

  const [addColumnDialogOpen, setAddColumnDialogOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState('');
  const [newColumnDefault, setNewColumnDefault] = useState('');

  const [dropColumnDialogOpen, setDropColumnDialogOpen] = useState(false);
  const [columnToDrop, setColumnToDrop] = useState<DuckLakeColumnDetail | null>(
    null,
  );

  const [renameColumnDialogOpen, setRenameColumnDialogOpen] = useState(false);
  const [columnToRename, setColumnToRename] =
    useState<DuckLakeColumnDetail | null>(null);
  const [renameColumnNewName, setRenameColumnNewName] = useState('');

  const [alterTypeDialogOpen, setAlterTypeDialogOpen] = useState(false);
  const [columnToAlterType, setColumnToAlterType] =
    useState<DuckLakeColumnDetail | null>(null);
  const [alterTypeNewType, setAlterTypeNewType] = useState('');

  const [updateRowsDialogOpen, setUpdateRowsDialogOpen] = useState(false);
  const [updateRowsQuery, setUpdateRowsQuery] = useState('');

  const [deleteRowsDialogOpen, setDeleteRowsDialogOpen] = useState(false);
  const [deleteRowsQuery, setDeleteRowsQuery] = useState('');

  const [upsertRowsDialogOpen, setUpsertRowsDialogOpen] = useState(false);
  const [upsertRowsQuery, setUpsertRowsQuery] = useState('');

  const restoreSnapshotMutation = useRestoreDuckLakeSnapshot();
  const addColumnMutation = useAddDuckLakeColumn();
  const dropColumnMutation = useDropDuckLakeColumn();
  const renameColumnMutation = useRenameDuckLakeColumn();
  const alterColumnTypeMutation = useAlterDuckLakeColumnType();
  const updateRowsMutation = useUpdateDuckLakeRows();
  const deleteRowsMutation = useDeleteDuckLakeRows();
  const upsertRowsMutation = useUpsertDuckLakeRows();

  const {
    data: tableDetails,
    isLoading,
    error,
  } = useDuckLakeTableDetails(instanceId || '', tableName || '');

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  const handleOpenAddColumnDialog = () => {
    setNewColumnName('');
    setNewColumnType('');
    setNewColumnDefault('');
    setAddColumnDialogOpen(true);
  };

  const handleConfirmAddColumn = () => {
    if (!instanceId || !tableName) {
      setAddColumnDialogOpen(false);
      return;
    }

    addColumnMutation.mutate({
      instanceId,
      tableName,
      columnName: newColumnName,
      columnType: newColumnType,
      defaultValue:
        newColumnDefault.trim() === '' ? undefined : newColumnDefault,
    });

    setAddColumnDialogOpen(false);
  };

  const isPartitionColumnId = (columnId: number) => {
    const ids = new Set<number>(
      (tableDetails?.partitionInfo?.columns || []).map((c: any) =>
        Number(c.columnId),
      ),
    );
    return ids.has(Number(columnId));
  };

  const handleRequestDropColumn = (column: DuckLakeColumnDetail) => {
    setColumnToDrop(column);
    setDropColumnDialogOpen(true);
  };

  const handleRequestRenameColumn = (column: DuckLakeColumnDetail) => {
    setColumnToRename(column);
    setRenameColumnNewName(column.columnName);
    setRenameColumnDialogOpen(true);
  };

  const handleRequestAlterColumnType = (column: DuckLakeColumnDetail) => {
    setColumnToAlterType(column);
    setAlterTypeNewType(column.columnType);
    setAlterTypeDialogOpen(true);
  };

  const handleConfirmDropColumn = () => {
    if (!instanceId || !tableName || !columnToDrop) {
      setDropColumnDialogOpen(false);
      setColumnToDrop(null);
      return;
    }

    dropColumnMutation.mutate({
      instanceId,
      tableName,
      columnName: columnToDrop.columnName,
    });

    setDropColumnDialogOpen(false);
    setColumnToDrop(null);
  };

  const handleConfirmRenameColumn = () => {
    if (!instanceId || !tableName || !columnToRename) {
      setRenameColumnDialogOpen(false);
      setColumnToRename(null);
      return;
    }

    renameColumnMutation.mutate({
      instanceId,
      tableName,
      oldColumnName: columnToRename.columnName,
      newColumnName: renameColumnNewName,
    });

    setRenameColumnDialogOpen(false);
    setColumnToRename(null);
  };

  const handleConfirmAlterColumnType = () => {
    if (!instanceId || !tableName || !columnToAlterType) {
      setAlterTypeDialogOpen(false);
      setColumnToAlterType(null);
      return;
    }

    alterColumnTypeMutation.mutate({
      instanceId,
      tableName,
      columnName: columnToAlterType.columnName,
      newType: alterTypeNewType,
    });

    setAlterTypeDialogOpen(false);
    setColumnToAlterType(null);
  };

  const handleOpenUpdateRowsDialog = () => {
    if (!tableName) {
      return;
    }
    setUpdateRowsQuery(
      `UPDATE ${tableName} SET /* column = value */ WHERE /* condition */;`,
    );
    setUpdateRowsDialogOpen(true);
  };

  const handleConfirmUpdateRows = () => {
    if (!instanceId || !tableName) {
      setUpdateRowsDialogOpen(false);
      return;
    }

    updateRowsMutation.mutate({
      instanceId,
      tableName,
      updateQuery: updateRowsQuery,
    });

    setUpdateRowsDialogOpen(false);
  };

  const handleOpenDeleteRowsDialog = () => {
    if (!tableName) {
      return;
    }
    setDeleteRowsQuery(`DELETE FROM ${tableName} WHERE /* condition */;`);
    setDeleteRowsDialogOpen(true);
  };

  const handleConfirmDeleteRows = () => {
    if (!instanceId || !tableName) {
      setDeleteRowsDialogOpen(false);
      return;
    }

    deleteRowsMutation.mutate({
      instanceId,
      tableName,
      deleteQuery: deleteRowsQuery,
    });

    setDeleteRowsDialogOpen(false);
  };

  const handleOpenUpsertRowsDialog = () => {
    if (!tableName) {
      return;
    }
    setUpsertRowsQuery(
      `INSERT INTO ${tableName} (/* cols */) VALUES (/* values */) /* upsert clause */;`,
    );
    setUpsertRowsDialogOpen(true);
  };

  const handleConfirmUpsertRows = () => {
    if (!instanceId || !tableName) {
      setUpsertRowsDialogOpen(false);
      return;
    }

    upsertRowsMutation.mutate({
      instanceId,
      tableName,
      upsertQuery: upsertRowsQuery,
    });

    setUpsertRowsDialogOpen(false);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  /**
   * Safely convert any value to string for React rendering
   * Handles DuckDB hugeint objects and other non-primitive types
   */
  const safeToString = (value: any): string => {
    if (value === null || value === undefined) {
      return '-';
    }
    if (typeof value === 'object') {
      // Handle DuckDB hugeint objects
      if (value.hugeint !== undefined) {
        return String(value.hugeint);
      }
      // Handle other objects
      return JSON.stringify(value);
    }
    return String(value);
  };

  const handleRequestRestoreSnapshot = (snapshot: DuckLakeSnapshotDetail) => {
    setSnapshotToRestore(snapshot);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestoreSnapshot = () => {
    if (!instanceId || !tableName || !snapshotToRestore) {
      setRestoreDialogOpen(false);
      setSnapshotToRestore(null);
      return;
    }

    restoreSnapshotMutation.mutate({
      instanceId,
      tableName,
      snapshotId: safeToString(snapshotToRestore.snapshotId),
    });

    setRestoreDialogOpen(false);
    setSnapshotToRestore(null);
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
            Failed to load table details
          </Typography>
          <Typography variant="body2">
            {(error as Error).message || 'Unknown error'}
          </Typography>
        </Alert>
      </Box>
    );
  }

  if (!tableDetails) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="warning">Table details not found</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <Tooltip title="Back to Instance Details">
          <IconButton
            onClick={() =>
              navigate(`/app/data-lake/duck-lake/instances/${instanceId}`)
            }
            sx={{ mr: 1 }}
          >
            <ArrowBack />
          </IconButton>
        </Tooltip>
        <TableChart sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
            {tableDetails.tableName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Schema: {tableDetails.schemaName} • UUID: {tableDetails.tableUuid}
          </Typography>
        </Box>
        <Chip
          label={`Snapshot ${safeToString(tableDetails.beginSnapshot)}${tableDetails.endSnapshot ? ` - ${safeToString(tableDetails.endSnapshot)}` : ' (current)'}`}
          color="primary"
          variant="outlined"
        />
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          aria-label="table details tabs"
        >
          <Tab icon={<BarChart />} label="Overview" iconPosition="start" />
          <Tab icon={<Schema />} label="Schema" iconPosition="start" />
          <Tab icon={<TableChart />} label="Data" iconPosition="start" />
          <Tab icon={<BarChart />} label="Statistics" iconPosition="start" />
          <Tab
            icon={<InsertDriveFile />}
            label="Data Files"
            iconPosition="start"
          />
          <Tab icon={<Splitscreen />} label="Partitions" iconPosition="start" />
          <Tab icon={<History />} label="History" iconPosition="start" />
          <Tab icon={<Label />} label="Tags" iconPosition="start" />
        </Tabs>
      </Box>

      {/* Tab 0: Overview */}
      <TabPanel value={currentTab} index={0}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Table Information
                </Typography>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell>
                        <strong>Table ID</strong>
                      </TableCell>
                      <TableCell>
                        {safeToString(tableDetails.tableId)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <strong>Table UUID</strong>
                      </TableCell>
                      <TableCell>{tableDetails.tableUuid}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <strong>Schema ID</strong>
                      </TableCell>
                      <TableCell>
                        {safeToString(tableDetails.schemaId)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <strong>Schema Name</strong>
                      </TableCell>
                      <TableCell>{tableDetails.schemaName}</TableCell>
                    </TableRow>
                    {tableDetails.path && (
                      <TableRow>
                        <TableCell>
                          <strong>Path</strong>
                        </TableCell>
                        <TableCell
                          sx={{
                            wordBreak: 'break-all',
                            overflowWrap: 'anywhere',
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: 'monospace' }}
                          >
                            {tableDetails.path}
                          </Typography>
                          {tableDetails.pathIsRelative && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              (relative)
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Statistics
                </Typography>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell>
                        <strong>Record Count</strong>
                      </TableCell>
                      <TableCell>
                        {formatNumber(tableDetails.stats.recordCount)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <strong>File Size</strong>
                      </TableCell>
                      <TableCell>
                        {formatBytes(tableDetails.stats.fileSizeBytes)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <strong>Next Row ID</strong>
                      </TableCell>
                      <TableCell>
                        {formatNumber(tableDetails.stats.nextRowId)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <strong>Columns</strong>
                      </TableCell>
                      <TableCell>{tableDetails.columns.length}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <strong>Data Files</strong>
                      </TableCell>
                      <TableCell>{tableDetails.dataFiles.length}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Tab 1: Schema */}
      <TabPanel value={currentTab} index={1}>
        <Card>
          <CardContent>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 2,
                gap: 2,
              }}
            >
              <Typography variant="h6">
                Column Schema ({tableDetails.columns.length} columns)
              </Typography>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={handleOpenAddColumnDialog}
                disabled={
                  addColumnMutation.isLoading ||
                  dropColumnMutation.isLoading ||
                  renameColumnMutation.isLoading ||
                  alterColumnTypeMutation.isLoading
                }
              >
                Add column
              </Button>
            </Box>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Order</TableCell>
                    <TableCell>Column Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Nullable</TableCell>
                    <TableCell>Default Value</TableCell>
                    <TableCell>Snapshot Range</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tableDetails.columns.map((column: DuckLakeColumnDetail) => (
                    <TableRow key={column.columnId}>
                      <TableCell>{safeToString(column.columnOrder)}</TableCell>
                      <TableCell>
                        <strong>{column.columnName}</strong>
                        {column.parentColumn && (
                          <Chip label="Nested" size="small" sx={{ ml: 1 }} />
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={column.columnType}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {column.nullsAllowed ? (
                          <Chip label="Yes" size="small" color="default" />
                        ) : (
                          <Chip label="No" size="small" color="primary" />
                        )}
                      </TableCell>
                      <TableCell>{column.defaultValue || '-'}</TableCell>
                      <TableCell>
                        {safeToString(column.beginSnapshot)}
                        {column.endSnapshot
                          ? ` - ${safeToString(column.endSnapshot)}`
                          : ' (current)'}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip
                          title={
                            isPartitionColumnId(column.columnId)
                              ? 'Partition columns cannot be renamed'
                              : 'Rename column'
                          }
                        >
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleRequestRenameColumn(column)}
                              disabled={
                                renameColumnMutation.isLoading ||
                                alterColumnTypeMutation.isLoading ||
                                dropColumnMutation.isLoading ||
                                addColumnMutation.isLoading ||
                                isPartitionColumnId(column.columnId)
                              }
                            >
                              <DriveFileRenameOutline fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip
                          title={
                            isPartitionColumnId(column.columnId)
                              ? 'Partition columns cannot be altered'
                              : 'Alter column type'
                          }
                        >
                          <span>
                            <IconButton
                              size="small"
                              onClick={() =>
                                handleRequestAlterColumnType(column)
                              }
                              disabled={
                                alterColumnTypeMutation.isLoading ||
                                renameColumnMutation.isLoading ||
                                dropColumnMutation.isLoading ||
                                addColumnMutation.isLoading ||
                                isPartitionColumnId(column.columnId)
                              }
                            >
                              <SwapHoriz fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip
                          title={
                            isPartitionColumnId(column.columnId)
                              ? 'Partition columns cannot be dropped'
                              : 'Drop column'
                          }
                        >
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleRequestDropColumn(column)}
                              disabled={
                                dropColumnMutation.isLoading ||
                                addColumnMutation.isLoading ||
                                renameColumnMutation.isLoading ||
                                alterColumnTypeMutation.isLoading ||
                                isPartitionColumnId(column.columnId)
                              }
                            >
                              <Delete fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Dialog
              open={addColumnDialogOpen}
              onClose={() => setAddColumnDialogOpen(false)}
              maxWidth="sm"
              fullWidth
            >
              <DialogTitle>Add column</DialogTitle>
              <DialogContent>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  Default value is treated as a raw SQL expression (e.g.{' '}
                  <strong>0</strong>,<strong> &apos;x&apos;</strong>,{' '}
                  <strong>current_timestamp</strong>).
                </Typography>
                <TextField
                  fullWidth
                  label="Column name"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  sx={{ mb: 2 }}
                  disabled={addColumnMutation.isLoading}
                  autoFocus
                />
                <TextField
                  fullWidth
                  label="Column type"
                  value={newColumnType}
                  onChange={(e) => setNewColumnType(e.target.value)}
                  sx={{ mb: 2 }}
                  disabled={addColumnMutation.isLoading}
                />
                <TextField
                  fullWidth
                  label="Default (optional)"
                  value={newColumnDefault}
                  onChange={(e) => setNewColumnDefault(e.target.value)}
                  disabled={addColumnMutation.isLoading}
                />
              </DialogContent>
              <DialogActions>
                <Button
                  color="inherit"
                  onClick={() => setAddColumnDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleConfirmAddColumn}
                  disabled={
                    addColumnMutation.isLoading ||
                    newColumnName.trim() === '' ||
                    newColumnType.trim() === ''
                  }
                >
                  Add
                </Button>
              </DialogActions>
            </Dialog>

            <Dialog
              open={dropColumnDialogOpen}
              onClose={() => {
                setDropColumnDialogOpen(false);
                setColumnToDrop(null);
              }}
              maxWidth="sm"
              fullWidth
            >
              <DialogTitle>Drop column</DialogTitle>
              <DialogContent>
                <Typography variant="body2" color="text.secondary">
                  Are you sure you want to drop{' '}
                  <strong>{columnToDrop?.columnName}</strong>?
                </Typography>
              </DialogContent>
              <DialogActions>
                <Button
                  color="inherit"
                  onClick={() => {
                    setDropColumnDialogOpen(false);
                    setColumnToDrop(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  color="error"
                  variant="contained"
                  onClick={handleConfirmDropColumn}
                  disabled={!columnToDrop || dropColumnMutation.isLoading}
                >
                  Drop
                </Button>
              </DialogActions>
            </Dialog>

            <Dialog
              open={renameColumnDialogOpen}
              onClose={() => {
                setRenameColumnDialogOpen(false);
                setColumnToRename(null);
              }}
              maxWidth="sm"
              fullWidth
            >
              <DialogTitle>Rename column</DialogTitle>
              <DialogContent>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  Renaming <strong>{columnToRename?.columnName}</strong>
                </Typography>
                <TextField
                  fullWidth
                  label="New column name"
                  value={renameColumnNewName}
                  onChange={(e) => setRenameColumnNewName(e.target.value)}
                  disabled={renameColumnMutation.isLoading}
                  autoFocus
                />
              </DialogContent>
              <DialogActions>
                <Button
                  color="inherit"
                  onClick={() => {
                    setRenameColumnDialogOpen(false);
                    setColumnToRename(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleConfirmRenameColumn}
                  disabled={
                    !columnToRename ||
                    renameColumnMutation.isLoading ||
                    renameColumnNewName.trim() === '' ||
                    renameColumnNewName.trim() ===
                      columnToRename?.columnName.trim()
                  }
                >
                  Rename
                </Button>
              </DialogActions>
            </Dialog>

            <Dialog
              open={alterTypeDialogOpen}
              onClose={() => {
                setAlterTypeDialogOpen(false);
                setColumnToAlterType(null);
              }}
              maxWidth="sm"
              fullWidth
            >
              <DialogTitle>Alter column type</DialogTitle>
              <DialogContent>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  Changing type for{' '}
                  <strong>{columnToAlterType?.columnName}</strong>
                </Typography>
                <TextField
                  fullWidth
                  label="New type"
                  value={alterTypeNewType}
                  onChange={(e) => setAlterTypeNewType(e.target.value)}
                  disabled={alterColumnTypeMutation.isLoading}
                  autoFocus
                />
              </DialogContent>
              <DialogActions>
                <Button
                  color="inherit"
                  onClick={() => {
                    setAlterTypeDialogOpen(false);
                    setColumnToAlterType(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleConfirmAlterColumnType}
                  disabled={
                    !columnToAlterType ||
                    alterColumnTypeMutation.isLoading ||
                    alterTypeNewType.trim() === '' ||
                    alterTypeNewType.trim() ===
                      columnToAlterType?.columnType.trim()
                  }
                >
                  Update
                </Button>
              </DialogActions>
            </Dialog>
          </CardContent>
        </Card>
      </TabPanel>

      <TabPanel value={currentTab} index={2}>
        <Card>
          <CardContent>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 2,
                gap: 2,
              }}
            >
              <Typography variant="h6">Data / Rows (manual SQL)</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  onClick={handleOpenUpdateRowsDialog}
                  disabled={
                    updateRowsMutation.isLoading ||
                    deleteRowsMutation.isLoading ||
                    upsertRowsMutation.isLoading
                  }
                >
                  Update
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleOpenDeleteRowsDialog}
                  disabled={
                    deleteRowsMutation.isLoading ||
                    updateRowsMutation.isLoading ||
                    upsertRowsMutation.isLoading
                  }
                >
                  Delete
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleOpenUpsertRowsDialog}
                  disabled={
                    upsertRowsMutation.isLoading ||
                    updateRowsMutation.isLoading ||
                    deleteRowsMutation.isLoading
                  }
                >
                  Upsert
                </Button>
              </Box>
            </Box>

            <Alert severity="info">
              Row operations are executed as raw SQL. Review the query carefully
              before running.
            </Alert>

            <Dialog
              open={updateRowsDialogOpen}
              onClose={() => setUpdateRowsDialogOpen(false)}
              maxWidth="md"
              fullWidth
            >
              <DialogTitle>Update rows</DialogTitle>
              <DialogContent>
                <TextField
                  fullWidth
                  multiline
                  minRows={8}
                  label="UPDATE SQL"
                  value={updateRowsQuery}
                  onChange={(e) => setUpdateRowsQuery(e.target.value)}
                  disabled={updateRowsMutation.isLoading}
                  autoFocus
                />
              </DialogContent>
              <DialogActions>
                <Button
                  color="inherit"
                  onClick={() => setUpdateRowsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleConfirmUpdateRows}
                  disabled={
                    updateRowsMutation.isLoading ||
                    updateRowsQuery.trim() === ''
                  }
                >
                  Run
                </Button>
              </DialogActions>
            </Dialog>

            <Dialog
              open={deleteRowsDialogOpen}
              onClose={() => setDeleteRowsDialogOpen(false)}
              maxWidth="md"
              fullWidth
            >
              <DialogTitle>Delete rows</DialogTitle>
              <DialogContent>
                <TextField
                  fullWidth
                  multiline
                  minRows={8}
                  label="DELETE SQL"
                  value={deleteRowsQuery}
                  onChange={(e) => setDeleteRowsQuery(e.target.value)}
                  disabled={deleteRowsMutation.isLoading}
                  autoFocus
                />
              </DialogContent>
              <DialogActions>
                <Button
                  color="inherit"
                  onClick={() => setDeleteRowsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  color="error"
                  variant="contained"
                  onClick={handleConfirmDeleteRows}
                  disabled={
                    deleteRowsMutation.isLoading ||
                    deleteRowsQuery.trim() === ''
                  }
                >
                  Run
                </Button>
              </DialogActions>
            </Dialog>

            <Dialog
              open={upsertRowsDialogOpen}
              onClose={() => setUpsertRowsDialogOpen(false)}
              maxWidth="md"
              fullWidth
            >
              <DialogTitle>Upsert rows</DialogTitle>
              <DialogContent>
                <TextField
                  fullWidth
                  multiline
                  minRows={8}
                  label="UPSERT SQL"
                  value={upsertRowsQuery}
                  onChange={(e) => setUpsertRowsQuery(e.target.value)}
                  disabled={upsertRowsMutation.isLoading}
                  autoFocus
                />
              </DialogContent>
              <DialogActions>
                <Button
                  color="inherit"
                  onClick={() => setUpsertRowsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleConfirmUpsertRows}
                  disabled={
                    upsertRowsMutation.isLoading ||
                    upsertRowsQuery.trim() === ''
                  }
                >
                  Run
                </Button>
              </DialogActions>
            </Dialog>
          </CardContent>
        </Card>
      </TabPanel>

      {/* Tab 3: Statistics */}
      <TabPanel value={currentTab} index={3}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Column Statistics ({tableDetails.columnStats.length} columns)
            </Typography>
            {tableDetails.columnStats.length > 0 ? (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Column Name</TableCell>
                      <TableCell>Contains Null</TableCell>
                      <TableCell>Contains NaN</TableCell>
                      <TableCell>Min Value</TableCell>
                      <TableCell>Max Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tableDetails.columnStats.map(
                      (stat: DuckLakeColumnStats) => (
                        <TableRow key={stat.columnId}>
                          <TableCell>
                            <strong>{stat.columnName}</strong>
                          </TableCell>
                          <TableCell>
                            {stat.containsNull ? (
                              <Chip label="Yes" size="small" color="warning" />
                            ) : (
                              <Chip label="No" size="small" color="success" />
                            )}
                          </TableCell>
                          <TableCell>
                            {stat.containsNan ? (
                              <Chip label="Yes" size="small" color="warning" />
                            ) : (
                              <Chip label="No" size="small" color="success" />
                            )}
                          </TableCell>
                          <TableCell>{stat.minValue || '-'}</TableCell>
                          <TableCell>{stat.maxValue || '-'}</TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="info">No column statistics available</Alert>
            )}
          </CardContent>
        </Card>
      </TabPanel>

      {/* Tab 4: Data Files */}
      <TabPanel value={currentTab} index={4}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Data Files ({tableDetails.dataFiles.length} files)
            </Typography>
            {tableDetails.dataFiles.length > 0 ? (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>File Order</TableCell>
                      <TableCell>Path</TableCell>
                      <TableCell>Format</TableCell>
                      <TableCell>Records</TableCell>
                      <TableCell>Size</TableCell>
                      <TableCell>Row ID Start</TableCell>
                      <TableCell>Snapshot Range</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tableDetails.dataFiles.map(
                      (file: DuckLakeDataFileInfo) => (
                        <TableRow key={file.dataFileId}>
                          <TableCell>{safeToString(file.fileOrder)}</TableCell>
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: 'monospace',
                                wordBreak: 'break-all',
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {file.path}
                            </Typography>
                            {file.pathIsRelative && (
                              <Chip
                                label="Relative"
                                size="small"
                                sx={{ mt: 0.5 }}
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={file.fileFormat}
                              size="small"
                              color="primary"
                            />
                          </TableCell>
                          <TableCell>
                            {formatNumber(file.recordCount)}
                          </TableCell>
                          <TableCell>
                            {formatBytes(file.fileSizeBytes)}
                          </TableCell>
                          <TableCell>{formatNumber(file.rowIdStart)}</TableCell>
                          <TableCell>
                            {safeToString(file.beginSnapshot)}
                            {file.endSnapshot
                              ? ` - ${safeToString(file.endSnapshot)}`
                              : ' (current)'}
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="info">No data files found</Alert>
            )}
          </CardContent>
        </Card>
      </TabPanel>

      {/* Tab 5: Partitions */}
      <TabPanel value={currentTab} index={5}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Partition Information
            </Typography>
            {tableDetails.partitionInfo ? (
              <Box>
                <Typography variant="subtitle1" gutterBottom>
                  Partition Columns ({tableDetails.partitionInfo.columns.length}
                  )
                </Typography>
                <TableContainer sx={{ mb: 3 }}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Key Index</TableCell>
                        <TableCell>Column Name</TableCell>
                        <TableCell>Transform</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tableDetails.partitionInfo.columns.map(
                        (col: DuckLakePartitionColumn) => (
                          <TableRow
                            key={`${col.partitionId}-${safeToString(col.partitionKeyIndex)}`}
                          >
                            <TableCell>
                              {safeToString(col.partitionKeyIndex)}
                            </TableCell>
                            <TableCell>
                              <strong>{col.columnName}</strong>
                            </TableCell>
                            <TableCell>{col.transform || 'identity'}</TableCell>
                          </TableRow>
                        ),
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Typography variant="subtitle1" gutterBottom>
                  File Partition Values (
                  {tableDetails.partitionInfo.filePartitionValues.length})
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Data File ID</TableCell>
                        <TableCell>Key Index</TableCell>
                        <TableCell>Partition Value</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tableDetails.partitionInfo.filePartitionValues.map(
                        (val: DuckLakeFilePartitionValue, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell>
                              {safeToString(val.dataFileId)}
                            </TableCell>
                            <TableCell>
                              {safeToString(val.partitionKeyIndex)}
                            </TableCell>
                            <TableCell>
                              <strong>{val.partitionValue}</strong>
                            </TableCell>
                          </TableRow>
                        ),
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            ) : (
              <Alert severity="info">Table is not partitioned</Alert>
            )}
          </CardContent>
        </Card>
      </TabPanel>

      {/* Tab 6: History */}
      <TabPanel value={currentTab} index={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Snapshot History ({tableDetails.snapshots.length} snapshots)
            </Typography>
            {tableDetails.snapshots.length > 0 ? (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Snapshot ID</TableCell>
                      <TableCell>Time</TableCell>
                      <TableCell>Schema Version</TableCell>
                      <TableCell>Changes</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tableDetails.snapshots.map(
                      (snapshot: DuckLakeSnapshotDetail) => (
                        <TableRow key={safeToString(snapshot.snapshotId)}>
                          <TableCell>
                            <Chip
                              label={safeToString(snapshot.snapshotId)}
                              size="small"
                              color="primary"
                            />
                          </TableCell>
                          <TableCell>
                            {moment(snapshot.snapshotTime).format(
                              'YYYY-MM-DD HH:mm:ss',
                            )}
                            <Typography
                              variant="caption"
                              display="block"
                              color="text.secondary"
                            >
                              {moment(snapshot.snapshotTime).fromNow()}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {safeToString(snapshot.schemaVersion)}
                          </TableCell>
                          <TableCell>{snapshot.changesMade || '-'}</TableCell>
                          <TableCell align="right">
                            <Tooltip title="Restore this snapshot">
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    handleRequestRestoreSnapshot(snapshot)
                                  }
                                  disabled={restoreSnapshotMutation.isLoading}
                                >
                                  <Restore fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="info">No snapshot history available</Alert>
            )}
          </CardContent>
        </Card>

        <Dialog
          open={restoreDialogOpen}
          onClose={() => {
            setRestoreDialogOpen(false);
            setSnapshotToRestore(null);
          }}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Restore snapshot</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary">
              This will create a new snapshot by restoring the table to snapshot{' '}
              <strong>{safeToString(snapshotToRestore?.snapshotId)}</strong>.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button
              color="inherit"
              onClick={() => {
                setRestoreDialogOpen(false);
                setSnapshotToRestore(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleConfirmRestoreSnapshot}
              disabled={!snapshotToRestore || restoreSnapshotMutation.isLoading}
            >
              Restore
            </Button>
          </DialogActions>
        </Dialog>
      </TabPanel>

      {/* Tab 7: Tags */}
      <TabPanel value={currentTab} index={7}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Table Tags ({tableDetails.tags.length})
                </Typography>
                {tableDetails.tags.length > 0 ? (
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Key</TableCell>
                          <TableCell>Value</TableCell>
                          <TableCell>Snapshot Range</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {tableDetails.tags.map(
                          (tag: DuckLakeTag, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell>
                                <strong>{tag.key}</strong>
                              </TableCell>
                              <TableCell>{tag.value}</TableCell>
                              <TableCell>
                                {safeToString(tag.beginSnapshot)}
                                {tag.endSnapshot
                                  ? ` - ${safeToString(tag.endSnapshot)}`
                                  : ' (current)'}
                              </TableCell>
                            </TableRow>
                          ),
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Alert severity="info">No table tags</Alert>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Column Tags ({tableDetails.columnTags.length})
                </Typography>
                {tableDetails.columnTags.length > 0 ? (
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Column</TableCell>
                          <TableCell>Key</TableCell>
                          <TableCell>Value</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {tableDetails.columnTags.map(
                          (tag: DuckLakeColumnTag, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell>
                                <strong>{tag.columnName}</strong>
                              </TableCell>
                              <TableCell>{tag.key}</TableCell>
                              <TableCell>{tag.value}</TableCell>
                            </TableRow>
                          ),
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Alert severity="info">No column tags</Alert>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>
    </Box>
  );
};
