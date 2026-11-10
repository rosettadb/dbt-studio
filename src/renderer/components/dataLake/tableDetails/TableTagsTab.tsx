import React from 'react';
import {
  Grid,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from '@mui/material';
import { Label, ViewColumn } from '@mui/icons-material';
import { DuckLakeTag, DuckLakeColumnTag } from '../../../../types/duckLake';
import { safeToString } from '../../../helpers/utils';
import {
  DataLakeSectionEmpty,
  DataLakeTableContainer,
} from '../DataLakeLayout';
import { SettingsSection } from '../../settings/SettingsLayout';

interface TableTagsTabProps {
  tableDetails: any;
}

export const TableTagsTab: React.FC<TableTagsTabProps> = ({ tableDetails }) => {
  const tagCount = tableDetails.tags.length;
  const columnTagCount = tableDetails.columnTags.length;
  return (
    <Grid container spacing={1.5}>
      <Grid item xs={12} md={6}>
        <SettingsSection
          title="Table Tags"
          icon={<Label />}
          description={`${tagCount} ${tagCount === 1 ? 'tag' : 'tags'}`}
        >
          {tagCount > 0 ? (
            <DataLakeTableContainer bordered={false}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Key</TableCell>
                    <TableCell>Value</TableCell>
                    <TableCell>Snapshot Range</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tableDetails.tags.map((tag: DuckLakeTag, idx: number) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableRow key={idx}>
                      <TableCell sx={{ fontWeight: 500 }}>{tag.key}</TableCell>
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
            </DataLakeTableContainer>
          ) : (
            <DataLakeSectionEmpty>No table tags</DataLakeSectionEmpty>
          )}
        </SettingsSection>
      </Grid>

      <Grid item xs={12} md={6}>
        <SettingsSection
          title="Column Tags"
          icon={<ViewColumn />}
          description={`${columnTagCount} ${columnTagCount === 1 ? 'tag' : 'tags'}`}
        >
          {columnTagCount > 0 ? (
            <DataLakeTableContainer bordered={false}>
              <Table size="small">
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
                      // eslint-disable-next-line react/no-array-index-key
                      <TableRow key={idx}>
                        <TableCell sx={{ fontWeight: 500 }}>
                          {tag.columnName}
                        </TableCell>
                        <TableCell>{tag.key}</TableCell>
                        <TableCell>{tag.value}</TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </DataLakeTableContainer>
          ) : (
            <DataLakeSectionEmpty>No column tags</DataLakeSectionEmpty>
          )}
        </SettingsSection>
      </Grid>
    </Grid>
  );
};
