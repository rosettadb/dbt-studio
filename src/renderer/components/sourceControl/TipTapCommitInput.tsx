import React, { useState, useRef, useEffect } from 'react';
import { Box, Button, useTheme } from '@mui/material';
import { Check, Sync, ArrowUpward } from '@mui/icons-material';
import {
  useGitCommit,
  useGetAheadBehindCount,
  useGitPush,
  useGetRemotes,
} from '../../controllers';
import { AddGitRemoteModal } from '../modals';

interface TipTapCommitInputProps {
  projectPath?: string;
  stagedFilesCount?: number;
  onCommitSuccess?: () => void;
}

export const TipTapCommitInput: React.FC<TipTapCommitInputProps> = ({
  projectPath,
  stagedFilesCount = 0,
  onCommitSuccess,
}) => {
  const [message, setMessage] = useState('');
  const [height, setHeight] = useState(36);
  const [isFocused, setIsFocused] = useState(false);
  const [lastActionTime, setLastActionTime] = useState(0);
  const theme = useTheme();
  const textareaRef = useRef<HTMLDivElement>(null);

  const { data: aheadBehind, refetch: refetchAheadBehind } =
    useGetAheadBehindCount(projectPath, {
      enabled: !!projectPath,
    });

  const { mutate: commitFiles, isLoading: isCommitting } = useGitCommit({
    onSuccess: () => {
      // eslint-disable-next-line no-console
      console.log(
        '[TipTapCommitInput.useGitCommit.onSuccess] Commit succeeded',
      );
      setMessage('');
      setHeight(36);
      if (textareaRef.current) {
        textareaRef.current.textContent = '';
      }
      // eslint-disable-next-line no-console
      console.log(
        '[TipTapCommitInput.useGitCommit.onSuccess] Calling onCommitSuccess callback',
      );
      onCommitSuccess?.();
      // Delay refetch to prevent race conditions with button state
      setTimeout(() => {
        // eslint-disable-next-line no-console
        console.log(
          '[TipTapCommitInput.useGitCommit.onSuccess] Refetching ahead/behind count',
        );
        refetchAheadBehind();
      }, 100);
    },
    onError: (error: any) => {
      // eslint-disable-next-line no-console
      console.error(
        '[TipTapCommitInput.useGitCommit.onError] Commit failed:',
        error,
      );
    },
  });

  const { mutate: pushFiles, isLoading: isPushing } = useGitPush({
    onSuccess: () => {
      // eslint-disable-next-line no-console
      console.log('[TipTapCommitInput.useGitPush.onSuccess] Push succeeded');
      refetchAheadBehind();
      onCommitSuccess?.();
    },
    onError: (error: any) => {
      // eslint-disable-next-line no-console
      console.error(
        '[TipTapCommitInput.useGitPush.onError] Push failed:',
        error,
      );
    },
  });

  const { data: remotes = [], refetch: refetchRemotes } = useGetRemotes(
    projectPath || '',
    {
      enabled: !!projectPath,
    },
  );

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
    // eslint-disable-next-line no-console
    console.log('[TipTapCommitInput.handleCommit] Called with:', {
      stagedFilesCount,
      projectPath,
      message,
    });
    if (stagedFilesCount > 0 && projectPath) {
      // eslint-disable-next-line no-console
      console.log('[TipTapCommitInput.handleCommit] Calling commitFiles');
      commitFiles({
        path: projectPath,
        message: message.trim() || 'Update files', // Default message if empty
        files: ['.'],
      });
    }
  };

  const handlePush = () => {
    // eslint-disable-next-line no-console
    console.log('[TipTapCommitInput.handlePush] Called with:', {
      projectPath,
      remotesCount: remotes.length,
    });
    if (!projectPath) {
      return;
    }

    if (remotes.length === 0) {
      // eslint-disable-next-line no-console
      console.log('[TipTapCommitInput.handlePush] No remotes, opening modal');
      setIsAddRemoteModalOpen(true);
      return;
    }

    // eslint-disable-next-line no-console
    console.log('[TipTapCommitInput.handlePush] Calling pushFiles');
    pushFiles({ path: projectPath });
  };

  const handleCloseAddRemoteModal = () => {
    setIsAddRemoteModalOpen(false);
  };

  const handleRemoteAdded = async () => {
    await refetchRemotes();
    setIsAddRemoteModalOpen(false);
    if (projectPath) {
      pushFiles({ path: projectPath });
    }
  };

  // Determine whether the primary action should be "Push" instead of "Commit".
  // The button switches to push when the branch is ahead of its remote and there
  // are no staged files to commit.
  const aheadCount = aheadBehind?.ahead ?? 0;
  const hasRemote = remotes.length > 0;
  const hasTrackingBranch = aheadBehind !== null; // null means no upstream tracking branch

  // eslint-disable-next-line no-console
  console.log('[TipTapCommitInput] Button state calculation:', {
    aheadBehind,
    aheadCount,
    hasRemote,
    hasTrackingBranch,
    stagedFilesCount,
    remotesCount: remotes.length,
  });

  // Show "Publish Branch" when:
  // 1. No remote exists, OR
  // 2. Remote exists but current branch has no tracking branch
  const shouldShowPublish =
    stagedFilesCount === 0 && (!hasRemote || !hasTrackingBranch);

  // Show "Sync Changes" when:
  // 1. Remote exists AND tracking branch exists
  // 2. Branch is ahead of remote
  // 3. No staged files to commit
  const shouldShowPush =
    hasRemote && hasTrackingBranch && aheadCount > 0 && stagedFilesCount === 0;

  // eslint-disable-next-line no-console
  console.log('[TipTapCommitInput] Button decision:', {
    shouldShowPublish,
    shouldShowPush,
  });

  let primaryAction: 'commit' | 'push' | 'publish' = 'commit';
  if (shouldShowPublish) {
    primaryAction = 'publish';
  } else if (shouldShowPush) {
    primaryAction = 'push';
  }

  // eslint-disable-next-line no-console
  console.log('[TipTapCommitInput] Final primaryAction:', primaryAction);

  const isLoading = isCommitting || isPushing;
  const isCommitDisabled = stagedFilesCount === 0 || isLoading;
  const isPushDisabled = !shouldShowPush || isLoading;
  const isPublishDisabled = isLoading;
  const buttonDisabled = (() => {
    switch (primaryAction) {
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
      if (primaryAction === 'push') {
        return 'Pushing...';
      }
      if (primaryAction === 'commit') {
        return 'Committing...';
      }
      return 'Publishing...';
    }
    if (primaryAction === 'push') {
      return `Sync Changes ${aheadCount}↑`;
    }
    if (primaryAction === 'publish') {
      return 'Publish Branch';
    }
    return stagedFilesCount > 0 ? `Commit (${stagedFilesCount})` : 'Commit';
  })();

  const buttonIcon = (() => {
    if (isLoading) {
      return null;
    }
    if (primaryAction === 'push') {
      return <Sync sx={{ fontSize: 16, mr: 0.5 }} />;
    }
    if (primaryAction === 'publish') {
      return <ArrowUpward sx={{ fontSize: 16, mr: 0.5 }} />;
    }
    return <Check sx={{ fontSize: 16, mr: 0.5 }} />;
  })();

  const handlePrimaryAction = () => {
    // eslint-disable-next-line no-console
    console.log(
      '[TipTapCommitInput.handlePrimaryAction] Called with primaryAction:',
      primaryAction,
    );
    // Prevent rapid successive actions (debounce 1 second)
    const now = Date.now();
    if (now - lastActionTime < 1000) {
      // eslint-disable-next-line no-console
      console.log(
        '[TipTapCommitInput.handlePrimaryAction] Debounced - too soon',
      );
      return;
    }
    setLastActionTime(now);

    // Prevent action if already loading
    if (isLoading) {
      // eslint-disable-next-line no-console
      console.log(
        '[TipTapCommitInput.handlePrimaryAction] Already loading, skipping',
      );
      return;
    }

    if (primaryAction === 'push') {
      // eslint-disable-next-line no-console
      console.log('[TipTapCommitInput.handlePrimaryAction] Action is push');
      handlePush();
      return;
    }
    if (primaryAction === 'publish') {
      // eslint-disable-next-line no-console
      console.log('[TipTapCommitInput.handlePrimaryAction] Action is publish');
      // If no remote exists, show modal to add one
      if (remotes.length === 0) {
        setIsAddRemoteModalOpen(true);
      } else {
        // Remote exists but no tracking branch - push with -u to set upstream
        handlePush();
      }
      return;
    }
    // eslint-disable-next-line no-console
    console.log('[TipTapCommitInput.handlePrimaryAction] Action is commit');
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
