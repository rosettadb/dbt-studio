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

  const activeItem = React.useMemo(() => {
    if (location.pathname.includes('sql')) {
      return 1;
    }
    // Don't highlight any sidebar item when on settings or connection pages
    if (location.pathname.includes('settings') ||
        location.pathname.includes('add-connection') ||
        location.pathname.includes('edit-connection')) {
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
                  pointerEvents: selectedProject?.dbtConnection
                    ? 'auto'
                    : 'none',
                }}
              >
                <ListItem
                  sx={{
                    cursor: 'pointer',
                    m: 0,
                    backgroundColor:
                      activeItem === index
                        ? theme.palette.divider
                        : 'transparent',
                  }}
                >
                  <ListItemIcon>
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
