import React from 'react';
import {
  Grid,
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
} from '@mui/material';
import { DuckLakeTag, DuckLakeColumnTag } from '../../../../types/duckLake';
import { safeToString } from '../../../helpers/utils';

interface TableTagsTabProps {
  tableDetails: any;
}

export const TableTagsTab: React.FC<TableTagsTabProps> = ({ tableDetails }) => {
  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Table Tags ({tableDetails.tags.length})
            </Typography>
            {tableDetails.tags.length > 0 ? (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Key</TableCell>
                      <TableCell>Value</TableCell>
                      <TableCell>Snapshot Range</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tableDetails.tags.map((tag: DuckLakeTag, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <strong>{tag.key}</strong>
                        </TableCell>
                        <TableCell>{tag.value}</TableCell>
                        <TableCell>
                          {safeToString(tag.beginSnapshot)}
                          {tag.endSnapshot
                            ? ` - ${safeToString(tag.endSnapshot)}`
                            : ' (current)'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="info">No table tags</Alert>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Column Tags ({tableDetails.columnTags.length})
            </Typography>
            {tableDetails.columnTags.length > 0 ? (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Column</TableCell>
                      <TableCell>Key</TableCell>
                      <TableCell>Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tableDetails.columnTags.map(
                      (tag: DuckLakeColumnTag, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <strong>{tag.columnName}</strong>
                          </TableCell>
                          <TableCell>{tag.key}</TableCell>
                          <TableCell>{tag.value}</TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="info">No column tags</Alert>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};
