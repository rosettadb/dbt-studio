import React from 'react';
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
  Alert,
} from '@mui/material';
import moment from 'moment';
import { DuckLakeSnapshotDetail } from '../../../../types/duckLake';
import { safeToString } from '../../../helpers/utils';

interface TableHistoryTabProps {
  tableDetails: any;
}

export const TableHistoryTab: React.FC<TableHistoryTabProps> = ({
  tableDetails,
}) => {
  return (
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
  );
};
