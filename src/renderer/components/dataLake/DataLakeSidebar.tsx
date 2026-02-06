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
  Alert,
} from '@mui/material';
import { Dashboard, History, Add, Description } from '@mui/icons-material';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { SettingsSidebarElement } from '../../screens/settings/settingsElements';
import { icons } from '../../../../assets';
import type { DuckLakeInstance } from '../../../types/duckLake';
import { DataLakeSVG } from '../sidebar/icons';
import { useNotebooks } from '../../controllers/notebook.controller';

export const DataLakeIcon: React.FC<{
  fontSize?: 'small' | 'medium';
}> = ({ fontSize = 'small' }) => (
  <Box
    component="img"
    src={icons.duckLake}
    alt="DuckLake"
    sx={{
      width: fontSize === 'small' ? 14 : 18,
      height: fontSize === 'small' ? 14 : 18,
    }}
  />
);

export const StyledDuckLakeNavLink = styled(NavLink)(({ theme }) => ({
  textDecoration: 'none',
  color: theme.palette.grey[600],
  display: 'block',
  width: '270px',
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

// Create a wrapper component for DataLakeSVG to use as an icon
const DataLakeIconSmall: React.FC = () => (
  <DataLakeSVG width={18} height={18} />
);

export const dataLakeSidebarElements: SettingsSidebarElement[] = [
  {
    icon: Dashboard,
    text: 'Dashboard',
    path: '/app/data-lake/dashboard',
  },
  {
    icon: DataLakeIconSmall as any,
    text: 'DataLakes',
    path: '/app/data-lake/instances',
  },
  {
    icon: History,
    text: 'Query History',
    path: '/app/data-lake/history',
  },
];

interface DataLakeSidebarProps {
  instances?: DuckLakeInstance[];
}

export const DataLakeSidebar: React.FC<DataLakeSidebarProps> = ({
  instances = [],
}) => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  // Extract instanceId from current path
  const pathSegments = location.pathname.split('/');
  const instanceId = pathSegments.includes('instances')
    ? pathSegments[pathSegments.indexOf('instances') + 1]
    : null;

  const selectedInstance = instances.find(
    (instance) => instance.id === instanceId,
  );

  // Check if we're in the notebooks section
  const isInNotebooksSection = pathSegments.includes('notebooks');

  // Fetch notebooks if we're in the notebooks section and have an instanceId
  const { data: notebooks = [] } = useNotebooks(
    isInNotebooksSection && instanceId ? instanceId : '',
  );

  // Extract current notebookId if viewing a specific notebook
  const notebookId =
    pathSegments.includes('notebooks') &&
    pathSegments.length > pathSegments.indexOf('notebooks') + 1
      ? pathSegments[pathSegments.indexOf('notebooks') + 1]
      : null;

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
    >
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
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
            <DataLakeSVG width={18} height={18} />
            <Typography variant="h6" sx={{ m: 0 }}>
              DataLake
            </Typography>
          </Box>
        </Box>
        <Box sx={{ overflow: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
          {/* Main Navigation */}
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
            {dataLakeSidebarElements.map((element) => (
              <StyledDuckLakeNavLink key={element.text} to={element.path}>
                <ListItem
                  sx={{
                    cursor: 'pointer',
                    borderRadius: 1,
                    mb: 0,
                    width: '270px',
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
                        location.pathname === element.path
                          ? 'primary'
                          : 'inherit'
                      }
                    />
                  </ListItemIcon>
                  <ListItemText primary={element.text} />
                </ListItem>
              </StyledDuckLakeNavLink>
            ))}
          </List>

          {/* Instances List */}
          {instances.length > 0 && !isInNotebooksSection && (
            <Box sx={{ mt: 3 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  px: 2,
                  pb: 1,
                  fontWeight: 600,
                  color: theme.palette.text.secondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                DataLakes
              </Typography>
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
                {instances.map((instance) => (
                  <StyledDuckLakeNavLink
                    key={instance.id}
                    to={`/app/data-lake/duck-lake/instances/${instance.id}`}
                  >
                    <ListItem
                      sx={{
                        cursor: 'pointer',
                        borderRadius: 1,
                        mb: 0,
                        width: '270px',
                        backgroundColor:
                          selectedInstance?.id === instance.id
                            ? theme.palette.divider
                            : 'transparent',
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <DataLakeIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={instance.name}
                        primaryTypographyProps={{
                          variant: 'body2',
                          sx: { fontSize: '0.875rem' },
                        }}
                      />
                    </ListItem>
                  </StyledDuckLakeNavLink>
                ))}
              </List>
            </Box>
          )}

          {/* Active Instance (when in notebooks section) */}
          {isInNotebooksSection && selectedInstance && (
            <Box sx={{ mt: 3 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  px: 2,
                  pb: 1,
                  fontWeight: 600,
                  color: theme.palette.text.secondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                DataLake
              </Typography>
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
                <StyledDuckLakeNavLink
                  to={`/app/data-lake/duck-lake/instances/${selectedInstance.id}`}
                >
                  <ListItem
                    sx={{
                      cursor: 'pointer',
                      borderRadius: 1,
                      mb: 0,
                      width: '270px',
                      backgroundColor: theme.palette.divider,
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <DataLakeIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={selectedInstance.name}
                      primaryTypographyProps={{
                        variant: 'body2',
                        sx: { fontSize: '0.875rem', fontWeight: 500 },
                      }}
                    />
                  </ListItem>
                </StyledDuckLakeNavLink>
              </List>
            </Box>
          )}

          {/* Notebooks List */}
          {isInNotebooksSection && (
            <Box sx={{ mt: 3 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  px: 2,
                  pb: 1,
                  fontWeight: 600,
                  color: theme.palette.text.secondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Notebooks
              </Typography>
              {notebooks.length > 0 ? (
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
                  {notebooks.map((notebook) => (
                    <StyledDuckLakeNavLink
                      key={notebook.id}
                      to={`/app/data-lake/duck-lake/instances/${instanceId}/notebooks/${notebook.id}`}
                    >
                      <ListItem
                        sx={{
                          cursor: 'pointer',
                          borderRadius: 1,
                          mb: 0,
                          width: '270px',
                          backgroundColor:
                            notebookId === notebook.id
                              ? theme.palette.divider
                              : 'transparent',
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <Description fontSize="small" />
                        </ListItemIcon>
                        <ListItemText
                          primary={notebook.name}
                          primaryTypographyProps={{
                            variant: 'body2',
                            sx: {
                              fontSize: '0.875rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            },
                          }}
                        />
                      </ListItem>
                    </StyledDuckLakeNavLink>
                  ))}
                </List>
              ) : (
                <Box sx={{ px: 2, py: 1 }}>
                  <Alert severity="info" sx={{ fontSize: '0.75rem', py: 0.5 }}>
                    No notebooks yet
                  </Alert>
                </Box>
              )}
            </Box>
          )}
        </Box>
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
          onClick={() => navigate('/app/data-lake/new-instance')}
          sx={{ width: '100%', boxSizing: 'border-box' }}
        >
          New DataLake
        </Button>
      </Box>
    </Box>
  );
};
