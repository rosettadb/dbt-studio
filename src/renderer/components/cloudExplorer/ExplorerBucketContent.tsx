import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Breadcrumbs,
  IconButton,
  InputBase,
  CircularProgress,
  Alert,
  Tooltip,
} from '@mui/material';
import {
  Folder,
  InsertDriveFile,
  Image,
  ArticleOutlined,
  Home,
  ArrowBack,
  Download,
  Search,
  Clear,
  Refresh,
  NavigateNext,
  TableView,
} from '@mui/icons-material';
import {
  useConnection,
  useListObjects,
  useGetDownloadUrl,
  useAddRecentItem,
  usePreviewData,
} from '../../controllers/cloudExplorer.controller';
import type {
  CloudProvider,
  CloudStorageConfig,
} from '../../../types/frontend';
import { DataPreviewModal } from './DataPreviewModal';

interface ExplorerBucketContentProps {
  connectionId: string;
  bucketName: string;
}

export const ExplorerBucketContent: React.FC<ExplorerBucketContentProps> = ({
  connectionId,
  bucketName,
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const prefix = searchParams.get('prefix') || '';
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});
  const [loadingUrls, setLoadingUrls] = useState<Record<string, boolean>>({});
  const [previewModal, setPreviewModal] = useState<{
    open: boolean;
    fileName: string;
    objectName: string;
  }>({ open: false, fileName: '', objectName: '' });

  const connectionQuery = useConnection(connectionId);
  const connection = connectionQuery.data;

  const objectsQuery = useListObjects(
    connection?.provider as CloudProvider,
    connection?.config as CloudStorageConfig,
    bucketName,
    prefix,
    !!connection,
  );

  const getDownloadUrl = useGetDownloadUrl();
  const addRecentItem = useAddRecentItem();
  const previewData = usePreviewData();

  const objects = objectsQuery.data?.objects || [];

  // Filter objects based on search term using useMemo to prevent infinite re-renders
  const filteredObjects = useMemo(() => {
    if (searchTerm) {
      return objects.filter((obj) => {
        const name = obj.name.split('/').pop() || obj.name;
        return name.toLowerCase().includes(searchTerm.toLowerCase());
      });
    }
    return objects;
  }, [objects, searchTerm]);

  const pathParts = prefix.split('/').filter(Boolean);

  const handleNavigate = (path: string) => {
    const params = new URLSearchParams();
    if (path) {
      params.set('prefix', path);
    }
    setSearchParams(params);
    setSearchTerm('');

    // Add to recent items for directories
    if (connection && path) {
      const dirName = path.split('/').filter(Boolean).pop() || bucketName;
      addRecentItem.mutate({
        id: `${connectionId}-${bucketName}-${path}`,
        name: dirName,
        path: `${bucketName}/${path}`,
        connectionId,
        connectionName: connection.name,
        provider: connection.provider,
      });
    }
  };

  const handleDownload = async (objectName: string) => {
    if (downloadUrls[objectName]) {
      window.open(downloadUrls[objectName], '_blank');
      return;
    }

    if (!connection) return;

    try {
      setLoadingUrls((prev) => ({ ...prev, [objectName]: true }));

      const url = await getDownloadUrl.mutateAsync({
        provider: connection.provider,
        config: connection.config,
        bucketName,
        objectName,
      });

      if (url) {
        setDownloadUrls((prev) => ({ ...prev, [objectName]: url }));
        window.open(url, '_blank');

        // Add to recent items
        const fileName = objectName.split('/').pop() || objectName;
        addRecentItem.mutate({
          id: `${connectionId}-${bucketName}-${objectName}`,
          name: fileName,
          path: `${bucketName}/${objectName}`,
          connectionId,
          connectionName: connection.name,
          provider: connection.provider,
        });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error getting download URL:', error);
    } finally {
      setLoadingUrls((prev) => ({ ...prev, [objectName]: false }));
    }
  };

  const getFileIcon = (name: string, isDirectory: boolean) => {
    if (isDirectory) return <Folder color="action" />;

    const extension = name.split('.').pop()?.toLowerCase();

    if (
      ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(extension || '')
    ) {
      return <Image color="action" />;
    }

    if (['txt', 'md', 'json', 'csv', 'xml'].includes(extension || '')) {
      return <ArticleOutlined color="action" />;
    }

    return <InsertDriveFile color="action" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  // Check if file supports DuckDB preview
  const isPreviewSupported = (fileName: string): boolean => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    const supportedTypes = [
      'parquet',
      'csv',
      'json',
      'jsonl',
      'xlsx',
      'xls',
      'sqlite',
      'db',
      'arrow',
      'avro',
      'delta',
      'iceberg',
    ];
    return supportedTypes.includes(extension || '');
  };

  const handlePreview = async (objectName: string) => {
    if (!connection) return;

    const fileName = objectName.split('/').pop() || objectName;
    setPreviewModal({
      open: true,
      fileName,
      objectName,
    });

    // Trigger the preview data fetch
    previewData.mutate({
      provider: connection.provider,
      config: connection.config,
      bucketName,
      objectName,
      previewType: 'sample',
      limit: 100,
    });
  };

  const handleBackToBuckets = () => {
    navigate(`/app/cloud-explorer/buckets/${connectionId}`);
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
          onClick={handleBackToBuckets}
          sx={{ mt: 2 }}
        >
          Back to Buckets
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
        <Folder sx={{ fontSize: 28, color: 'primary.main' }} />
        <Typography variant="h4" component="h1">
          {bucketName}
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
            onClick={handleBackToBuckets}
          >
            Back to Buckets
          </Button>
        </Box>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={() => objectsQuery.refetch()}
          disabled={objectsQuery.isFetching}
        >
          Refresh
        </Button>
      </Box>

      <Card>
        <CardHeader
          title={
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Breadcrumbs
                separator={<NavigateNext fontSize="small" />}
                aria-label="breadcrumb"
              >
                <Button
                  variant="text"
                  size="small"
                  onClick={() => handleNavigate('')}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                  <Home fontSize="small" />
                  Home
                </Button>
                {pathParts.map((part, index) => {
                  const path = pathParts.slice(0, index + 1).join('/');
                  return (
                    <Button
                      key={path}
                      variant="text"
                      size="small"
                      onClick={() => handleNavigate(path)}
                    >
                      {part}
                    </Button>
                  );
                })}
              </Breadcrumbs>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Search color="action" />
                <InputBase
                  placeholder="Search in this location..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  sx={{ flex: 1 }}
                />
                {searchTerm && (
                  <IconButton size="small" onClick={() => setSearchTerm('')}>
                    <Clear />
                  </IconButton>
                )}
              </Box>
            </Box>
          }
        />
        <CardContent>
          {objectsQuery.isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          )}
          {objectsQuery.isError && (
            <Alert severity="error">
              Failed to load objects: {String(objectsQuery.error)}
            </Alert>
          )}
          {!objectsQuery.isLoading &&
            !objectsQuery.isError &&
            filteredObjects.length === 0 && (
              <Box sx={{ textAlign: 'center', p: 4 }}>
                <Typography color="text.secondary">
                  {searchTerm
                    ? 'No matching objects found'
                    : 'No objects found in this location'}
                </Typography>
              </Box>
            )}
          {!objectsQuery.isLoading &&
            !objectsQuery.isError &&
            filteredObjects.length > 0 && (
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell align="right">Size</TableCell>
                      <TableCell align="right">Modified</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredObjects.map((object) => {
                      const displayName =
                        object.name.split('/').pop() || object.name;
                      return (
                        <TableRow
                          key={object.name}
                          hover
                          sx={{
                            cursor: object.isDirectory ? 'pointer' : 'default',
                          }}
                          onClick={
                            object.isDirectory
                              ? () => handleNavigate(object.name)
                              : undefined
                          }
                        >
                          <TableCell>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                              }}
                            >
                              {getFileIcon(displayName, object.isDirectory)}
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: object.isDirectory
                                    ? 'bold'
                                    : 'normal',
                                  color: object.isDirectory
                                    ? 'primary.main'
                                    : 'text.primary',
                                }}
                              >
                                {displayName}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            {object.isDirectory
                              ? '-'
                              : formatFileSize(object.size)}
                          </TableCell>
                          <TableCell align="right">
                            {object.updated
                              ? formatDistanceToNow(new Date(object.updated), {
                                  addSuffix: true,
                                })
                              : '-'}
                          </TableCell>
                          <TableCell align="right">
                            {!object.isDirectory && (
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                {isPreviewSupported(object.name) && (
                                  <Tooltip title="Preview Data">
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePreview(object.name);
                                      }}
                                    >
                                      <TableView />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                <Tooltip title="Download">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownload(object.name);
                                    }}
                                    disabled={loadingUrls[object.name]}
                                  >
                                    {loadingUrls[object.name] ? (
                                      <CircularProgress size={20} />
                                    ) : (
                                      <Download />
                                    )}
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
        </CardContent>
      </Card>

      <DataPreviewModal
        open={previewModal.open}
        onClose={() =>
          setPreviewModal({ open: false, fileName: '', objectName: '' })
        }
        fileName={previewModal.fileName}
        previewResult={previewData.data || null}
        loading={previewData.isLoading}
        error={previewData.error ? String(previewData.error) : undefined}
      />
    </Box>
  );
};
