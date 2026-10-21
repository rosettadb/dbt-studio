import React from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardHeader,
  CardContent,
  Chip,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  Add,
  Edit,
  DeleteOutline,
  Storage as DatabaseIcon,
  SwapHoriz,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ReactComponent as RouteIcon } from '../../assets/icons/lucide/route.svg';
import { FileTreeViewer, SearchInFilesPanel } from '../index';
import type { SearchResultSelection } from '../searchInFiles';
import { FileTreeContainer } from '../../screens/projectDetails/styles';
import {
  FileNode,
  Project,
  SupportedConnectionTypes,
} from '../../../types/backend';
import { SourceControlView } from '../sourceControl';
import connectionIcons from '../../../../assets/connectionIcons';
import {
  useGetConnectionById,
  useGetConnections,
  useGetFileStatuses,
  useGetProjectFiles,
  useGetSelectedProject,
  useGetSettings,
  useGitIsInitialized,
  useListPipelines,
  useUpdateProject,
} from '../../controllers';
import {
  AddConnectionModal,
  CreatePipelineModal,
  PushToCloudModal,
  RemoveConnectionModal,
  RunWithEnvModal,
} from '../modals';
import { useTabs } from '../../context/TabsProvider';
import { useRefreshProjectFiles } from '../../hooks/useRefreshProjectFiles';
import { projectsServices } from '../../services';
import {
  getPipelineRelativeName,
  getPipelineRelativePath,
} from '../pipelineView';

export type SidebarTab = 'explorer' | 'search' | 'scm' | 'connections';

// Helper function to get connection type name
const getConnectionTypeName = (connectionType?: string) => {
  if (!connectionType) {
    return 'UNKNOWN';
  }

  switch (connectionType) {
    case 'postgres':
      return 'PostgreSQL';
    case 'snowflake':
      return 'Snowflake';
    case 'bigquery':
      return 'BigQuery';
    case 'redshift':
      return 'Redshift';
    case 'databricks':
      return 'Databricks';
    case 'duckdb':
      return 'DuckDB';
    case 'kinetica':
      return 'Kinetica';
    case 'oracle':
      return 'Oracle';
    case 'mysql':
      return 'MySQL';
    default:
      return String(connectionType).toUpperCase();
  }
};

// Helper function to get connection type color
const getConnectionTypeColor = (connectionType: string) => {
  switch (connectionType) {
    case 'postgres':
      return '#336791';
    case 'snowflake':
      return '#29b5e8';
    case 'bigquery':
      return '#4285f4';
    case 'redshift':
      return '#8c4fff';
    case 'databricks':
      return '#ff3621';
    case 'duckdb':
      return '#fff000';
    case 'mysql':
      return '#00758f';
    default:
      return '#666';
  }
};

// Connections Tab Component — owns the add/edit/remove flows for the
// project's database connection.
const ConnectionsTab: React.FC<{ project: Project }> = ({ project }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { data: connection } = useGetConnectionById(project.connectionId);
  const { data: connections = [] } = useGetConnections();
  const { refetch: refetchProject } = useGetSelectedProject();
  const { mutate: updateProject } = useUpdateProject();
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = React.useState(false);

  const modals = (
    <>
      <AddConnectionModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        project={project}
        connections={connections}
        onSuccess={() => {
          refetchProject();
        }}
        onUpdateProject={updateProject}
      />
      <RemoveConnectionModal
        isOpen={isRemoveOpen}
        onClose={() => setIsRemoveOpen(false)}
        onConfirm={() => {
          updateProject({ ...project, connectionId: undefined });
          toast.success('Connection removed from project successfully!');
          setIsRemoveOpen(false);
        }}
        connectionName={
          connection?.connection?.name || (connection as any)?.name
        }
      />
    </>
  );

  if (!connection) {
    return (
      <Box
        sx={{
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <DatabaseIcon
          sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.5 }}
        />
        <Typography
          variant="body2"
          color="text.secondary"
          textAlign="center"
          sx={{ whiteSpace: 'normal' }}
        >
          No database connection is associated with this project.
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setIsAddOpen(true)}
          size="small"
        >
          Add Connection
        </Button>
        {modals}
      </Box>
    );
  }

  const connType = connection.connection?.type || (connection as any).type;
  const connName = connection.connection?.name || (connection as any).name;
  const iconSrc = connectionIcons.images[connType as SupportedConnectionTypes];
  const chipBgColor = getConnectionTypeColor(connType);
  const chipTextColor = theme.palette.getContrastText(chipBgColor);

  return (
    <Box
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontSize: '0.65rem',
          fontWeight: 600,
        }}
      >
        Active Connection
      </Typography>

      <Card
        sx={{
          boxShadow: 'none',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <CardHeader
          avatar={
            iconSrc ? (
              <img
                src={iconSrc}
                alt={connType}
                style={{ width: 28, height: 28, objectFit: 'contain' }}
              />
            ) : (
              <DatabaseIcon sx={{ fontSize: 28 }} />
            )
          }
          title={
            <Typography
              variant="body2"
              fontWeight="bold"
              sx={{ fontSize: '0.8rem' }}
            >
              {connName}
            </Typography>
          }
          subheader={
            <Box sx={{ mt: 0.5 }}>
              <Chip
                label={getConnectionTypeName(connType)}
                size="small"
                sx={{
                  bgcolor: chipBgColor,
                  color: chipTextColor,
                  fontWeight: 'bold',
                  fontSize: '0.6rem',
                  height: '18px',
                }}
              />
            </Box>
          }
          sx={{ pb: 1, '& .MuiCardHeader-content': { overflow: 'hidden' } }}
        />
        <CardContent sx={{ pt: 1, pb: '8px !important' }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Edit sx={{ fontSize: 14 }} />}
              onClick={() => navigate(`/app/edit-connection/${connection.id}`)}
              sx={{ flex: 1, fontSize: '0.7rem', py: 0.5 }}
            >
              Edit
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<DeleteOutline sx={{ fontSize: 14 }} />}
              onClick={() => setIsRemoveOpen(true)}
              sx={{ flex: 1, fontSize: '0.7rem', py: 0.5 }}
            >
              Remove
            </Button>
          </Box>
        </CardContent>
      </Card>

      <Divider sx={{ my: 1 }} />

      <Button
        variant="text"
        startIcon={<SwapHoriz sx={{ fontSize: 18 }} />}
        onClick={() => setIsAddOpen(true)}
        size="small"
        sx={{
          alignSelf: 'flex-start',
          fontSize: '0.75rem',
          color: 'text.secondary',
          '&:hover': { color: 'primary.main' },
        }}
      >
        Change Connection
      </Button>
      {modals}
    </Box>
  );
};

// Explorer Tab Component — file tree plus the per-pipeline run buttons.
const ExplorerTab: React.FC<{
  project: Project;
  openCreatePipeline?: boolean;
}> = ({ project, openCreatePipeline }) => {
  const theme = useTheme();
  const { activeFilePath, openFile, closeTabByPath, renameTab } = useTabs();
  const { data: settings } = useGetSettings();
  const { data: connection } = useGetConnectionById(project.connectionId);
  const refreshProjectFiles = useRefreshProjectFiles();
  const { data: directories, isLoading: isLoadingDirectories } =
    useGetProjectFiles(project, { enabled: !!project.id });
  const { data: isInitialized } = useGitIsInitialized(project.path, {
    enabled: !!project.path,
  });
  const { data: statuses = [] } = useGetFileStatuses(project.path, {
    enabled: !!project.path && !!isInitialized,
  });
  const { refetch: refetchPipelines } = useListPipelines(project.id);

  const [createPipelineOpen, setCreatePipelineOpen] = React.useState(false);
  const [cloudRunArgs, setCloudRunArgs] = React.useState<string | null>(null);
  const [localRunFile, setLocalRunFile] = React.useState<string | null>(null);

  // Open the modal when triggered externally (e.g. from the home screen pipeline card)
  React.useEffect(() => {
    if (openCreatePipeline) {
      setCreatePipelineOpen(true);
    }
  }, [openCreatePipeline]);

  const handleFileSelect = React.useCallback(
    (fileNode: FileNode) => {
      openFile(fileNode.path);
    },
    [openFile],
  );

  const handlePipelineCreated = React.useCallback(
    async (filePath: string) => {
      await refetchPipelines();
      await refreshProjectFiles();
      openFile(filePath);
    },
    [refetchPipelines, refreshProjectFiles, openFile],
  );

  return (
    <FileTreeContainer sx={{ gap: 0, p: 0 }}>
      {/* Tree takes all remaining space */}
      <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {directories && (
          <FileTreeViewer
            statuses={statuses}
            node={directories}
            onDeleteFileCallback={closeTabByPath}
            onFileSelect={handleFileSelect}
            isLoadingFiles={isLoadingDirectories}
            refreshFiles={refreshProjectFiles}
            copyPath={async (source, target) => {
              await projectsServices.copyPath({ source, target });
              await refreshProjectFiles();
            }}
            onNewFileCallback={(filePath) => {
              if (filePath) openFile(filePath);
            }}
            selectedPath={activeFilePath}
            onRenameCallback={renameTab}
            onRunPipeline={(filePath) =>
              setCloudRunArgs(
                `--pipeline_name ${getPipelineRelativeName(filePath, project.path)}`,
              )
            }
            onRunPipelineLocal={(filePath) => {
              if (!settings?.runnerPath) return;
              setLocalRunFile(getPipelineRelativePath(filePath, project.path));
            }}
          />
        )}
      </Box>

      {/* Create Pipeline button — always visible */}
      <Box
        sx={{
          px: 1,
          pb: 1,
          pt: 0.75,
          flexShrink: 0,
          borderTop: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Tooltip
          title="Create a pipeline to run jobs on the cloud"
          placement="top"
          arrow
        >
          <Button
            fullWidth
            variant="contained"
            size="small"
            startIcon={<RouteIcon width={16} height={16} />}
            onClick={() => setCreatePipelineOpen(true)}
            sx={{
              fontSize: '0.72rem',
              py: 0.75,
            }}
          >
            Create Pipeline
          </Button>
        </Tooltip>
      </Box>

      <CreatePipelineModal
        isOpen={createPipelineOpen}
        onClose={() => setCreatePipelineOpen(false)}
        project={project}
        onCreated={(filePath) => handlePipelineCreated(filePath)}
        onApplied={async () => {
          await refetchPipelines();
          await refreshProjectFiles();
        }}
      />
      {cloudRunArgs !== null && (
        <PushToCloudModal
          isOpen
          onClose={() => setCloudRunArgs(null)}
          project={project}
          command="pipeline"
          initialDbtArguments={cloudRunArgs}
        />
      )}
      {localRunFile && (
        <RunWithEnvModal
          isOpen
          onClose={() => setLocalRunFile(null)}
          project={project}
          pipelineRelativePath={localRunFile}
          connectionName={connection?.connection?.name}
        />
      )}
    </FileTreeContainer>
  );
};

// Search Tab Component - Global "find in files" panel
const SearchTab: React.FC<{ project: Project }> = ({ project }) => {
  const { openFileAt } = useTabs();
  const handleSelect = React.useCallback(
    (selection: SearchResultSelection) => openFileAt(selection),
    [openFileAt],
  );
  return (
    <SearchInFilesPanel
      projectPath={project.path}
      onResultSelect={handleSelect}
    />
  );
};

// Source Control Tab Component — git view with a "synchronize" action that
// reconciles the git status, the open tabs and the file tree.
const SourceControlTab: React.FC<{ project: Project }> = ({ project }) => {
  const {
    tabs,
    closeTabByPath,
    markTabSavedByPath,
    refreshTabContentByPath,
    openFile,
  } = useTabs();
  const refreshProjectFiles = useRefreshProjectFiles();
  const { data: isInitialized } = useGitIsInitialized(project.path, {
    enabled: !!project.path,
  });
  const { data: statuses = [], refetch: updateStatuses } = useGetFileStatuses(
    project.path,
    { enabled: !!project.path && !!isInitialized },
  );
  const [isSynchronizing, setIsSynchronizing] = React.useState(false);

  const handleSynchronizeAll = React.useCallback(async () => {
    setIsSynchronizing(true);
    try {
      const [statusesResult] = await Promise.all([
        updateStatuses(),
        refreshProjectFiles(),
      ]);
      const currentStatuses = statusesResult?.data ?? statuses ?? [];

      tabs.forEach((tab) => {
        const fileStatus = currentStatuses.find((s) => s.path === tab.path);
        if (!fileStatus) {
          closeTabByPath(tab.path);
          markTabSavedByPath(tab.path);
        } else if (fileStatus.status === 'modified' && !tab.isModified) {
          refreshTabContentByPath(tab.path);
        }
      });
    } catch (error: any) {
      toast.error(`Sync failed: ${error?.message || 'Unknown error'}`);
      // eslint-disable-next-line no-console
      console.error('Synchronization error:', error);
    } finally {
      setIsSynchronizing(false);
    }
  }, [
    tabs,
    statuses,
    updateStatuses,
    refreshProjectFiles,
    closeTabByPath,
    markTabSavedByPath,
    refreshTabContentByPath,
  ]);

  return (
    <SourceControlView
      projectPath={project.path}
      onOpenFile={openFile}
      onRefreshFileContent={refreshTabContentByPath}
      onSynchronize={handleSynchronizeAll}
      isSynchronizing={isSynchronizing}
    />
  );
};

interface ProjectSidebarProps {
  activeTab: SidebarTab;
  project: Project;
  openCreatePipeline?: boolean;
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  activeTab,
  project,
  openCreatePipeline,
}) => {
  return (
    <Box
      sx={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'explorer' && (
          <ExplorerTab
            project={project}
            openCreatePipeline={openCreatePipeline}
          />
        )}
        {activeTab === 'search' && <SearchTab project={project} />}
        {activeTab === 'scm' && <SourceControlTab project={project} />}
        {activeTab === 'connections' && <ConnectionsTab project={project} />}
      </Box>
    </Box>
  );
};
