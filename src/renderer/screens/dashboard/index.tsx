import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  CircularProgress,
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
import { toast } from 'react-toastify';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import AddIcon from '@mui/icons-material/Add';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import DatabaseIcon from '@mui/icons-material/Storage';
import ElectricalServicesIcon from '@mui/icons-material/ElectricalServices';

import { icons, rosettaIcon } from '../../../../assets';
import { connectionIcon } from '../../../connections/registry.renderer';
import { useAppContext } from '../../hooks';
import {
  Slot,
  STUDIO_SLOTS,
  type DashboardCard,
} from '../../../extensionApi/renderer';
import { dashboardCards } from '../../../extensionHost/renderer/contributions.renderer';
import { useRegistry } from '../../../extensionHost/renderer/registry.renderer';
import { QuickStartTour, hasSeenTour, markTourSeen } from '../../components';
import { CommandPalette } from '../../components/commandPalette';
import { CloudLocalEnvironmentSwitch } from '../../components/menu/CloudLocalEnvironmentSwitch';
import {
  useGetProjects,
  useGetConnections,
  useSelectProject,
  useApiKey,
  useAuthLogin,
  useProfile,
} from '../../controllers';

const DbtCardIcon: React.FC = () => (
  <img
    src={icons.dbtTm}
    alt="dbt"
    style={{ width: 28, height: 28, objectFit: 'contain' }}
  />
);

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

const ProjectTypeIcon: React.FC<{ connectionType?: string }> = ({
  connectionType,
}) => {
  const connectionIconSrc = connectionIcon(connectionType);
  if (!connectionIconSrc) {
    return <DatabaseIcon fontSize="small" />;
  }
  return (
    <img
      src={connectionIconSrc}
      alt={connectionType}
      style={{ width: 20, height: 20, objectFit: 'contain' }}
    />
  );
};

// Studio's own Home cards. Extensions add theirs to the same registry;
// the gaps in `order` leave room between them (300 is the SQL Editor card
// and 700 the Pipeline card, which their extensions add).
const features: DashboardCard[] = [
  {
    id: 'dbt-project',
    order: 100,
    title: 'Projects',
    category: 'dbt and Analytics',
    description:
      'Create and open dbt projects, or Analytics projects for notebooks and SQL.',
    icon: DbtCardIcon,
    path: '/app/select-project',
  },
  {
    id: 'notebook',
    order: 200,
    title: 'Notebook',
    category: 'Analytics',
    description:
      'Create interactive notebooks for data exploration and analysis.',
    icon: AutoStoriesIcon,
    path: '/app/notebooks',
  },
  {
    id: 'analytics',
    order: 400,
    title: 'Analytics',
    category: 'BI & Viz',
    description: 'Visualize your data with powerful dashboards and charts.',
    icon: AnalyticsCardIcon,
    // navigated programmatically with state: { tab: 'analytics' }
    path: '/app/sql',
  },
  {
    id: 'datalake',
    order: 500,
    title: 'Data Lake',
    category: 'Storage',
    description: 'Access and manage raw data across your data lake storage.',
    icon: DataLakeCardIcon,
    path: '/app/data-lake',
  },
  {
    id: 'object-explorer',
    order: 600,
    title: 'Object Explorer',
    category: 'Cloud',
    description: 'Browse and manage cloud storage objects effortlessly.',
    icon: CloudExplorerCardIcon,
    path: '/app/cloud-explorer',
  },
  {
    id: 'etl',
    order: 800,
    title: 'ETL (Migrate)',
    category: 'Migration',
    description:
      'Extract, transform, and load data seamlessly between systems.',
    icon: EtlCardIcon,
    path: '/app/flows',
  },
];

features.forEach((feature) => dashboardCards.add(feature));

// How many rows each bottom panel lists; its Manage All button only shows when
// there are more than this.
const panelRowsShownCount = 3;
// Each panel always keeps room for that many rows and for its Manage All
// button, so the page is the same height, and so gets the same scale, however
// many projects or connections there are. A row with a name and a path is
// about 43.5px; the Manage All area is its divider with margins (22px) plus
// the 26px button.
const panelRowsReservedHeight = panelRowsShownCount * 44;
const panelManageAllReservedHeight = 48;

// Below this scale the text gets too small to read, so a smaller window than
// that scrolls instead of shrinking the page further.
const smallestReadablePageScale = 0.7;
// The page needs about this much width for 4 module cards per row, so a narrow
// window shrinks the page instead of squeezing the cards.
const narrowestComfortablePageWidth = 1150;

// Scales the page (CSS transform) so it exactly fills the window's height:
// bigger on big monitors, smaller in a small window, never past the smallest
// readable scale. A transform, not CSS zoom, because Chromium before 128
// (Electron 31) reports positions inside a zoomed page divided by the zoom, so
// tooltips and test clicks would aim at the wrong spot. Off while the quick
// start tour can show (no projects), because the tour's highlight lands in the
// wrong place on a scaled page.
const usePageScaleThatFitsWindow = (isScalingAllowed: boolean) => {
  const windowRef = React.useRef<HTMLDivElement>(null);
  const pageRef = React.useRef<HTMLDivElement>(null);
  const [pageScale, setPageScale] = React.useState(1);
  const [unscaledPageHeight, setUnscaledPageHeight] = React.useState<number>();

  React.useLayoutEffect(() => {
    if (!isScalingAllowed) {
      setPageScale(1);
      setUnscaledPageHeight(undefined);
      return undefined;
    }
    const windowBox = windowRef.current!;
    const page = pageRef.current!;
    const fitPageToWindow = (isGrowingAllowed: boolean) => {
      // Its laid-out height, which a transform doesn't change
      const pageHeight = page.offsetHeight;
      setUnscaledPageHeight(pageHeight);
      const scaleThatFits = Math.min(
        windowBox.clientHeight / pageHeight,
        windowBox.clientWidth / narrowestComfortablePageWidth,
      );
      // Rounded down, so rounding never leaves the page 1px too tall
      const nextScale = Math.max(
        smallestReadablePageScale,
        Math.floor(scaleThatFits * 1000) / 1000,
      );
      // Rescaling rewraps some text, which changes the page's height, so this
      // runs again after each change. Shrinking always applies, so the page
      // never stays too tall. Growing only follows a window resize: growing
      // because a rewrap made the page shorter can make it wrap back and get
      // too tall again, and the page would flicker between the two scales. A
      // tiny grow is skipped too, so it settles.
      setPageScale((previousScale) =>
        nextScale > previousScale &&
        (!isGrowingAllowed || nextScale - previousScale < 0.005)
          ? previousScale
          : nextScale,
      );
    };
    // Fits once before the first paint, so Home doesn't flash at the wrong
    // size, then refits when the window resizes or the page's content changes
    fitPageToWindow(true);
    const resizeObserver = new ResizeObserver((resizedBoxes) =>
      fitPageToWindow(
        resizedBoxes.some((resizedBox) => resizedBox.target === windowBox),
      ),
    );
    // Its outer (border) size, which a scrollbar appearing doesn't change, so
    // only a real window resize counts
    resizeObserver.observe(windowBox, { box: 'border-box' });
    resizeObserver.observe(page);
    return () => resizeObserver.disconnect();
  }, [isScalingAllowed]);

  return { windowRef, pageRef, pageScale, unscaledPageHeight };
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { setIsSidebarOpen } = useAppContext();
  const { data: projects = [] } = useGetProjects();
  const { data: connections = [] } = useGetConnections();
  const { mutateAsync: selectProject } = useSelectProject();
  const cards = useRegistry(dashboardCards);
  const { data: apiKey, isLoading: apiKeyLoading } = useApiKey();
  const { data: profile } = useProfile();
  const { mutate: login, isLoading: loginLoading } = useAuthLogin({
    onSuccess: () => {
      toast.success(
        'Login initiated! Please complete authentication in your browser.',
      );
    },
    onError: (error) => {
      toast.error(`Login failed: ${error.message || 'Unknown error'}`);
    },
  });

  const handleFeatureClick = (path: string) => {
    setIsSidebarOpen(true);
    navigate(path);
  };

  const handleCardClick = (feature: DashboardCard) => {
    if (feature.id === 'analytics') {
      setIsSidebarOpen(true);
      navigate('/app/sql', { state: { tab: 'analytics' } });
      return;
    }
    if (feature.onSelect) {
      feature.onSelect({
        navigate,
        openSidebar: () => setIsSidebarOpen(true),
        hasProjects: projects.length > 0,
      });
      return;
    }
    if (feature.path) handleFeatureClick(feature.path);
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

  React.useEffect(() => {
    if (projects.length > 0 && !hasSeenTour()) {
      markTourSeen();
    }
  }, [projects.length]);

  const outlinedButtonSx = {
    borderColor: theme.palette.divider,
    color: theme.palette.text.primary,
    fontWeight: 600,
    textTransform: 'none',
    borderRadius: 2,
    '&:hover': {
      borderColor: theme.palette.primary.main,
      color: theme.palette.primary.main,
    },
  };

  const manageAllButtonSx = {
    ...outlinedButtonSx,
    height: 26,
    fontSize: '0.75rem',
  };

  // A page that fits the window keeps 4 cards per row and its panels side by
  // side, shrinking instead; otherwise a narrow window stacks them.
  const isPageFitToWindow = projects.length > 0;
  const { windowRef, pageRef, pageScale, unscaledPageHeight } =
    usePageScaleThatFitsWindow(isPageFitToWindow);

  const mostRecentlyOpenedProjects = [...projects]
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
    .slice(0, panelRowsShownCount);

  return (
    <Box
      ref={windowRef}
      sx={{
        height: '100%',
        width: '100%',
        overflowY: 'auto',
        backgroundColor: theme.palette.background.default,
      }}
    >
      {/* A transform doesn't change the space the page takes up, so this box
          takes the scaled page's height (and clips its unscaled size), so the
          window only scrolls when the scaled page is too tall */}
      <Box
        sx={{
          height:
            unscaledPageHeight === undefined
              ? undefined
              : unscaledPageHeight * pageScale,
          overflow: 'hidden',
        }}
      >
        <Box
          ref={pageRef}
          sx={{
            px: { xs: 2.5, md: 4 },
            py: 1.5,
            boxSizing: 'border-box',
            // Laid out this much wider, so once scaled it fills the width
            width: `${100 / pageScale}%`,
            transform: pageScale === 1 ? undefined : `scale(${pageScale})`,
            transformOrigin: 'top left',
          }}
        >
          {/* Hero / Welcome Header */}
          <Paper
            elevation={0}
            data-tour="tour-workspace-overview"
            sx={{
              px: 3,
              py: 1.5,
              mb: 2,
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
                  variant="h5"
                  sx={{
                    fontWeight: 800,
                    color: theme.palette.text.primary,
                    letterSpacing: '-0.5px',
                  }}
                >
                  Workspace Overview
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  Access your data engineering modules, analytics notebooks, and
                  pipelines.
                </Typography>
              </Box>
            </Box>

            {/* Quick Header Actions */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                flexWrap: 'wrap',
              }}
            >
              <CommandPalette />
              {/* Once logged in, Connect to Cloud turns into the Cloud / Local
              switch (shown when the profile has loaded, like the top bar) */}
              {apiKey && profile && <CloudLocalEnvironmentSwitch />}
              {!apiKey && (
                <Button
                  variant="outlined"
                  disabled={apiKeyLoading || loginLoading}
                  startIcon={
                    apiKeyLoading || loginLoading ? (
                      <CircularProgress size={16} />
                    ) : (
                      <Box
                        component="img"
                        src={rosettaIcon}
                        alt="Rosetta"
                        sx={{ width: 18, height: 18 }}
                      />
                    )
                  }
                  onClick={() => login()}
                  sx={outlinedButtonSx}
                >
                  Connect to Cloud
                </Button>
              )}
              <Button
                variant="outlined"
                startIcon={<SettingsOutlinedIcon />}
                onClick={() => handleFeatureClick('/app/settings')}
                sx={outlinedButtonSx}
              >
                Settings
              </Button>
            </Box>
          </Paper>

          {/* Main Studio Modules (7 Cards) */}
          <Box data-tour="tour-modules-area">
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
              Studio Modules
            </Typography>
            <Grid container rowSpacing={2} columnSpacing={2.5} sx={{ mb: 2 }}>
              {cards.map((feature) => {
                const IconComponent = feature.icon;
                return (
                  <Grid
                    item
                    xs={isPageFitToWindow ? 3 : 12}
                    sm={isPageFitToWindow ? 3 : 6}
                    md={isPageFitToWindow ? 3 : 4}
                    lg={3}
                    key={feature.id}
                  >
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
                          p: 2,
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
                              mb: 1,
                            }}
                          >
                            <Box
                              className="icon-box"
                              sx={{
                                width: 40,
                                height: 40,
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
          </Box>

          {/* Bottom Panels: Recent Projects & Active Connections */}
          <Grid container spacing={2.5}>
            {/* Recent Projects */}
            <Grid item xs={isPageFitToWindow ? 6 : 12} md={6}>
              <Paper
                elevation={0}
                data-tour="tour-recent-projects"
                sx={{
                  px: 2.5,
                  pt: 1.5,
                  pb: 1.125,
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
                    mb: 1.25,
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
                    <FolderOpenIcon
                      sx={{ color: theme.palette.primary.main }}
                    />
                    Recent Projects ({projects.length})
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={() => {
                      setIsSidebarOpen(true);
                      navigate('/app/select-project', {
                        state: { startNewProject: true },
                      });
                    }}
                    data-tour="tour-open-project-btn"
                    sx={outlinedButtonSx}
                  >
                    New Project
                  </Button>
                </Box>
                <Divider sx={{ mb: 1 }} />
                <Box sx={{ minHeight: panelRowsReservedHeight }}>
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
                      {mostRecentlyOpenedProjects.map((p: any) => (
                        <ListItemButton
                          key={p.id || p.path}
                          onClick={() => handleOpenProject(String(p.id))}
                          sx={{
                            borderRadius: 1.5,
                            py: 0.25,
                            '&:hover': {
                              backgroundColor: theme.palette.action.hover,
                            },
                          }}
                        >
                          <ListItemIcon
                            sx={{
                              minWidth: 36,
                              color: theme.palette.primary.main,
                            }}
                          >
                            <ProjectTypeIcon
                              connectionType={p.connection?.type}
                            />
                          </ListItemIcon>
                          <ListItemText
                            sx={{ my: 0 }}
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
                </Box>
                {/* A flex column, so the divider's margins stay inside this box */}
                <Box
                  sx={{
                    height: panelManageAllReservedHeight,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {projects.length > panelRowsShownCount && (
                    <>
                      <Divider sx={{ mt: 1.5, mb: 1.125 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => navigate('/app/select-project')}
                          sx={manageAllButtonSx}
                        >
                          Manage All Projects
                        </Button>
                      </Box>
                    </>
                  )}
                </Box>
              </Paper>
            </Grid>

            {/* Database Connections */}
            <Grid item xs={isPageFitToWindow ? 6 : 12} md={6}>
              <Paper
                elevation={0}
                data-tour="tour-configured-connections"
                sx={{
                  px: 2.5,
                  pt: 1.5,
                  pb: 1.125,
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
                    mb: 1.25,
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
                    <ElectricalServicesIcon
                      sx={{ color: theme.palette.primary.main }}
                    />
                    Configured Connections ({connections.length})
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={() => handleFeatureClick('/app/add-connection')}
                    sx={outlinedButtonSx}
                  >
                    New Connection
                  </Button>
                </Box>
                <Divider sx={{ mb: 1 }} />
                <Box sx={{ minHeight: panelRowsReservedHeight }}>
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
                      {connections
                        .slice(0, panelRowsShownCount)
                        .map((c: any) => (
                          <ListItemButton
                            key={c.id}
                            onClick={() =>
                              handleFeatureClick('/app/connections')
                            }
                            sx={{
                              borderRadius: 1.5,
                              py: 0.25,
                              '&:hover': {
                                backgroundColor: theme.palette.action.hover,
                              },
                            }}
                          >
                            <ListItemIcon
                              sx={{
                                minWidth: 36,
                                color: theme.palette.primary.main,
                              }}
                            >
                              <ProjectTypeIcon
                                connectionType={c.connection?.type}
                              />
                            </ListItemIcon>
                            <ListItemText
                              sx={{ my: 0 }}
                              primary={
                                c.connection?.name || c.name || 'Connection'
                              }
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
                </Box>
                {/* A flex column, so the divider's margins stay inside this box */}
                <Box
                  sx={{
                    height: panelManageAllReservedHeight,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {connections.length > panelRowsShownCount && (
                    <>
                      <Divider sx={{ mt: 1.5, mb: 1.125 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleFeatureClick('/app/connections')}
                          sx={manageAllButtonSx}
                        >
                          Manage All Connections
                        </Button>
                      </Box>
                    </>
                  )}
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </Box>
      </Box>
      {/* Dialogs that extensions keep mounted on Home */}
      <Slot id={STUDIO_SLOTS.homeOverlays} />
      {/* Only show the quick start tour for brand-new users with no projects */}
      {projects.length === 0 && <QuickStartTour />}
    </Box>
  );
};

export default Dashboard;
