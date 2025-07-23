import React from 'react';
import {
  Typography,
  Box,
  List,
  ListItem,
  useTheme,
  ListItemIcon,
  ListItemText,
  Button,
  Divider,
} from '@mui/material';
import {
  Cable,
  Add,
  Storage as DatabaseIcon,
  Cloud as CloudIcon,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGetConnections, useGetCloudConnections } from '../../controllers';
import connectionIcons from '../../../../assets/connectionIcons';
import { SupportedConnectionTypes } from '../../../types/backend';

export const ConnectionsSidebar: React.FC = () => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: connections = [] } = useGetConnections();
  const { data: cloudConnections = [] } = useGetCloudConnections();

  // Extract connectionId from current path
  const pathSegments = location.pathname.split('/');
  // eslint-disable-next-line no-nested-ternary
  const connectionId = pathSegments.includes('edit-connection')
    ? pathSegments[pathSegments.indexOf('edit-connection') + 1]
    : pathSegments.includes('edit-cloud-connection')
      ? pathSegments[pathSegments.indexOf('edit-cloud-connection') + 1]
      : null;

  const selectedConnection = connections.find(
    (conn) => conn.id === connectionId,
  );

  const selectedCloudConnection = cloudConnections.find(
    (conn) => conn.id === connectionId,
  );

  const getConnectionIcon = (connectionType: SupportedConnectionTypes) => {
    const iconSrc = connectionIcons.images[connectionType];
    if (iconSrc) {
      return (
        <img
          src={iconSrc}
          alt={connectionType}
          style={{
            width: 20,
            height: 20,
            objectFit: 'contain',
          }}
        />
      );
    }
    return <DatabaseIcon fontSize="small" />;
  };

  const getCloudProviderIcon = (provider: string) => {
    switch (provider) {
      case 'aws':
        return '☁️'; // You can replace with actual AWS icon
      case 'azure':
        return '🔷'; // You can replace with actual Azure icon
      case 'gcs':
        return '🌐'; // You can replace with actual GCS icon
      default:
        return <CloudIcon fontSize="small" />;
    }
  };

  const renderCloudProviderIcon = (provider: string) => {
    const icon = getCloudProviderIcon(provider);
    if (typeof icon === 'string') {
      return (
        <Box
          sx={{
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
          }}
        >
          {icon}
        </Box>
      );
    }
    return icon;
  };

  const getConnectionTypeName = (connectionType: string) => {
    switch (connectionType) {
      case 'postgres':
        return 'PostgreSQL';
      case 'snowflake':
        return 'Snowflake';
      case 'bigquery':
        return 'BigQuery';
      case 'redshift':
        return 'Redshift';
      case 'databricks':
        return 'Databricks';
      case 'duckdb':
        return 'DuckDB';
      default:
        return connectionType.toUpperCase();
    }
  };

  const getCloudProviderName = (provider: string) => {
    switch (provider) {
      case 'aws':
        return 'Amazon S3';
      case 'azure':
        return 'Azure Blob';
      case 'gcs':
        return 'Google Cloud';
      default:
        return provider.toUpperCase();
    }
  };

  return (
    <Box
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            mb: 2,
            gap: 1,
          }}
        >
          <Cable color="primary" fontSize="small" />
          <Typography variant="h6" sx={{ m: 0 }}>
            Connections & Sources
          </Typography>
        </Box>

        <Box sx={{ overflow: 'auto', flex: 1 }}>
          {/* Database Connections List */}
          {connections.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1,
                  pb: 1,
                  fontWeight: 600,
                  color: theme.palette.text.secondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                <DatabaseIcon fontSize="small" />
                Connections ({connections.length})
              </Typography>
              <List sx={{ py: 0 }}>
                {connections.map((connection) => (
                  <ListItem
                    key={connection.id}
                    sx={{
                      cursor: 'pointer',
                      borderRadius: 1,
                      mb: 0.5,
                      py: 0.5,
                      px: 1,
                      backgroundColor:
                        selectedConnection?.id === connection.id
                          ? `${theme.palette.primary.light}20`
                          : 'transparent',
                      border:
                        selectedConnection?.id === connection.id
                          ? `1px solid ${theme.palette.primary.main}`
                          : '1px solid transparent',
                      '&:hover': {
                        backgroundColor: theme.palette.action.hover,
                      },
                    }}
                    onClick={() => {
                      navigate(`/app/edit-connection/${connection.id}`);
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      {getConnectionIcon(connection.connection.type)}
                    </ListItemIcon>
                    <ListItemText
                      primary={connection.connection.name}
                      secondary={getConnectionTypeName(
                        connection.connection.type,
                      )}
                      primaryTypographyProps={{
                        variant: 'body2',
                        sx: {
                          fontSize: '0.875rem',
                          fontWeight:
                            selectedConnection?.id === connection.id
                              ? 600
                              : 400,
                        },
                      }}
                      secondaryTypographyProps={{
                        variant: 'caption',
                        sx: {
                          fontSize: '0.75rem',
                          color: theme.palette.text.secondary,
                        },
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          {/* Cloud Sources List */}
          {cloudConnections.length > 0 && (
            <Box sx={{ mb: 2 }}>
              {connections.length > 0 && <Divider sx={{ mb: 2 }} />}
              <Typography
                variant="caption"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1,
                  pb: 1,
                  fontWeight: 600,
                  color: theme.palette.text.secondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                <CloudIcon fontSize="small" />
                Sources ({cloudConnections.length})
              </Typography>
              <List sx={{ py: 0 }}>
                {cloudConnections.map((cloudConnection) => (
                  <ListItem
                    key={cloudConnection.id}
                    sx={{
                      cursor: 'pointer',
                      borderRadius: 1,
                      mb: 0.5,
                      py: 0.5,
                      px: 1,
                      backgroundColor:
                        selectedCloudConnection?.id === cloudConnection.id
                          ? `${theme.palette.primary.light}20`
                          : 'transparent',
                      border:
                        selectedCloudConnection?.id === cloudConnection.id
                          ? `1px solid ${theme.palette.primary.main}`
                          : '1px solid transparent',
                      '&:hover': {
                        backgroundColor: theme.palette.action.hover,
                      },
                    }}
                    onClick={() => {
                      navigate(
                        `/app/cloud-explorer/edit-connection/${cloudConnection.id}`,
                      );
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      {renderCloudProviderIcon(cloudConnection.provider)}
                    </ListItemIcon>
                    <ListItemText
                      primary={cloudConnection.name}
                      secondary={getCloudProviderName(cloudConnection.provider)}
                      primaryTypographyProps={{
                        variant: 'body2',
                        sx: {
                          fontSize: '0.875rem',
                          fontWeight:
                            selectedCloudConnection?.id === cloudConnection.id
                              ? 600
                              : 400,
                        },
                      }}
                      secondaryTypographyProps={{
                        variant: 'caption',
                        sx: {
                          fontSize: '0.75rem',
                          color: theme.palette.text.secondary,
                        },
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          {/* No Connections State */}
          {connections.length === 0 && cloudConnections.length === 0 && (
            <Box sx={{ mt: 3, textAlign: 'center', px: 2 }}>
              <DatabaseIcon
                sx={{
                  fontSize: 48,
                  color: theme.palette.text.secondary,
                  opacity: 0.5,
                  mb: 1,
                }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                No connections found
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mb: 2 }}
              >
                Create your first database connection or cloud source to get
                started
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Action Buttons */}
      <Box
        sx={{
          mt: 'auto',
          pt: 2,
          borderTop: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Button
          variant="contained"
          color="primary"
          fullWidth
          startIcon={<Add />}
          onClick={() => navigate('/app/add-connection')}
          sx={{ mb: 1 }}
        >
          New Connection
        </Button>
        <Button
          variant="outlined"
          color="primary"
          fullWidth
          startIcon={<CloudIcon />}
          onClick={() => navigate('/app/add-cloud-connection')}
        >
          New Cloud Source
        </Button>
      </Box>
    </Box>
  );
};
