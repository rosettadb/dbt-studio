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
import { Cable, Add, Storage as DatabaseIcon } from '@mui/icons-material';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useGetConnections } from '../../controllers';
import connectionIcons from '../../../../assets/connectionIcons';
import { SupportedConnectionTypes } from '../../../types/backend';

export const StyledConnectionNavLink = styled(NavLink)(({ theme }) => ({
  textDecoration: 'none',
  color: theme.palette.grey[600],
  display: 'block',
  width: '100%',
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

export const ConnectionsSidebar: React.FC = () => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: connections = [] } = useGetConnections();

  // Extract connectionId from current path
  const pathSegments = location.pathname.split('/');
  const connectionId = pathSegments.includes('edit-connection')
    ? pathSegments[pathSegments.indexOf('edit-connection') + 1]
    : null;

  const selectedConnection = connections.find(
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
            <Cable color="primary" fontSize="small" />
            <Typography variant="h6" sx={{ m: 0 }}>
              Database Connections
            </Typography>
          </Box>
        </Box>

        <Box sx={{ overflow: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
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
                All Connections ({connections.length})
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
                  <ListItem
                    key={connection.id}
                    sx={{
                      cursor: 'pointer',
                      borderRadius: 1,
                      mb: 0,
                      width: '100%',
                      backgroundColor:
                        selectedConnection?.id === connection.id
                          ? theme.palette.divider
                          : 'transparent',
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
                              ? 500
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
          {connections.length === 0 && (
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
                Create your first database connection to get started
              </Typography>
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
          startIcon={<Add />}
          onClick={() => navigate('/app/add-connection')}
        >
          New Connection
        </Button>
      </Box>
    </Box>
  );
};
