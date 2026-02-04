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
import { DuckLakeDataFileInfo } from '../../../../types/duckLake';
import {
  formatBytes,
  formatNumber,
  safeToString,
} from '../../../helpers/utils';

interface TableDataFilesTabProps {
  tableDetails: any;
}

export const TableDataFilesTab: React.FC<TableDataFilesTabProps> = ({
  tableDetails,
}) => {
  return (
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
                {tableDetails.dataFiles.map((file: DuckLakeDataFileInfo) => (
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
                        <Chip label="Relative" size="small" sx={{ mt: 0.5 }} />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={file.fileFormat}
                        size="small"
                        color="primary"
                      />
                    </TableCell>
                    <TableCell>{formatNumber(file.recordCount)}</TableCell>
                    <TableCell>{formatBytes(file.fileSizeBytes)}</TableCell>
                    <TableCell>{formatNumber(file.rowIdStart)}</TableCell>
                    <TableCell>
                      {safeToString(file.beginSnapshot)}
                      {file.endSnapshot
                        ? ` - ${safeToString(file.endSnapshot)}`
                        : ' (current)'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Alert severity="info">No data files found</Alert>
        )}
      </CardContent>
    </Card>
  );
};
