import React from 'react';
import { Box, List, ListItem, ListItemIcon, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useLocation } from 'react-router-dom';
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

  const activeItem = React.useMemo(() => {
    if (location.pathname.includes('connection')) {
      return 0;
    }
    if (location.pathname.includes('select-project')) {
      return 1;
    }
    if (location.pathname.includes('sql')) {
      return 3;
    }
    if (location.pathname === '/app' || location.pathname.includes('/app/')) {
      return 2;
    }
    if (location.pathname.includes('cloud-explorer')) {
      return 2;
    }
    if (
      location.pathname.includes('settings') ||
      location.pathname.includes('add-connection') ||
      location.pathname.includes('edit-connection') ||
      location.pathname.includes('select-project')
    ) {
      return -1;
    }
    return 0;
  }, [location.pathname]);

  return (
    <>
      <Menu />
      <StyledDrawer variant="permanent" open={content ? isSidebarOpen : false}>
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

              if (isDisabled) {
                return (
                  <Tooltip
                    key={element.text}
                    title={element.text}
                    placement="right"
                    arrow
                  >
                    <Box>{listItem}</Box>
                  </Tooltip>
                );
              }

              return (
                <Tooltip
                  key={element.text}
                  title={element.text}
                  placement="right"
                  arrow
                >
                  <StyledNavLink
                    to={element.path}
                    style={{
                      cursor: 'pointer',
                    }}
                  >
                    {listItem}
                  </StyledNavLink>
                </Tooltip>
              );
            })}
          </List>
          {isSidebarOpen && <SidebarContent>{content}</SidebarContent>}
        </Box>
      </StyledDrawer>
    </>
  );
};
