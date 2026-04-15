import React from 'react';
import { Box, List, ListItem, ListItemIcon, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useLocation } from 'react-router-dom';
import SettingsIcon from '@mui/icons-material/Settings';
import ElectricalServicesIcon from '@mui/icons-material/ElectricalServices';
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
  const isConnectionsActive =
    location.pathname.includes('/connections') ||
    location.pathname.includes('add-connection') ||
    location.pathname.includes('edit-connection');

  const isSettingsActive = location.pathname.includes('/settings');

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
    if (location.pathname.includes('select-project')) {
      return 1;
    }
    if (location.pathname.includes('notebooks')) {
      return 4;
    }
    if (location.pathname.includes('sql')) {
      return 3;
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
            <Box
              display="flex"
              flexDirection="column"
              sx={{ width: 48, flexShrink: 0 }}
            >
              {/* Top navigation items */}
              <List
                sx={{
                  width: 48,
                  marginTop: '-16px',
                  p: 0,
                }}
              >
                {getSidebarElements(isProjectSelected)
                  .filter((el) => el.path !== '/app/connections')
                  .map((element) => {
                    // Re-map index to match original activeItem logic (skip connections at 0)
                    const originalIndex =
                      getSidebarElements(isProjectSelected).indexOf(element);
                    const isActive = activeItem === originalIndex;
                    const isDisabled = element.disabled;
                    const listItem = (
                      <ListItem
                        sx={{
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          m: 0,
                          px: 0,
                          py: '6px',
                          justifyContent: 'center',
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
                            minWidth: 'unset',
                            justifyContent: 'center',
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
                        sx={{
                          background: 'red',
                        }}
                      >
                        <StyledNavLink
                          to={element.path}
                          data-testid={element.testId}
                          style={{
                            cursor: 'pointer',
                            pointerEvents: isDisabled ? 'none' : 'auto',
                            background: 'blue',
                          }}
                        >
                          {listItem}
                        </StyledNavLink>
                      </Tooltip>
                    );
                  })}
              </List>

              {/* Bottom items: Connections + Settings */}
              <Box
                sx={{
                  mt: 'auto',
                  pb: 0,
                  marginBottom: '-16px',
                }}
              >
                <Tooltip title="Database Connections" placement="right" arrow>
                  <StyledNavLink
                    to="/app/connections"
                    data-testid="nav-item-connections"
                  >
                    <ListItem
                      sx={{
                        cursor: 'pointer',
                        m: 0,
                        px: 0,
                        py: '6px',
                        justifyContent: 'center',
                        backgroundColor: isConnectionsActive
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
                          justifyContent: 'center',
                        }}
                      >
                        <ElectricalServicesIcon sx={{ fontSize: 22 }} />
                      </ListItemIcon>
                    </ListItem>
                  </StyledNavLink>
                </Tooltip>

                <Tooltip title="Settings" placement="right" arrow>
                  <StyledNavLink
                    to="/app/settings"
                    data-testid="nav-item-settings"
                  >
                    <ListItem
                      sx={{
                        cursor: 'pointer',
                        m: 0,
                        px: 0,
                        py: '6px',
                        justifyContent: 'center',
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
                          justifyContent: 'center',
                        }}
                      >
                        <SettingsIcon sx={{ fontSize: 22 }} />
                      </ListItemIcon>
                    </ListItem>
                  </StyledNavLink>
                </Tooltip>
              </Box>
            </Box>
            {isSidebarOpen && <SidebarContent>{content}</SidebarContent>}
          </Box>
        </Box>
      </StyledDrawer>
    </>
  );
};
