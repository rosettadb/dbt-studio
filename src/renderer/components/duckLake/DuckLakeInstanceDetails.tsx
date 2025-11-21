import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  LinearProgress,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Dataset as Database,
  Settings,
  Edit,
  Delete,
  PlayArrow,
  Stop,
  Refresh,
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
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import { DuckLakeTablesView } from './DuckLakeTablesView';
import {
  databaseIcons,
  cloudStorageImages,
} from '../../../../assets/connectionIcons';

interface DuckLakeInstance {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  dataPath: string;
  catalog: {
    type: 'duckdb' | 'sqlite' | 'postgresql';
    duckdb?: { metadataPath: string };
    sqlite?: { metadataPath: string };
    postgresql?: {
      host: string;
      port: number;
      database: string;
      username: string;
      ssl: boolean;
    };
  };
  runtime?: {
    maxMemory?: string;
    threads?: number;
    enableOptimizer?: boolean;
    tempDirectory?: string;
  };
  createdAt: string;
  updatedAt: string;
  description?: string;
  health?: {
    catalogConnected: boolean;
    dataPathAccessible: boolean;
    extensionLoaded: boolean;
    lastChecked: string;
    error?: string;
  };
  stats?: {
    tableCount: number;
    totalSize: number;
    lastQuery: string;
    queryCount: number;
  };
}

interface DuckLakeInstanceDetailsProps {
  instance: DuckLakeInstance;
  onConnect?: (instanceId: string) => void;
  onDisconnect?: (instanceId: string) => void;
  onEdit?: (instanceId: string) => void;
  onDelete?: (instanceId: string) => void;
  onRefreshHealth?: (instanceId: string) => void;
  isLoading?: boolean;
}

export const DuckLakeInstanceDetails: React.FC<
  DuckLakeInstanceDetailsProps
> = ({
  instance,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
  onRefreshHealth,
  isLoading = false,
}) => {
  const navigate = useNavigate();
  const [currentTab, setCurrentTab] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

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

  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${sizes[i]}`;
  };

  const handleConnect = () => {
    if (onConnect) {
      onConnect(instance.id);
    }
  };

  const handleDisconnect = () => {
    if (onDisconnect) {
      onDisconnect(instance.id);
    }
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit(instance.id);
    } else {
      navigate(`/app/duck-lake/instances/${instance.id}/edit`);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(instance.id);
    }
    setDeleteDialogOpen(false);
  };

  const handleRefreshHealth = () => {
    if (onRefreshHealth) {
      onRefreshHealth(instance.id);
    }
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
                primary="Status"
                secondary={
                  <Chip
                    label={instance.status}
                    size="small"
                    color={getStatusColor(instance.status) as any}
                  />
                }
              />
            </ListItem>
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
            <IconButton
              size="small"
              onClick={handleRefreshHealth}
              disabled={isLoading}
            >
              <Refresh />
            </IconButton>
          </Typography>
          {instance.health ? (
            <List dense>
              <ListItem>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {getHealthIcon(instance.health.catalogConnected)}
                </ListItemIcon>
                <ListItemText
                  primary="Catalog Connection"
                  secondary={
                    instance.health.catalogConnected
                      ? 'Connected'
                      : 'Disconnected'
                  }
                />
              </ListItem>
              <ListItem>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {getHealthIcon(instance.health.dataPathAccessible)}
                </ListItemIcon>
                <ListItemText
                  primary="Data Path"
                  secondary={
                    instance.health.dataPathAccessible
                      ? 'Accessible'
                      : 'Not accessible'
                  }
                />
              </ListItem>
              <ListItem>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {getHealthIcon(instance.health.extensionLoaded)}
                </ListItemIcon>
                <ListItemText
                  primary="DuckLake Extension"
                  secondary={
                    instance.health.extensionLoaded ? 'Loaded' : 'Not loaded'
                  }
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Last Checked"
                  secondary={moment(instance.health.lastChecked).fromNow()}
                />
              </ListItem>
              {instance.health.error && (
                <ListItem>
                  <Alert severity="error" sx={{ width: '100%' }}>
                    {instance.health.error}
                  </Alert>
                </ListItem>
              )}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Health check not available
            </Typography>
          )}
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
                  sx: { fontFamily: 'monospace', fontSize: '0.875rem' },
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
                    sx: { fontFamily: 'monospace', fontSize: '0.875rem' },
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
                    sx: { fontFamily: 'monospace', fontSize: '0.875rem' },
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
        {instance.runtime && (
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
                        {instance.runtime.maxMemory || 'Default'}
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
                        {instance.runtime.threads || 'Auto'}
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
                        {instance.runtime.enableOptimizer
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
                        sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                      >
                        {instance.runtime.tempDirectory || 'Default'}
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
            DuckLake Instance • {instance.catalog.type.toUpperCase()} Catalog
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {instance.status === 'active' ? (
            <Button
              variant="outlined"
              color="warning"
              startIcon={<Stop />}
              onClick={handleDisconnect}
              disabled={isLoading}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              variant="contained"
              color="success"
              startIcon={<PlayArrow />}
              onClick={handleConnect}
              disabled={isLoading}
            >
              Connect
            </Button>
          )}
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
            <Tab label="Overview" />
            <Tab label="Tables" />
            <Tab label="Activity" />
          </Tabs>
        </Box>
        <CardContent>
          {currentTab === 0 && renderOverviewTab()}
          {currentTab === 1 && <DuckLakeTablesView instanceId={instance.id} />}
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
