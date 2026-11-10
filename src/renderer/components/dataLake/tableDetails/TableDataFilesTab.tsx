import React from 'react';
import {
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from '@mui/material';
import { InsertDriveFile } from '@mui/icons-material';
import { DuckLakeDataFileInfo } from '../../../../types/duckLake';
import {
  formatBytes,
  formatNumber,
  safeToString,
} from '../../../helpers/utils';
import {
  DataLakeSectionEmpty,
  DataLakeTableContainer,
} from '../DataLakeLayout';
import { SettingsSection } from '../../settings/SettingsLayout';

interface TableDataFilesTabProps {
  tableDetails: {
    dataFiles?: DuckLakeDataFileInfo[];
  };
}

export const TableDataFilesTab: React.FC<TableDataFilesTabProps> = ({
  tableDetails,
}) => {
  const dataFiles = tableDetails.dataFiles ?? [];
  return (
    <SettingsSection
      title="Data Files"
      icon={<InsertDriveFile />}
      description={`${dataFiles.length} ${dataFiles.length === 1 ? 'file' : 'files'}`}
    >
      {dataFiles.length > 0 ? (
        <DataLakeTableContainer bordered={false}>
          <Table size="small">
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
              {dataFiles.map((file: DuckLakeDataFileInfo) => (
                <TableRow key={file.dataFileId}>
                  <TableCell>{safeToString(file.fileOrder)}</TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: 12,
                        wordBreak: 'break-all',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {file.path}
                    </Typography>
                    {file.pathIsRelative && (
                      <Typography variant="caption" color="text.secondary">
                        Relative path
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ textTransform: 'uppercase' }}>
                    {file.fileFormat}
                  </TableCell>
                  <TableCell>{formatNumber(file.recordCount)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {formatBytes(file.fileSizeBytes)}
                  </TableCell>
                  <TableCell>{formatNumber(file.rowIdStart)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {safeToString(file.beginSnapshot)}
                    {file.endSnapshot
                      ? ` - ${safeToString(file.endSnapshot)}`
                      : ' (current)'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataLakeTableContainer>
      ) : (
        <DataLakeSectionEmpty>No data files found</DataLakeSectionEmpty>
      )}
    </SettingsSection>
  );
};
