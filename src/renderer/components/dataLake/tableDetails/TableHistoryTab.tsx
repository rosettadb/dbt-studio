import React from 'react';
import {
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from '@mui/material';
import { History } from '@mui/icons-material';
import moment from 'moment';
import { DuckLakeSnapshotDetail } from '../../../../types/duckLake';
import { safeToString } from '../../../helpers/utils';
import {
  DataLakeSectionEmpty,
  DataLakeTableContainer,
} from '../DataLakeLayout';
import { SettingsSection } from '../../settings/SettingsLayout';

interface TableHistoryTabProps {
  tableDetails: any;
}

export const TableHistoryTab: React.FC<TableHistoryTabProps> = ({
  tableDetails,
}) => {
  const count = tableDetails.snapshots.length;
  return (
    <SettingsSection
      title="Snapshot History"
      icon={<History />}
      description={`${count} ${count === 1 ? 'snapshot' : 'snapshots'}`}
    >
      {count > 0 ? (
        <DataLakeTableContainer bordered={false}>
          <Table size="small">
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
                    <TableCell sx={{ fontWeight: 500 }}>
                      {safeToString(snapshot.snapshotId)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
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
        </DataLakeTableContainer>
      ) : (
        <DataLakeSectionEmpty>
          No snapshot history available
        </DataLakeSectionEmpty>
      )}
    </SettingsSection>
  );
};
