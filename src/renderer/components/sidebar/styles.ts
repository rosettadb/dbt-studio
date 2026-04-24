import { styled } from '@mui/material/styles';
import { Box, Drawer } from '@mui/material';
import { NavLink } from 'react-router-dom';

export const ACTIVITY_BAR_COLLAPSED_WIDTH = 55;
export const ACTIVITY_BAR_EXPANDED_WIDTH = 200;
export const SIDEBAR_PANEL_WIDTH = 300;

export const StyledDrawer = styled(Drawer, {
  shouldForwardProp: (prop) => prop !== 'open' && prop !== 'activityBarWidth',
})<{ open: boolean; activityBarWidth: number }>(({
  theme,
  open,
  activityBarWidth,
}) => {
  const totalWidth = open
    ? activityBarWidth + SIDEBAR_PANEL_WIDTH
    : activityBarWidth;

  return {
    width: totalWidth,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    transition: theme.transitions.create('width', {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),

    '& .MuiDrawer-paper': {
      display: 'flex',
      flexDirection: 'row',
      width: totalWidth,
      top: 0,
      height: 'calc(100% - 24px)',
      overflowX: 'hidden',
      borderRight: 'none',
      boxShadow:
        theme.palette.mode === 'dark'
          ? '2px 0 4px rgba(0, 0, 0, 0.15)'
          : '2px 0 4px rgba(0, 0, 0, 0.04)',
      backgroundColor: 'transparent',
      transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.enteringScreen,
      }),
    },
  };
});

export const ActivityBar = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'expanded',
})<{ expanded?: boolean }>(({ theme, expanded }) => ({
  width: expanded ? ACTIVITY_BAR_EXPANDED_WIDTH : ACTIVITY_BAR_COLLAPSED_WIDTH,
  minWidth: expanded
    ? ACTIVITY_BAR_EXPANDED_WIDTH
    : ACTIVITY_BAR_COLLAPSED_WIDTH,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: theme.palette.background.paper,
  borderRight: `1px solid ${theme.palette.divider}`,
  transition: theme.transitions.create(['width', 'min-width'], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
}));

// Must match menu toolbar height (36px)
export const ActivityBarHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 36,
  minHeight: 36,
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

export const StyledNavLink = styled(NavLink)(({ theme }) => ({
  textDecoration: 'none',
  color: theme.palette.grey[600],
  '&.active': {
    color: theme.palette.primary.main,
    textDecoration: 'none',
  },
}));

export const SidebarContent = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'open',
})<{ open?: boolean }>(({ theme, open }) => ({
  backgroundColor: theme.palette.background.paper,
  borderLeft: open ? `2px solid ${theme.palette.background.default}` : 'none',
  width: open ? SIDEBAR_PANEL_WIDTH : 0,
  minWidth: open ? SIDEBAR_PANEL_WIDTH : 0,
  height: '100%',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  transition: theme.transitions.create(['width', 'min-width'], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
}));

// Must match menu toolbar height (36px)
export const SidebarPanelHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 36,
  minHeight: 36,
  paddingRight: 4,
  borderBottom: `1px solid ${theme.palette.divider}`,
}));
