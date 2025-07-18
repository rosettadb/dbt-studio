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

  const isProjectSelected = Boolean(selectedProject?.id);

  const activeItem = React.useMemo(() => {
    if (location.pathname.includes('connection')) {
      return 0;
    }
    if (location.pathname.includes('sql')) {
      return 2;
    }
    return 1;
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
                  cursor: isProjectSelected ? 'pointer' : 'not-allowed',
                }}
              >
                <ListItem
                  sx={{
                    cursor: isProjectSelected
                      ? 'pointer'
                      : 'not-allowed !important',
                    m: 0,
                    backgroundColor:
                      activeItem === index
                        ? theme.palette.divider
                        : 'transparent',
                    '&:hover': {
                      backgroundColor: theme.palette.action.hover,
                    },
                    transition: 'background-color 0.2s ease',
                    '& .MuiListItemIcon-root': {
                      cursor: isProjectSelected
                        ? 'pointer'
                        : 'not-allowed !important',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      cursor: isProjectSelected
                        ? 'pointer'
                        : 'not-allowed !important',
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
