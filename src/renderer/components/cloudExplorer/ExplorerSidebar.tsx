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
import { Cloud, Dashboard, Cable, History, Add } from '@mui/icons-material';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { SettingsSidebarElement } from '../../screens/settings/settingsElements';

export const StyledSettingsNavLink = styled(NavLink)(({ theme }) => ({
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

export const explorerSidebarElements: SettingsSidebarElement[] = [
  {
    icon: Dashboard,
    text: 'Dashboard',
    path: '/app/cloud-explorer/dashboard',
  },
  {
    icon: Cable,
    text: 'Connections',
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
  return (
    <Box
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
      }}
    >
      <Box>
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
          {explorerSidebarElements.map((element) => (
            <StyledSettingsNavLink key={element.text} to={element.path}>
              <ListItem
                sx={{
                  cursor: 'pointer',
                  borderRadius: 1,
                  mb: 0,
                  width: '100%',
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
                      location.pathname === element.path ? 'primary' : 'inherit'
                    }
                  />
                </ListItemIcon>
                <ListItemText primary={element.text} />
              </ListItem>
            </StyledSettingsNavLink>
          ))}
        </List>
      </Box>
      <Box sx={{ mt: 'auto' }}>
        <Button
          variant="contained"
          color="primary"
          fullWidth
          startIcon={<Add />}
          onClick={() => navigate('/app/cloud-explorer/new-connection')}
        >
          New Connection
        </Button>
      </Box>
    </Box>
  );
};
