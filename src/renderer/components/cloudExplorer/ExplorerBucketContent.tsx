import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-toastify';
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TableSortLabel,
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
import bucketIcon from '../../../../assets/icons/bucket-blue.png';

interface ExplorerBucketContentProps {
  connectionId: string;
  bucketName: string;
}

// Utility function to check if file is CSV format for dbt seed compatibility
const isCSVFile = (fileName: string): boolean => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension === 'csv';
};

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

  // Sort and filter state
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const connectionQuery = useConnection(connectionId);
  const connection = connectionQuery.data;
  const {
    getCloudAwsSecret,
    getCloudAzureKey,
    getCloudGcsCredential,
    getCloudMinioSecret,
    getCloudR2Secret,
    getCloudB2Secret,
    getCloudRustfsSecret,
  } = useSecureStorage();

  useEffect(() => {
    const fetchSecrets = async () => {
      if (!connection) {
        setSecureConfig(null);
        return;
      }
      const config = { ...connection.config };
      try {
        if (connection.provider === 'aws') {
          const secret = await getCloudAwsSecret(connection.id);
          (config as { secretAccessKey?: string }).secretAccessKey =
            secret || '';
        } else if (connection.provider === 'azure') {
          const key = await getCloudAzureKey(connection.id);
          (config as { accountKey?: string }).accountKey = key || '';
        } else if (connection.provider === 'gcs') {
          const cred = await getCloudGcsCredential(connection.id);
          (config as { credentials?: any }).credentials = cred || '';
        } else if (connection.provider === 'minio') {
          const secret = await getCloudMinioSecret(connection.id);
          (config as { secretAccessKey?: string }).secretAccessKey =
            secret || '';
        } else if (connection.provider === 'cloudflare-r2') {
          const secret = await getCloudR2Secret(connection.id);
          (config as { secretAccessKey?: string }).secretAccessKey =
            secret || '';
        } else if (connection.provider === 'backblaze-b2') {
          const secret = await getCloudB2Secret(connection.id);
          (config as { applicationKey?: string }).applicationKey = secret || '';
        } else if (connection.provider === 'rustfs') {
          const secret = await getCloudRustfsSecret(connection.id);
          (config as { secretAccessKey?: string }).secretAccessKey =
            secret || '';
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

  // Get file extension
  const getFileExtension = (fileName: string) => {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() : '';
  };

  // Get unique file types for filter
  const uniqueFileTypes = useMemo(() => {
    const types = objects
      .filter((obj) => !obj.isDirectory)
      .map((obj) => {
        const name = obj.name.split('/').pop() || obj.name;
        return getFileExtension(name);
      })
      .filter((ext): ext is string => !!ext);
    return Array.from(new Set(types));
  }, [objects]);

  // Filter objects based on search term and type filter using useMemo
  const filteredObjects = useMemo(() => {
    let result = [...objects];

    // Apply search filter
    if (searchTerm) {
      result = result.filter((obj) => {
        const name = obj.name.split('/').pop() || obj.name;
        return name.toLowerCase().includes(searchTerm.toLowerCase());
      });
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      result = result.filter((obj) => {
        if (typeFilter === 'folders') return obj.isDirectory;
        if (typeFilter === 'files') return !obj.isDirectory;
        const name = obj.name.split('/').pop() || obj.name;
        return getFileExtension(name) === typeFilter;
      });
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name': {
          const nameA = a.name.split('/').pop() || a.name;
          const nameB = b.name.split('/').pop() || b.name;
          // Folders first, then files
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          comparison = nameA.localeCompare(nameB);
          break;
        }
        case 'size':
          // Folders first, then sort by size
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case 'modified': {
          const dateA = a.updated ? new Date(a.updated).getTime() : 0;
          const dateB = b.updated ? new Date(b.updated).getTime() : 0;
          comparison = dateA - dateB;
          break;
        }
        default:
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [objects, searchTerm, typeFilter, sortBy, sortOrder]);

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
      toast.success('File download started successfully');
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
        toast.success('File download started successfully');

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
      toast.error('Failed to download file. Please try again.');
    } finally {
      setLoadingUrls((prev) => ({ ...prev, [objectName]: false }));
    }
  };

  const handleDownloadAsSeed = async (objectName: string) => {
    if (!project) {
      toast.error('No project selected. Please select a project first.');
      return;
    }

    const fileName = objectName.split('/').pop() || objectName;
    if (!isCSVFile(fileName)) {
      toast.error('Only CSV files can be downloaded as dbt seeds.');
      return;
    }

    if (downloadUrls[objectName]) {
      try {
        await projectsServices.downloadSeed(downloadUrls[objectName], project);
        toast.success(`CSV file "${fileName}" downloaded as seed successfully`);
        return;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error downloading seed:', error);
        toast.error('Failed to download file as seed. Please try again.');
        return;
      }
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
        toast.success(`CSV file "${fileName}" downloaded as seed successfully`);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error getting download URL:', error);
      toast.error('Failed to download file as seed. Please try again.');
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

  const handleSort = (column: 'name' | 'size' | 'modified') => {
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
            <TableCell align="right">
              <TableSortLabel
                active={sortBy === 'size'}
                direction={sortBy === 'size' ? sortOrder : 'asc'}
                onClick={() => handleSort('size')}
              >
                Size
              </TableSortLabel>
            </TableCell>
            <TableCell align="right">
              <TableSortLabel
                active={sortBy === 'modified'}
                direction={sortBy === 'modified' ? sortOrder : 'asc'}
                onClick={() => handleSort('modified')}
              >
                Modified
              </TableSortLabel>
            </TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredObjects.map((object) => {
            const displayName = object.name.split('/').pop() || object.name;
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
                      maxWidth: '100%',
                    }}
                  >
                    {getFileIcon(displayName, object.isDirectory)}
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: object.isDirectory ? 'bold' : 'normal',
                        color: object.isDirectory
                          ? 'primary.main'
                          : 'text.primary',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={displayName}
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
                    <Box
                      sx={{
                        display: 'flex',
                        gap: 1,
                        justifyContent: 'flex-end',
                      }}
                    >
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
                      {project &&
                        isCSVFile(
                          object.name.split('/').pop() || object.name,
                        ) && (
                          <Tooltip title="Download as seed (CSV only)">
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
          justifyContent: 'space-between',
          mb: 2,
          borderBottom: 1,
          borderColor: 'divider',
          pb: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton
            onClick={handleBackToBuckets}
            sx={{ color: 'text.secondary' }}
          >
            <ArrowBack />
          </IconButton>
          <img
            src={bucketIcon}
            alt="bucket"
            style={{ width: 28, height: 28, objectFit: 'contain' }}
          />
          <Typography variant="h4" component="h1">
            {bucketName}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton
            onClick={() => objectsQuery.refetch()}
            disabled={objectsQuery.isFetching}
            sx={{ color: 'text.secondary' }}
          >
            <Refresh />
          </IconButton>
        </Box>
      </Box>

      <Card>
        <CardHeader
          title={
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Breadcrumbs
                separator={<NavigateNext fontSize="small" />}
                aria-label="breadcrumb"
              >
                <Button
                  variant="text"
                  size="small"
                  onClick={() => handleNavigate('')}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    fontSize: '0.875rem',
                  }}
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
                      sx={{ fontSize: '0.875rem' }}
                    >
                      {part}
                    </Button>
                  );
                })}
              </Breadcrumbs>

              {/* Search and Filter Bar */}
              <Box
                sx={{
                  display: 'flex',
                  gap: 2,
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
                    placeholder="Search in this location..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    startAdornment={
                      <Search
                        sx={{ color: 'text.secondary', mr: 0.5, fontSize: 18 }}
                      />
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

                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel sx={{ fontSize: '0.875rem', top: -4 }}>
                    Type
                  </InputLabel>
                  <Select
                    value={typeFilter}
                    label="Type"
                    onChange={(e) => setTypeFilter(e.target.value)}
                    sx={{
                      fontSize: '0.875rem',
                      height: 32,
                      '& .MuiSelect-select': {
                        py: 0.5,
                      },
                    }}
                  >
                    <MenuItem value="all" sx={{ fontSize: '0.875rem' }}>
                      All Types
                    </MenuItem>
                    <MenuItem value="folders" sx={{ fontSize: '0.875rem' }}>
                      Folders
                    </MenuItem>
                    <MenuItem value="files" sx={{ fontSize: '0.875rem' }}>
                      Files
                    </MenuItem>
                    {uniqueFileTypes.map((type) => (
                      <MenuItem
                        key={type}
                        value={type}
                        sx={{ fontSize: '0.875rem' }}
                      >
                        .{type}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: '0.75rem' }}
                >
                  {filteredObjects.length} of {objects.length} item(s)
                </Typography>
              </Box>
            </Box>
          }
          sx={{ pb: 1 }}
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
            filteredObjects.length > 0 &&
            renderListView()}
        </CardContent>
      </Card>
    </Box>
  );
};
