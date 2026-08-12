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
import { ReactComponent as RouteIcon } from '../../assets/icons/lucide/route.svg';
import { FileTreeViewer } from '../index';
import { FileTreeContainer } from '../../screens/projectDetails/styles';
import {
  FileStatus,
  FileNode,
  Project,
  SupportedConnectionTypes,
} from '../../../types/backend';
import { SourceControlView } from '../sourceControl';
import connectionIcons from '../../../../assets/connectionIcons';
import { useListPipelines } from '../../controllers';
import { CreatePipelineModal } from '../modals';

export type SidebarTab = 'explorer' | 'scm' | 'connections';

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
    default:
      return '#666';
  }
};

// Connections Tab Component
interface ConnectionsTabProps {
  connection?: any;
  onAddConnection?: () => void;
  onEditConnection?: () => void;
  onRemoveConnection?: () => void;
}

const ConnectionsTab: React.FC<ConnectionsTabProps> = ({
  connection,
  onAddConnection,
  onEditConnection,
  onRemoveConnection,
}) => {
  const theme = useTheme();

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
          onClick={onAddConnection}
          size="small"
        >
          Add Connection
        </Button>
      </Box>
    );
  }

  const connType = connection.connection?.type || connection.type;
  const connName = connection.connection?.name || connection.name;
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
              onClick={onEditConnection}
              sx={{ flex: 1, fontSize: '0.7rem', py: 0.5 }}
            >
              Edit
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<DeleteOutline sx={{ fontSize: 14 }} />}
              onClick={onRemoveConnection}
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
        onClick={onAddConnection}
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
    </Box>
  );
};

// Explorer Tab Component - Wraps existing FileTreeViewer
interface ExplorerTabProps {
  directories?: FileNode;
  statuses: FileStatus[];
  isLoadingDirectories: boolean;
  selectedFilePath?: string;
  project?: Project;
  onDeleteFile: (deletedFile: string) => void;
  onFileSelect: (fileNode: any) => Promise<void>;
  onRefreshFiles: () => Promise<void>;
  onCopyPath: (source: string, target: string) => Promise<void>;
  onNewFile: (filePath?: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => void;
  onRunPipeline?: (filePath: string) => void;
  onRunPipelineLocal?: (filePath: string) => void;
}

const ExplorerTab: React.FC<ExplorerTabProps> = ({
  directories,
  statuses,
  isLoadingDirectories,
  selectedFilePath,
  project,
  onDeleteFile,
  onFileSelect,
  onRefreshFiles,
  onCopyPath,
  onNewFile,
  onRenameFile,
  onRunPipeline,
  onRunPipelineLocal,
}) => {
  const theme = useTheme();
  const [createPipelineOpen, setCreatePipelineOpen] = React.useState(false);

  const { refetch: refetchPipelines } = useListPipelines(project?.id);

  const handlePipelineCreated = React.useCallback(
    async (filePath: string) => {
      await refetchPipelines();
      await onRefreshFiles();
      // Open the newly created pipeline file in the editor
      const fileName = filePath.split('/').pop() ?? 'pipeline.yml';
      onFileSelect({
        id: filePath,
        name: fileName,
        path: filePath,
        type: 'file' as const,
      });
    },
    [refetchPipelines, onRefreshFiles, onFileSelect],
  );

  return (
    <FileTreeContainer sx={{ gap: 0, p: 0 }}>
      {/* Tree takes all remaining space */}
      <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {directories && (
          <FileTreeViewer
            statuses={statuses}
            node={directories}
            onDeleteFileCallback={onDeleteFile}
            onFileSelect={onFileSelect}
            isLoadingFiles={isLoadingDirectories}
            refreshFiles={onRefreshFiles}
            copyPath={onCopyPath}
            onNewFileCallback={onNewFile}
            selectedPath={selectedFilePath}
            onRenameCallback={onRenameFile}
            onRunPipeline={onRunPipeline}
            onRunPipelineLocal={onRunPipelineLocal}
          />
        )}
      </Box>

      {/* Create Pipeline button — always visible */}
      {project && (
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
      )}

      {project && (
        <CreatePipelineModal
          isOpen={createPipelineOpen}
          onClose={() => setCreatePipelineOpen(false)}
          project={project}
          onCreated={(filePath) => handlePipelineCreated(filePath)}
        />
      )}
    </FileTreeContainer>
  );
};

// Source Control Tab Component - Monaco Editor Integration
interface SourceControlTabProps {
  projectPath?: string;
  onOpenFile?: (filePath: string) => void;
  onFileSelect?: (filePath: string) => void;
  onRefreshFileContent?: (filePath: string) => void;
  onSynchronize?: () => Promise<void>;
  isSynchronizing?: boolean;
}

const SourceControlTab: React.FC<SourceControlTabProps> = ({
  projectPath,
  onOpenFile,
  onFileSelect,
  onRefreshFileContent,
  onSynchronize,
  isSynchronizing,
}) => {
  return (
    <SourceControlView
      projectPath={projectPath}
      onOpenFile={onOpenFile}
      onFileSelect={onFileSelect}
      onRefreshFileContent={onRefreshFileContent}
      onSynchronize={onSynchronize}
      isSynchronizing={isSynchronizing}
    />
  );
};

interface ProjectSidebarProps {
  // Tab control (lifted to parent)
  activeTab: SidebarTab;

  // File Explorer props (preserve all existing functionality)
  directories?: FileNode;
  statuses: FileStatus[];
  isLoadingDirectories: boolean;
  selectedFilePath?: string;
  project?: Project;

  // File Explorer callbacks (preserve all existing functionality)
  onDeleteFile: (deletedFile: string) => void;
  onFileSelect: (fileNode: any) => Promise<void>;
  onRefreshFiles: () => Promise<void>;
  onCopyPath: (source: string, target: string) => Promise<void>;
  onNewFile: (filePath?: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => void;

  // Source Control tab integration with Monaco editor
  onSourceControlOpenFile?: (filePath: string) => void;
  onSourceControlFileSelect?: (filePath: string) => void;
  onSourceControlRefreshFileContent?: (filePath: string) => void;

  // Synchronization
  onSourceControlSynchronize?: () => Promise<void>;
  isSourceControlSynchronizing?: boolean;

  // Connections
  connection?: any;
  onAddConnection?: () => void;
  onEditConnection?: () => void;
  onRemoveConnection?: () => void;

  // Pipeline
  onRunPipeline?: (filePath: string) => void;
  onRunPipelineLocal?: (filePath: string) => void;
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  activeTab,
  directories,
  statuses,
  isLoadingDirectories,
  selectedFilePath,
  project,
  onDeleteFile,
  onFileSelect,
  onRefreshFiles,
  onCopyPath,
  onNewFile,
  onRenameFile,
  onSourceControlOpenFile,
  onSourceControlFileSelect,
  onSourceControlRefreshFileContent,
  onSourceControlSynchronize,
  isSourceControlSynchronizing,
  connection,
  onAddConnection,
  onEditConnection,
  onRemoveConnection,
  onRunPipeline,
  onRunPipelineLocal,
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
      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {/* File Explorer Tab - Preserve Existing Functionality Exactly */}
        {activeTab === 'explorer' && (
          <ExplorerTab
            directories={directories}
            statuses={statuses}
            isLoadingDirectories={isLoadingDirectories}
            selectedFilePath={selectedFilePath}
            project={project}
            onDeleteFile={onDeleteFile}
            onFileSelect={onFileSelect}
            onRefreshFiles={onRefreshFiles}
            onCopyPath={onCopyPath}
            onNewFile={onNewFile}
            onRenameFile={onRenameFile}
            onRunPipeline={onRunPipeline}
            onRunPipelineLocal={onRunPipelineLocal}
          />
        )}

        {/* Source Control Tab - New Git Interface */}
        {activeTab === 'scm' && (
          <SourceControlTab
            projectPath={project?.path}
            onOpenFile={onSourceControlOpenFile}
            onFileSelect={onSourceControlFileSelect}
            onRefreshFileContent={onSourceControlRefreshFileContent}
            onSynchronize={onSourceControlSynchronize}
            isSynchronizing={isSourceControlSynchronizing}
          />
        )}

        {/* Connections Tab */}
        {activeTab === 'connections' && (
          <ConnectionsTab
            connection={connection}
            onAddConnection={onAddConnection}
            onEditConnection={onEditConnection}
            onRemoveConnection={onRemoveConnection}
          />
        )}
      </Box>
    </Box>
  );
};
