import React from 'react';
import {
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from '@mui/material';
import { Splitscreen, ViewList } from '@mui/icons-material';
import {
  DuckLakePartitionColumn,
  DuckLakeFilePartitionValue,
} from '../../../../types/duckLake';
import { safeToString } from '../../../helpers/utils';
import { SettingsStack, SettingsSection } from '../../settings/SettingsLayout';
import {
  DataLakeSectionEmpty,
  DataLakeTableContainer,
} from '../DataLakeLayout';

interface TablePartitionsTabProps {
  tableDetails: any;
}

export const TablePartitionsTab: React.FC<TablePartitionsTabProps> = ({
  tableDetails,
}) => {
  if (!tableDetails.partitionInfo) {
    return (
      <SettingsSection title="Partition Columns" icon={<Splitscreen />}>
        <DataLakeSectionEmpty>Table is not partitioned</DataLakeSectionEmpty>
      </SettingsSection>
    );
  }

  const columns: DuckLakePartitionColumn[] =
    tableDetails.partitionInfo.columns ?? [];
  const filePartitionValues: DuckLakeFilePartitionValue[] =
    tableDetails.partitionInfo.filePartitionValues ?? [];

  return (
    <SettingsStack>
      <SettingsSection
        title="Partition Columns"
        icon={<Splitscreen />}
        description={`${columns.length} ${columns.length === 1 ? 'column' : 'columns'}`}
      >
        <DataLakeTableContainer bordered={false}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Key Index</TableCell>
                <TableCell>Column Name</TableCell>
                <TableCell>Transform</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {columns.map((col) => (
                <TableRow
                  key={`${col.partitionId}-${safeToString(
                    col.partitionKeyIndex,
                  )}`}
                >
                  <TableCell>{safeToString(col.partitionKeyIndex)}</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>
                    {col.columnName}
                  </TableCell>
                  <TableCell>{col.transform || 'identity'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataLakeTableContainer>
      </SettingsSection>

      <SettingsSection
        title="File Partition Values"
        icon={<ViewList />}
        description={`${filePartitionValues.length} ${filePartitionValues.length === 1 ? 'value' : 'values'}`}
      >
        <DataLakeTableContainer bordered={false}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Data File ID</TableCell>
                <TableCell>Key Index</TableCell>
                <TableCell>Partition Value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filePartitionValues.map((val, idx) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={idx}>
                  <TableCell>{safeToString(val.dataFileId)}</TableCell>
                  <TableCell>{safeToString(val.partitionKeyIndex)}</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>
                    {val.partitionValue}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataLakeTableContainer>
      </SettingsSection>
    </SettingsStack>
  );
};
