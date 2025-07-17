import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Grid,
  Button,
} from '@mui/material';
import {
  Cloud,
  Dataset,
  Storage,
  AccessTime,
  Description,
  FolderOpen,
  Settings,
  Add,
} from '@mui/icons-material';
import {
  useConnections,
  useRecentItems,
  useListBuckets,
} from '../../controllers/cloudExplorer.controller';
import type {
  CloudProvider,
  CloudStorageConfig,
} from '../../../types/frontend';

interface ExplorerDashboardProps {
  selectedConnectionId?: string;
}

export const ExplorerDashboard = ({
  selectedConnectionId,
}: ExplorerDashboardProps) => {
  const navigate = useNavigate();

  const connectionsQuery = useConnections();
  const recentItemsQuery = useRecentItems();

  const connections = connectionsQuery.data || [];
  const recentItems = recentItemsQuery.data || [];

  // Get selected connection
  const selectedConnection = selectedConnectionId
    ? connections.find((c) => c.id === selectedConnectionId)
    : null;

  // Get buckets for selected connection
  const bucketsQuery = useListBuckets(
    selectedConnection?.provider as CloudProvider,
    selectedConnection?.config as CloudStorageConfig,
    !!selectedConnection,
  );

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

  const buckets = bucketsQuery.data || [];

  const recentFiles = useMemo(() => {
    return recentItems.filter((item) => !item.path.endsWith('/')).slice(0, 5);
  }, [recentItems]);

  const recentDirectories = useMemo(() => {
    return recentItems.filter((item) => item.path.endsWith('/')).slice(0, 5);
  }, [recentItems]);

  return (
    <Box sx={{ p: 2 }}>
      <Grid container spacing={3}>
        {/* Header */}
        <Grid item xs={12}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              mb: 3,
            }}
          >
            <Button
              variant="outlined"
              startIcon={<Settings />}
              onClick={() => navigate('/app/cloud-explorer/connections')}
            >
              Manage Connections
            </Button>
          </Box>
        </Grid>

        {/* Statistics Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
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
                  <Dataset sx={{ color: 'text.secondary', fontSize: 20 }} />
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
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
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
                    Total Buckets
                  </Typography>
                  <FolderOpen sx={{ color: 'text.secondary', fontSize: 20 }} />
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
                {buckets.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {buckets.length === 1 ? 'Bucket' : 'Buckets'} available
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
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
                {Object.keys(connectionTypes).length}
              </Typography>
              <Box
                sx={{
                  mt: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.5,
                }}
              >
                {connectionTypes.gcs && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Cloud sx={{ fontSize: 16 }} />
                    <Typography variant="body2" color="text.secondary">
                      {connectionTypes.gcs} Google Cloud Storage{' '}
                      {connectionTypes.gcs === 1 ? 'connection' : 'connections'}
                    </Typography>
                  </Box>
                )}
                {connectionTypes.aws && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Dataset sx={{ fontSize: 16 }} />
                    <Typography variant="body2" color="text.secondary">
                      {connectionTypes.aws} Amazon S3{' '}
                      {connectionTypes.aws === 1 ? 'connection' : 'connections'}
                    </Typography>
                  </Box>
                )}
                {connectionTypes.azure && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Cloud sx={{ fontSize: 16 }} />
                    <Typography variant="body2" color="text.secondary">
                      {connectionTypes.azure} Azure Blob Storage{' '}
                      {connectionTypes.azure === 1
                        ? 'connection'
                        : 'connections'}
                    </Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
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
                {recentItems.length}{' '}
                {recentItems.length === 1 ? 'item' : 'items'} accessed recently
              </Typography>
              {recentItems.length > 0 && (
                <Button
                  variant="text"
                  size="small"
                  onClick={() => navigate('/app/cloud-explorer/recent')}
                  sx={{ mt: 1, p: 0, minWidth: 'auto' }}
                >
                  View all recent items
                </Button>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Files and Directories */}
        <Grid item xs={12} md={6}>
          <Card>
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
                      Recent Files
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Recently accessed files
                    </Typography>
                  </Box>
                  <Description sx={{ color: 'text.secondary', fontSize: 24 }} />
                </Box>
              }
            />
            <CardContent>
              {recentFiles.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No recent files
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {recentFiles.map((item) => (
                    <Box
                      key={item.id}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <Description
                          sx={{ fontSize: 16, color: 'text.secondary' }}
                        />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {item.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.connectionName} / {item.path}
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
                  {recentFiles.length > 0 && (
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() =>
                        navigate('/app/cloud-explorer/recent?filter=files')
                      }
                      fullWidth
                      sx={{ mt: 1 }}
                    >
                      View All Files
                    </Button>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
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
                      Recent Directories
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Recently accessed directories
                    </Typography>
                  </Box>
                  <FolderOpen sx={{ color: 'text.secondary', fontSize: 24 }} />
                </Box>
              }
            />
            <CardContent>
              {recentDirectories.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No recent directories
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {recentDirectories.map((item) => (
                    <Box
                      key={item.id}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <FolderOpen
                          sx={{ fontSize: 16, color: 'text.secondary' }}
                        />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {item.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.connectionName} / {item.path}
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
                  {recentDirectories.length > 0 && (
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() =>
                        navigate(
                          '/app/cloud-explorer/recent?filter=directories',
                        )
                      }
                      fullWidth
                      sx={{ mt: 1 }}
                    >
                      View All Directories
                    </Button>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Welcome Card for New Users */}
        {connections.length === 0 && (
          <Grid item xs={12}>
            <Card>
              <CardHeader
                title={
                  <Typography variant="h6" component="h2">
                    Welcome to Cloud Explorer
                  </Typography>
                }
                subheader="Get started by adding your first connection"
              />
              <CardContent>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 3 }}
                >
                  Cloud Explorer allows you to connect to various cloud storage
                  services and browse your buckets and files.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={() =>
                    navigate('/app/cloud-explorer/connections/new')
                  }
                >
                  Add Connection
                </Button>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
};
