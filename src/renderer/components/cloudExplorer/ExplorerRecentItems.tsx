import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardActions,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Alert,
  CircularProgress,
  ButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import {
  InsertDriveFile,
  Folder,
  Delete,
  Clear,
  Refresh,
  AccessTime,
  OpenInNew,
} from '@mui/icons-material';

import {
  useRecentItems,
  useRemoveRecentItem,
  useClearRecentItems,
} from '../../controllers/cloudExplorer.controller';

export const ExplorerRecentItems: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const recentItemsQuery = useRecentItems();
  const removeRecentItem = useRemoveRecentItem();
  const clearRecentItems = useClearRecentItems();

  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // Get filter from URL parameters
  const urlParams = new URLSearchParams(location.search);
  const urlFilter = urlParams.get('filter') as
    | 'all'
    | 'files'
    | 'directories'
    | null;
  const [filter, setFilter] = useState<'all' | 'files' | 'directories'>(
    urlFilter || 'all',
  );

  // Update filter when URL changes
  useEffect(() => {
    if (urlFilter && urlFilter !== filter) {
      setFilter(urlFilter);
    }
  }, [urlFilter, filter]);

  const handleItemClick = (item: any) => {
    // Check if we have a bucket name in the path (format: bucket/path/to/file)
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

  const handleRemoveItem = async (itemId: string) => {
    try {
      await removeRecentItem.mutateAsync(itemId);
      setItemToDelete(null);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to remove recent item:', error);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearRecentItems.mutateAsync();
      setClearDialogOpen(false);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to clear recent items:', error);
    }
  };

  // Handle filter changes and update URL
  const handleFilterChange = (newFilter: 'all' | 'files' | 'directories') => {
    setFilter(newFilter);
    const params = new URLSearchParams();
    if (newFilter !== 'all') {
      params.set('filter', newFilter);
    }
    const newUrl = params.toString()
      ? `/app/cloud-explorer/recent-items?${params.toString()}`
      : '/app/cloud-explorer/recent-items';
    navigate(newUrl, { replace: true });
  };

  if (recentItemsQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (recentItemsQuery.isError) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">
          Failed to load recent items:{' '}
          {recentItemsQuery.error instanceof Error
            ? recentItemsQuery.error.message
            : 'Unknown error'}
        </Alert>
      </Box>
    );
  }

  const recentItems = recentItemsQuery.data || [];

  // Filter items based on selected filter
  const filteredItems = recentItems.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'files') return !item.path.endsWith('/');
    if (filter === 'directories') return item.path.endsWith('/');
    return true;
  });

  return (
    <Box sx={{ p: 2 }}>
      {/* Header with title and actions */}
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
            Recent Items
          </Typography>
          <AccessTime sx={{ color: 'text.secondary', fontSize: 28 }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {/* Filter buttons */}
          <ButtonGroup variant="outlined" size="small">
            <Button
              variant={filter === 'all' ? 'contained' : 'outlined'}
              onClick={() => handleFilterChange('all')}
            >
              All
            </Button>
            <Button
              variant={filter === 'files' ? 'contained' : 'outlined'}
              onClick={() => handleFilterChange('files')}
            >
              Files
            </Button>
            <Button
              variant={filter === 'directories' ? 'contained' : 'outlined'}
              onClick={() => handleFilterChange('directories')}
            >
              Directories
            </Button>
          </ButtonGroup>

          {/* Action buttons */}
          <IconButton
            onClick={() => recentItemsQuery.refetch()}
            disabled={recentItemsQuery.isRefetching}
          >
            <Refresh />
          </IconButton>
          {recentItems.length > 0 && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<Clear />}
              onClick={() => setClearDialogOpen(true)}
            >
              Clear All
            </Button>
          )}
        </Box>
      </Box>

      {filteredItems.length === 0 ? (
        <Card sx={{ p: 2 }}>
          <CardHeader
            title="No recent items"
            subheader={(() => {
              if (filter === 'all')
                return "You haven't accessed any files or directories yet.";
              if (filter === 'files')
                return "You haven't accessed any files yet.";
              return "You haven't accessed any directories yet.";
            })()}
          />
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              Browse your cloud storage connections to see recent items here.
            </Typography>
          </CardContent>
          <CardActions>
            <Button
              variant="contained"
              onClick={() => navigate('/app/cloud-explorer/dashboard')}
            >
              Browse Storage
            </Button>
          </CardActions>
        </Card>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 1 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 60 }} />
                <TableCell>Name</TableCell>
                <TableCell>Accessed</TableCell>
                <TableCell align="center" sx={{ width: 200 }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id} hover sx={{ cursor: 'pointer' }}>
                  <TableCell>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {item.path.endsWith('/') ? (
                        <Folder sx={{ color: 'text.secondary' }} />
                      ) : (
                        <InsertDriveFile sx={{ color: 'text.secondary' }} />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box>
                      <Button
                        variant="text"
                        onClick={() => handleItemClick(item)}
                        sx={{
                          textAlign: 'left',
                          justifyContent: 'flex-start',
                          fontWeight: 500,
                          textTransform: 'none',
                          p: 0,
                          minWidth: 'auto',
                          '&:hover': { textDecoration: 'underline' },
                        }}
                      >
                        {item.name}
                      </Button>
                      <Box sx={{ mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {item.connectionName}
                        </Typography>
                        {item.path && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: 'block',
                              fontFamily: 'monospace',
                              mt: 0.25,
                            }}
                          >
                            {item.path.endsWith('/')
                              ? `/${item.path}`
                              : `/${item.path.split('/').slice(0, -1).join('/')}`}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {formatDistanceToNow(new Date(item.accessedAt), {
                        addSuffix: true,
                      })}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Box
                      sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}
                    >
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<OpenInNew />}
                        onClick={() => handleItemClick(item)}
                      >
                        Open
                      </Button>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          setItemToDelete(item.id);
                        }}
                      >
                        <Delete />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Delete Item Dialog */}
      <Dialog open={!!itemToDelete} onClose={() => setItemToDelete(null)}>
        <DialogTitle>Remove Recent Item</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to remove this item from your recent items?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemToDelete(null)}>Cancel</Button>
          <Button
            onClick={() => itemToDelete && handleRemoveItem(itemToDelete)}
            color="error"
            disabled={removeRecentItem.isLoading}
            startIcon={
              removeRecentItem.isLoading ? <CircularProgress size={16} /> : null
            }
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear All Dialog */}
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>Clear All Recent Items</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to clear all recent items? This action cannot
            be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleClearAll}
            color="error"
            variant="contained"
            disabled={clearRecentItems.isLoading}
            startIcon={
              clearRecentItems.isLoading ? <CircularProgress size={16} /> : null
            }
          >
            Clear All
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
