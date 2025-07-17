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
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Alert,
  CircularProgress,
  Divider,
} from '@mui/material';
import {
  InsertDriveFile,
  Folder,
  Delete,
  Clear,
  Refresh,
  Cloud,
  Storage,
} from '@mui/icons-material';

import { CloudProvider } from '../../../types/frontend';
import {
  useRecentItems,
  useRemoveRecentItem,
  useClearRecentItems,
} from '../../controllers/cloudExplorer.controller';

export const ExplorerRecentItems: React.FC = () => {
  const navigate = useNavigate();
  const recentItemsQuery = useRecentItems();
  const removeRecentItem = useRemoveRecentItem();
  const clearRecentItems = useClearRecentItems();

  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const getProviderIcon = (provider: CloudProvider) => {
    switch (provider) {
      case 'gcs':
        return <Cloud sx={{ color: '#4285f4' }} />;
      case 'aws':
        return <Storage sx={{ color: '#ff9900' }} />;
      case 'azure':
        return <Cloud sx={{ color: '#0078d4' }} />;
      default:
        return <Storage />;
    }
  };

  const handleItemClick = (item: any) => {
    // Navigate to the dashboard with the connection and path
    navigate(
      `/app/cloud-explorer/dashboard?connectionId=${item.connectionId}&path=${encodeURIComponent(
        item.path,
      )}`,
    );
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

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60),
    );

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hours ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays} days ago`;

    return date.toLocaleDateString();
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

      {recentItems.length === 0 ? (
        <Card>
          <CardHeader
            title="No recent items"
            subheader="Items you access will appear here for quick access."
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
        <Card>
          <CardHeader
            title={`${recentItems.length} Recent Items`}
            subheader="Click an item to navigate to its location"
          />
          <List>
            {recentItems.map((item, index) => (
              <React.Fragment key={item.id}>
                <ListItem
                  onClick={() => handleItemClick(item)}
                  sx={{ cursor: 'pointer' }}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      onClick={(e) => {
                        e.stopPropagation();
                        setItemToDelete(item.id);
                      }}
                    >
                      <Delete />
                    </IconButton>
                  }
                >
                  <ListItemAvatar>
                    <Avatar>
                      {item.name.includes('.') ? (
                        <InsertDriveFile />
                      ) : (
                        <Folder />
                      )}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <Typography variant="body1">{item.name}</Typography>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                          }}
                        >
                          {getProviderIcon(item.provider)}
                          <Typography variant="caption" color="text.secondary">
                            {item.connectionName}
                          </Typography>
                        </Box>
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          {item.path}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(new Date(item.accessedAt))}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
                {index < recentItems.length - 1 && <Divider component="li" />}
              </React.Fragment>
            ))}
          </List>
        </Card>
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
