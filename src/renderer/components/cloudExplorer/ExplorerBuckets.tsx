import React from 'react';
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
  CircularProgress,
  Alert,
  Skeleton,
} from '@mui/material';
import {
  FolderOpen,
  ArrowBack,
  Refresh,
  OpenInNew,
  Archive,
} from '@mui/icons-material';
import {
  useConnection,
  useListBuckets,
} from '../../controllers/cloudExplorer.controller';
import type {
  CloudProvider,
  CloudStorageConfig,
} from '../../../types/frontend';
import { cloudStorageImages } from '../../../../assets/connectionIcons';

interface ExplorerBucketsProps {
  connectionId: string;
}

export const ExplorerBuckets: React.FC<ExplorerBucketsProps> = ({
  connectionId,
}) => {
  const navigate = useNavigate();
  const connectionQuery = useConnection(connectionId);
  const connection = connectionQuery.data;

  const bucketsQuery = useListBuckets(
    connection?.provider as CloudProvider,
    connection?.config as CloudStorageConfig,
    !!connection,
  );

  const buckets = bucketsQuery.data || [];

  const getProviderIcon = (provider: CloudProvider) => {
    const iconSrc = cloudStorageImages[provider];
    if (iconSrc) {
      return (
        <img
          src={iconSrc}
          alt={provider}
          style={{
            width: 36,
            height: 36,
            objectFit: 'contain',
          }}
        />
      );
    }
    return <FolderOpen sx={{ fontSize: 28, color: 'primary.main' }} />;
  };

  const handleBucketClick = (bucketName: string) => {
    navigate(`/app/cloud-explorer/bucket/${connectionId}/${bucketName}`);
  };

  const handleBackToConnections = () => {
    navigate('/app/cloud-explorer/connections');
  };

  if (connectionQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (connectionQuery.isError || !connection) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Connection not found or failed to load</Alert>
        <Button
          variant="outlined"
          startIcon={<ArrowBack />}
          onClick={handleBackToConnections}
          sx={{ mt: 2 }}
        >
          Back to Connections
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      {/* Page Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mb: 3,
          borderBottom: 1,
          borderColor: 'divider',
          pb: 2,
        }}
      >
        {getProviderIcon(connection.provider)}
        <Typography variant="h4" component="h1">
          {connection.name}
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBack />}
            onClick={handleBackToConnections}
          >
            Back to Connections
          </Button>
        </Box>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={() => bucketsQuery.refetch()}
          disabled={bucketsQuery.isFetching}
        >
          Refresh
        </Button>
      </Box>

      {/* Section Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Select a bucket to browse its contents
        </Typography>
      </Box>

      {bucketsQuery.isLoading && (
        <Grid container spacing={2}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid item xs={12} md={6} lg={4} key={i}>
              <Card sx={{ boxShadow: 3 }}>
                <CardHeader>
                  <Skeleton variant="text" width="75%" />
                </CardHeader>
                <CardContent>
                  <Skeleton variant="text" width="50%" />
                  <Skeleton variant="text" width="60%" />
                </CardContent>
                <CardActions>
                  <Skeleton variant="rectangular" width={80} height={36} />
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
      {bucketsQuery.isError && (
        <Alert severity="error">
          Failed to load buckets: {String(bucketsQuery.error)}
        </Alert>
      )}
      {!bucketsQuery.isLoading &&
        !bucketsQuery.isError &&
        buckets.length === 0 && (
          <Box sx={{ textAlign: 'center', p: 4 }}>
            <Typography color="text.secondary">No buckets found</Typography>
          </Box>
        )}
      {!bucketsQuery.isLoading &&
        !bucketsQuery.isError &&
        buckets.length > 0 && (
          <Grid container spacing={2}>
            {buckets.map((bucket) => (
              <Grid item xs={12} md={6} lg={4} key={bucket.name}>
                <Card sx={{ boxShadow: 3, '&:hover': { boxShadow: 6 } }}>
                  <CardHeader
                    avatar={<Archive sx={{ color: 'text.secondary' }} />}
                    title={bucket.name}
                    titleTypographyProps={{
                      variant: 'h6',
                      noWrap: true,
                      title: bucket.name,
                    }}
                  />
                  <CardContent>
                    {bucket.location && (
                      <Typography variant="body2" color="text.secondary">
                        Location: {bucket.location}
                      </Typography>
                    )}
                    {bucket.created && (
                      <Typography variant="body2" color="text.secondary">
                        Created: {new Date(bucket.created).toLocaleDateString()}
                      </Typography>
                    )}
                  </CardContent>
                  <CardActions>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<OpenInNew />}
                      onClick={() => handleBucketClick(bucket.name)}
                      fullWidth
                    >
                      Browse
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
    </Box>
  );
};
