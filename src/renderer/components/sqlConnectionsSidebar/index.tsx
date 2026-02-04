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
  CircularProgress,
  Tooltip,
  alpha,
} from '@mui/material';
import {
  Cable,
  Settings as SettingsIcon,
  Storage as DatabaseIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useGetConnections } from '../../controllers';
import {
  SupportedConnectionTypes,
  ConnectionModel,
} from '../../../types/backend';
import connectionIcons from '../../../../assets/connectionIcons';
import type { SqlTabState } from '../../../types/editor';

// Styled ListItem for connection selection
const ConnectionListItem = styled(ListItem)<{
  isActive: boolean;
  hasOpenTab: boolean;
}>(({ theme, isActive, hasOpenTab }) => {
  const getBackgroundColor = () => {
    if (isActive) return alpha(theme.palette.primary.main, 0.15);
    if (hasOpenTab) return alpha(theme.palette.primary.main, 0.05);
    return 'transparent';
  };

  const getBorderColor = () => {
    if (isActive) return `1px solid ${theme.palette.primary.main}`;
    if (hasOpenTab)
      return `1px solid ${alpha(theme.palette.primary.main, 0.3)}`;
    return '1px solid transparent';
  };

  return {
    cursor: 'pointer',
    borderRadius: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
    padding: theme.spacing(0.5, 1),
    minHeight: '36px',
    backgroundColor: getBackgroundColor(),
    border: getBorderColor(),
    transition: 'all 0.15s ease',
    '&:hover': {
      backgroundColor: isActive
        ? alpha(theme.palette.primary.main, 0.2)
        : theme.palette.action.hover,
    },
  };
});

// Group connections by type
const groupConnectionsByType = (connections: ConnectionModel[]) => {
  const grouped: Record<string, ConnectionModel[]> = {};

  connections.forEach((conn) => {
    const { type } = conn.connection;
    if (!grouped[type]) {
      grouped[type] = [];
    }
    grouped[type].push(conn);
  });

  return grouped;
};

// Format connection type for display
const formatConnectionType = (type: string): string => {
  const typeMap: Record<string, string> = {
    postgres: 'PostgreSQL',
    snowflake: 'Snowflake',
    bigquery: 'BigQuery',
    redshift: 'Redshift',
    databricks: 'Databricks',
    duckdb: 'DuckDB',
    kinetica: 'Kinetica',
    mysql: 'MySQL',
    mssql: 'SQL Server',
    oracle: 'Oracle',
    db2: 'DB2',
  };
  return typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1);
};

interface SqlConnectionsSidebarProps {
  openTabs: SqlTabState[];
  activeTabId: string | null;
  onConnectionSelect: (connection: {
    id: string;
    name: string;
    type: string;
  }) => void;
}

export const SqlConnectionsSidebar: React.FC<SqlConnectionsSidebarProps> = ({
  openTabs,
  activeTabId,
  onConnectionSelect,
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { data: connections = [], isLoading, isError } = useGetConnections();

  // Get set of connection IDs that have open tabs
  const openTabConnectionIds = new Set(openTabs.map((tab) => tab.connectionId));

  // Get active tab's connection ID
  const activeConnectionId = openTabs.find(
    (tab) => tab.id === activeTabId,
  )?.connectionId;

  // Group connections by type
  const groupedConnections = groupConnectionsByType(connections);
  const connectionTypes = Object.keys(groupedConnections).sort();

  const getConnectionIcon = (connectionType: SupportedConnectionTypes) => {
    const iconSrc = connectionIcons.images[connectionType];
    if (iconSrc) {
      return (
        <img
          src={iconSrc}
          alt={connectionType}
          style={{
            width: 18,
            height: 18,
            objectFit: 'contain',
          }}
        />
      );
    }
    return <DatabaseIcon fontSize="small" />;
  };

  const handleConnectionClick = (connection: ConnectionModel) => {
    onConnectionSelect({
      id: connection.id,
      name: connection.connection.name,
      type: connection.connection.type,
    });
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 1,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Cable fontSize="small" color="primary" />
          <Typography variant="subtitle2" fontWeight={600}>
            Connections
          </Typography>
        </Box>
        <Tooltip title="Manage Connections">
          <Button
            size="small"
            sx={{ minWidth: 'auto', px: 0.5 }}
            onClick={() => navigate('/app/settings/connections')}
          >
            <SettingsIcon fontSize="small" />
          </Button>
        </Tooltip>
      </Box>

      {/* Connections List */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          px: 1,
          py: 1,
        }}
      >
        {isLoading && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              py: 4,
            }}
          >
            <CircularProgress size={24} />
          </Box>
        )}

        {isError && (
          <Box sx={{ textAlign: 'center', py: 3, px: 1 }}>
            <Typography variant="body2" color="error">
              Failed to load connections
            </Typography>
          </Box>
        )}

        {!isLoading && !isError && connections.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 3, px: 1 }}>
            <DatabaseIcon
              sx={{
                fontSize: 36,
                color: theme.palette.text.disabled,
                mb: 1,
              }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              No connections found
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => navigate('/app/add-connection')}
            >
              Add Connection
            </Button>
          </Box>
        )}

        {!isLoading && !isError && connectionTypes.length > 0 && (
          <>
            {connectionTypes.map((type) => (
              <Box key={type} sx={{ mb: 2 }}>
                {/* Type header */}
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    px: 0.5,
                    pb: 0.5,
                    fontWeight: 600,
                    color: theme.palette.text.secondary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    fontSize: '0.65rem',
                  }}
                >
                  {formatConnectionType(type)} (
                  {groupedConnections[type].length})
                </Typography>

                {/* Connections of this type */}
                <List sx={{ py: 0 }}>
                  {groupedConnections[type].map((connection) => {
                    const hasOpenTab = openTabConnectionIds.has(connection.id);
                    const isActive = activeConnectionId === connection.id;

                    const getTooltipText = () => {
                      if (!hasOpenTab)
                        return `Open ${connection.connection.name}`;
                      if (isActive) return 'Active tab';
                      return 'Tab already open';
                    };

                    return (
                      <Tooltip
                        key={connection.id}
                        title={getTooltipText()}
                        placement="right"
                        arrow
                        enterDelay={500}
                      >
                        <ConnectionListItem
                          isActive={isActive}
                          hasOpenTab={hasOpenTab}
                          onClick={() => handleConnectionClick(connection)}
                        >
                          <ListItemIcon sx={{ minWidth: 28 }}>
                            {getConnectionIcon(connection.connection.type)}
                          </ListItemIcon>
                          <ListItemText
                            primary={connection.connection.name}
                            primaryTypographyProps={{
                              variant: 'body2',
                              sx: {
                                fontSize: '0.8rem',
                                fontWeight: isActive ? 600 : 400,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                color: isActive
                                  ? theme.palette.primary.main
                                  : theme.palette.text.primary,
                              },
                            }}
                          />
                          {hasOpenTab && (
                            <OpenInNewIcon
                              sx={{
                                fontSize: 14,
                                color: isActive
                                  ? theme.palette.primary.main
                                  : theme.palette.text.disabled,
                                ml: 0.5,
                              }}
                            />
                          )}
                        </ConnectionListItem>
                      </Tooltip>
                    );
                  })}
                </List>
              </Box>
            ))}
          </>
        )}
      </Box>

      {/* Footer - Manage Connections Link */}
      {!isLoading && connections.length > 0 && (
        <Box
          sx={{
            px: 1.5,
            py: 1,
            borderTop: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Button
            size="small"
            fullWidth
            variant="text"
            startIcon={<SettingsIcon fontSize="small" />}
            onClick={() => navigate('/app/settings/connections')}
            sx={{
              textTransform: 'none',
              justifyContent: 'flex-start',
              color: theme.palette.text.secondary,
              '&:hover': {
                backgroundColor: theme.palette.action.hover,
              },
            }}
          >
            Manage Connections
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default SqlConnectionsSidebar;
