import React, { useState } from 'react';
import { useQueryClient } from 'react-query';
import {
  Box,
  Typography,
  Grid,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Button,
  Tabs,
  Tab,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  Card,
  CardContent,
  LinearProgress,
} from '@mui/material';
import {
  Dataset as Database,
  Settings,
  Edit,
  Delete,
  Circle,
  Info,
  CheckCircle,
  Error as ErrorIcon,
  TableChart,
  Build,
  Folder,
  Security,
  Speed,
  Memory,
  Refresh,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import { DataLakeTablesView } from './DataLakeTablesView';
import {
  databaseIcons,
  cloudStorageImages,
} from '../../../../assets/connectionIcons';
import {
  useRefreshDuckLakeInstanceHealth,
  useDuckLakeInstanceHealth,
  duckLakeKeys,
} from '../../controllers/duckLake.controller';
import { DuckLakeInstance } from '../../../types/duckLake';

interface DuckLakeInstanceDetailsProps {
  instance: DuckLakeInstance;
  onEdit?: (instanceId: string) => void;
  onDelete?: (instanceId: string) => void;
  isLoading?: boolean;
}

export const DataLakeInstanceDetails: React.FC<
  DuckLakeInstanceDetailsProps
> = ({ instance, onEdit, onDelete, isLoading = false }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentTab, setCurrentTab] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Use the health check mutation for test connection
  const testConnectionMutation = useRefreshDuckLakeInstanceHealth();

  // Fetch health data for this instance
  const healthQuery = useDuckLakeInstanceHealth(instance.id);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle sx={{ color: 'success.main' }} />;
      case 'error':
        return <ErrorIcon sx={{ color: 'error.main' }} />;
      default:
        return <Circle sx={{ color: 'grey.500' }} />;
    }
  };

  const getHealthIcon = (healthy: boolean) => {
    return healthy ? (
      <CheckCircle sx={{ color: 'success.main', fontSize: 16 }} />
    ) : (
      <ErrorIcon sx={{ color: 'error.main', fontSize: 16 }} />
    );
  };

  const getOptionalHealthIcon = (value?: boolean) => {
    if (typeof value !== 'boolean') {
      return <Info sx={{ color: 'warning.main', fontSize: 16 }} />;
    }
    return getHealthIcon(value);
  };

  const getStorageStatusLabel = (value?: boolean) => {
    if (typeof value !== 'boolean') {
      return 'Pending test';
    }
    return value ? 'Connected' : 'Connection failed';
  };

  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${sizes[i]}`;
  };

  const handleTestConnection = () => {
    testConnectionMutation.mutate(instance.id);
  };

  const handleRefresh = () => {
    // Invalidate tables and health status for this instance
    queryClient.invalidateQueries(duckLakeKeys.tables(instance.id));
    queryClient.invalidateQueries(duckLakeKeys.instanceHealth(instance.id));
    queryClient.invalidateQueries(duckLakeKeys.instance(instance.id));
  };

  const isStorageHealthy = (value?: boolean) =>
    typeof value !== 'boolean' || value;

  const getTestIndicatorColor = () => {
    if (testConnectionMutation.isLoading) {
      return 'warning.main';
    }

    if (healthQuery.data) {
      const { catalogConnected, dataPathAccessible, storageConnected } =
        healthQuery.data;
      const healthy =
        catalogConnected &&
        dataPathAccessible &&
        isStorageHealthy(storageConnected);

      return healthy ? 'success.main' : 'error.main';
    }

    return 'grey.400';
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit(instance.id);
    } else {
      navigate(`/app/data-lake/duck-lake/instances/${instance.id}/edit`);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(instance.id);
    }
    setDeleteDialogOpen(false);
  };

  const getStorageType = (dataPath: string) => {
    if (dataPath.startsWith('s3://')) {
      return 'Amazon S3';
    }
    if (dataPath.startsWith('gs://')) {
      return 'Google Cloud Storage';
    }
    if (dataPath.startsWith('abfss://')) {
      return 'Azure Blob Storage';
    }
    return 'Local Filesystem';
  };

  const getStorageIcon = (dataPath: string) => {
    if (dataPath.startsWith('s3://')) {
      return (
        <Box
          component="img"
          src={cloudStorageImages.aws}
          alt="AWS S3"
          sx={{ width: 24, height: 24 }}
        />
      );
    }
    if (dataPath.startsWith('gs://')) {
      return (
        <Box
          component="img"
          src={cloudStorageImages.gcs}
          alt="Google Cloud Storage"
          sx={{ width: 24, height: 24 }}
        />
      );
    }
    if (dataPath.startsWith('abfss://')) {
      return (
        <Box
          component="img"
          src={cloudStorageImages.azure}
          alt="Azure Blob Storage"
          sx={{ width: 24, height: 24 }}
        />
      );
    }
    return <Folder color="action" />;
  };

  const renderOverviewTab = () => (
    <Box sx={{ mt: 2 }}>
      <Grid container spacing={3}>
        {/* Status Card */}
        <Grid item xs={12} md={6}>
          <Typography
            variant="h6"
            gutterBottom
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            {getStatusIcon(instance.status)}
            Instance Status
          </Typography>
          <List dense>
            <ListItem>
              <ListItemText
                primary="Created"
                secondary={moment(instance.createdAt).format(
                  'MMM DD, YYYY HH:mm',
                )}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Last Updated"
                secondary={moment(instance.updatedAt).fromNow()}
              />
            </ListItem>
            {instance.description && (
              <ListItem>
                <ListItemText
                  primary="Description"
                  secondary={instance.description}
                />
              </ListItem>
            )}
          </List>
        </Grid>

        {/* Health Status */}
        <Grid item xs={12} md={6}>
          <Typography
            variant="h6"
            gutterBottom
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Info color="primary" />
              Health Status
            </Box>
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              onClick={handleTestConnection}
              disabled={isLoading || testConnectionMutation.isLoading}
              sx={{
                position: 'relative',
                paddingRight: '32px',
                minWidth: '140px',
                color: 'text.secondary',
                borderColor: 'divider',
                '&:hover': {
                  borderColor: 'primary.main',
                  backgroundColor: 'action.hover',
                },
              }}
            >
              {testConnectionMutation.isLoading
                ? 'Testing...'
                : 'Test Connection'}
              <Box
                sx={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: getTestIndicatorColor(),
                  border: '1px solid',
                  borderColor: 'background.paper',
                }}
              />
            </Button>
          </Typography>
          {(() => {
            if (healthQuery.isLoading) {
              return (
                <Typography variant="body2" color="text.secondary">
                  Loading health status...
                </Typography>
              );
            }

            if (!healthQuery.data) {
              return (
                <Typography variant="body2" color="text.secondary">
                  Health check not available
                </Typography>
              );
            }

            return (
              <List dense>
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {getHealthIcon(healthQuery.data.catalogConnected)}
                  </ListItemIcon>
                  <ListItemText
                    primary="Catalog Connection"
                    secondary={
                      healthQuery.data.catalogConnected
                        ? 'Connected'
                        : 'Disconnected'
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {getHealthIcon(healthQuery.data.dataPathAccessible)}
                  </ListItemIcon>
                  <ListItemText
                    primary="Data Path"
                    secondary={
                      healthQuery.data.dataPathAccessible
                        ? 'Accessible'
                        : 'Not accessible'
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {getHealthIcon(healthQuery.data.extensionLoaded)}
                  </ListItemIcon>
                  <ListItemText
                    primary="DuckLake Extension"
                    secondary={
                      healthQuery.data.extensionLoaded ? 'Loaded' : 'Not loaded'
                    }
                  />
                </ListItem>
                {instance.storage && (
                  <ListItem>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      {getOptionalHealthIcon(healthQuery.data.storageConnected)}
                    </ListItemIcon>
                    <ListItemText
                      primary="Storage Connection"
                      secondary={getStorageStatusLabel(
                        healthQuery.data.storageConnected,
                      )}
                    />
                  </ListItem>
                )}
                {healthQuery.data.storageLocation && (
                  <ListItem>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Folder color="action" fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary="Storage Path"
                      secondary={healthQuery.data.storageLocation}
                      secondaryTypographyProps={{
                        sx: {
                          fontFamily: 'monospace',
                          wordBreak: 'break-all',
                          overflowWrap: 'anywhere',
                        },
                      }}
                    />
                  </ListItem>
                )}
                <ListItem>
                  <ListItemText
                    primary="Last Checked"
                    secondary={moment(healthQuery.data.lastChecked).fromNow()}
                  />
                </ListItem>
                {healthQuery.data.errors &&
                  healthQuery.data.errors.length > 0 && (
                    <ListItem>
                      <Alert severity="error" sx={{ width: '100%' }}>
                        {healthQuery.data.errors.join(', ')}
                      </Alert>
                    </ListItem>
                  )}
                {healthQuery.data.warnings &&
                  healthQuery.data.warnings.length > 0 && (
                    <ListItem>
                      <Alert severity="warning" sx={{ width: '100%' }}>
                        {healthQuery.data.warnings.join(', ')}
                      </Alert>
                    </ListItem>
                  )}
              </List>
            );
          })()}
        </Grid>

        {/* Statistics */}
        {instance.stats && (
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography
                variant="h6"
                gutterBottom
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <TableChart color="primary" />
                Statistics
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="primary">
                      {instance.stats.tableCount}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Tables
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="primary">
                      {formatBytes(instance.stats.totalSize)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Size
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="primary">
                      {instance.stats.queryCount}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Queries
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 1 }}
                    >
                      Last Query
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ fontFamily: 'monospace' }}
                    >
                      {moment(instance.stats.lastQuery).fromNow()}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        )}

        {/* Storage Configuration */}
        <Grid item xs={12} md={6}>
          <Typography
            variant="h6"
            gutterBottom
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <Folder color="primary" />
            Storage Configuration
          </Typography>
          <List dense>
            <ListItem>
              <ListItemIcon sx={{ minWidth: 40 }}>
                {getStorageIcon(instance.dataPath)}
              </ListItemIcon>
              <ListItemText
                primary="Data Path"
                secondary={instance.dataPath}
                secondaryTypographyProps={{
                  sx: {
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    wordBreak: 'break-all',
                    overflowWrap: 'anywhere',
                  },
                }}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Storage Type"
                secondary={getStorageType(instance.dataPath)}
              />
            </ListItem>
          </List>
        </Grid>

        {/* Catalog Configuration */}
        <Grid item xs={12} md={6}>
          <Typography
            variant="h6"
            gutterBottom
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            {databaseIcons[
              instance.catalog.type as keyof typeof databaseIcons
            ] ? (
              <Box
                component="img"
                src={
                  databaseIcons[
                    instance.catalog.type as keyof typeof databaseIcons
                  ]
                }
                alt={instance.catalog.type}
                sx={{ width: 24, height: 24 }}
              />
            ) : (
              <Database color="primary" />
            )}
            Catalog Configuration
          </Typography>
          <List dense>
            <ListItem>
              <ListItemText
                primary=""
                secondary={
                  <Chip
                    label={instance.catalog.type.toUpperCase()}
                    size="small"
                    color="primary"
                  />
                }
              />
            </ListItem>
            {instance.catalog.type === 'duckdb' && instance.catalog.duckdb && (
              <ListItem>
                <ListItemText
                  primary="Metadata Path"
                  secondary={instance.catalog.duckdb.metadataPath}
                  secondaryTypographyProps={{
                    sx: {
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      wordBreak: 'break-all',
                      overflowWrap: 'anywhere',
                    },
                  }}
                />
              </ListItem>
            )}
            {instance.catalog.type === 'sqlite' && instance.catalog.sqlite && (
              <ListItem>
                <ListItemText
                  primary="Metadata Path"
                  secondary={instance.catalog.sqlite.metadataPath}
                  secondaryTypographyProps={{
                    sx: {
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      wordBreak: 'break-all',
                      overflowWrap: 'anywhere',
                    },
                  }}
                />
              </ListItem>
            )}
            {instance.catalog.type === 'postgresql' &&
              instance.catalog.postgresql && (
                <>
                  <ListItem>
                    <ListItemText
                      primary="Host"
                      secondary={`${instance.catalog.postgresql.host}:${instance.catalog.postgresql.port}`}
                      secondaryTypographyProps={{
                        sx: {
                          wordBreak: 'break-all',
                          overflowWrap: 'anywhere',
                        },
                      }}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Database"
                      secondary={instance.catalog.postgresql.database}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Username"
                      secondary={instance.catalog.postgresql.username}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Security fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary="SSL"
                      secondary={
                        instance.catalog.postgresql.ssl ? 'Enabled' : 'Disabled'
                      }
                    />
                  </ListItem>
                </>
              )}
          </List>
        </Grid>

        {/* Runtime Configuration */}
        {(instance.runtime || instance.runtimeOptions) && (
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography
                variant="h6"
                gutterBottom
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <Settings color="primary" />
                Runtime Configuration
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Memory fontSize="small" color="action" />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Max Memory
                      </Typography>
                      <Typography variant="body1">
                        {instance.runtime?.maxMemory ||
                          instance.runtimeOptions?.maxMemory ||
                          'Default'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Speed fontSize="small" color="action" />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Threads
                      </Typography>
                      <Typography variant="body1">
                        {instance.runtime?.threads ||
                          instance.runtimeOptions?.threads ||
                          'Auto'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Build fontSize="small" color="action" />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Optimizer
                      </Typography>
                      <Typography variant="body1">
                        {instance.runtime?.enableOptimizer ||
                        instance.runtimeOptions?.enableOptimizer
                          ? 'Enabled'
                          : 'Disabled'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Folder fontSize="small" color="action" />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Temp Directory
                      </Typography>
                      <Typography
                        variant="body1"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          wordBreak: 'break-all',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {instance.runtime?.tempDirectory ||
                          instance.runtimeOptions?.tempDirectory ||
                          'Default'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        )}
      </Grid>
    </Box>
  );

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box>
          <Typography
            variant="h4"
            component="h1"
            sx={{
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            {getStorageIcon(instance.dataPath)}
            {instance.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            DataLake Instance • {instance.catalog.type.toUpperCase()} Catalog
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={handleRefresh}
            disabled={isLoading}
          >
            Refresh
          </Button>
          <Button
            variant="outlined"
            startIcon={<Edit />}
            onClick={handleEdit}
            disabled={isLoading}
          >
            Edit
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<Delete />}
            onClick={() => setDeleteDialogOpen(true)}
            disabled={isLoading}
          >
            Delete
          </Button>
        </Box>
      </Box>

      {isLoading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Tabs */}
      <Card>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={currentTab}
            onChange={(_, newValue) => setCurrentTab(newValue)}
          >
            <Tab label="Tables" />
            <Tab label="Overview" />
            <Tab label="Activity" />
          </Tabs>
        </Box>
        <CardContent>
          {currentTab === 0 && <DataLakeTablesView instanceId={instance.id} />}
          {currentTab === 1 && renderOverviewTab()}
          {currentTab === 2 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body1" color="text.secondary">
                Activity history coming soon...
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Instance</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone. The instance configuration will be
            permanently deleted.
          </Alert>
          <Typography>
            Are you sure you want to delete the instance{' '}
            <strong>{instance.name}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Note: This will not delete the actual data files, only the instance
            configuration.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete Instance
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
