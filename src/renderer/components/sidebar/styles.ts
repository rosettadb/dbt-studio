import { styled } from '@mui/material/styles';
import { Box, Drawer } from '@mui/material';
import { NavLink } from 'react-router-dom';

const drawerWidth = 366;

export const StyledDrawer = styled(Drawer, {
  shouldForwardProp: (prop) => prop !== 'open',
})<{ open: boolean }>(({ theme, open }) => ({
  width: open ? drawerWidth : theme.spacing(7),
  flexShrink: 0,
  whiteSpace: 'nowrap',
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: open
      ? theme.transitions.duration.enteringScreen
      : theme.transitions.duration.leavingScreen,
  }),

  '& .MuiDrawer-paper': {
    width: open ? drawerWidth : theme.spacing(7),
    top: 42,
    // height: 'calc(100% - 42px)',
    overflowX: 'hidden',
    borderRight: 'none',
    transition: theme.transitions.create('width', {
      easing: theme.transitions.easing.sharp,
      duration: open
        ? theme.transitions.duration.enteringScreen
        : theme.transitions.duration.leavingScreen,
    }),
  },
}));

export const StyledNavLink = styled(NavLink)(({ theme }) => ({
  textDecoration: 'none',
  color: theme.palette.grey[600],
  '&.active': {
    color: theme.palette.primary.main,
    textDecoration: 'none',
  },
}));

export const SidebarContent = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  borderLeft: `2px solid ${theme.palette.background.default}`,
  width: '100%',
  height: 'calc(100vh - 42px)',
}));
