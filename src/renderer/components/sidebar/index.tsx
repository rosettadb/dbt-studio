import React from 'react';
import { Box, List, ListItem, ListItemIcon, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useLocation } from 'react-router-dom';
import SettingsIcon from '@mui/icons-material/Settings';
import { getSidebarElements } from './elements';
import { Menu } from '../menu';
import { SidebarContent, StyledDrawer, StyledNavLink } from './styles';
import { useAppContext } from '../../hooks';
import { useGetSelectedProject } from '../../controllers';

type Props = {
  content?: React.ReactNode;
};

export const Sidebar: React.FC<Props> = ({ content }) => {
  const theme = useTheme();
  const { data: selectedProject } = useGetSelectedProject();
  const { isSidebarOpen } = useAppContext();
  const location = useLocation();

  const isProjectSelected = Boolean(selectedProject?.id);
  const isSettingsActive =
    location.pathname.includes('/settings') ||
    location.pathname.includes('add-connection') ||
    location.pathname.includes('edit-connection');

  const activeItem = React.useMemo(() => {
    if (location.pathname.includes('cloud-explorer')) {
      return 5;
    }
    if (
      location.pathname.includes('data-lake') ||
      location.pathname.includes('datalake')
    ) {
      return 6;
    }
    if (location.pathname.includes('connection')) {
      return 0;
    }
    if (location.pathname.includes('select-project')) {
      return 1;
    }
    if (location.pathname.includes('notebooks')) {
      return 4;
    }
    if (location.pathname.includes('sql')) {
      return 3;
    }
    if (
      location.pathname.includes('settings') ||
      location.pathname.includes('add-connection') ||
      location.pathname.includes('edit-connection')
    ) {
      return -1; // No sidebar item should be active for these routes
    }
    if (location.pathname === '/app') {
      return 2; // Only exact match for /app should activate DBT Studio
    }
    return -1; // Default to no active item for other routes
  }, [location.pathname]);

  return (
    <>
      <Menu />
      <StyledDrawer
        variant="permanent"
        open={content ? isSidebarOpen : false}
        data-testid="sidebar"
      >
        <Box flexGrow={1} display="flex" flexDirection="column">
          <Box flexGrow={1} display="flex">
            <List sx={{ width: 55, marginTop: '-24px' }}>
              {getSidebarElements(isProjectSelected).map((element, index) => {
                const isActive = activeItem === index;
                const isDisabled = element.disabled;
                const listItem = (
                  <ListItem
                    sx={{
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      m: 0,
                      opacity: isDisabled ? 0.5 : 1,
                      backgroundColor: isActive
                        ? theme.palette.divider
                        : 'transparent',
                      '&:hover': {
                        backgroundColor: isDisabled
                          ? 'transparent'
                          : theme.palette.action.hover,
                      },
                      transition: 'all 0.2s ease',
                      pointerEvents: isDisabled ? 'none' : 'auto',
                      '& .MuiListItemIcon-root': {
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        opacity: isDisabled ? 0.5 : 1,
                      }}
                    >
                      <element.icon />
                    </ListItemIcon>
                  </ListItem>
                );

                return (
                  <Tooltip
                    key={element.text}
                    title={element.text}
                    placement="right"
                    arrow
                  >
                    <StyledNavLink
                      to={element.path}
                      data-testid={element.testId}
                      style={{
                        cursor: 'pointer',
                        pointerEvents: isDisabled ? 'none' : 'auto',
                      }}
                    >
                      {listItem}
                    </StyledNavLink>
                  </Tooltip>
                );
              })}

              <Tooltip title="Settings" placement="right" arrow>
                <StyledNavLink
                  to="/app/settings"
                  data-testid="nav-item-settings"
                >
                  <ListItem
                    sx={{
                      cursor: 'pointer',
                      m: 0,
                      backgroundColor: isSettingsActive
                        ? theme.palette.divider
                        : 'transparent',
                      '&:hover': {
                        backgroundColor: theme.palette.action.hover,
                      },
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 'unset',
                      }}
                    >
                      <SettingsIcon sx={{ fontSize: 22 }} />
                    </ListItemIcon>
                  </ListItem>
                </StyledNavLink>
              </Tooltip>
            </List>
            {isSidebarOpen && <SidebarContent>{content}</SidebarContent>}
          </Box>
        </Box>
      </StyledDrawer>
    </>
  );
};
