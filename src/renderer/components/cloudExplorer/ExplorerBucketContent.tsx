import React, { useState, useMemo, useEffect } from 'react';
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
import type { CloudProvider } from '../../../types/frontend';
import { InlineDataPreview } from './InlineDataPreview';
import useSecureStorage from '../../hooks/useSecureStorage';
import { formatFileSize, isPreviewSupported } from '../../utils/fileUtils';
import { DBTProjects } from '../sidebar/icons';
import { useGetSelectedProject } from '../../controllers';
import { projectsServices } from '../../services';

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
  const { data: project } = useGetSelectedProject();
  const prefix = searchParams.get('prefix') || '';
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});
  const [loadingUrls, setLoadingUrls] = useState<Record<string, boolean>>({});
  const [previewFile, setPreviewFile] = useState<{
    fileName: string;
    objectName: string;
    fileSize?: number;
  } | null>(null);
  const [secureConfig, setSecureConfig] = useState<any | null>(null);

  const connectionQuery = useConnection(connectionId);
  const connection = connectionQuery.data;
  const { getCloudAwsSecret, getCloudAzureKey, getCloudGcsCredential } =
    useSecureStorage();

  useEffect(() => {
    const fetchSecrets = async () => {
      if (!connection) {
        setSecureConfig(null);
        return;
      }
      const config = { ...connection.config };
      try {
        if (connection.provider === 'aws') {
          const secret = await getCloudAwsSecret(connection.name);
          (config as { secretAccessKey?: string }).secretAccessKey =
            secret || '';
        } else if (connection.provider === 'azure') {
          const key = await getCloudAzureKey(connection.name);
          (config as { accountKey?: string }).accountKey = key || '';
        } else if (connection.provider === 'gcs') {
          const cred = await getCloudGcsCredential(connection.name);
          (config as { credentials?: any }).credentials = cred || '';
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch secure credentials', e);
      }
      setSecureConfig(config);
    };
    fetchSecrets();
    // Only refetch if connection changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  const objectsQuery = useListObjects(
    connection?.provider as CloudProvider,
    secureConfig as any,
    bucketName,
    prefix,
    !!connection && !!secureConfig,
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

    if (!connection || !secureConfig) return;

    try {
      setLoadingUrls((prev) => ({ ...prev, [objectName]: true }));

      const url = await getDownloadUrl.mutateAsync({
        provider: connection.provider,
        config: secureConfig,
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

  const handleDownloadAsSeed = async (objectName: string) => {
    if (!project) {
      // TODO - need to show some alert or something here
      return;
    }
    if (downloadUrls[objectName]) {
      // window.open(downloadUrls[objectName], '_blank');
      await projectsServices.downloadSeed(downloadUrls[objectName], project);
      return;
    }

    if (!connection || !secureConfig) return;

    try {
      setLoadingUrls((prev) => ({ ...prev, [objectName]: true }));

      const url = await getDownloadUrl.mutateAsync({
        provider: connection.provider,
        config: secureConfig,
        bucketName,
        objectName,
      });
      if (url) {
        setDownloadUrls((prev) => ({ ...prev, [objectName]: url }));
        await projectsServices.downloadSeed(url, project);
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

  const handlePreview = async (objectName: string) => {
    if (!connection || !secureConfig) return;

    const fileName = objectName.split('/').pop() || objectName;
    const targetObject = objects.find((obj) => obj.name === objectName);

    setPreviewFile({
      fileName,
      objectName,
      fileSize: targetObject?.size,
    });

    // Trigger the preview data fetch
    previewData.mutate({
      provider: connection.provider,
      config: secureConfig,
      bucketName,
      objectName,
      previewType: 'sample',
      limit: 100,
    });
  };

  const handleBackToBuckets = () => {
    navigate(`/app/cloud-explorer/buckets/${connectionId}`);
  };

  const handleBackToFiles = () => {
    setPreviewFile(null);
    previewData.reset();
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

  // If we're previewing a file, show the inline preview instead
  if (previewFile) {
    return (
      <InlineDataPreview
        fileName={previewFile.fileName}
        previewResult={previewData.data || null}
        loading={previewData.isLoading}
        error={previewData.error ? String(previewData.error) : undefined}
        onBack={handleBackToFiles}
        fileSize={previewFile.fileSize}
      />
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
                              : formatFileSize(object.size, {
                                  showZeroAsNA: false,
                                })}
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
                                {project && (
                                  <Tooltip title="Download as seed">
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownloadAsSeed(object.name);
                                      }}
                                      disabled={loadingUrls[object.name]}
                                    >
                                      {loadingUrls[object.name] ? (
                                        <CircularProgress size={20} />
                                      ) : (
                                        <DBTProjects />
                                      )}
                                    </IconButton>
                                  </Tooltip>
                                )}
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
    </Box>
  );
};
