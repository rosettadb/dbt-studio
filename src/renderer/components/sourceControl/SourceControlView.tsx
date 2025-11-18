import React from 'react';
import { Box, Button } from '@mui/material';
import { useQueryClient } from 'react-query';
import { RepositoryHeader } from './RepositoryHeader';
import { TipTapCommitInput } from './TipTapCommitInput';
import { ChangesSection } from './ChangesSection';
import {
  useGitIsInitialized,
  useGetFileStatuses,
  useGitStage,
  useGitUnstage,
  useGitStageAll,
  useGitUnstageAll,
  useGitDiscardChanges,
  useGitInit,
} from '../../controllers';
import { QUERY_KEYS } from '../../config/constants';

// Git Init Button Component
interface GitInitButtonProps {
  projectPath?: string;
  onSuccess?: () => void;
}

const GitInitButton: React.FC<GitInitButtonProps> = ({
  projectPath,
  onSuccess,
}) => {
  const { mutate: initGit, isLoading } = useGitInit({
    onSuccess: () => {
      onSuccess?.();
    },
    onError: (error) => {
      // eslint-disable-next-line no-alert
      alert(`Failed to initialize git repository: ${error.message}`);
    },
  });

  const handleInitGit = () => {
    if (projectPath) {
      initGit({ path: projectPath });
    }
  };

  return (
    <Button
      variant="contained"
      size="small"
      onClick={handleInitGit}
      disabled={!projectPath || isLoading}
      sx={{
        mt: 1,
        textTransform: 'none',
        fontSize: '12px',
        px: 2,
        py: 0.5,
      }}
    >
      {isLoading ? 'Initializing...' : 'Initialize Repository'}
    </Button>
  );
};

interface SourceControlViewProps {
  projectPath?: string;
  // Monaco Editor integration
  onOpenFile?: (filePath: string) => void;
  onFileSelect?: (filePath: string) => void;
  onRefreshFileContent?: (filePath: string) => void;
}

export const SourceControlView: React.FC<SourceControlViewProps> = ({
  projectPath,
  onOpenFile,
  onFileSelect,
  onRefreshFileContent,
}) => {
  const { data: isInitialized } = useGitIsInitialized(projectPath || '', {
    enabled: !!projectPath,
  });

  const { data: fileStatuses = [], refetch: refetchStatuses } =
    useGetFileStatuses(projectPath || '', {
      enabled: !!projectPath && !!isInitialized,
    });

  // Debug: Log file statuses when they change
  React.useEffect(() => {
    if (fileStatuses.length > 0) {
      // eslint-disable-next-line no-console
      console.log('=== FRONTEND FILE STATUSES ===');
      // eslint-disable-next-line no-console
      console.log('Project path:', projectPath);
      // eslint-disable-next-line no-console
      console.log('Total files:', fileStatuses.length);
      // eslint-disable-next-line no-console
      console.log(
        'Staged files:',
        fileStatuses.filter((f) => f.status === 'staged').length,
      );
      // eslint-disable-next-line no-console
      console.log(
        'Unstaged files:',
        fileStatuses.filter((f) => f.status !== 'staged').length,
      );
      // eslint-disable-next-line no-console
      console.log(
        'File list:',
        fileStatuses.map((f) => ({
          path: f.path,
          status: f.status,
          basename: f.path.split('/').pop(),
        })),
      );
      // eslint-disable-next-line no-console
      console.log('=== END FRONTEND DEBUG ===');
    }
  }, [fileStatuses, projectPath]);

  const stagedFilesCount = fileStatuses.filter(
    (f) => f.status === 'staged',
  ).length;

  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    // eslint-disable-next-line no-console
    console.log('=== REFRESH BUTTON CLICKED ===');
    // eslint-disable-next-line no-console
    console.log('Project path:', projectPath);
    // eslint-disable-next-line no-console
    console.log('Current file statuses count:', fileStatuses.length);

    // Force invalidate and refetch all git queries
    await queryClient.invalidateQueries([QUERY_KEYS.GIT_STATUSES]);
    await queryClient.invalidateQueries([QUERY_KEYS.GIT_IS_INITIALIZED]);

    // eslint-disable-next-line no-console
    console.log('Cache invalidated, refetching...');

    // Force refetch
    const result = await refetchStatuses();

    // eslint-disable-next-line no-console
    console.log('Refetch complete, new data:', result.data?.length, 'files');
    // eslint-disable-next-line no-console
    console.log('=== END REFRESH DEBUG ===');
  };

  // Git operations hooks
  const { mutate: stageFiles } = useGitStage({
    onSuccess: () => {
      handleRefresh();
    },
  });

  const { mutate: unstageFiles } = useGitUnstage({
    onSuccess: () => {
      handleRefresh();
    },
  });

  const { mutate: stageAllFiles } = useGitStageAll({
    onSuccess: () => {
      handleRefresh();
    },
  });

  const { mutate: unstageAllFiles } = useGitUnstageAll({
    onSuccess: () => {
      handleRefresh();
    },
  });

  const { mutate: discardFiles } = useGitDiscardChanges({
    onSuccess: (_, variables) => {
      handleRefresh();
      // Refresh content of discarded files in open tabs
      if (onRefreshFileContent && variables.files) {
        variables.files.forEach((filePath) => {
          onRefreshFileContent(filePath);
        });
      }
    },
  });

  // Git operation handlers
  const handleStage = (filePath: string) => {
    if (projectPath) {
      stageFiles({ path: projectPath, files: [filePath] });
    }
  };

  const handleUnstage = (filePath: string) => {
    if (projectPath) {
      unstageFiles({ path: projectPath, files: [filePath] });
    }
  };

  const handleStageAll = () => {
    if (projectPath) {
      stageAllFiles({ path: projectPath });
    }
  };

  const handleUnstageAll = () => {
    if (projectPath) {
      unstageAllFiles({ path: projectPath });
    }
  };

  const handleDiscard = (filePath: string) => {
    if (projectPath) {
      // Show confirmation dialog for discard operation
      // eslint-disable-next-line no-alert
      const confirmed = window.confirm(
        `Are you sure you want to discard changes to ${filePath}? This action cannot be undone.`,
      );
      if (confirmed) {
        discardFiles({ path: projectPath, files: [filePath] });
      }
    }
  };

  const handleDiscardAll = () => {
    if (projectPath) {
      const unstagedFiles = fileStatuses.filter(
        (file) => file.status !== 'staged',
      );
      if (unstagedFiles.length === 0) return;

      // Show confirmation dialog for discard all operation
      // eslint-disable-next-line no-alert
      const confirmed = window.confirm(
        `Are you sure you want to discard all ${unstagedFiles.length} unstaged changes? This action cannot be undone.`,
      );
      if (confirmed) {
        const filePaths = unstagedFiles.map((file) => file.path);
        discardFiles({ path: projectPath, files: filePaths });
      }
    }
  };

  const handleOpenFile = (filePath: string) => {
    // Integrate with Monaco editor tab system
    if (onOpenFile) {
      onOpenFile(filePath);
    }
    // Also update selected file for consistency
    if (onFileSelect) {
      onFileSelect(filePath);
    }
  };

  if (!projectPath) {
    return (
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '200px',
          color: 'text.secondary',
        }}
      >
        No project selected
      </Box>
    );
  }

  if (!isInitialized) {
    return (
      <Box
        sx={{
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'text.secondary',
          textAlign: 'center',
          gap: 2,
        }}
      >
        <Box sx={{ fontSize: '14px', fontWeight: 500, mb: 1 }}>
          Git repository not initialized
        </Box>
        <Box
          sx={{
            fontSize: '12px',
            opacity: 0.8,
            lineHeight: 1.4,
            maxWidth: '250px',
            wordWrap: 'break-word',
          }}
        >
          Initialize a git repository to enable source control features like
          staging, committing, and pushing changes.
        </Box>
        <GitInitButton projectPath={projectPath} onSuccess={handleRefresh} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Repository Header with Actions */}
      <RepositoryHeader projectPath={projectPath} onRefresh={handleRefresh} />

      {/* TipTap Commit Input */}
      <TipTapCommitInput
        projectPath={projectPath}
        stagedFilesCount={stagedFilesCount}
        onCommitSuccess={handleRefresh}
      />

      {/* Changes Section */}
      <ChangesSection
        fileStatuses={fileStatuses}
        onStage={handleStage}
        onUnstage={handleUnstage}
        onStageAll={handleStageAll}
        onUnstageAll={handleUnstageAll}
        onDiscard={handleDiscard}
        onDiscardAll={handleDiscardAll}
        onOpenFile={handleOpenFile}
      />
    </Box>
  );
};
