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
  Cable,
  Refresh,
  Visibility,
  DeleteOutline,
} from '@mui/icons-material';

import { CloudProvider } from '../../../types/frontend';
import {
  useGetCloudConnections,
  useDeleteBucketConnection,
} from '../../controllers';
import { cloudStorageImages } from '../../../../assets/connectionIcons';

export const ExplorerConnections: React.FC = () => {
  const navigate = useNavigate();
  const connectionsQuery = useGetCloudConnections();
  const deleteConnection = useDeleteBucketConnection();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState<string | null>(
    null,
  );

  const getProviderIcon = (provider: CloudProvider) => {
    const iconSrc = cloudStorageImages[provider];
    if (iconSrc) {
      return (
        <img
          src={iconSrc}
          alt={provider}
          style={{
            width: 48,
            height: 48,
            objectFit: 'contain',
          }}
        />
      );
    }
    return <Cable />;
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
            Sources
          </Typography>
          <Cable sx={{ color: 'text.secondary', fontSize: 28 }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton
            onClick={() => connectionsQuery.refetch()}
            disabled={connectionsQuery.isRefetching}
          >
            <Refresh />
          </IconButton>
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
              Add Source
            </Button>
          </CardActions>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {connections.map((connection) => (
            <Grid item xs={12} md={6} lg={4} key={connection.id}>
              <Card
                sx={{
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    transform: 'translateY(-2px)',
                  },
                }}
              >
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
                      startIcon={<Visibility />}
                      onClick={() =>
                        navigate(`/app/cloud-explorer/buckets/${connection.id}`)
                      }
                    >
                      Explore
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
                        setConnectionToDelete(connection.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      Delete
                    </Button>
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
