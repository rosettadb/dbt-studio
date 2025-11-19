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
import {
  Storage,
  Dashboard,
  TableChart,
  History,
  Add,
  Circle,
} from '@mui/icons-material';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { SettingsSidebarElement } from '../../screens/settings/settingsElements';

export const StyledDuckLakeNavLink = styled(NavLink)(({ theme }) => ({
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

export const duckLakeSidebarElements: SettingsSidebarElement[] = [
  {
    icon: Dashboard,
    text: 'Dashboard',
    path: '/app/duck-lake/dashboard',
  },
  {
    icon: Storage,
    text: 'Instances',
    path: '/app/duck-lake/instances',
  },
  {
    icon: TableChart,
    text: 'Tables',
    path: '/app/duck-lake/tables',
  },
  {
    icon: History,
    text: 'Query History',
    path: '/app/duck-lake/history',
  },
];

interface DuckLakeSidebarProps {
  instances?: Array<{
    id: string;
    name: string;
    status: 'active' | 'inactive' | 'error';
  }>;
}

export const DuckLakeSidebar: React.FC<DuckLakeSidebarProps> = ({
  instances = [],
}) => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  // Extract instanceId from current path
  const pathSegments = location.pathname.split('/');
  const instanceId = pathSegments.includes('instances')
    ? pathSegments[pathSegments.indexOf('instances') + 1]
    : null;

  const selectedInstance = instances.find(
    (instance) => instance.id === instanceId,
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return theme.palette.success.main;
      case 'error':
        return theme.palette.error.main;
      default:
        return theme.palette.grey[500];
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
            <Storage color="primary" fontSize="small" />
            <Typography variant="h6" sx={{ m: 0 }}>
              DuckLake
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
            {duckLakeSidebarElements.map((element) => (
              <StyledDuckLakeNavLink key={element.text} to={element.path}>
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
              </StyledDuckLakeNavLink>
            ))}
          </List>

          {/* Current Instance */}
          {selectedInstance && (
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
                Current Instance
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
                  <Circle
                    fontSize="small"
                    sx={{ color: getStatusColor(selectedInstance.status) }}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={selectedInstance.name}
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

          {/* Instances List */}
          {instances.length > 0 && (
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
                Instances
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
                {instances.map((instance) => (
                  <StyledDuckLakeNavLink
                    key={instance.id}
                    to={`/app/duck-lake/instances/${instance.id}`}
                  >
                    <ListItem
                      sx={{
                        cursor: 'pointer',
                        borderRadius: 1,
                        mb: 0,
                        width: '270px',
                        backgroundColor:
                          selectedInstance?.id === instance.id
                            ? theme.palette.divider
                            : 'transparent',
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Circle
                          fontSize="small"
                          sx={{ color: getStatusColor(instance.status) }}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={instance.name}
                        primaryTypographyProps={{
                          variant: 'body2',
                          sx: { fontSize: '0.875rem' },
                        }}
                      />
                    </ListItem>
                  </StyledDuckLakeNavLink>
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
          startIcon={<Add />}
          onClick={() => navigate('/app/duck-lake/new-instance')}
        >
          New Instance
        </Button>
      </Box>
    </Box>
  );
};
