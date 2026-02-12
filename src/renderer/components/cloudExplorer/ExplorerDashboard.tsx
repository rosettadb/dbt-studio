import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Button,
} from '@mui/material';
import {
  Storage,
  AccessTime,
  Description,
  FolderOpen,
  Settings,
  Cloud,
  Dashboard,
} from '@mui/icons-material';
import {
  useGetCloudConnections,
  useRecentItems,
} from '../../controllers/cloudExplorer.controller';
import type { CloudProvider } from '../../../types/frontend';
import { cloudStorageImages } from '../../../../assets/connectionIcons';

export const ExplorerDashboard = () => {
  const navigate = useNavigate();

  const connectionsQuery = useGetCloudConnections();
  const recentItemsQuery = useRecentItems();

  const connections = connectionsQuery.data || [];
  const recentItems = recentItemsQuery.data || [];

  // Helper function to truncate long paths
  const truncatePath = (path: string, maxLength: number = 50) => {
    if (path.length <= maxLength) return path;
    const parts = path.split('/');
    if (parts.length <= 2) return path;
    return `.../${parts.slice(-2).join('/')}`;
  };

  // Helper function to get provider icons
  const getProviderIcon = (provider: CloudProvider) => {
    const iconSrc = cloudStorageImages[provider];
    if (iconSrc) {
      return (
        <img
          src={iconSrc}
          alt={provider}
          style={{
            width: 16,
            height: 16,
            objectFit: 'contain',
          }}
        />
      );
    }
    return <Storage sx={{ fontSize: 16 }} />;
  };

  // Calculate statistics
  const connectionTypes = useMemo(() => {
    return connections.reduce(
      (acc, connection) => {
        acc[connection.provider] = (acc[connection.provider] || 0) + 1;
        return acc;
      },
      {} as Record<CloudProvider, number>,
    );
  }, [connections]);

  // Handle navigation to recent items
  const handleRecentItemClick = (item: any) => {
    const pathParts = item.path.split('/');

    // If path doesn't contain bucket info, navigate to buckets list
    if (pathParts.length < 2) {
      navigate(`/app/cloud-explorer/buckets/${item.connectionId}`);
      return;
    }

    const bucketName = pathParts[0];
    const relativePath = pathParts.slice(1).join('/');

    // Navigate to the proper cloud explorer location
    if (item.path.endsWith('/')) {
      // Directory - navigate to the bucket with the directory prefix
      navigate(
        `/app/cloud-explorer/bucket/${item.connectionId}/${bucketName}${relativePath ? `?prefix=${encodeURIComponent(relativePath)}` : ''}`,
      );
    } else {
      // File - navigate to the directory containing the file
      const directory = relativePath.split('/').slice(0, -1).join('/');
      const directoryWithSlash = directory ? `${directory}/` : '';
      navigate(
        `/app/cloud-explorer/bucket/${item.connectionId}/${bucketName}${directoryWithSlash ? `?prefix=${encodeURIComponent(directoryWithSlash)}` : ''}`,
      );
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Header with title and manage connections button */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
            Dashboard
          </Typography>
          <Dashboard sx={{ color: 'text.secondary', fontSize: 28 }} />
        </Box>
        <Button
          variant="outlined"
          startIcon={<Settings />}
          onClick={() => navigate('/app/cloud-explorer/connections')}
        >
          Manage Connections
        </Button>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 3,
        }}
      >
        {/* Statistics Cards */}
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
            title={
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography variant="subtitle2" color="text.secondary">
                  Total Connections
                </Typography>
                <Storage sx={{ color: 'text.secondary', fontSize: 20 }} />
              </Box>
            }
            sx={{ pb: 1 }}
          />
          <CardContent sx={{ pt: 0 }}>
            <Typography
              variant="h4"
              component="div"
              sx={{ fontWeight: 'bold' }}
            >
              {connections.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {connections.length === 1 ? 'Connection' : 'Connections'}{' '}
              configured
            </Typography>
          </CardContent>
        </Card>

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
            title={
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography variant="subtitle2" color="text.secondary">
                  Storage Types
                </Typography>
                <Cloud sx={{ color: 'text.secondary', fontSize: 20 }} />
              </Box>
            }
            sx={{ pb: 1 }}
          />
          <CardContent sx={{ pt: 0 }}>
            <Typography
              variant="h4"
              component="div"
              sx={{ fontWeight: 'bold' }}
            >
              {Object.keys(connectionTypes).length}
            </Typography>
            <Box
              sx={{
                mt: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                maxHeight: 150,
                overflowY: 'auto',
                '&::-webkit-scrollbar': {
                  width: '6px',
                },
                '&::-webkit-scrollbar-track': {
                  background: 'transparent',
                },
                '&::-webkit-scrollbar-thumb': {
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '3px',
                },
                '&::-webkit-scrollbar-thumb:hover': {
                  background: 'rgba(0,0,0,0.3)',
                },
              }}
            >
              {connectionTypes.aws && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {getProviderIcon('aws')}
                  <Typography variant="body2" color="text.secondary">
                    {connectionTypes.aws} Amazon S3{' '}
                    {connectionTypes.aws === 1 ? 'connection' : 'connections'}
                  </Typography>
                </Box>
              )}
              {connectionTypes.azure && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {getProviderIcon('azure')}
                  <Typography variant="body2" color="text.secondary">
                    {connectionTypes.azure} Azure Blob Storage{' '}
                    {connectionTypes.azure === 1 ? 'connection' : 'connections'}
                  </Typography>
                </Box>
              )}
              {connectionTypes.gcs && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {getProviderIcon('gcs')}
                  <Typography variant="body2" color="text.secondary">
                    {connectionTypes.gcs} Google Cloud Storage{' '}
                    {connectionTypes.gcs === 1 ? 'connection' : 'connections'}
                  </Typography>
                </Box>
              )}
              {connectionTypes.minio && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {getProviderIcon('minio')}
                  <Typography variant="body2" color="text.secondary">
                    {connectionTypes.minio} MinIO{' '}
                    {connectionTypes.minio === 1 ? 'connection' : 'connections'}
                  </Typography>
                </Box>
              )}
              {connectionTypes['cloudflare-r2'] && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {getProviderIcon('cloudflare-r2')}
                  <Typography variant="body2" color="text.secondary">
                    {connectionTypes['cloudflare-r2']} Cloudflare R2{' '}
                    {connectionTypes['cloudflare-r2'] === 1
                      ? 'connection'
                      : 'connections'}
                  </Typography>
                </Box>
              )}
              {connectionTypes['backblaze-b2'] && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {getProviderIcon('backblaze-b2')}
                  <Typography variant="body2" color="text.secondary">
                    {connectionTypes['backblaze-b2']} Backblaze B2{' '}
                    {connectionTypes['backblaze-b2'] === 1
                      ? 'connection'
                      : 'connections'}
                  </Typography>
                </Box>
              )}
              {connectionTypes.rustfs && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {getProviderIcon('rustfs')}
                  <Typography variant="body2" color="text.secondary">
                    {connectionTypes.rustfs} rustfs{' '}
                    {connectionTypes.rustfs === 1
                      ? 'connection'
                      : 'connections'}
                  </Typography>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>

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
            title={
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography variant="subtitle2" color="text.secondary">
                  Recent Activity
                </Typography>
                <AccessTime sx={{ color: 'text.secondary', fontSize: 20 }} />
              </Box>
            }
            sx={{ pb: 1 }}
          />
          <CardContent sx={{ pt: 0 }}>
            <Typography
              variant="h4"
              component="div"
              sx={{ fontWeight: 'bold' }}
            >
              {recentItems.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {recentItems.length} {recentItems.length === 1 ? 'item' : 'items'}{' '}
              accessed recently
            </Typography>
            {recentItems.length > 0 && (
              <Button
                variant="text"
                size="small"
                onClick={() => navigate('/app/cloud-explorer/recent-items')}
                sx={{ mt: 1, p: 0, minWidth: 'auto', textTransform: 'none' }}
              >
                View all recent items →
              </Button>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Recent Activity Section */}
      {recentItems.length > 0 && (
        <Card
          sx={{
            mt: 3,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              transform: 'translateY(-2px)',
            },
          }}
        >
          <CardHeader
            title={
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box>
                  <Typography variant="h6" component="h2">
                    Recent Activity
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Recently accessed files and directories
                  </Typography>
                </Box>
                <AccessTime sx={{ color: 'text.secondary', fontSize: 24 }} />
              </Box>
            }
          />
          <CardContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {recentItems.slice(0, 10).map((item) => (
                <Box
                  key={item.id}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    p: 1,
                    borderRadius: 1,
                    '&:hover': {
                      backgroundColor: 'action.hover',
                    },
                  }}
                  onClick={() => handleRecentItemClick(item)}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {item.path.endsWith('/') ? (
                      <FolderOpen
                        sx={{ fontSize: 16, color: 'text.secondary' }}
                      />
                    ) : (
                      <Description
                        sx={{ fontSize: 16, color: 'text.secondary' }}
                      />
                    )}
                    <Box>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '300px',
                        }}
                        title={item.name}
                      >
                        {item.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block',
                          maxWidth: '400px',
                        }}
                        title={`${item.connectionName} / ${item.path}`}
                      >
                        {item.connectionName} / {truncatePath(item.path)}
                      </Typography>
                    </Box>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {formatDistanceToNow(new Date(item.accessedAt), {
                      addSuffix: true,
                    })}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Button
              variant="text"
              size="small"
              onClick={() => navigate('/app/cloud-explorer/recent-items')}
              fullWidth
              sx={{ mt: 2, textTransform: 'none' }}
            >
              View All Recent Items →
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Welcome Card for New Users */}
      {connections.length === 0 && (
        <Box sx={{ mt: 3 }}>
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
              title={
                <Typography variant="h6" component="h2">
                  Welcome to Cloud Explorer
                </Typography>
              }
              subheader="Get started by adding your first connection"
            />
            <CardContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Cloud Explorer allows you to connect to various cloud storage
                services and browse your buckets and files.
              </Typography>
              <Button
                variant="contained"
                color="primary"
                startIcon={<Cloud />}
                onClick={() => navigate('/app/cloud-explorer/new-connection')}
              >
                New Source
              </Button>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
};
