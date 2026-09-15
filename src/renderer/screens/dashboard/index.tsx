import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  Divider,
  Grid,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Typography,
  useTheme,
} from '@mui/material';
import FolderSpecialIcon from '@mui/icons-material/FolderSpecial';
import Terminal from '@mui/icons-material/Terminal';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import AddIcon from '@mui/icons-material/Add';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';

import { icons, rosettaIcon } from '../../../../assets';
import { ReactComponent as RouteIcon } from '../../assets/icons/lucide/route.svg';
import { useAppContext } from '../../hooks';
import {
  useGetProjects,
  useGetConnections,
  useSelectProject,
} from '../../controllers';

const DbtCardIcon: React.FC = () => (
  <img
    src={icons.dbtTm}
    alt="dbt"
    style={{ width: 28, height: 28, objectFit: 'contain' }}
  />
);

const PipelineCardIcon: React.FC = () => {
  const theme = useTheme();
  return (
    <RouteIcon
      width={28}
      height={28}
      style={{ color: theme.palette.primary.main }}
    />
  );
};

const AnalyticsCardIcon: React.FC = () => (
  <img
    src={icons.analytics}
    alt="analytics"
    style={{ width: 28, height: 28, objectFit: 'contain' }}
  />
);

const DataLakeCardIcon: React.FC = () => (
  <img
    src={icons.datalakeCard}
    alt="datalake"
    style={{ width: 28, height: 28, objectFit: 'contain' }}
  />
);

const EtlCardIcon: React.FC = () => (
  <img
    src={icons.dataMigration}
    alt="etl"
    style={{ width: 28, height: 28, objectFit: 'contain' }}
  />
);

const CloudExplorerCardIcon: React.FC = () => (
  <img
    src={icons.cloudSearch}
    alt="cloud explorer"
    style={{ width: 28, height: 28, objectFit: 'contain' }}
  />
);

const SqlEditorCardIcon: React.FC = () => (
  <Terminal color="primary" sx={{ fontSize: 28 }} />
);

const features = [
  {
    id: 'dbt-project',
    title: 'DBT Project',
    category: 'dbt Core',
    description:
      'Manage and explore your dbt models, sources, and documentation.',
    icon: DbtCardIcon,
    path: '/select-project',
  },
  {
    id: 'notebook',
    title: 'Notebook',
    category: 'Analytics',
    description:
      'Create interactive notebooks for data exploration and analysis.',
    icon: AutoStoriesIcon,
    path: '/app/notebooks',
  },
  {
    id: 'sql-editor',
    title: 'SQL Editor',
    category: 'SQL',
    description: 'Write, execute, and profile high-performance SQL queries.',
    icon: SqlEditorCardIcon,
    path: '/app/sql',
  },
  {
    id: 'analytics',
    title: 'Analytics',
    category: 'BI & Viz',
    description: 'Visualize your data with powerful dashboards and charts.',
    icon: AnalyticsCardIcon,
    // navigated programmatically with state: { tab: 2 }
    path: '/app/sql',
  },
  {
    id: 'datalake',
    title: 'Data Lake',
    category: 'Storage',
    description: 'Access and manage raw data across your data lake storage.',
    icon: DataLakeCardIcon,
    path: '/app/data-lake',
  },
  {
    id: 'object-explorer',
    title: 'Object Explorer',
    category: 'Cloud',
    description: 'Browse and manage cloud storage objects effortlessly.',
    icon: CloudExplorerCardIcon,
    path: '/app/cloud-explorer',
  },
  {
    id: 'pipeline',
    title: 'Pipeline',
    category: 'Orchestration',
    description: 'Design and monitor robust data pipelines and workflows.',
    icon: PipelineCardIcon,
    // opened via modal — path unused
    path: '',
  },
  {
    id: 'etl',
    title: 'ETL (Migrate)',
    category: 'Migration',
    description:
      'Extract, transform, and load data seamlessly between systems.',
    icon: EtlCardIcon,
    path: '/app/flows',
  },
];

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { setIsSidebarOpen, selectedProject } = useAppContext();
  const { data: projects = [] } = useGetProjects();
  const { data: connections = [] } = useGetConnections();
  const { mutateAsync: selectProject } = useSelectProject();

  const handleFeatureClick = (path: string) => {
    setIsSidebarOpen(true);
    navigate(path);
  };

  const handleCardClick = (feature: (typeof features)[number]) => {
    if (feature.id === 'pipeline') {
      if (!selectedProject) {
        navigate('/app/select-project');
        return;
      }
      setIsSidebarOpen(true);
      navigate('/app/dbt-project', { state: { openCreatePipeline: true } });
      return;
    }
    if (feature.id === 'analytics') {
      setIsSidebarOpen(true);
      navigate('/app/sql', { state: { tab: 2 } });
      return;
    }
    handleFeatureClick(feature.path);
  };

  const handleOpenProject = async (projectId: string) => {
    try {
      await selectProject({ projectId });
      setIsSidebarOpen(true);
      navigate('/app/dbt-project');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to select project:', err);
    }
  };

  return (
    <Box
      sx={{
        p: { xs: 2.5, md: 4 },
        height: '100%',
        width: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
        backgroundColor: theme.palette.background.default,
      }}
    >
      {/* Hero / Welcome Header */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 4,
          borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: theme.palette.background.paper,
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
          <Box
            component="img"
            src={rosettaIcon}
            alt="Rosetta Studio"
            sx={{ width: 56, height: 56, objectFit: 'contain' }}
          />
          <Box>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                color: theme.palette.text.primary,
                letterSpacing: '-0.5px',
              }}
            >
              Workspace Overview
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Access your data engineering modules, analytics notebooks, and
              pipelines.
            </Typography>
          </Box>
        </Box>

        {/* Quick Header Actions */}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => handleFeatureClick('/app/add-connection')}
            sx={{
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: 2,
            }}
          >
            New Connection
          </Button>
          <Button
            variant="outlined"
            startIcon={<FolderOpenIcon />}
            onClick={() => handleFeatureClick('/select-project')}
            sx={{
              borderColor: theme.palette.divider,
              color: theme.palette.text.primary,
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: 2,
              '&:hover': {
                borderColor: theme.palette.primary.main,
                color: theme.palette.primary.main,
              },
            }}
          >
            Open Project
          </Button>
          <Button
            variant="outlined"
            startIcon={<SettingsOutlinedIcon />}
            onClick={() => handleFeatureClick('/app/settings')}
            sx={{
              borderColor: theme.palette.divider,
              color: theme.palette.text.primary,
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: 2,
              '&:hover': {
                borderColor: theme.palette.primary.main,
                color: theme.palette.primary.main,
              },
            }}
          >
            Settings
          </Button>
        </Box>
      </Paper>

      {/* Main Studio Modules (7 Cards) */}
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
        Studio Modules
      </Typography>
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        {features.map((feature) => {
          const IconComponent = feature.icon;
          return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={feature.id}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 2.5,
                  border: `1px solid ${theme.palette.divider}`,
                  backgroundColor: theme.palette.background.paper,
                  transition: 'all 0.25s ease-in-out',
                  display: 'flex',
                  flexDirection: 'column',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow:
                      theme.palette.mode === 'dark'
                        ? '0 8px 24px rgba(0, 0, 0, 0.4)'
                        : '0 8px 20px rgba(0, 0, 0, 0.08)',
                    borderColor: theme.palette.primary.main,
                    '& .icon-box': {
                      backgroundColor: theme.palette.action.selected,
                      color: theme.palette.primary.main,
                      transform: 'scale(1.05)',
                    },
                  },
                }}
              >
                <CardActionArea
                  onClick={() => handleCardClick(feature)}
                  sx={{
                    height: '100%',
                    p: 2.5,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ width: '100%' }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mb: 2,
                      }}
                    >
                      <Box
                        className="icon-box"
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: 2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: theme.palette.action.hover,
                          color: theme.palette.primary.main,
                          transition: 'all 0.25s ease',
                        }}
                      >
                        <IconComponent />
                      </Box>
                      <Chip
                        label={feature.category}
                        size="small"
                        sx={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          borderRadius: 1.5,
                          backgroundColor:
                            theme.palette.mode === 'dark'
                              ? 'rgba(255, 255, 255, 0.06)'
                              : 'rgba(0, 0, 0, 0.04)',
                          color: theme.palette.text.secondary,
                        }}
                      />
                    </Box>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 700,
                        fontSize: '1.1rem',
                        color: theme.palette.text.primary,
                        mb: 0.8,
                      }}
                    >
                      {feature.title}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {feature.description}
                    </Typography>
                  </Box>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Bottom Panels: Recent Projects & Active Connections */}
      <Grid container spacing={2.5}>
        {/* Recent Projects */}
        <Grid item xs={12} md={6}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2.5,
              border: `1px solid ${theme.palette.divider}`,
              backgroundColor: theme.palette.background.paper,
              height: '100%',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 1.5,
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <FolderOpenIcon sx={{ color: theme.palette.primary.main }} />
                Recent Projects ({projects.length})
              </Typography>
              <Button
                size="small"
                onClick={() => navigate('/select-project')}
                sx={{
                  textTransform: 'none',
                  color: theme.palette.primary.main,
                }}
              >
                View All
              </Button>
            </Box>
            <Divider sx={{ mb: 1 }} />
            {projects.length === 0 ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ py: 3, textAlign: 'center' }}
              >
                No recent projects found.
              </Typography>
            ) : (
              <List disablePadding>
                {projects.slice(0, 4).map((p: any) => (
                  <ListItemButton
                    key={p.id || p.path}
                    onClick={() => handleOpenProject(String(p.id))}
                    sx={{
                      borderRadius: 1.5,
                      mb: 0.5,
                      '&:hover': {
                        backgroundColor: theme.palette.action.hover,
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{ minWidth: 36, color: theme.palette.primary.main }}
                    >
                      <FolderSpecialIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={p.name}
                      secondary={p.path}
                      primaryTypographyProps={{
                        fontWeight: 600,
                        fontSize: '0.9rem',
                      }}
                      secondaryTypographyProps={{
                        fontSize: '0.78rem',
                        noWrap: true,
                      }}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Paper>
        </Grid>

        {/* Database Connections */}
        <Grid item xs={12} md={6}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2.5,
              border: `1px solid ${theme.palette.divider}`,
              backgroundColor: theme.palette.background.paper,
              height: '100%',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 1.5,
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <RouteIcon
                  width={20}
                  height={20}
                  style={{ color: theme.palette.primary.main }}
                />
                Configured Connections ({connections.length})
              </Typography>
              <Button
                size="small"
                onClick={() => handleFeatureClick('/app/connections')}
                sx={{
                  textTransform: 'none',
                  color: theme.palette.primary.main,
                }}
              >
                Manage
              </Button>
            </Box>
            <Divider sx={{ mb: 1 }} />
            {connections.length === 0 ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ py: 3, textAlign: 'center' }}
              >
                No connections configured yet.
              </Typography>
            ) : (
              <List disablePadding>
                {connections.slice(0, 4).map((c: any) => (
                  <ListItemButton
                    key={c.id}
                    onClick={() => handleFeatureClick('/app/connections')}
                    sx={{
                      borderRadius: 1.5,
                      mb: 0.5,
                      '&:hover': {
                        backgroundColor: theme.palette.action.hover,
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{ minWidth: 36, color: theme.palette.primary.main }}
                    >
                      <StorageOutlinedIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={c.connection?.name || c.name || 'Connection'}
                      secondary={c.connection?.type || 'Database'}
                      primaryTypographyProps={{
                        fontWeight: 600,
                        fontSize: '0.9rem',
                      }}
                      secondaryTypographyProps={{
                        fontSize: '0.78rem',
                      }}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
