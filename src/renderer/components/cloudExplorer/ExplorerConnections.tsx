import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardActions,
  Grid,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Chip,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Cloud,
  Storage,
  Cable,
  Refresh,
} from '@mui/icons-material';

import { CloudProvider } from '../../../types/frontend';
import {
  useConnections,
  useDeleteConnection,
  useTestCloudConnection,
} from '../../controllers/cloudExplorer.controller';

export const ExplorerConnections: React.FC = () => {
  const navigate = useNavigate();
  const connectionsQuery = useConnections();
  const deleteConnection = useDeleteConnection();
  const testConnection = useTestCloudConnection();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState<string | null>(
    null,
  );
  const [testingConnections, setTestingConnections] = useState<Set<string>>(
    new Set(),
  );

  const getProviderIcon = (provider: CloudProvider) => {
    switch (provider) {
      case 'gcs':
        return <Cloud sx={{ color: '#4285f4' }} />;
      case 'aws':
        return <Storage sx={{ color: '#ff9900' }} />;
      case 'azure':
        return <Cloud sx={{ color: '#0078d4' }} />;
      default:
        return <Cable />;
    }
  };

  const getProviderName = (provider: CloudProvider) => {
    switch (provider) {
      case 'gcs':
        return 'Google Cloud Storage';
      case 'aws':
        return 'Amazon S3';
      case 'azure':
        return 'Azure Blob Storage';
      default:
        return (provider as string).toUpperCase();
    }
  };

  const getProviderColor = (provider: CloudProvider) => {
    switch (provider) {
      case 'gcs':
        return '#4285f4';
      case 'aws':
        return '#ff9900';
      case 'azure':
        return '#0078d4';
      default:
        return '#666';
    }
  };

  const handleDeleteConnection = async () => {
    if (connectionToDelete) {
      try {
        await deleteConnection.mutateAsync(connectionToDelete);
        setDeleteDialogOpen(false);
        setConnectionToDelete(null);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to delete connection:', error);
      }
    }
  };

  const handleTestConnection = async (connectionId: string) => {
    const connection = connectionsQuery.data?.find(
      (c) => c.id === connectionId,
    );
    if (!connection) return;

    setTestingConnections((prev) => new Set(prev).add(connectionId));

    try {
      await testConnection.mutateAsync({
        provider: connection.provider,
        config: connection.config,
      });
      // Could show a success message here
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Connection test failed:', error);
      // Could show an error message here
    } finally {
      setTestingConnections((prev) => {
        const newSet = new Set(prev);
        newSet.delete(connectionId);
        return newSet;
      });
    }
  };

  const renderConnectionDetails = (connection: any) => {
    const { provider, config } = connection;

    switch (provider) {
      case 'gcs':
        return (
          <Typography variant="body2" color="text.secondary">
            Project ID: {config.projectId}
          </Typography>
        );
      case 'aws':
        return (
          <Typography variant="body2" color="text.secondary">
            Region: {config.region}
          </Typography>
        );
      case 'azure':
        return (
          <Typography variant="body2" color="text.secondary">
            Account: {config.accountName}
          </Typography>
        );
      default:
        return null;
    }
  };

  if (connectionsQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (connectionsQuery.isError) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">
          Failed to load connections:{' '}
          {connectionsQuery.error instanceof Error
            ? connectionsQuery.error.message
            : 'Unknown error'}
        </Alert>
      </Box>
    );
  }

  const connections = connectionsQuery.data || [];

  return (
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton
            onClick={() => connectionsQuery.refetch()}
            disabled={connectionsQuery.isRefetching}
          >
            <Refresh />
          </IconButton>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => navigate('/app/cloud-explorer/new-connection')}
          >
            Add Connection
          </Button>
        </Box>
      </Box>

      {connections.length === 0 ? (
        <Card>
          <CardHeader
            title="No connections found"
            subheader="Add a connection to get started with Cloud Explorer."
          />
          <CardContent>
            <Typography variant="body2" color="text.secondary" paragraph>
              Cloud Explorer allows you to connect to various cloud storage
              services and browse your buckets and files.
            </Typography>
          </CardContent>
          <CardActions>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => navigate('/app/cloud-explorer/new-connection')}
            >
              Add Connection
            </Button>
          </CardActions>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {connections.map((connection) => (
            <Grid item xs={12} md={6} lg={4} key={connection.id}>
              <Card>
                <CardHeader
                  avatar={getProviderIcon(connection.provider)}
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
                        label={getProviderName(connection.provider)}
                        size="small"
                        sx={{
                          bgcolor: getProviderColor(connection.provider),
                          color: 'white',
                          fontWeight: 'bold',
                        }}
                      />
                    </Box>
                  }
                />
                <CardContent sx={{ pt: 0 }}>
                  {renderConnectionDetails(connection)}
                  {connection.lastUsed && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      sx={{ mt: 1 }}
                    >
                      Last used:{' '}
                      {new Date(connection.lastUsed).toLocaleDateString()}
                    </Typography>
                  )}
                </CardContent>
                <CardActions sx={{ justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() =>
                        navigate(
                          `/app/cloud-explorer/dashboard?connectionId=${connection.id}`,
                        )
                      }
                    >
                      View Buckets
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Edit />}
                      onClick={() =>
                        navigate(
                          `/app/cloud-explorer/edit-connection/${connection.id}`,
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
                      onClick={() => handleTestConnection(connection.id)}
                      disabled={testingConnections.has(connection.id)}
                      startIcon={
                        testingConnections.has(connection.id) ? (
                          <CircularProgress size={16} />
                        ) : (
                          <Cable />
                        )
                      }
                    >
                      Test
                    </Button>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => {
                        setConnectionToDelete(connection.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Delete />
                    </IconButton>
                  </Box>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Connection</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this connection? This action cannot
            be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteConnection}
            color="error"
            variant="contained"
            disabled={deleteConnection.isLoading}
            startIcon={
              deleteConnection.isLoading ? <CircularProgress size={16} /> : null
            }
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
