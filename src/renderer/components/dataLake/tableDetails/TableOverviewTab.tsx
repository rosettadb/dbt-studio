import React from 'react';
import { Box, Grid, Typography } from '@mui/material';
import { BarChart, InfoOutlined } from '@mui/icons-material';
import {
  formatBytes,
  formatNumber,
  safeToString,
} from '../../../helpers/utils';
import { DuckLakeTableDetails } from '../../../../types/duckLake';
import { SettingsRow, SettingsSection } from '../../settings/SettingsLayout';

interface TableOverviewTabProps {
  tableDetails: DuckLakeTableDetails;
}

// Value on the right of a settings-style row.
const RowValue: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="body2" color="text.secondary">
    {children}
  </Typography>
);

export const TableOverviewTab: React.FC<TableOverviewTabProps> = ({
  tableDetails,
}) => {
  return (
    <Grid container spacing={1.5}>
      <Grid item xs={12} md={6}>
        <SettingsSection title="Table Information" icon={<InfoOutlined />}>
          <SettingsRow label="Table ID">
            <RowValue>{safeToString(tableDetails.tableId)}</RowValue>
          </SettingsRow>
          <SettingsRow label="Table UUID">
            <RowValue>{tableDetails.tableUuid}</RowValue>
          </SettingsRow>
          <SettingsRow label="Schema ID">
            <RowValue>{safeToString(tableDetails.schemaId)}</RowValue>
          </SettingsRow>
          <SettingsRow label="Schema Name">
            <RowValue>{tableDetails.schemaName}</RowValue>
          </SettingsRow>
          {tableDetails.path && (
            <SettingsRow
              label={tableDetails.pathIsRelative ? 'Path (relative)' : 'Path'}
              description={
                <Box
                  component="span"
                  sx={{
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {tableDetails.path}
                </Box>
              }
            />
          )}
        </SettingsSection>
      </Grid>

      <Grid item xs={12} md={6}>
        <SettingsSection title="Statistics" icon={<BarChart />}>
          <SettingsRow label="Record Count">
            <RowValue>
              {formatNumber(tableDetails.stats?.recordCount ?? 0)}
            </RowValue>
          </SettingsRow>
          <SettingsRow label="File Size">
            <RowValue>
              {formatBytes(tableDetails.stats?.fileSizeBytes ?? 0)}
            </RowValue>
          </SettingsRow>
          <SettingsRow label="Next Row ID">
            <RowValue>
              {formatNumber(tableDetails.stats?.nextRowId ?? 0)}
            </RowValue>
          </SettingsRow>
          <SettingsRow label="Columns">
            <RowValue>{tableDetails.columns?.length ?? 0}</RowValue>
          </SettingsRow>
          <SettingsRow label="Data Files">
            <RowValue>{tableDetails.dataFiles?.length ?? 0}</RowValue>
          </SettingsRow>
        </SettingsSection>
      </Grid>
    </Grid>
  );
};
