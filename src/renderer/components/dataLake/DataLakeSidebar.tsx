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
  Chip,
} from '@mui/material';
import { Dashboard, Add } from '@mui/icons-material';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { SettingsSidebarElement } from '../../screens/settings/settingsElements';
import { icons } from '../../../../assets';
import type { DuckLakeInstance } from '../../../types/duckLake';
import type { IcebergInstanceListItem } from '../../../types/iceberg';
import { DataLakeSVG } from '../sidebar/icons';
import { IcebergIcon } from './iceberg/IcebergIcon';

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
];

interface DataLakeSidebarProps {
  instances?: DuckLakeInstance[];
  icebergInstances?: IcebergInstanceListItem[];
}

export const DataLakeSidebar: React.FC<DataLakeSidebarProps> = ({
  instances = [],
  icebergInstances = [],
}) => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  // Extract lake type + instanceId from current path
  const pathSegments = location.pathname.split('/');
  const instancesIndex = pathSegments.indexOf('instances');
  const instanceId =
    instancesIndex >= 0 ? pathSegments[instancesIndex + 1] : null;
  const lakeType = instancesIndex > 0 ? pathSegments[instancesIndex - 1] : null;

  const selectedDuckLakeInstance = instances.find(
    (instance) => lakeType === 'duck-lake' && instance.id === instanceId,
  );
  const selectedIcebergInstance = icebergInstances.find(
    (instance) => lakeType === 'iceberg' && instance.id === instanceId,
  );

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

          {/* DuckLake Instances */}
          {instances.length > 0 && (
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
                DuckLake
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
                          selectedDuckLakeInstance?.id === instance.id
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

          {/* Iceberg Instances */}
          {icebergInstances.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  pb: 1,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: theme.palette.text.secondary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Apache Iceberg
                </Typography>
                <Chip
                  label="BETA"
                  color="primary"
                  size="small"
                  sx={{ height: 16, fontSize: '0.55rem', fontWeight: 700 }}
                />
              </Box>
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
                {icebergInstances.map((instance) => (
                  <StyledDuckLakeNavLink
                    key={instance.id}
                    to={`/app/data-lake/iceberg/instances/${instance.id}`}
                  >
                    <ListItem
                      sx={{
                        cursor: 'pointer',
                        borderRadius: 1,
                        mb: 0,
                        width: '270px',
                        backgroundColor:
                          selectedIcebergInstance?.id === instance.id
                            ? theme.palette.divider
                            : 'transparent',
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <IcebergIcon size={18} />
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
