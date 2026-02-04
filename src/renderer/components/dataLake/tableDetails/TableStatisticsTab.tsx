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
import { DuckLakeColumnStats } from '../../../../types/duckLake';

interface TableStatisticsTabProps {
  tableDetails: any;
}

export const TableStatisticsTab: React.FC<TableStatisticsTabProps> = ({
  tableDetails,
}) => {
  return (
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
                {tableDetails.columnStats.map((stat: DuckLakeColumnStats) => (
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
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Alert severity="info">No column statistics available</Alert>
        )}
      </CardContent>
    </Card>
  );
};
