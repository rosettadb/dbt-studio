import React, { useState } from 'react';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import { Restore } from '@mui/icons-material';
import moment from 'moment';
import { useRestoreDuckLakeSnapshot } from '../../../controllers/duckLake.controller';
import { DuckLakeSnapshotDetail } from '../../../../types/duckLake';
import { safeToString } from '../../../helpers/utils';

interface TableHistoryTabProps {
  tableDetails: any;
  instanceId: string;
  tableName: string;
}

export const TableHistoryTab: React.FC<TableHistoryTabProps> = ({
  tableDetails,
  instanceId,
  tableName,
}) => {
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [snapshotToRestore, setSnapshotToRestore] =
    useState<DuckLakeSnapshotDetail | null>(null);

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
                    <TableCell>Author</TableCell>
                    <TableCell>Message</TableCell>
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
                        <TableCell>{snapshot.author || '-'}</TableCell>
                        <TableCell>{snapshot.commitMessage || '-'}</TableCell>
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
    </>
  );
};
