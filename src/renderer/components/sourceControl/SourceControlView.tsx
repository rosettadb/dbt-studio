import React from 'react';
import { Box, Button, CircularProgress } from '@mui/material';
import { useQueryClient } from 'react-query';
import { RepositoryHeader } from './RepositoryHeader';
import { TipTapCommitInput } from './TipTapCommitInput';
import { ChangesSection } from './ChangesSection';
import { ConfirmationModal } from '../modals/confirmationModal';
import { GitErrorModal, GitUiError } from '../modals';
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
  onGitError?: (error: GitUiError) => void;
}

const GitInitButton: React.FC<GitInitButtonProps> = ({
  projectPath,
  onSuccess,
  onGitError,
}) => {
  const { mutate: initGit, isLoading } = useGitInit({
    onSuccess: () => {
      onSuccess?.();
    },
    onError: (error) => {
      onGitError?.({
        title: 'Failed to initialize git repository',
        message: error.message ?? 'Unknown error',
        operation: 'init',
        repoPath: projectPath,
      });
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
  // Synchronization
  onSynchronize?: () => Promise<void>;
  isSynchronizing?: boolean;
}

export const SourceControlView: React.FC<SourceControlViewProps> = ({
  projectPath,
  onOpenFile,
  onFileSelect,
  onRefreshFileContent,
  onSynchronize,
  isSynchronizing,
}) => {
  const [gitError, setGitError] = React.useState<GitUiError | null>(null);

  const handleGitError = React.useCallback((error: GitUiError) => {
    setGitError(error);
  }, []);

  const handleCloseGitError = React.useCallback(() => {
    setGitError(null);
  }, []);

  const { data: isInitialized } = useGitIsInitialized(projectPath || '', {
    enabled: !!projectPath,
  });

  const { data: fileStatuses = [] } = useGetFileStatuses(projectPath || '', {
    enabled: !!projectPath && !!isInitialized,
  });

  const stagedFilesCount = fileStatuses.filter(
    (f) =>
      f.status === 'staged' ||
      f.status === 'renamed' ||
      f.status === 'staged-deleted',
  ).length;

  const queryClient = useQueryClient();

  // State for discard confirmation dialog
  const [discardConfirmation, setDiscardConfirmation] = React.useState<{
    open: boolean;
    files: string[];
    message: string;
  }>({
    open: false,
    files: [],
    message: '',
  });

  const handleRefresh = async () => {
    // Simply invalidate the query - React Query will handle refetching
    await queryClient.invalidateQueries([QUERY_KEYS.GIT_STATUSES, projectPath]);
  };

  // Git operations hooks - optimistic updates make these feel instant
  const { mutate: stageFiles } = useGitStage({
    onSuccess: () => {
      handleRefresh();
    },
    onError: (error) => {
      handleGitError({
        title: 'Failed to stage file',
        message: error.message ?? 'Unknown error',
        operation: 'stage',
        repoPath: projectPath,
      });
    },
  });

  const { mutate: unstageFiles } = useGitUnstage({
    onSuccess: () => {
      handleRefresh();
    },
    onError: (error) => {
      handleGitError({
        title: 'Failed to unstage file',
        message: error.message ?? 'Unknown error',
        operation: 'unstage',
        repoPath: projectPath,
      });
    },
  });

  const { mutate: stageAllFiles } = useGitStageAll({
    onSuccess: () => {
      handleRefresh();
    },
    onError: (error) => {
      handleGitError({
        title: 'Failed to stage all changes',
        message: error.message ?? 'Unknown error',
        operation: 'stageAll',
        repoPath: projectPath,
      });
    },
  });

  const { mutate: unstageAllFiles } = useGitUnstageAll({
    onSuccess: () => {
      handleRefresh();
    },
    onError: (error) => {
      handleGitError({
        title: 'Failed to unstage all changes',
        message: error.message ?? 'Unknown error',
        operation: 'unstageAll',
        repoPath: projectPath,
      });
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
    onError: (error) => {
      handleGitError({
        title: 'Failed to discard changes',
        message: error.message ?? 'Unknown error',
        operation: 'discard',
        repoPath: projectPath,
      });
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
      // Get just the filename for display
      const fileName = filePath.split('/').pop() || filePath;

      // Show confirmation dialog
      setDiscardConfirmation({
        open: true,
        files: [filePath],
        message: `Are you sure you want to discard changes to "${fileName}"? This action cannot be undone.`,
      });
    }
  };

  const handleDiscardAll = () => {
    if (projectPath) {
      const unstagedFiles = fileStatuses.filter(
        (file) => file.status !== 'staged',
      );
      if (unstagedFiles.length === 0) return;

      // Show confirmation dialog
      setDiscardConfirmation({
        open: true,
        files: unstagedFiles.map((file) => file.path),
        message: `Are you sure you want to discard all ${unstagedFiles.length} unstaged change${unstagedFiles.length === 1 ? '' : 's'}? This action cannot be undone.`,
      });
    }
  };

  const handleConfirmDiscard = () => {
    if (projectPath && discardConfirmation.files.length > 0) {
      discardFiles({ path: projectPath, files: discardConfirmation.files });
      setDiscardConfirmation({ open: false, files: [], message: '' });
    }
  };

  const handleCancelDiscard = () => {
    setDiscardConfirmation({ open: false, files: [], message: '' });
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
      <>
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
          <GitInitButton
            projectPath={projectPath}
            onSuccess={handleRefresh}
            onGitError={handleGitError}
          />
        </Box>

        <GitErrorModal
          isOpen={!!gitError}
          error={gitError}
          onClose={handleCloseGitError}
        />
      </>
    );
  }

  return (
    <>
      <Box
        sx={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Repository Header with Actions */}
        <RepositoryHeader
          projectPath={projectPath}
          onSynchronize={onSynchronize}
          isSynchronizing={isSynchronizing}
          hasPendingChanges={fileStatuses.length > 0}
          onGitError={handleGitError}
        />

        {/* TipTap Commit Input */}
        <TipTapCommitInput
          projectPath={projectPath}
          stagedFilesCount={stagedFilesCount}
          onCommitSuccess={handleRefresh}
          onGitError={handleGitError}
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

        {isSynchronizing && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.25)',
              backdropFilter: 'blur(1px)',
              zIndex: 10,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                backgroundColor: 'background.paper',
                px: 2,
                py: 1,
                borderRadius: 1,
                boxShadow: 3,
              }}
            >
              <CircularProgress size={16} thickness={5} />
              <Box
                component="span"
                sx={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'text.secondary',
                }}
              >
                Synchronizing…
              </Box>
            </Box>
          </Box>
        )}
      </Box>

      {/* Discard Confirmation Dialog */}
      <ConfirmationModal
        isOpen={discardConfirmation.open}
        onClose={handleCancelDiscard}
        onConfirm={handleConfirmDiscard}
        title="Discard Changes"
        question={discardConfirmation.message}
      />

      <GitErrorModal
        isOpen={!!gitError}
        error={gitError}
        onClose={handleCloseGitError}
      />
    </>
  );
};
