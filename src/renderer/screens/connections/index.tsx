import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
  Chip,
  Card,
  CardContent,
  CardHeader,
  CardActions,
  Grid,
  Divider,
} from '@mui/material';
import {
  Add,
  Edit,
  Cable,
  Refresh,
  DeleteOutline,
  Storage as DatabaseIcon,
  Cloud as CloudIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  useDeleteConnection,
  useGetCloudConnections,
  useGetConnections,
  useGetProjects,
} from '../../controllers';
import { Loader, ConnectionsSidebar } from '../../components';
import { AppLayout } from '../../layouts';
import connectionIcons, {
  cloudStorageImages,
} from '../../../../assets/connectionIcons';
import { SupportedConnectionTypes } from '../../../types/backend';
import { CloudProvider, CloudConnection } from '../../../types/frontend';

const Connections: React.FC = () => {
  const {
    data: connections = [],
    isLoading,
    refetch,
    isRefetching,
  } = useGetConnections();

  const {
    data: cloudConnections = [],
    isLoading: isLoadingCloudConnections,
    refetch: refetchCloudConnections,
    isRefetching: isRefetchingCloudConnections,
  } = useGetCloudConnections();

  const navigate = useNavigate();
  const { data: projects = [] } = useGetProjects();

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [connectionToDelete, setConnectionToDelete] = React.useState<{
    id: string;
    name: string;
    type: 'database' | 'cloud';
  } | null>(null);

  const { mutate: deleteConnection } = useDeleteConnection({
    onSuccess: () => {
      toast.info(
        `Connection ${connectionToDelete?.name} successfully deleted!`,
      );
    },
  });

  // Helper function to get projects using a connection
  const getProjectsUsingConnection = (connectionId: string) => {
    return projects.filter((project) => project.connectionId === connectionId);
  };

  // Helper function to check if connection can be deleted
  const canDeleteConnection = (connectionId: string) => {
    return getProjectsUsingConnection(connectionId).length === 0;
  };

  const handleDeleteConnection = (id: string, type: 'database' | 'cloud') => {
    if (type === 'database') {
      const connectionToRemove = connections.find((c) => c.id === id);
      if (connectionToRemove) {
        setConnectionToDelete({
          id: connectionToRemove.id,
          name: connectionToRemove.connection.name,
          type: 'database',
        });
        setDeleteDialogOpen(true);
      }
    } else {
      const cloudConnectionToRemove = cloudConnections.find((c) => c.id === id);
      if (cloudConnectionToRemove) {
        setConnectionToDelete({
          id: cloudConnectionToRemove.id,
          name: cloudConnectionToRemove.name,
          type: 'cloud',
        });
        setDeleteDialogOpen(true);
      }
    }
  };

  const confirmDeleteConnection = async () => {
    if (connectionToDelete) {
      deleteConnection(connectionToDelete.id);
    }
    setDeleteDialogOpen(false);
    setConnectionToDelete(null);
  };

  // Helper function to get connection icon
  const getConnectionIcon = (connectionType: string) => {
    return connectionIcons.images[connectionType as SupportedConnectionTypes];
  };

  // Helper function to get cloud provider icon
  const getCloudProviderIcon = (provider: string) => {
    const iconSrc = cloudStorageImages[provider as CloudProvider];
    if (iconSrc) {
      return (
        <img
          src={iconSrc}
          alt={provider}
          style={{ width: 48, height: 48, objectFit: 'contain' }}
        />
      );
    }
    return <CloudIcon sx={{ fontSize: 48 }} />;
  };

  // Helper function to get connection type name
  const getConnectionTypeName = (connectionType: string) => {
    switch (connectionType) {
      case 'postgres':
        return 'PostgreSQL';
      case 'snowflake':
        return 'Snowflake';
      case 'bigquery':
        return 'BigQuery';
      case 'redshift':
        return 'Redshift';
      case 'databricks':
        return 'Databricks';
      case 'duckdb':
        return 'DuckDB';
      default:
        return connectionType.toUpperCase();
    }
  };

  // Helper function to get cloud provider name
  const getCloudProviderName = (provider: string) => {
    switch (provider) {
      case 'aws':
        return 'Amazon S3';
      case 'azure':
        return 'Azure Blob Storage';
      case 'gcs':
        return 'Google Cloud Storage';
      default:
        return provider.toUpperCase();
    }
  };

  // Helper function to get connection type color
  const getConnectionTypeColor = (connectionType: string) => {
    switch (connectionType) {
      case 'postgres':
        return '#336791';
      case 'snowflake':
        return '#29b5e8';
      case 'bigquery':
        return '#4285f4';
      case 'redshift':
        return '#8c4fff';
      case 'databricks':
        return '#ff3621';
      case 'duckdb':
        return '#fff000';
      default:
        return '#666';
    }
  };

  // Helper function to get cloud provider color
  const getCloudProviderColor = (provider: string) => {
    switch (provider) {
      case 'aws':
        return '#ff9900';
      case 'azure':
        return '#0078d4';
      case 'gcs':
        return '#4285f4';
      default:
        return '#666';
    }
  };

  // Helper function to render the appropriate icon component
  const renderConnectionIcon = (connectionType: string) => {
    const connectionIcon = getConnectionIcon(connectionType);

    if (connectionIcon) {
      return (
        <img
          src={connectionIcon}
          alt={connectionType}
          style={{
            width: 48,
            height: 48,
            objectFit: 'contain',
          }}
        />
      );
    }
    return <DatabaseIcon sx={{ fontSize: 48 }} />;
  };

  // Helper function to render cloud provider icon
  const renderCloudProviderIcon = (provider: string) => {
    const icon = getCloudProviderIcon(provider);
    if (typeof icon === 'string') {
      return (
        <Box sx={{ fontSize: 48, display: 'flex', alignItems: 'center' }}>
          {icon}
        </Box>
      );
    }
    return icon;
  };

  const renderConnectionDetails = (connection: any) => {
    switch (connection.type) {
      case 'postgres':
      case 'redshift':
        return (
          <Typography variant="body2" color="text.secondary">
            Host: {connection.host}:{connection.port}
          </Typography>
        );
      case 'snowflake':
        return (
          <Typography variant="body2" color="text.secondary">
            Account: {connection.account}
          </Typography>
        );
      case 'bigquery':
        return (
          <Typography variant="body2" color="text.secondary">
            Project: {connection.project || connection.projectId}
          </Typography>
        );
      case 'databricks':
        return (
          <Typography variant="body2" color="text.secondary">
            Host: {connection.host}
          </Typography>
        );
      case 'duckdb':
        return (
          <Typography variant="body2" color="text.secondary">
            Path: {connection.short_database_path || connection.database_path}
          </Typography>
        );
      default:
        return null;
    }
  };

  const renderCloudConnectionDetails = (cloudConnection: CloudConnection) => {
    switch (cloudConnection.provider) {
      case 'aws':
        return (
          <Typography variant="body2" color="text.secondary">
            Region: {(cloudConnection.config as any).region}
          </Typography>
        );
      case 'azure':
        return (
          <Typography variant="body2" color="text.secondary">
            Account: {(cloudConnection.config as any).accountName}
          </Typography>
        );
      case 'gcs':
        return (
          <Typography variant="body2" color="text.secondary">
            Project: {(cloudConnection.config as any).projectId}
          </Typography>
        );
      default:
        return null;
    }
  };

  const handleRefresh = () => {
    refetch();
    refetchCloudConnections();
  };

  if (isLoading || isLoadingCloudConnections) {
    return <Loader />;
  }

  const totalConnections = connections.length + cloudConnections.length;

  return (
    <AppLayout sidebarContent={<ConnectionsSidebar />}>
      <Box sx={{ p: 2 }}>
        {/* Header with title and icon */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 3,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
              Connections
            </Typography>
            <Cable sx={{ color: 'primary.main', fontSize: 28 }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton
              onClick={handleRefresh}
              disabled={isRefetching || isRefetchingCloudConnections}
            >
              <Refresh />
            </IconButton>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => navigate('/app/add-connection')}
            >
              New Connection
            </Button>
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography
            variant="h6"
            sx={{ color: 'primary.main', textAlign: 'center' }}
          >
            Manage Your Data Connections & Sources
          </Typography>
        </Box>

        {totalConnections === 0 ? (
          <Card>
            <CardHeader
              title="No connections found"
              subheader="Add a connection to get started with your dbt projects."
              avatar={
                <DatabaseIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
              }
            />
            <CardContent>
              <Typography variant="body2" color="text.secondary" paragraph>
                Database connections allow you to connect your dbt projects to
                various data sources like PostgreSQL, Snowflake, BigQuery, and
                more. Cloud sources let you connect to storage services like S3,
                Azure Blob Storage, and Google Cloud Storage.
              </Typography>
            </CardContent>
            <CardActions>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => navigate('/app/add-connection')}
              >
                Add Connection
              </Button>
            </CardActions>
          </Card>
        ) : (
          <Box>
            {/* Database Connections Section */}
            {connections.length > 0 && (
              <Box sx={{ mb: 4 }}>
                <Typography
                  variant="h6"
                  sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <DatabaseIcon />
                  Database Connections ({connections.length})
                </Typography>
                <Grid container spacing={2}>
                  {connections.map(({ id, connection }) => {
                    const projectsUsing = getProjectsUsingConnection(id);
                    return (
                      <Grid item xs={12} md={6} lg={4} key={id}>
                        <Card
                          sx={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                              transform: 'translateY(-2px)',
                            },
                          }}
                        >
                          <CardHeader
                            avatar={renderConnectionIcon(connection.type)}
                            title={connection.name}
                            subheader={
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  mt: 1,
                                }}
                              >
                                <Chip
                                  label={getConnectionTypeName(connection.type)}
                                  size="small"
                                  sx={{
                                    bgcolor: getConnectionTypeColor(
                                      connection.type,
                                    ),
                                    color: 'white',
                                    fontWeight: 'bold',
                                  }}
                                />
                              </Box>
                            }
                          />
                          <CardContent
                            sx={{
                              pt: 0,
                              flexGrow: 1,
                              display: 'flex',
                              flexDirection: 'column',
                            }}
                          >
                            {renderConnectionDetails(connection)}
                            {projectsUsing.length > 0 && (
                              <Box sx={{ mt: 2 }}>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  display="block"
                                  sx={{ mb: 1 }}
                                >
                                  Used by projects:
                                </Typography>
                                <Box
                                  sx={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 0.5,
                                  }}
                                >
                                  {projectsUsing.map((project) => (
                                    <Chip
                                      key={project.id}
                                      label={project.name}
                                      size="small"
                                      variant="outlined"
                                      sx={{ fontSize: '10px', height: '20px' }}
                                    />
                                  ))}
                                </Box>
                              </Box>
                            )}
                            <Box sx={{ flexGrow: 1 }} />
                          </CardContent>
                          <CardActions sx={{ justifyContent: 'space-between' }}>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<Edit />}
                                onClick={() =>
                                  navigate(`/app/edit-connection/${id}`)
                                }
                              >
                                Edit
                              </Button>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                startIcon={<DeleteOutline />}
                                sx={{
                                  borderRadius: '8px',
                                  '&:hover': {
                                    backgroundColor: 'error.light',
                                    color: 'error.contrastText',
                                    borderColor: 'error.light',
                                  },
                                }}
                                onClick={() => {
                                  if (canDeleteConnection(id)) {
                                    handleDeleteConnection(id, 'database');
                                    return;
                                  }
                                  toast.error(
                                    'Cannot delete! Connection already used!',
                                  );
                                }}
                                disabled={!canDeleteConnection(id)}
                              >
                                Delete
                              </Button>
                            </Box>
                          </CardActions>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>
              </Box>
            )}

            {/* Cloud Sources Section */}
            {cloudConnections.length > 0 && (
              <Box>
                {connections.length > 0 && <Divider sx={{ mb: 3 }} />}
                <Typography
                  variant="h6"
                  sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <CloudIcon />
                  Cloud Sources ({cloudConnections.length})
                </Typography>
                <Grid container spacing={2}>
                  {cloudConnections.map((cloudConnection) => (
                    <Grid item xs={12} md={6} lg={4} key={cloudConnection.id}>
                      <Card
                        sx={{
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                          transition: 'all 0.3s ease',
                          border: '1px solid',
                          borderColor: 'divider',
                          '&:hover': {
                            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                            transform: 'translateY(-2px)',
                            borderColor: 'primary.main',
                          },
                        }}
                      >
                        <CardHeader
                          avatar={renderCloudProviderIcon(
                            cloudConnection.provider,
                          )}
                          title={cloudConnection.name}
                          subheader={
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                mt: 1,
                              }}
                            >
                              <Chip
                                label={getCloudProviderName(
                                  cloudConnection.provider,
                                )}
                                size="small"
                                sx={{
                                  bgcolor: getCloudProviderColor(
                                    cloudConnection.provider,
                                  ),
                                  color: 'white',
                                  fontWeight: 'bold',
                                }}
                              />
                            </Box>
                          }
                        />
                        <CardContent
                          sx={{
                            pt: 0,
                            flexGrow: 1,
                            display: 'flex',
                            flexDirection: 'column',
                          }}
                        >
                          {renderCloudConnectionDetails(cloudConnection)}
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ mt: 1 }}
                          >
                            Created:{' '}
                            {new Date(
                              cloudConnection.created,
                            ).toLocaleDateString()}
                          </Typography>
                          {cloudConnection.lastUsed && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Last used:{' '}
                              {new Date(
                                cloudConnection.lastUsed,
                              ).toLocaleDateString()}
                            </Typography>
                          )}
                          <Box sx={{ flexGrow: 1 }} />
                        </CardContent>
                        <CardActions sx={{ justifyContent: 'space-between' }}>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<Edit />}
                              onClick={() =>
                                navigate(
                                  `/app/cloud-explorer/edit-connection/${cloudConnection.id}`,
                                )
                              }
                            >
                              Edit
                            </Button>
                          </Box>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              startIcon={<DeleteOutline />}
                              sx={{
                                borderRadius: '8px',
                                '&:hover': {
                                  backgroundColor: 'error.light',
                                  color: 'error.contrastText',
                                  borderColor: 'error.light',
                                },
                              }}
                              onClick={() =>
                                handleDeleteConnection(
                                  cloudConnection.id,
                                  'cloud',
                                )
                              }
                            >
                              Delete
                            </Button>
                          </Box>
                        </CardActions>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}
          </Box>
        )}

        <Dialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          aria-labelledby="alert-dialog-title"
          aria-describedby="alert-dialog-description"
        >
          <DialogTitle id="alert-dialog-title">
            Delete{' '}
            {connectionToDelete?.type === 'cloud'
              ? 'Cloud Source'
              : 'Connection'}
          </DialogTitle>
          <DialogContent>
            <DialogContentText id="alert-dialog-description">
              Are you sure you want to delete the{' '}
              {connectionToDelete?.type === 'cloud'
                ? 'cloud source'
                : 'connection'}{' '}
              &quot;
              {connectionToDelete?.name}
              &quot;? This action cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)} color="primary">
              Cancel
            </Button>
            <Button
              onClick={confirmDeleteConnection}
              color="error"
              variant="contained"
              autoFocus
            >
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </AppLayout>
  );
};

export default Connections;
