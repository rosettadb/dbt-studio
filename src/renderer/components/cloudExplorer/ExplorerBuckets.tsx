import React, { useEffect, useState, useMemo } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  InputBase,
  TableSortLabel,
  Tooltip,
} from '@mui/material';
import {
  FolderOpen,
  ArrowBack,
  Refresh,
  OpenInNew,
  Search,
  Clear,
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
import useSecureStorage from '../../hooks/useSecureStorage';
import { ViewToggle } from './ViewToggle';
import bucketIcon from '../../../../assets/icons/bucket-blue.png';

interface ExplorerBucketsProps {
  connectionId: string;
}

export const ExplorerBuckets: React.FC<ExplorerBucketsProps> = ({
  connectionId,
}) => {
  const navigate = useNavigate();
  const connectionQuery = useConnection(connectionId);
  const connection = connectionQuery.data;

  // View state management
  const [view, setView] = useState<'list' | 'card'>('list');

  // Search, filter, and sort state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'created'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Load view preference from localStorage
  useEffect(() => {
    const savedView = localStorage.getItem('cloudExplorer.bucketsView');
    if (savedView === 'list' || savedView === 'card') {
      setView(savedView);
    }
  }, []);

  // Save view preference to localStorage
  const handleViewChange = (newView: 'list' | 'card') => {
    setView(newView);
    localStorage.setItem('cloudExplorer.bucketsView', newView);
  };

  // Secure storage logic
  const {
    getCloudAwsSecret,
    getCloudAzureKey,
    getCloudGcsCredential,
    getCloudMinioSecret,
    getCloudR2Secret,
    getCloudB2Secret,
    getCloudRustfsSecret,
  } = useSecureStorage();
  const [secureConfig, setSecureConfig] = useState<any | null>(null);
  const [credentialsMissing, setCredentialsMissing] = useState(false);

  useEffect(() => {
    const fetchSecrets = async () => {
      if (!connection) {
        setSecureConfig(null);
        setCredentialsMissing(false);
        return;
      }
      const config = { ...connection.config };
      let missing = false;
      try {
        if (connection.provider === 'aws') {
          const secret = await getCloudAwsSecret(connection.id);
          if (secret === null) {
            missing = true;
          } else {
            (config as { secretAccessKey?: string }).secretAccessKey = secret;
          }
        } else if (connection.provider === 'azure') {
          const key = await getCloudAzureKey(connection.id);
          if (key === null) {
            missing = true;
          } else {
            (config as { accountKey?: string }).accountKey = key;
          }
        } else if (connection.provider === 'gcs') {
          const cred = await getCloudGcsCredential(connection.id);
          if (cred === null) {
            missing = true;
          } else {
            (config as { credentials?: any }).credentials = cred;
          }
        } else if (connection.provider === 'minio') {
          const secret = await getCloudMinioSecret(connection.id);
          if (secret === null) {
            missing = true;
          } else {
            (config as { secretAccessKey?: string }).secretAccessKey = secret;
          }
        } else if (connection.provider === 'cloudflare-r2') {
          const secret = await getCloudR2Secret(connection.id);
          if (secret === null) {
            missing = true;
          } else {
            (config as { secretAccessKey?: string }).secretAccessKey = secret;
          }
        } else if (connection.provider === 'backblaze-b2') {
          const secret = await getCloudB2Secret(connection.id);
          if (secret === null) {
            missing = true;
          } else {
            (config as { applicationKey?: string }).applicationKey = secret;
          }
        } else if (connection.provider === 'rustfs') {
          const secret = await getCloudRustfsSecret(connection.id);
          if (secret === null) {
            missing = true;
          } else {
            (config as { secretAccessKey?: string }).secretAccessKey = secret;
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error fetching secrets:', e);
      }
      setCredentialsMissing(missing);
      setSecureConfig(missing ? null : config);
    };
    fetchSecrets();
  }, [connection]);

  const bucketsQuery = useListBuckets(
    connection?.provider as CloudProvider,
    secureConfig as CloudStorageConfig,
    !!connection && !!secureConfig && !credentialsMissing,
  );

  const buckets = bucketsQuery.data || [];

  // Filter, search, and sort buckets
  const filteredAndSortedBuckets = useMemo(() => {
    let result = [...buckets];

    // Apply search filter
    if (searchTerm) {
      result = result.filter((bucket) =>
        bucket.name.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          // Size not available, keep original order
          comparison = 0;
          break;
        case 'created': {
          const dateA = a.created ? new Date(a.created).getTime() : 0;
          const dateB = b.created ? new Date(b.created).getTime() : 0;
          comparison = dateA - dateB;
          break;
        }
        default:
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [buckets, searchTerm, sortBy, sortOrder]);

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

  const handleSort = (column: 'name' | 'size' | 'created') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const renderListView = () => (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>
              <TableSortLabel
                active={sortBy === 'name'}
                direction={sortBy === 'name' ? sortOrder : 'asc'}
                onClick={() => handleSort('name')}
              >
                Name
              </TableSortLabel>
            </TableCell>
            <TableCell>Objects</TableCell>
            <TableCell>
              <TableSortLabel
                active={sortBy === 'size'}
                direction={sortBy === 'size' ? sortOrder : 'asc'}
                onClick={() => handleSort('size')}
              >
                Size
              </TableSortLabel>
            </TableCell>
            <TableCell>Access</TableCell>
            <TableCell>
              <TableSortLabel
                active={sortBy === 'created'}
                direction={sortBy === 'created' ? sortOrder : 'asc'}
                onClick={() => handleSort('created')}
              >
                Created
              </TableSortLabel>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredAndSortedBuckets.map((bucket) => (
            <TableRow
              key={bucket.name}
              hover
              sx={{ cursor: 'pointer' }}
              onClick={() => handleBucketClick(bucket.name)}
            >
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <img
                    src={bucketIcon}
                    alt="bucket"
                    style={{ width: 24, height: 24, objectFit: 'contain' }}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {bucket.name}
                  </Typography>
                </Box>
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {bucket.objectCount !== undefined ? bucket.objectCount : '-'}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {bucket.size !== undefined
                    ? `${(bucket.size / (1024 * 1024)).toFixed(2)} MiB`
                    : '-'}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  R/W
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {bucket.created
                    ? new Date(bucket.created).toLocaleDateString()
                    : '-'}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderCardView = () => (
    <Grid container spacing={2}>
      {filteredAndSortedBuckets.map((bucket) => (
        <Grid item xs={12} md={6} lg={4} key={bucket.name}>
          <Card sx={{ boxShadow: 3, '&:hover': { boxShadow: 6 } }}>
            <CardHeader
              avatar={
                <img
                  src={bucketIcon}
                  alt="bucket"
                  style={{ width: 28, height: 28, objectFit: 'contain' }}
                />
              }
              title={
                <Tooltip title={bucket.name} arrow>
                  <span>{bucket.name}</span>
                </Tooltip>
              }
              titleTypographyProps={{
                variant: 'h6',
                noWrap: true,
                sx: {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              }}
              sx={{
                '& .MuiCardHeader-content': {
                  overflow: 'hidden',
                  minWidth: 0,
                },
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
  );

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
          justifyContent: 'space-between',
          mb: 2,
          borderBottom: 1,
          borderColor: 'divider',
          pb: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton
            onClick={handleBackToConnections}
            sx={{ color: 'text.secondary' }}
          >
            <ArrowBack />
          </IconButton>
          {getProviderIcon(connection.provider)}
          <Typography variant="h4" component="h1">
            {connection.name}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ViewToggle view={view} onViewChange={handleViewChange} />
          <IconButton
            onClick={() => bucketsQuery.refetch()}
            disabled={bucketsQuery.isFetching}
            sx={{ color: 'text.secondary' }}
          >
            <Refresh />
          </IconButton>
        </Box>
      </Box>

      {/* Search and Filter Bar */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          mb: 2,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flex: 1,
            minWidth: 250,
          }}
        >
          <InputBase
            placeholder="Search buckets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            startAdornment={
              <Search sx={{ color: 'text.secondary', mr: 0.5, fontSize: 18 }} />
            }
            endAdornment={
              searchTerm ? (
                <IconButton
                  size="small"
                  onClick={() => setSearchTerm('')}
                  sx={{ p: 0.5 }}
                >
                  <Clear fontSize="small" />
                </IconButton>
              ) : null
            }
            sx={{
              flex: 1,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              px: 1,
              py: 0.25,
              fontSize: '0.875rem',
              height: 32,
            }}
          />
        </Box>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontSize: '0.75rem' }}
        >
          {filteredAndSortedBuckets.length} of {buckets.length} bucket(s)
        </Typography>
      </Box>

      {bucketsQuery.isLoading && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Objects</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Access</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Skeleton variant="circular" width={24} height={24} />
                      <Skeleton variant="text" width={150} />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Skeleton variant="text" width={40} />
                  </TableCell>
                  <TableCell>
                    <Skeleton variant="text" width={60} />
                  </TableCell>
                  <TableCell>
                    <Skeleton variant="text" width={40} />
                  </TableCell>
                  <TableCell>
                    <Skeleton variant="text" width={100} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {bucketsQuery.isError && (
        <Alert severity="error">
          Failed to load buckets: {String(bucketsQuery.error)}
        </Alert>
      )}
      {!bucketsQuery.isLoading &&
        !bucketsQuery.isError &&
        !credentialsMissing &&
        buckets.length === 0 && (
          <Box sx={{ textAlign: 'center', p: 4 }}>
            <Typography color="text.secondary">No buckets found</Typography>
          </Box>
        )}

      {!bucketsQuery.isLoading &&
        !bucketsQuery.isError &&
        buckets.length > 0 &&
        filteredAndSortedBuckets.length === 0 && (
          <Box sx={{ textAlign: 'center', p: 4 }}>
            <Typography color="text.secondary">
              No buckets match your search or filter criteria
            </Typography>
          </Box>
        )}

      {credentialsMissing && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              variant="outlined"
              onClick={() =>
                navigate(`/app/cloud-explorer/edit-connection/${connectionId}`)
              }
            >
              Edit Source
            </Button>
          }
        >
          Credentials for this connection are missing from secure storage.
        </Alert>
      )}
      {!bucketsQuery.isLoading &&
        !bucketsQuery.isError &&
        filteredAndSortedBuckets.length > 0 &&
        (view === 'list' ? renderListView() : renderCardView())}
    </Box>
  );
};
