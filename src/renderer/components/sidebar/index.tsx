import React from 'react';
import { Box, List, ListItem, ListItemIcon } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useLocation } from 'react-router-dom';
import { sidebarElements } from './elements';
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

  // Check if project is selected
  const isProjectSelected = Boolean(selectedProject?.id);
  // Check if navigation should be enabled - requires project selection AND dbt connection
  const isNavigationEnabled = Boolean(selectedProject?.id && selectedProject?.dbtConnection);

  const activeItem = React.useMemo(() => {
    if (location.pathname.includes('sql')) {
      return 1;
    }
    // Don't highlight any sidebar item when on settings, connection pages, or select-project
    if (location.pathname.includes('settings') ||
        location.pathname.includes('add-connection') ||
        location.pathname.includes('edit-connection') ||
        location.pathname.includes('select-project')) {
      return -1; // No item selected
    }
    return 0;
  }, [location.pathname]);

  return (
    <>
      <Menu />
      <StyledDrawer variant="permanent" open={content ? isSidebarOpen : false}>
        <Box flexGrow={1} display="flex">
          <List sx={{ width: 55, marginTop: '-24px' }}>
            {sidebarElements.map((element, index) => (
              <StyledNavLink
                key={element.text}
                to={element.path}
                style={{
                  pointerEvents: isProjectSelected ? (isNavigationEnabled ? 'auto' : 'none') : 'none',
                  opacity: isNavigationEnabled ? 1 : 0.5,
                  cursor: isProjectSelected ? 'pointer' : 'not-allowed',
                }}
              >
                <ListItem
                  sx={{
                    cursor: isProjectSelected ? 'pointer' : 'not-allowed !important',
                    m: 0,
                    backgroundColor:
                      (activeItem === index && isNavigationEnabled)
                        ? theme.palette.divider
                        : 'transparent',
                    '&:hover': isNavigationEnabled ? {
                      backgroundColor: theme.palette.action.hover,
                    } : {},
                    transition: 'background-color 0.2s ease',
                    '& .MuiListItemIcon-root': {
                      cursor: isProjectSelected ? 'pointer' : 'not-allowed !important',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      cursor: isProjectSelected ? 'pointer' : 'not-allowed !important',
                    }}
                  >
                    <element.icon />
                  </ListItemIcon>
                </ListItem>
              </StyledNavLink>
            ))}
          </List>
          {isSidebarOpen && <SidebarContent>{content}</SidebarContent>}
        </Box>
      </StyledDrawer>
    </>
  );
};
