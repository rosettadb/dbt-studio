import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Typography,
} from '@mui/material';
import {
  Add,
  Dashboard,
  DriveFolderUpload,
  FolderCopy,
  History,
  Rocket,
  Storage,
  Terminal,
} from '@mui/icons-material';
import {
  useGetConnections,
  useGetProjects,
  useSelectProject,
} from '../../controllers';
import { useRecentDbtRuns } from '../../hooks/useRecentDbtRuns';
import { useProjectImport } from '../../hooks/useProjectImport';
import { CloneRepoModal } from '../modals/cloneRepoModal';
import { GetStartedModal } from '../GetStartedModal';
import connectionIcons from '../../../../assets/connectionIcons';
import { SupportedConnectionTypes } from '../../../types/backend';

const cardSx = {
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  transition: 'all 0.3s ease',
  '&:hover': {
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    transform: 'translateY(-2px)',
  },
};

const StatCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <Card sx={cardSx}>
    <CardHeader
      title={
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography variant="subtitle2" color="text.secondary">
            {title}
          </Typography>
          {icon}
        </Box>
      }
      sx={{ pb: 1 }}
    />
    <CardContent sx={{ pt: 0 }}>{children}</CardContent>
  </Card>
);

const statusColor = (status: string) => {
  if (status === 'success') return 'success';
  if (status === 'error') return 'error';
  if (status === 'warn') return 'warning';
  return 'default';
};

const ProjectsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { data: projects = [] } = useGetProjects();
  const { data: connections = [] } = useGetConnections();
  const { mutateAsync: selectProject } = useSelectProject();
  const { importProject } = useProjectImport();
  const [cloneOpen, setCloneOpen] = React.useState(false);
  const [getStartedOpen, setGetStartedOpen] = React.useState(false);

  const runs = useRecentDbtRuns(projects, 10);
  const lastRun = runs[0];

  const recentProjects = useMemo(
    () =>
      [...projects]
        .filter((p) => p.lastOpenedAt)
        .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
        .slice(0, 5),
    [projects],
  );

  const connectionsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    connections.forEach((c) => {
      counts[c.connection.type] = (counts[c.connection.type] || 0) + 1;
    });
    return counts;
  }, [connections]);

  const openProject = async (projectId?: string) => {
    if (!projectId) return;
    await selectProject({ projectId });
    navigate('/app/dbt-project');
  };

  const hasGettingStarted = projects.some(
    (p) => p.name === 'dbtstudio_getting_started',
  );

  return (
    <Box sx={{ p: 2 }} data-testid="projects-dashboard">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
          Dashboard
        </Typography>
        <Dashboard sx={{ color: 'text.secondary', fontSize: 28 }} />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 3,
        }}
      >
        <StatCard
          title="Total Projects"
          icon={<FolderCopy sx={{ color: 'text.secondary', fontSize: 20 }} />}
        >
          <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
            {projects.length}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {projects.length === 1 ? 'Project' : 'Projects'} in Studio
          </Typography>
        </StatCard>

        <StatCard
          title="Connections"
          icon={<Storage sx={{ color: 'text.secondary', fontSize: 20 }} />}
        >
          <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
            {connections.length}
          </Typography>
          <Box
            sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}
          >
            {Object.entries(connectionsByType).map(([type, count]) => {
              const icon =
                connectionIcons.images[type as SupportedConnectionTypes];
              return (
                <Box
                  key={type}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  {icon && (
                    <img
                      src={icon}
                      alt={type}
                      style={{ width: 16, height: 16, objectFit: 'contain' }}
                    />
                  )}
                  <Typography variant="body2" color="text.secondary">
                    {count} {type}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </StatCard>

        <StatCard
          title="Last dbt run"
          icon={<Terminal sx={{ color: 'text.secondary', fontSize: 20 }} />}
        >
          {lastRun ? (
            <>
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                {lastRun.command}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {lastRun.projectName} ·{' '}
                {formatDistanceToNow(new Date(lastRun.startedAt), {
                  addSuffix: true,
                })}
              </Typography>
              <Chip
                size="small"
                label={lastRun.status}
                color={statusColor(lastRun.status)}
                sx={{ mt: 1 }}
              />
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No dbt runs yet
            </Typography>
          )}
        </StatCard>

        <Card sx={{ ...cardSx, gridColumn: { md: 'span 2' } }}>
          <CardHeader
            title={
              <Typography variant="subtitle2" color="text.secondary">
                Recent projects
              </Typography>
            }
            action={
              <Button
                size="small"
                onClick={() => navigate('/app/projects/recent')}
              >
                View all
              </Button>
            }
            sx={{ pb: 1 }}
          />
          <CardContent sx={{ pt: 0 }}>
            {recentProjects.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Open a project and it will appear here.
              </Typography>
            ) : (
              recentProjects.map((project) => (
                <Box
                  key={project.id}
                  onClick={() => openProject(project.id)}
                  data-testid={`dashboard-recent-${project.name}`}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    py: 0.75,
                    px: 1,
                    borderRadius: 1,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Typography variant="body2">{project.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDistanceToNow(project.lastOpenedAt as number, {
                      addSuffix: true,
                    })}
                  </Typography>
                </Box>
              ))
            )}
          </CardContent>
        </Card>

        <Card sx={cardSx}>
          <CardHeader
            title={
              <Typography variant="subtitle2" color="text.secondary">
                Quick actions
              </Typography>
            }
            sx={{ pb: 1 }}
          />
          <CardContent
            sx={{ pt: 0, display: 'flex', flexDirection: 'column', gap: 1 }}
          >
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => navigate('/app/projects/new')}
            >
              New Project
            </Button>
            <Button variant="outlined" onClick={() => setCloneOpen(true)}>
              Clone from git
            </Button>
            <Button
              variant="outlined"
              startIcon={<DriveFolderUpload />}
              onClick={importProject}
            >
              Import folder or zip
            </Button>
            {!hasGettingStarted && (
              <Button
                variant="outlined"
                startIcon={<Rocket />}
                onClick={() => setGetStartedOpen(true)}
              >
                Getting-started example
              </Button>
            )}
          </CardContent>
        </Card>

        <Card sx={{ ...cardSx, gridColumn: '1 / -1' }}>
          <CardHeader
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <History sx={{ color: 'text.secondary', fontSize: 20 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Recent dbt runs
                </Typography>
              </Box>
            }
            sx={{ pb: 1 }}
          />
          <CardContent sx={{ pt: 0 }}>
            {runs.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Runs from the project editor will appear here.
              </Typography>
            ) : (
              runs.map((run) => (
                <Box
                  key={run.id}
                  onClick={() => openProject(run.projectId)}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1.5fr 1.5fr 90px 80px 1fr',
                    gap: 1,
                    alignItems: 'center',
                    py: 0.75,
                    px: 1,
                    borderRadius: 1,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Typography variant="body2" noWrap>
                    {run.projectName}
                  </Typography>
                  <Typography variant="body2" noWrap color="text.secondary">
                    {run.command}
                  </Typography>
                  <Chip
                    size="small"
                    label={run.status}
                    color={statusColor(run.status)}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {run.elapsedTime != null
                      ? `${run.elapsedTime.toFixed(1)}s`
                      : '-'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDistanceToNow(new Date(run.startedAt), {
                      addSuffix: true,
                    })}
                  </Typography>
                </Box>
              ))
            )}
          </CardContent>
        </Card>
      </Box>

      <GetStartedModal
        isOpen={getStartedOpen}
        onClose={() => setGetStartedOpen(false)}
      />
      {cloneOpen && (
        <CloneRepoModal
          isOpen={cloneOpen}
          onClose={() => setCloneOpen(false)}
        />
      )}
    </Box>
  );
};

export default ProjectsDashboard;
