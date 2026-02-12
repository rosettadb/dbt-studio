import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Button,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Tooltip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  Autocomplete,
  DialogActions,
  Alert,
} from '@mui/material';
import {
  Add,
  Delete,
  DriveFileRenameOutline,
  SwapHoriz,
  Close,
} from '@mui/icons-material';
import {
  useAddDuckLakeColumn,
  useAlterDuckLakeColumnType,
  useDropDuckLakeColumn,
  useRenameDuckLakeColumn,
} from '../../../controllers/duckLake.controller';
import { DuckLakeColumnDetail } from '../../../../types/duckLake';
import { DUCKLAKE_SUPPORTED_COLUMN_TYPES } from '../../../config/ducklake';
import { safeToString } from '../../../helpers/utils';

interface TableSchemaTabProps {
  tableDetails: any;
  instanceId: string;
  tableName: string;
}

export const TableSchemaTab: React.FC<TableSchemaTabProps> = ({
  tableDetails,
  instanceId,
  tableName,
}) => {
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

  const addColumnMutation = useAddDuckLakeColumn();
  const dropColumnMutation = useDropDuckLakeColumn();
  const renameColumnMutation = useRenameDuckLakeColumn();
  const alterColumnTypeMutation = useAlterDuckLakeColumnType();

  const isPartitionColumnId = (columnId: number) => {
    const ids = new Set<number>(
      (tableDetails?.partitionInfo?.columns || []).map((c: any) =>
        Number(c.columnId),
      ),
    );
    return ids.has(Number(columnId));
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

  const handleRequestDropColumn = (column: DuckLakeColumnDetail) => {
    setColumnToDrop(column);
    setDropColumnDialogOpen(true);
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

  const handleRequestRenameColumn = (column: DuckLakeColumnDetail) => {
    setColumnToRename(column);
    setRenameColumnNewName(column.columnName);
    setRenameColumnDialogOpen(true);
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

  const handleRequestAlterColumnType = (column: DuckLakeColumnDetail) => {
    setColumnToAlterType(column);
    setAlterTypeNewType(column.columnType);
    setAlterTypeDialogOpen(true);
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

  return (
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
            Column Schema ({tableDetails?.columns?.length ?? 0} columns)
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
              {(tableDetails?.columns || []).map(
                (column: DuckLakeColumnDetail) => (
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
                            onClick={() => handleRequestAlterColumnType(column)}
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
                ),
              )}
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
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
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
            <Autocomplete
              freeSolo
              options={DUCKLAKE_SUPPORTED_COLUMN_TYPES}
              value={newColumnType}
              onInputChange={(_event, newValue) => setNewColumnType(newValue)}
              disabled={addColumnMutation.isLoading}
              renderInput={(params) => (
                <TextField
                  // eslint-disable-next-line react/jsx-props-no-spreading
                  {...params}
                  label="Column type"
                  fullWidth
                  sx={{ mb: 1 }}
                  helperText="For nested types: INT[], LIST(INT), STRUCT(a INT, b VARCHAR), MAP(Key, Value)"
                />
              )}
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
              variant="outlined"
              color="inherit"
              onClick={() => setAddColumnDialogOpen(false)}
              startIcon={<Close />}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleConfirmAddColumn}
              startIcon={<Add />}
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
              variant="outlined"
              color="inherit"
              onClick={() => {
                setDropColumnDialogOpen(false);
                setColumnToDrop(null);
              }}
              startIcon={<Close />}
            >
              Cancel
            </Button>
            <Button
              color="error"
              variant="contained"
              onClick={handleConfirmDropColumn}
              startIcon={<Delete />}
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
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
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
              variant="outlined"
              color="inherit"
              onClick={() => {
                setRenameColumnDialogOpen(false);
                setColumnToRename(null);
              }}
              startIcon={<Close />}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleConfirmRenameColumn}
              startIcon={<DriveFileRenameOutline />}
              disabled={
                !columnToRename ||
                renameColumnMutation.isLoading ||
                renameColumnNewName.trim() === '' ||
                renameColumnNewName.trim() === columnToRename?.columnName.trim()
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
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Changing type for <strong>{columnToAlterType?.columnName}</strong>
            </Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                DuckLake Type Restrictions
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Only widening promotions within the same type family are
                allowed:
              </Typography>
              <Typography variant="body2" component="div" sx={{ ml: 1 }}>
                • Integers: TINYINT → SMALLINT → INTEGER → BIGINT → HUGEINT
                <br />
                • Floats: REAL/FLOAT4 → DOUBLE/FLOAT8
                <br />
                • Strings: VARCHAR(n) → VARCHAR(m) where m &gt; n, or → TEXT
                <br />• Cross-family conversions need table recreation
              </Typography>
            </Alert>
            <Autocomplete
              freeSolo
              options={DUCKLAKE_SUPPORTED_COLUMN_TYPES}
              value={alterTypeNewType}
              onInputChange={(_event, newValue) =>
                setAlterTypeNewType(newValue)
              }
              disabled={alterColumnTypeMutation.isLoading}
              renderInput={(params) => (
                <TextField
                  // eslint-disable-next-line react/jsx-props-no-spreading
                  {...params}
                  label="New type"
                  fullWidth
                  autoFocus
                  helperText="For nested types: INT[], LIST(INT), STRUCT(a INT), MAP(K,V)"
                />
              )}
            />
          </DialogContent>
          <DialogActions>
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => {
                setAlterTypeDialogOpen(false);
                setColumnToAlterType(null);
              }}
              startIcon={<Close />}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleConfirmAlterColumnType}
              startIcon={<SwapHoriz />}
              disabled={
                !columnToAlterType ||
                alterColumnTypeMutation.isLoading ||
                alterTypeNewType.trim() === '' ||
                alterTypeNewType.trim() === columnToAlterType?.columnType.trim()
              }
            >
              Update
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
};
