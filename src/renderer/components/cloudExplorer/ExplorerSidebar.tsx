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
} from '@mui/material';
import { Cloud, Dashboard, Cable, History, Folder } from '@mui/icons-material';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { SettingsSidebarElement } from '../../screens/settings/settingsElements';
import { useGetCloudConnections } from '../../controllers/cloudExplorer.controller';
import { cloudStorageImages } from '../../../../assets/connectionIcons';
import { CloudProvider } from '../../../types/frontend';

export const StyledSettingsNavLink = styled(NavLink)(({ theme }) => ({
  textDecoration: 'none',
  color: theme.palette.grey[600],
  display: 'block',
  width: '270px',
  marginBottom: '2px',
  '&.active': {
    color: theme.palette.primary.main,
    textDecoration: 'none',
  },
  '&:hover': {
    color: theme.palette.primary.main,
    '& .MuiListItem-root': {
      backgroundColor: theme.palette.action.hover,
    },
  },
}));

export const explorerSidebarElements: SettingsSidebarElement[] = [
  {
    icon: Dashboard,
    text: 'Dashboard',
    path: '/app/cloud-explorer/dashboard',
  },
  {
    icon: Cable,
    text: 'Sources',
    path: '/app/cloud-explorer/connections',
  },
  {
    icon: History,
    text: 'Recent Items',
    path: '/app/cloud-explorer/recent-items',
  },
];

export const ExplorerSidebar: React.FC = () => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const connectionsQuery = useGetCloudConnections();

  // Extract connectionId and bucketName from current path
  const pathSegments = location.pathname.split('/');
  const connectionId =
    pathSegments.includes('buckets') || pathSegments.includes('bucket')
      ? pathSegments[pathSegments.indexOf('buckets') + 1] ||
        pathSegments[pathSegments.indexOf('bucket') + 1]
      : null;
  const bucketName =
    pathSegments.includes('bucket') && pathSegments.length > 5
      ? decodeURIComponent(pathSegments[pathSegments.indexOf('bucket') + 2])
      : null;

  const connections = connectionsQuery.data || [];
  const selectedConnection = connections.find(
    (conn) => conn.id === connectionId,
  );

  const getProviderIcon = (provider: CloudProvider) => {
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
    return <Cable fontSize="small" />;
  };

  return (
    <Box
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
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
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Cloud color="primary" fontSize="small" />
            <Typography variant="h6" sx={{ m: 0 }}>
              Cloud Explorer
            </Typography>
          </Box>
        </Box>

        <Box sx={{ overflow: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
          {/* Main Navigation */}
          <List
            sx={{
              py: 0,
              width: '100%',
              '& .MuiListItem-root': {
                py: 0.25,
                px: 1,
                minHeight: '32px',
                width: '270px',
              },
            }}
          >
            {explorerSidebarElements.map((element) => (
              <StyledSettingsNavLink key={element.text} to={element.path}>
                <ListItem
                  sx={{
                    cursor: 'pointer',
                    borderRadius: 1,
                    mb: 0,
                    width: '270px',
                    backgroundColor:
                      location.pathname === element.path
                        ? theme.palette.divider
                        : 'transparent',
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <element.icon
                      fontSize="small"
                      color={
                        location.pathname === element.path
                          ? 'primary'
                          : 'inherit'
                      }
                    />
                  </ListItemIcon>
                  <ListItemText primary={element.text} />
                </ListItem>
              </StyledSettingsNavLink>
            ))}
          </List>

          {/* Current Bucket */}
          {selectedConnection && bucketName && (
            <Box sx={{ mt: 3 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  px: 2,
                  pb: 1,
                  fontWeight: 600,
                  color: theme.palette.text.secondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Current Bucket
              </Typography>
              <ListItem
                sx={{
                  borderRadius: 1,
                  backgroundColor: theme.palette.divider,
                  mb: 0,
                  width: '270px',
                  py: 0.25,
                  px: 1,
                  minHeight: '32px',
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <Folder fontSize="small" color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary={bucketName}
                  primaryTypographyProps={{
                    variant: 'body2',
                    sx: {
                      fontSize: '0.875rem',
                      color: theme.palette.primary.main,
                    },
                  }}
                />
              </ListItem>
            </Box>
          )}

          {/* Connections List */}
          {connections.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  px: 2,
                  pb: 1,
                  fontWeight: 600,
                  color: theme.palette.text.secondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Connections
              </Typography>
              <List
                sx={{
                  py: 0,
                  width: '100%',
                  '& .MuiListItem-root': {
                    py: 0.25,
                    px: 1,
                    minHeight: '32px',
                    width: '100%',
                  },
                }}
              >
                {connections.map((connection) => (
                  <StyledSettingsNavLink
                    key={connection.id}
                    to={`/app/cloud-explorer/buckets/${connection.id}`}
                  >
                    <ListItem
                      sx={{
                        cursor: 'pointer',
                        borderRadius: 1,
                        mb: 0,
                        width: '270px',
                        backgroundColor:
                          selectedConnection?.id === connection.id
                            ? theme.palette.divider
                            : 'transparent',
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        {getProviderIcon(connection.provider)}
                      </ListItemIcon>
                      <ListItemText
                        primary={connection.name}
                        primaryTypographyProps={{
                          variant: 'body2',
                          sx: { fontSize: '0.875rem' },
                        }}
                      />
                    </ListItem>
                  </StyledSettingsNavLink>
                ))}
              </List>
            </Box>
          )}
        </Box>
      </Box>

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
          startIcon={<Cloud />}
          onClick={() => navigate('/app/cloud-explorer/new-connection')}
        >
          New Source
        </Button>
      </Box>
    </Box>
  );
};
