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
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Grid,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
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
import moment from 'moment';
import { useDuckLakeTableDetails } from '../../controllers/duckLake.controller';
import {
  DuckLakeColumnDetail,
  DuckLakeColumnStats,
  DuckLakeDataFileInfo,
  DuckLakePartitionColumn,
  DuckLakeFilePartitionValue,
  DuckLakeSnapshotDetail,
  DuckLakeTag,
  DuckLakeColumnTag,
} from '../../../types/duckLake';

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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  /**
   * Safely convert any value to string for React rendering
   * Handles DuckDB hugeint objects and other non-primitive types
   */
  const safeToString = (value: any): string => {
    if (value === null || value === undefined) {
      return '-';
    }
    if (typeof value === 'object') {
      // Handle DuckDB hugeint objects
      if (value.hugeint !== undefined) {
        return String(value.hugeint);
      }
      // Handle other objects
      return JSON.stringify(value);
    }
    return String(value);
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
          label={`Snapshot ${safeToString(tableDetails.beginSnapshot)}${tableDetails.endSnapshot ? ` - ${safeToString(tableDetails.endSnapshot)}` : ' (current)'}`}
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

      {/* Tab 0: Overview */}
      <TabPanel value={currentTab} index={0}>
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
                      <TableCell>
                        {safeToString(tableDetails.tableId)}
                      </TableCell>
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
                      <TableCell>
                        {safeToString(tableDetails.schemaId)}
                      </TableCell>
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
                        <TableCell>
                          {tableDetails.path}
                          {tableDetails.pathIsRelative && ' (relative)'}
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
      </TabPanel>

      {/* Tab 1: Schema */}
      <TabPanel value={currentTab} index={1}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Column Schema ({tableDetails.columns.length} columns)
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Order</TableCell>
                    <TableCell>Column Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Nullable</TableCell>
                    <TableCell>Default Value</TableCell>
                    <TableCell>Snapshot Range</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tableDetails.columns.map((column: DuckLakeColumnDetail) => (
                    <TableRow key={column.columnId}>
                      <TableCell>{safeToString(column.columnOrder)}</TableCell>
                      <TableCell>
                        <strong>{column.columnName}</strong>
                        {column.parentColumn && (
                          <Chip label="Nested" size="small" sx={{ ml: 1 }} />
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={column.columnType}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {column.nullsAllowed ? (
                          <Chip label="Yes" size="small" color="default" />
                        ) : (
                          <Chip label="No" size="small" color="primary" />
                        )}
                      </TableCell>
                      <TableCell>{column.defaultValue || '-'}</TableCell>
                      <TableCell>
                        {safeToString(column.beginSnapshot)}
                        {column.endSnapshot
                          ? ` - ${safeToString(column.endSnapshot)}`
                          : ' (current)'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </TabPanel>

      {/* Tab 2: Statistics */}
      <TabPanel value={currentTab} index={2}>
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
                    {tableDetails.columnStats.map(
                      (stat: DuckLakeColumnStats) => (
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
                      ),
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="info">No column statistics available</Alert>
            )}
          </CardContent>
        </Card>
      </TabPanel>

      {/* Tab 3: Data Files */}
      <TabPanel value={currentTab} index={3}>
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
                    {tableDetails.dataFiles.map(
                      (file: DuckLakeDataFileInfo) => (
                        <TableRow key={file.dataFileId}>
                          <TableCell>{safeToString(file.fileOrder)}</TableCell>
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{ fontFamily: 'monospace' }}
                            >
                              {file.path}
                            </Typography>
                            {file.pathIsRelative && (
                              <Chip
                                label="Relative"
                                size="small"
                                sx={{ mt: 0.5 }}
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={file.fileFormat}
                              size="small"
                              color="primary"
                            />
                          </TableCell>
                          <TableCell>
                            {formatNumber(file.recordCount)}
                          </TableCell>
                          <TableCell>
                            {formatBytes(file.fileSizeBytes)}
                          </TableCell>
                          <TableCell>{formatNumber(file.rowIdStart)}</TableCell>
                          <TableCell>
                            {safeToString(file.beginSnapshot)}
                            {file.endSnapshot
                              ? ` - ${safeToString(file.endSnapshot)}`
                              : ' (current)'}
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="info">No data files found</Alert>
            )}
          </CardContent>
        </Card>
      </TabPanel>

      {/* Tab 4: Partitions */}
      <TabPanel value={currentTab} index={4}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Partition Information
            </Typography>
            {tableDetails.partitionInfo ? (
              <Box>
                <Typography variant="subtitle1" gutterBottom>
                  Partition Columns ({tableDetails.partitionInfo.columns.length}
                  )
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
                            <TableCell>
                              {safeToString(val.dataFileId)}
                            </TableCell>
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
      </TabPanel>

      {/* Tab 5: History */}
      <TabPanel value={currentTab} index={5}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Snapshot History ({tableDetails.snapshots.length} snapshots)
            </Typography>
            {tableDetails.snapshots.length > 0 ? (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Snapshot ID</TableCell>
                      <TableCell>Time</TableCell>
                      <TableCell>Schema Version</TableCell>
                      <TableCell>Author</TableCell>
                      <TableCell>Changes</TableCell>
                      <TableCell>Commit Message</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tableDetails.snapshots.map(
                      (snapshot: DuckLakeSnapshotDetail) => (
                        <TableRow key={safeToString(snapshot.snapshotId)}>
                          <TableCell>
                            <Chip
                              label={safeToString(snapshot.snapshotId)}
                              size="small"
                              color="primary"
                            />
                          </TableCell>
                          <TableCell>
                            {moment(snapshot.snapshotTime).format(
                              'YYYY-MM-DD HH:mm:ss',
                            )}
                            <Typography
                              variant="caption"
                              display="block"
                              color="text.secondary"
                            >
                              {moment(snapshot.snapshotTime).fromNow()}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {safeToString(snapshot.schemaVersion)}
                          </TableCell>
                          <TableCell>{snapshot.author || '-'}</TableCell>
                          <TableCell>{snapshot.changesMade || '-'}</TableCell>
                          <TableCell>{snapshot.commitMessage || '-'}</TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="info">No snapshot history available</Alert>
            )}
          </CardContent>
        </Card>
      </TabPanel>

      {/* Tab 6: Tags */}
      <TabPanel value={currentTab} index={6}>
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
                        {tableDetails.tags.map(
                          (tag: DuckLakeTag, idx: number) => (
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
                          ),
                        )}
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
      </TabPanel>
    </Box>
  );
};
