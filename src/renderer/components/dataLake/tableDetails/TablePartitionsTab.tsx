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
  Alert,
  Box,
} from '@mui/material';
import {
  DuckLakePartitionColumn,
  DuckLakeFilePartitionValue,
} from '../../../../types/duckLake';
import { safeToString } from '../../../helpers/utils';

interface TablePartitionsTabProps {
  tableDetails: any;
}

export const TablePartitionsTab: React.FC<TablePartitionsTabProps> = ({
  tableDetails,
}) => {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Partition Information
        </Typography>
        {tableDetails.partitionInfo ? (
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              Partition Columns ({tableDetails.partitionInfo.columns.length})
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
                        <TableCell>{safeToString(val.dataFileId)}</TableCell>
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
  );
};
