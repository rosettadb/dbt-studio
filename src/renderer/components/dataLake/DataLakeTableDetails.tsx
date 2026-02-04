/**
 * DuckLake Table Details Component (Phase 8b)
 * Displays comprehensive table metadata from DuckLake catalog
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  ArrowBack,
  TableChart,
  Schema,
  BarChart,
  InsertDriveFile,
  Splitscreen,
  History,
  Label,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { useDuckLakeTableDetails } from '../../controllers/duckLake.controller';
import { safeToString } from '../../helpers/utils';

// Import Tab Components
import { TableOverviewTab } from './tableDetails/TableOverviewTab';
import { TableSchemaTab } from './tableDetails/TableSchemaTab';
import { TableDataRowsTab } from './tableDetails/TableDataRowsTab';
import { TableStatisticsTab } from './tableDetails/TableStatisticsTab';
import { TableDataFilesTab } from './tableDetails/TableDataFilesTab';
import { TablePartitionsTab } from './tableDetails/TablePartitionsTab';
import { TableHistoryTab } from './tableDetails/TableHistoryTab';
import { TableTagsTab } from './tableDetails/TableTagsTab';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`table-details-tabpanel-${index}`}
      aria-labelledby={`table-details-tab-${index}`}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export const DataLakeTableDetails: React.FC = () => {
  const navigate = useNavigate();
  const { instanceId, tableName } = useParams<{
    instanceId: string;
    tableName: string;
  }>();
  const [currentTab, setCurrentTab] = useState(0);

  const {
    data: tableDetails,
    isLoading,
    error,
  } = useDuckLakeTableDetails(instanceId || '', tableName || '');

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
            Failed to load table details
          </Typography>
          <Typography variant="body2">
            {(error as Error).message || 'Unknown error'}
          </Typography>
        </Alert>
      </Box>
    );
  }

  if (!tableDetails) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="warning">Table details not found</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <Tooltip title="Back to Instance Details">
          <IconButton
            onClick={() =>
              navigate(`/app/data-lake/duck-lake/instances/${instanceId}`)
            }
            sx={{ mr: 1 }}
          >
            <ArrowBack />
          </IconButton>
        </Tooltip>
        <TableChart sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
            {tableDetails.tableName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Schema: {tableDetails.schemaName} • UUID: {tableDetails.tableUuid}
          </Typography>
        </Box>
        <Chip
          label={`Snapshot ${safeToString(tableDetails.beginSnapshot)}${
            tableDetails.endSnapshot
              ? ` - ${safeToString(tableDetails.endSnapshot)}`
              : ' (current)'
          }`}
          color="primary"
          variant="outlined"
        />
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          aria-label="table details tabs"
        >
          <Tab icon={<BarChart />} label="Overview" iconPosition="start" />
          <Tab icon={<Schema />} label="Schema" iconPosition="start" />
          <Tab icon={<TableChart />} label="Data" iconPosition="start" />
          <Tab icon={<BarChart />} label="Statistics" iconPosition="start" />
          <Tab
            icon={<InsertDriveFile />}
            label="Data Files"
            iconPosition="start"
          />
          <Tab icon={<Splitscreen />} label="Partitions" iconPosition="start" />
          <Tab icon={<History />} label="History" iconPosition="start" />
          <Tab icon={<Label />} label="Tags" iconPosition="start" />
        </Tabs>
      </Box>

      {/* Tab Panels */}
      <TabPanel value={currentTab} index={0}>
        <TableOverviewTab tableDetails={tableDetails} />
      </TabPanel>

      <TabPanel value={currentTab} index={1}>
        <TableSchemaTab
          tableDetails={tableDetails}
          instanceId={instanceId || ''}
          tableName={tableName || ''}
        />
      </TabPanel>

      <TabPanel value={currentTab} index={2}>
        <TableDataRowsTab
          instanceId={instanceId || ''}
          tableName={tableName || ''}
        />
      </TabPanel>

      <TabPanel value={currentTab} index={3}>
        <TableStatisticsTab tableDetails={tableDetails} />
      </TabPanel>

      <TabPanel value={currentTab} index={4}>
        <TableDataFilesTab tableDetails={tableDetails} />
      </TabPanel>

      <TabPanel value={currentTab} index={5}>
        <TablePartitionsTab tableDetails={tableDetails} />
      </TabPanel>

      <TabPanel value={currentTab} index={6}>
        <TableHistoryTab
          tableDetails={tableDetails}
          instanceId={instanceId || ''}
          tableName={tableName || ''}
        />
      </TabPanel>

      <TabPanel value={currentTab} index={7}>
        <TableTagsTab tableDetails={tableDetails} />
      </TabPanel>
    </Box>
  );
};
