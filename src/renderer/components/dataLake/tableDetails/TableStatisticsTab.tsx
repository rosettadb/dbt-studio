import React from 'react';
import {
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from '@mui/material';
import { BarChart } from '@mui/icons-material';
import { DuckLakeColumnStats } from '../../../../types/duckLake';
import { SettingsStatus, SettingsSection } from '../../settings/SettingsLayout';
import {
  DataLakeSectionEmpty,
  DataLakeTableContainer,
} from '../DataLakeLayout';

interface TableStatisticsTabProps {
  tableDetails: any;
}

const YesNoStatus: React.FC<{ value: boolean }> = ({ value }) =>
  value ? (
    <SettingsStatus tone="warning">Yes</SettingsStatus>
  ) : (
    <SettingsStatus tone="success">No</SettingsStatus>
  );

export const TableStatisticsTab: React.FC<TableStatisticsTabProps> = ({
  tableDetails,
}) => {
  const count = tableDetails.columnStats.length;
  return (
    <SettingsSection
      title="Column Statistics"
      icon={<BarChart />}
      description={`${count} ${count === 1 ? 'column' : 'columns'}`}
    >
      {count > 0 ? (
        <DataLakeTableContainer bordered={false}>
          <Table size="small">
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
                  <TableCell sx={{ fontWeight: 500 }}>
                    {stat.columnName}
                  </TableCell>
                  <TableCell>
                    <YesNoStatus value={!!stat.containsNull} />
                  </TableCell>
                  <TableCell>
                    <YesNoStatus value={!!stat.containsNan} />
                  </TableCell>
                  <TableCell>{stat.minValue || '-'}</TableCell>
                  <TableCell>{stat.maxValue || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataLakeTableContainer>
      ) : (
        <DataLakeSectionEmpty>
          No column statistics available
        </DataLakeSectionEmpty>
      )}
    </SettingsSection>
  );
};
