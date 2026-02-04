import React, { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Tooltip,
  IconButton,
  Alert,
  Box,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import { Restore } from '@mui/icons-material';
import moment from 'moment';
import {
  useDuckLakeTableChanges,
  useRestoreDuckLakeSnapshot,
} from '../../../controllers/duckLake.controller';
import { DuckLakeSnapshotDetail } from '../../../../types/duckLake';
import { safeToString } from '../../../helpers/utils';

interface TableHistoryTabProps {
  tableDetails: any;
  instanceId: string;
  tableName: string;
}

type SnapshotOption = {
  label: string;
  value: number;
};

export const TableHistoryTab: React.FC<TableHistoryTabProps> = ({
  tableDetails,
  instanceId,
  tableName,
}) => {
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [snapshotToRestore, setSnapshotToRestore] =
    useState<DuckLakeSnapshotDetail | null>(null);

  const [fromSnapshotId, setFromSnapshotId] = useState<number | null>(null);
  const [toSnapshotId, setToSnapshotId] = useState<number | null>(null);

  const restoreSnapshotMutation = useRestoreDuckLakeSnapshot();

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

  const snapshotOptions = useMemo<SnapshotOption[]>(() => {
    return (tableDetails?.snapshots || []).map(
      (snapshot: DuckLakeSnapshotDetail) => ({
        label: `${safeToString(snapshot.snapshotId)} · ${moment(
          snapshot.snapshotTime,
        ).format('YYYY-MM-DD HH:mm:ss')}`,
        value: Number(snapshot.snapshotId),
      }),
    );
  }, [tableDetails]);

  const {
    data: tableChanges,
    isLoading: isCDCLoading,
    isFetching: isCDCRefreshing,
    error: cdcError,
  } = useDuckLakeTableChanges({
    instanceId: instanceId || '',
    tableName: tableName || '',
    fromSnapshotId,
    toSnapshotId,
    enabled: Boolean(instanceId && tableName && fromSnapshotId && toSnapshotId),
  });

  return (
    <>
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

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 2,
              mb: 2,
            }}
          >
            <Typography variant="h6">Change Data Capture</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel id="from-snapshot-label">From snapshot</InputLabel>
                <Select
                  labelId="from-snapshot-label"
                  label="From snapshot"
                  value={fromSnapshotId ?? ''}
                  onChange={(event) =>
                    setFromSnapshotId(
                      event.target.value === ''
                        ? null
                        : Number(event.target.value),
                    )
                  }
                >
                  <MenuItem value="">
                    <em>Select snapshot</em>
                  </MenuItem>
                  {snapshotOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel id="to-snapshot-label">To snapshot</InputLabel>
                <Select
                  labelId="to-snapshot-label"
                  label="To snapshot"
                  value={toSnapshotId ?? ''}
                  onChange={(event) =>
                    setToSnapshotId(
                      event.target.value === ''
                        ? null
                        : Number(event.target.value),
                    )
                  }
                >
                  <MenuItem value="">
                    <em>Select snapshot</em>
                  </MenuItem>
                  {snapshotOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </Box>

          {!fromSnapshotId || !toSnapshotId ? (
            <Alert severity="info">
              Select both snapshots to view row-level changes.
            </Alert>
          ) : null}

          {Boolean(cdcError) && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {(cdcError as Error).message}
            </Alert>
          )}

          {fromSnapshotId && toSnapshotId ? (
            <TableContainer sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width="10%">Operation</TableCell>
                    <TableCell width="15%">Snapshot</TableCell>
                    <TableCell>Row</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    if (isCDCLoading) {
                      return (
                        <TableRow>
                          <TableCell colSpan={3} align="center">
                            <Box
                              sx={{
                                display: 'flex',
                                justifyContent: 'center',
                              }}
                            >
                              <CircularProgress size={24} />
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    if ((tableChanges || []).length === 0) {
                      return (
                        <TableRow>
                          <TableCell colSpan={3}>
                            <Alert severity="info" sx={{ my: 1 }}>
                              No changes detected between snapshots.
                            </Alert>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    return tableChanges?.map((change, index) => (
                      <TableRow key={`change-${index}`}>
                        <TableCell>
                          <Chip
                            label={change.operation}
                            size="small"
                            color={(() => {
                              if (change.operation === 'INSERT') {
                                return 'success';
                              }
                              if (change.operation === 'DELETE') {
                                return 'error';
                              }
                              return 'warning';
                            })()}
                          />
                        </TableCell>
                        <TableCell>{change.snapshotId ?? '-'}</TableCell>
                        <TableCell>
                          <Box
                            component="pre"
                            sx={{
                              m: 0,
                              p: 1,
                              borderRadius: 1,
                              bgcolor: 'action.hover',
                              fontSize: 12,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                            }}
                          >
                            {JSON.stringify(change.row, null, 2)}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ));
                  })()}
                  {isCDCRefreshing && !isCDCLoading ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        <Typography variant="caption" color="text.secondary">
                          Refreshing changes…
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TableContainer>
          ) : null}
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
    </>
  );
};
