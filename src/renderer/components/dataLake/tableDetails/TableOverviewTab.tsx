import React from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import {
  formatBytes,
  formatNumber,
  safeToString,
} from '../../../helpers/utils';

interface TableOverviewTabProps {
  tableDetails: any;
}

export const TableOverviewTab: React.FC<TableOverviewTabProps> = ({
  tableDetails,
}) => {
  return (
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
                  <TableCell>{safeToString(tableDetails.tableId)}</TableCell>
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
                  <TableCell>{safeToString(tableDetails.schemaId)}</TableCell>
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
                        <Typography variant="caption" color="text.secondary">
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
  );
};
