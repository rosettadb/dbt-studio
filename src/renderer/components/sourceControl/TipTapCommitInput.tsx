import React, { useState, useRef, useEffect } from 'react';
import { Box, Button, CircularProgress, useTheme } from '@mui/material';
import { Check, Sync, ArrowUpward } from '@mui/icons-material';
import {
  useGitCommit,
  useGetAheadBehindCount,
  useGitPush,
  useGetRemotes,
} from '../../controllers';
import { AddGitRemoteModal, GitUiError } from '../modals';

interface TipTapCommitInputProps {
  projectPath?: string;
  stagedFilesCount?: number;
  unstagedFilesCount?: number;
  onCommitSuccess?: () => void;
  onGitError?: (error: GitUiError) => void;
}

export const TipTapCommitInput: React.FC<TipTapCommitInputProps> = ({
  projectPath,
  stagedFilesCount = 0,
  unstagedFilesCount = 0,
  onCommitSuccess,
  onGitError,
}) => {
  const [message, setMessage] = useState('');
  const [height, setHeight] = useState(36);
  const [isFocused, setIsFocused] = useState(false);
  const [lastActionTime, setLastActionTime] = useState(0);
  const [pendingAction, setPendingAction] = useState<
    'commit' | 'push' | 'publish' | null
  >(null);
  const theme = useTheme();
  const textareaRef = useRef<HTMLDivElement>(null);

  const {
    data: aheadBehind,
    refetch: refetchAheadBehind,
    isLoading: isAheadBehindLoading,
  } = useGetAheadBehindCount(projectPath, {
    enabled: !!projectPath,
  });

  const { mutate: commitFiles, isLoading: isCommitting } = useGitCommit({
    onSuccess: () => {
      setPendingAction(null);
      setMessage('');
      setHeight(36);
      if (textareaRef.current) {
        textareaRef.current.textContent = '';
      }
      onCommitSuccess?.();
      // Delay refetch to prevent race conditions with button state
      setTimeout(() => {
        refetchAheadBehind();
      }, 100);
    },
    onError: (error) => {
      setPendingAction(null);
      onGitError?.({
        title: 'Commit failed',
        message: error.message ?? 'Unknown error',
        operation: 'commit',
        repoPath: projectPath,
      });
    },
  });

  const { mutate: pushFiles, isLoading: isPushing } = useGitPush({
    onSuccess: (data) => {
      setPendingAction(null);
      if (data?.authRequired) {
        onGitError?.({
          title: 'Authentication required',
          message:
            'Authentication is required to push to the remote repository.',
          operation: 'push',
          repoPath: projectPath,
        });
        return;
      }

      if (data?.error) {
        onGitError?.({
          title: 'Push failed',
          message: data.error,
          operation: 'push',
          repoPath: projectPath,
        });
        return;
      }
      refetchAheadBehind();
      onCommitSuccess?.();
    },
    onError: (error) => {
      setPendingAction(null);
      onGitError?.({
        title: 'Push failed',
        message: error.message ?? 'Unknown error',
        operation: 'push',
        repoPath: projectPath,
      });
    },
  });

  const {
    data: remotes = [],
    refetch: refetchRemotes,
    isLoading: isRemotesLoading,
  } = useGetRemotes(projectPath || '', {
    enabled: !!projectPath,
  });

  const [isAddRemoteModalOpen, setIsAddRemoteModalOpen] = useState(false);

  // Calculate height based on content
  const updateHeight = () => {
    if (textareaRef.current) {
      const content = textareaRef.current.textContent || '';
      const lines = content.split('\n').length;
      const wrappedLines = content.split('\n').reduce((total, line) => {
        return total + Math.max(1, Math.ceil(line.length / 60));
      }, 0);
      const totalLines = Math.max(lines, wrappedLines);
      const calculatedHeight = Math.min(
        Math.max(totalLines * 20 + 16, 36),
        160,
      ); // 20px per line + padding
      setHeight(calculatedHeight);
    }
  };

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const content = e.currentTarget.textContent || '';
    setMessage(content);
    updateHeight();
  };

  const handleCommit = () => {
    if (stagedFilesCount > 0 && projectPath) {
      setPendingAction('commit');
      commitFiles({
        path: projectPath,
        message: message.trim() || 'Update files',
      });
    }
  };

  const handlePush = () => {
    if (!projectPath) {
      return;
    }

    if (remotes.length === 0) {
      setPendingAction('publish');
      setIsAddRemoteModalOpen(true);
      return;
    }

    setPendingAction('push');
    pushFiles({ path: projectPath });
  };

  const handleCloseAddRemoteModal = () => {
    setPendingAction(null);
    setIsAddRemoteModalOpen(false);
  };

  const handleRemoteAdded = async () => {
    try {
      await refetchRemotes();
      setIsAddRemoteModalOpen(false);
      if (projectPath) {
        setPendingAction('push');
        pushFiles({ path: projectPath });
      }
    } catch (error) {
      setPendingAction(null);
      setIsAddRemoteModalOpen(false);
      onGitError?.({
        title: 'Failed to refresh remotes',
        message: error instanceof Error ? error.message : 'Unknown error',
        operation: 'remotes:refresh',
        repoPath: projectPath,
      });
    }
  };

  // Determine whether the primary action should be "Push" instead of "Commit".
  // The button switches to push when the branch is ahead of its remote and there
  // are no staged files to commit.
  const aheadCount = aheadBehind?.ahead ?? 0;
  const hasRemote = remotes.length > 0;
  const hasTrackingBranch = aheadBehind !== null && aheadBehind !== undefined;

  // Show "Publish Branch" when:
  // 1. No staged files AND no unstaged files (i.e. nothing to commit)
  // 2. No remote exists, OR remote exists but current branch has no tracking branch
  const shouldShowPublish =
    stagedFilesCount === 0 &&
    unstagedFilesCount === 0 &&
    (!hasRemote || !hasTrackingBranch);

  // Show "Sync Changes" when:
  // 1. Remote exists AND tracking branch exists
  // 2. Branch is ahead of remote
  // 3. No staged files and no unstaged files
  const shouldShowPush =
    hasRemote &&
    hasTrackingBranch &&
    aheadCount > 0 &&
    stagedFilesCount === 0 &&
    unstagedFilesCount === 0;

  let primaryAction: 'commit' | 'push' | 'publish' = 'commit';
  if (shouldShowPublish) {
    primaryAction = 'publish';
  } else if (shouldShowPush) {
    primaryAction = 'push';
  }

  const isLoading = isCommitting || isPushing || pendingAction !== null;
  const isSwitchingPrimaryAction =
    isAheadBehindLoading || isRemotesLoading || projectPath === undefined;
  const effectivePrimaryAction: 'commit' | 'push' | 'publish' =
    isSwitchingPrimaryAction ? 'commit' : primaryAction;
  const isCommitDisabled = stagedFilesCount === 0 || isLoading;
  const isPushDisabled = isSwitchingPrimaryAction
    ? true
    : !shouldShowPush || isLoading;
  const isPublishDisabled = isSwitchingPrimaryAction ? true : isLoading;
  const buttonDisabled = (() => {
    switch (effectivePrimaryAction) {
      case 'push':
        return isPushDisabled;
      case 'publish':
        return isPublishDisabled;
      default:
        return isCommitDisabled;
    }
  })();

  const buttonLabel = (() => {
    if (isLoading) {
      if (pendingAction === 'push' || effectivePrimaryAction === 'push') {
        return 'Pushing...';
      }
      if (pendingAction === 'commit' || effectivePrimaryAction === 'commit') {
        return 'Committing...';
      }
      return 'Publishing...';
    }

    if (isSwitchingPrimaryAction) {
      return stagedFilesCount > 0 ? `Commit (${stagedFilesCount})` : 'Commit';
    }

    if (effectivePrimaryAction === 'push') {
      return `Sync Changes ${aheadCount}↑`;
    }
    if (effectivePrimaryAction === 'publish') {
      return 'Publish Branch';
    }
    return stagedFilesCount > 0 ? `Commit (${stagedFilesCount})` : 'Commit';
  })();

  const buttonIcon = (() => {
    if (isLoading) {
      return <CircularProgress size={16} thickness={5} color="inherit" />;
    }
    if (effectivePrimaryAction === 'push') {
      return <Sync sx={{ fontSize: 16, mr: 0.5 }} />;
    }
    if (effectivePrimaryAction === 'publish') {
      return <ArrowUpward sx={{ fontSize: 16, mr: 0.5 }} />;
    }
    return <Check sx={{ fontSize: 16, mr: 0.5 }} />;
  })();

  const handlePrimaryAction = () => {
    // Prevent rapid successive actions (debounce 1 second)
    const now = Date.now();
    if (now - lastActionTime < 1000) {
      return;
    }
    setLastActionTime(now);

    // Prevent action if already loading
    if (isLoading) {
      return;
    }

    if (effectivePrimaryAction === 'push') {
      handlePush();
      return;
    }
    if (effectivePrimaryAction === 'publish') {
      // If no remote exists, show modal to add one
      if (remotes.length === 0) {
        setIsAddRemoteModalOpen(true);
      } else {
        // Remote exists but no tracking branch - push with -u to set upstream
        handlePush();
      }
      return;
    }
    handleCommit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey && e.key === 'Enter') {
      e.preventDefault();
      handlePrimaryAction();
    }
  };

  // Initialize height on mount
  useEffect(() => {
    updateHeight();
  }, []);

  return (
    <>
      <Box
        sx={{
          px: 1,
          pt: 0,
          pb: 0.75,
          backgroundColor: 'background.paper',
        }}
      >
        {/* Dynamic Height TipTap Editor Container */}
        <Box
          sx={{
            position: 'relative',
            border: 1,
            borderColor: 'divider',
            borderRadius: theme.shape.borderRadius / 8, // Use theme border radius
            backgroundColor: 'background.paper',
            mb: 0.75,
            height,
            maxHeight: 160,
            overflowY: height >= 160 ? 'auto' : 'hidden',
            transition: 'height 0.2s ease',
            '&:hover': {
              borderColor: 'text.secondary',
            },
            '&:focus-within': {
              borderColor: 'primary.main',
            },
          }}
        >
          {/* Rich Text Editor Area */}
          <Box
            ref={textareaRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            data-placeholder="Message (⌘+Enter to commit)"
            sx={{
              p: theme.spacing(0.75, 1),
              fontSize: '13px',
              lineHeight: 1.4,
              fontFamily: theme.typography.fontFamily,
              minHeight: 20,
              outline: 'none',
              color: 'text.primary',
              wordWrap: 'break-word',
              whiteSpace: 'pre-wrap',
              position: 'relative',
              '&:empty::before': {
                content: 'attr(data-placeholder)',
                color: theme.palette.text.secondary,
                opacity: isFocused ? 0.4 : 0.6,
                pointerEvents: 'none',
                position: 'absolute',
                top: theme.spacing(0.75),
                left: theme.spacing(1),
              },
            }}
          />
        </Box>

        {/* Dynamic Commit/Push/Sync Button */}
        <Button
          fullWidth
          variant="contained"
          disabled={buttonDisabled}
          onClick={handlePrimaryAction}
          startIcon={buttonIcon}
          sx={{
            textTransform: 'none',
            fontSize: '13px',
            fontWeight: 500,
            py: 0.75,
            minHeight: 32,
            borderRadius: theme.shape.borderRadius / 8,
            backgroundColor: buttonDisabled
              ? theme.palette.action.disabled
              : theme.palette.primary.main,
            color: buttonDisabled
              ? theme.palette.action.disabledBackground
              : theme.palette.getContrastText(theme.palette.primary.main),
            '&:hover': {
              backgroundColor: buttonDisabled
                ? theme.palette.action.disabled
                : theme.palette.primary.dark,
            },
            '&.Mui-disabled': {
              color: theme.palette.action.disabledBackground,
              backgroundColor: theme.palette.action.disabled,
            },
          }}
        >
          {buttonLabel}
        </Button>
      </Box>

      {projectPath ? (
        <AddGitRemoteModal
          isOpen={isAddRemoteModalOpen}
          onClose={handleCloseAddRemoteModal}
          successCallback={handleRemoteAdded}
          path={projectPath}
        />
      ) : null}
    </>
  );
};
