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
import {
  connectionIcon,
  connectionLabel,
  connectionAccentColor,
} from '../../../connections/registry.renderer';
import { duckLakeInstanceIdOf } from '../../../shared/duckLakeInstanceIds';
import { FileTreeViewer } from '../index';
import { FileTreeContainer } from '../../screens/projectDetails/styles';
import { FileNode, Project } from '../../../types/backend';
import { SourceControlView } from '../sourceControl';
import {
  useGetConnectionById,
  useGetConnections,
  useGetFileStatuses,
  useGetProjectFiles,
  useGetSelectedProject,
  useGitIsInitialized,
  useUpdateProject,
  useDuckLakeInstances,
} from '../../controllers';
import { AddConnectionModal, RemoveConnectionModal } from '../modals';
import { useTabs } from '../../context/TabsProvider';
import { useRefreshProjectFiles } from '../../hooks/useRefreshProjectFiles';
import { projectsServices } from '../../services';
import { Slot, STUDIO_SLOTS } from '../../../extensionApi/renderer';

export type SidebarTab = 'explorer' | 'scm' | 'connections';

// Helper function to get connection type name
const getConnectionTypeName = (connectionType?: string) => {
  if (!connectionType) {
    return 'UNKNOWN';
  }

  return (
    connectionLabel(connectionType) ?? String(connectionType).toUpperCase()
  );
};

// Helper function to get connection type color
const getConnectionTypeColor = (connectionType: string) =>
  connectionAccentColor(connectionType);

// Connections Tab Component — owns the add/edit/remove flows for the
// project's database connection.
const ConnectionsTab: React.FC<{ project: Project }> = ({ project }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { data: connection } = useGetConnectionById(project.connectionId);
  const { data: connections = [] } = useGetConnections();
  // An Analytics project can be linked to a DuckLake instance itself
  // (`ducklake-<id>`), which has no saved connection (plan 95)
  const { data: duckLakeInstances = [] } = useDuckLakeInstances();
  const duckLakeInstanceId = duckLakeInstanceIdOf(project.connectionId);
  const duckLakeInstance = duckLakeInstanceId
    ? duckLakeInstances.find((i) => i.id === duckLakeInstanceId)
    : undefined;
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
          connection?.connection?.name ||
          (connection as any)?.name ||
          duckLakeInstance?.name
        }
      />
    </>
  );

  if (!connection && !duckLakeInstance) {
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

  const connType = connection
    ? connection.connection?.type || (connection as any).type
    : 'ducklake';
  const connName = connection
    ? connection.connection?.name || (connection as any).name
    : duckLakeInstance?.name;
  // A linked DuckLake instance is edited on its DataLake page
  const editPath = connection
    ? `/app/edit-connection/${connection.id}`
    : `/app/data-lake/duck-lake/instances/${duckLakeInstanceId}/edit`;
  const iconSrc = connectionIcon(connType);
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
              onClick={() => navigate(editPath)}
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

// Explorer Tab Component — the file tree, and below it whatever extensions
// put in the explorer footer slot.
const ExplorerTab: React.FC<{ project: Project }> = ({ project }) => {
  const {
    activeFilePath,
    openFile,
    closeTabByPath,
    renameTab,
    revealedFolderPath,
    clearRevealedFolder,
  } = useTabs();
  const refreshProjectFiles = useRefreshProjectFiles();
  const { data: directories } = useGetProjectFiles(project, {
    enabled: !!project.id,
  });
  const { data: isInitialized } = useGitIsInitialized(project.path, {
    enabled: !!project.path,
  });
  const { data: statuses = [] } = useGetFileStatuses(project.path, {
    enabled: !!project.path && !!isInitialized,
  });

  const handleFileSelect = React.useCallback(
    (fileNode: FileNode) => {
      openFile(fileNode.path);
    },
    [openFile],
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
            refreshFiles={refreshProjectFiles}
            copyPath={async (source, target) => {
              await projectsServices.copyPath({ source, target });
              await refreshProjectFiles();
            }}
            onNewFileCallback={(filePath) => {
              if (filePath) openFile(filePath);
            }}
            selectedPath={activeFilePath}
            revealFolderPath={revealedFolderPath}
            onFolderRevealed={clearRevealedFolder}
            onRenameCallback={renameTab}
          />
        )}
      </Box>

      <Slot id={STUDIO_SLOTS.projectExplorerFooter} props={{ project }} />
    </FileTreeContainer>
  );
};

// Source Control Tab Component — git view with a "synchronize" action that
// reconciles the git status, the open tabs and the file tree.
const SourceControlTab: React.FC<{ project: Project; active: boolean }> = ({
  project,
  active,
}) => {
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

  React.useEffect(() => {
    if (active && isInitialized) updateStatuses();
  }, [active, isInitialized, updateStatuses]);

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
        if (
          fileStatus?.status === 'deleted' ||
          fileStatus?.status === 'staged-deleted'
        ) {
          closeTabByPath(tab.path);
          markTabSavedByPath(tab.path);
        } else if (fileStatus?.status === 'modified' && !tab.isModified) {
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
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  activeTab,
  project,
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
        {activeTab === 'explorer' && <ExplorerTab project={project} />}
        {/* Keep the existing Git handlers mounted across project sidebar tabs so
            their palette commands remain available throughout DBT Studio. */}
        <Box
          sx={{
            display: activeTab === 'scm' ? 'block' : 'none',
            height: '100%',
          }}
        >
          <SourceControlTab project={project} active={activeTab === 'scm'} />
        </Box>
        {activeTab === 'connections' && <ConnectionsTab project={project} />}
      </Box>
    </Box>
  );
};
