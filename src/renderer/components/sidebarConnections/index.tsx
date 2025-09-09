import React from 'react';
import {
  Typography,
  Box,
  List,
  ListItem,
  useTheme,
  ListItemIcon,
  ListItemText,
  styled,
  Button,
  Divider,
} from '@mui/material';
import {
  Cable,
  Add,
  Storage as DatabaseIcon,
  Cloud as CloudIcon,
} from '@mui/icons-material';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useGetConnections, useGetCloudConnections } from '../../controllers';
import { SupportedConnectionTypes } from '../../../types/backend';
import connectionIcons, {
  cloudStorageImages,
} from '../../../../assets/connectionIcons';
import { CloudProvider } from '../../../types/frontend';

// Styled NavLink for consistent hover/active styles
const StyledNavLink = styled(NavLink)(({ theme }) => ({
  textDecoration: 'none',
  color: theme.palette.text.primary,
  display: 'block',
  width: '100%',
  '&.active': {
    color: theme.palette.primary.main,
    textDecoration: 'none',
    '& .MuiListItem-root': {
      backgroundColor: theme.palette.divider,
      borderColor: theme.palette.primary.main,
    },
  },
  '&:hover': {
    color: theme.palette.primary.main,
    '& .MuiListItem-root': {
      backgroundColor: theme.palette.action.hover,
    },
  },
}));

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

  const getCloudProviderIcon = (provider: CloudProvider) => {
    const iconSrc = cloudStorageImages[provider];
    if (iconSrc) {
      return (
        <img
          src={iconSrc}
          alt={provider}
          style={{
            width: 20,
            height: 20,
            objectFit: 'contain',
          }}
        />
      );
    }
    return <CloudIcon fontSize="small" />;
  };

  const renderCloudProviderIcon = (provider: string) => {
    // Cast provider to CloudProvider for type safety
    return getCloudProviderIcon(provider as CloudProvider);
  };

  return (
    <Box
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        overflowX: 'hidden',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Box
        sx={{
          flex: 1,
          overflow: 'hidden',
          overflowX: 'hidden',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
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

        <Box
          sx={{
            overflow: 'auto',
            flex: 1,
            overflowX: 'hidden',
            maxHeight: 'calc(100vh - 200px)',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
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
              <List sx={{ py: 0, width: '100%' }}>
                {connections.map((connection) => (
                  <StyledNavLink
                    key={connection.id}
                    to={`/app/edit-connection/${connection.id}`}
                  >
                    <ListItem
                      sx={{
                        cursor: 'pointer',
                        borderRadius: 1,
                        mb: 0.5,
                        py: 0.5,
                        px: 1,
                        backgroundColor:
                          selectedConnection?.id === connection.id
                            ? theme.palette.divider
                            : 'transparent',
                        overflow: 'hidden',
                        minHeight: '32px',
                        width: '270px',
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        {getConnectionIcon(connection.connection.type)}
                      </ListItemIcon>
                      <ListItemText
                        primary={connection.connection.name}
                        primaryTypographyProps={{
                          variant: 'body2',
                          sx: {
                            fontSize: '0.875rem',
                            fontWeight:
                              selectedConnection?.id === connection.id
                                ? 600
                                : 400,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          },
                        }}
                      />
                    </ListItem>
                  </StyledNavLink>
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
              <List sx={{ py: 0, width: '100%' }}>
                {cloudConnections.map((cloudConnection) => (
                  <StyledNavLink
                    key={cloudConnection.id}
                    to={`/app/cloud-explorer/buckets/${cloudConnection.id}`}
                  >
                    <ListItem
                      sx={{
                        cursor: 'pointer',
                        borderRadius: 1,
                        mb: 0.5,
                        py: 0.5,
                        px: 1,
                        backgroundColor:
                          selectedCloudConnection?.id === cloudConnection.id
                            ? theme.palette.divider
                            : 'transparent',
                        border:
                          selectedCloudConnection?.id === cloudConnection.id
                            ? `1px solid ${theme.palette.primary.main}`
                            : '1px solid transparent',
                        '&:hover': {
                          backgroundColor: theme.palette.action.hover,
                        },
                        overflow: 'hidden',
                        minHeight: '32px',
                        width: '270px',
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        {renderCloudProviderIcon(cloudConnection.provider)}
                      </ListItemIcon>
                      <ListItemText
                        primary={cloudConnection.name}
                        primaryTypographyProps={{
                          variant: 'body2',
                          sx: {
                            fontSize: '0.875rem',
                            fontWeight:
                              selectedCloudConnection?.id === cloudConnection.id
                                ? 600
                                : 400,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          },
                        }}
                      />
                    </ListItem>
                  </StyledNavLink>
                ))}
              </List>
            </Box>
          )}

          {/* No Connections State */}
          {connections.length === 0 && cloudConnections.length === 0 && (
            <Box
              sx={{
                mt: 3,
                textAlign: 'center',
                px: 1,
                maxWidth: '250px',
                mx: 'auto',
                wordWrap: 'break-word',
                overflow: 'hidden',
              }}
            >
              <DatabaseIcon
                sx={{
                  fontSize: 48,
                  color: theme.palette.text.secondary,
                  opacity: 0.5,
                  mb: 1,
                }}
              />
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mb: 1,
                  wordWrap: 'break-word',
                  hyphens: 'auto',
                }}
              >
                No connections found
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: 'block',
                  mb: 2,
                  lineHeight: 1.4,
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'normal',
                  textAlign: 'center',
                }}
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
          width: '270px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        <Button
          variant="contained"
          color="primary"
          fullWidth
          startIcon={<Add />}
          onClick={() => navigate('/app/add-connection')}
          sx={{ mb: 1, width: '100%', boxSizing: 'border-box' }}
        >
          New Connection
        </Button>
        <Button
          variant="outlined"
          color="primary"
          fullWidth
          startIcon={<CloudIcon />}
          onClick={() => navigate('/app/cloud-explorer/new-connection')}
          sx={{ width: '100%', boxSizing: 'border-box' }}
        >
          New Cloud Source
        </Button>
      </Box>
    </Box>
  );
};
