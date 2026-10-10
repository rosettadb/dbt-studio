import React from 'react';
import {
  Box,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  useTheme,
} from '@mui/material';
import { Add, Dashboard, FolderCopy, History } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { SettingsSidebarElement } from '../../screens/settings/settingsElements';
import { StyledSettingsNavLink } from '../cloudExplorer/ExplorerSidebar';

export const projectsSidebarElements: SettingsSidebarElement[] = [
  { icon: Dashboard, text: 'Dashboard', path: '/app/projects/dashboard' },
  { icon: FolderCopy, text: 'Projects', path: '/app/projects/list' },
  { icon: History, text: 'Recent', path: '/app/projects/recent' },
];

export const ProjectsSidebar: React.FC = () => {
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
        overflow: 'hidden',
      }}
      data-testid="projects-sidebar"
    >
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
          <FolderCopy color="primary" fontSize="small" />
          <Typography variant="h6" sx={{ m: 0 }}>
            Projects
          </Typography>
        </Box>
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
          {projectsSidebarElements.map((element) => {
            const active = location.pathname === element.path;
            return (
              <StyledSettingsNavLink
                key={element.text}
                to={element.path}
                data-testid={`projects-nav-${element.text.toLowerCase()}`}
              >
                <ListItem
                  sx={{
                    cursor: 'pointer',
                    borderRadius: 1,
                    mb: 0,
                    width: '270px',
                    backgroundColor: active
                      ? theme.palette.divider
                      : 'transparent',
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <element.icon
                      fontSize="small"
                      color={active ? 'primary' : 'inherit'}
                    />
                  </ListItemIcon>
                  <ListItemText primary={element.text} />
                </ListItem>
              </StyledSettingsNavLink>
            );
          })}
        </List>
      </Box>
      <Box
        sx={{
          mt: 'auto',
          pt: 2,
          borderTop: `1px solid ${theme.palette.divider}`,
          width: '270px',
          boxSizing: 'border-box',
        }}
      >
        <Button
          variant="contained"
          color="primary"
          fullWidth
          startIcon={<Add />}
          onClick={() => navigate('/app/projects/new')}
          data-testid="projects-new-btn"
        >
          New Project
        </Button>
      </Box>
    </Box>
  );
};
