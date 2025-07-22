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
} from '@mui/material';
import {
  Add,
  Edit,
  Cable,
  Refresh,
  DeleteOutline,
  Storage as DatabaseIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  useDeleteConnection,
  useGetConnections,
  useGetProjects,
} from '../../controllers';
import { Loader } from '../../components';
import { AppLayout } from '../../layouts';
import { ConnectionsSidebar } from '../../components/sidebarConnections';
import connectionIcons from '../../../../assets/connectionIcons';
import { SupportedConnectionTypes } from '../../../types/backend';

const Connections: React.FC = () => {
  const {
    data: connections = [],
    isLoading,
    refetch,
    isRefetching,
  } = useGetConnections();
  const navigate = useNavigate();
  const { data: projects = [] } = useGetProjects();

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [connectionToDelete, setConnectionToDelete] = React.useState<{
    id: string;
    name: string;
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

  const handleDeleteConnection = (id: string) => {
    const connectionToRemove = connections.find((c) => c.id === id);
    if (connectionToRemove) {
      setConnectionToDelete({
        id: connectionToRemove.id,
        name: connectionToRemove.connection.name,
      });
      setDeleteDialogOpen(true);
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

  if (isLoading) {
    return <Loader />;
  }

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
            <IconButton onClick={() => refetch()} disabled={isRefetching}>
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
            Manage Your Data Connections
          </Typography>
        </Box>

        {connections.length === 0 ? (
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
                more.
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
                              bgcolor: getConnectionTypeColor(connection.type),
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
                      {/* Spacer to push actions to bottom */}
                      <Box sx={{ flexGrow: 1 }} />
                    </CardContent>
                    <CardActions sx={{ justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<Edit />}
                          onClick={() => navigate(`/app/edit-connection/${id}`)}
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
                              handleDeleteConnection(id);
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
        )}

        <Dialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          aria-labelledby="alert-dialog-title"
          aria-describedby="alert-dialog-description"
        >
          <DialogTitle id="alert-dialog-title">Delete Connection</DialogTitle>
          <DialogContent>
            <DialogContentText id="alert-dialog-description">
              Are you sure you want to delete the connection &quot;
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
