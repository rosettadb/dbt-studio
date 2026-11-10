import React, { useState, useRef, useEffect } from 'react';
import {
  alpha,
  Box,
  Button,
  CircularProgress,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Check,
  Sync,
  CloudUploadOutlined,
  KeyboardArrowDown,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  useGitCommit,
  useGetAheadBehindCount,
  useGitPush,
  useGetRemotes,
} from '../../controllers';
import { AddGitRemoteModal, GitUiError, SshPassphraseModal } from '../modals';

function isSshUrl(url: string): boolean {
  return url.startsWith('git@') || url.startsWith('ssh://');
}

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
  // 26px for one line, like VS Code: 18px line + 3px padding each side + border
  const [height, setHeight] = useState(26);
  const [isFocused, setIsFocused] = useState(false);
  const [lastActionTime, setLastActionTime] = useState(0);
  const [pendingAction, setPendingAction] = useState<
    'commit' | 'commitPush' | 'push' | 'publish' | null
  >(null);
  const [commitMenuAnchor, setCommitMenuAnchor] = useState<HTMLElement | null>(
    null,
  );
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
      setHeight(26);
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

  const {
    data: remotes = [],
    refetch: refetchRemotes,
    isLoading: isRemotesLoading,
  } = useGetRemotes(projectPath || '', {
    enabled: !!projectPath,
  });

  const [sshPassphraseDialogOpen, setSshPassphraseDialogOpen] = useState(false);
  const [sshPassphraseAttempted, setSshPassphraseAttempted] = useState(false);

  // Close any pending SSH prompt from a previous project — this component
  // stays mounted across project switches, only projectPath changes.
  useEffect(() => {
    setSshPassphraseDialogOpen(false);
    setSshPassphraseAttempted(false);
  }, [projectPath]);

  const { mutate: pushFiles, isLoading: isPushing } = useGitPush({
    onSuccess: (data) => {
      setPendingAction(null);
      if (data?.authRequired) {
        const originPushUrl = remotes.find((r) => r.name === 'origin')?.refs
          .push;
        if (originPushUrl && isSshUrl(originPushUrl)) {
          if (sshPassphraseAttempted) {
            toast.error('Incorrect SSH key passphrase. Please try again.');
          }
          setSshPassphraseDialogOpen(true);
          return;
        }
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
      setSshPassphraseDialogOpen(false);
      setSshPassphraseAttempted(false);
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
      // 18px per line + 6px padding + 2px border
      const calculatedHeight = Math.min(Math.max(totalLines * 18 + 8, 26), 160);
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

  const handleCommitAndPush = () => {
    if (stagedFilesCount === 0 || !projectPath) {
      return;
    }
    setPendingAction('commitPush');
    commitFiles(
      { path: projectPath, message: message.trim() || 'Update files' },
      // Runs after the hook's own onSuccess (message cleared, state reset).
      // handlePush publishes the branch first when there is no remote yet.
      { onSuccess: () => handlePush() },
    );
  };

  const handleSshPassphraseSubmit = (sshPassphrase: string) => {
    if (!projectPath) return;
    setSshPassphraseAttempted(true);
    setPendingAction('push');
    pushFiles({
      path: projectPath,
      credentials: { username: '', password: '', sshPassphrase },
    });
  };

  const handleSshPassphraseCancel = () => {
    setSshPassphraseDialogOpen(false);
    setSshPassphraseAttempted(false);
    setPendingAction(null);
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
      if (
        pendingAction === 'commit' ||
        pendingAction === 'commitPush' ||
        effectivePrimaryAction === 'commit'
      ) {
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
      return <Sync sx={{ fontSize: 16 }} />;
    }
    if (effectivePrimaryAction === 'publish') {
      return <CloudUploadOutlined sx={{ fontSize: 16 }} />;
    }
    return <Check sx={{ fontSize: 16 }} />;
  })();

  // Theme primary colours for the action button
  const accent = theme.palette.primary.main;
  const accentHover = theme.palette.primary.dark;
  const accentText = theme.palette.primary.contrastText;
  const actionButtonSx = {
    minWidth: 0,
    height: '100%',
    py: 0,
    borderRadius: 0,
    boxShadow: 'none',
    textTransform: 'none',
    fontSize: '13px',
    fontWeight: 500,
    backgroundColor: accent,
    color: accentText,
    '& .MuiButton-startIcon': { mr: 0.75 },
    '&:hover': { backgroundColor: accentHover, boxShadow: 'none' },
    // Dimmed via the wrapper's opacity instead of turning grey
    '&.Mui-disabled': { backgroundColor: accent, color: accentText },
    '&.Mui-focusVisible': {
      boxShadow: `inset 0 0 0 1px ${alpha(accentText, 0.85)}`,
    },
  } as const;

  // Split button (Commit ▾) only for commit; Push/Publish stay single.
  const showCommitMenu = effectivePrimaryAction === 'commit';

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

  const handleCommitMenuAction = (pushAfterCommit: boolean) => {
    setCommitMenuAnchor(null);
    if (isLoading) {
      return;
    }
    if (pushAfterCommit) {
      handleCommitAndPush();
    } else {
      handleCommit();
    }
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
            // MUI's outlined-input border; the theme divider (6-8%) was too faint
            borderColor:
              theme.palette.mode === 'dark'
                ? alpha(theme.palette.common.white, 0.23)
                : alpha(theme.palette.common.black, 0.23),
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
              p: theme.spacing(0.375, 1),
              fontSize: '13px',
              lineHeight: '18px',
              fontFamily: theme.typography.fontFamily,
              minHeight: 18,
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
                top: theme.spacing(0.375),
                left: theme.spacing(1),
              },
            }}
          />
        </Box>

        {/* Dynamic Commit/Push/Sync Button (split button for Commit) */}
        <Box
          sx={{
            display: 'flex',
            height: 28,
            borderRadius: theme.shape.borderRadius / 8,
            overflow: 'hidden',
            opacity: buttonDisabled ? 0.45 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          <Button
            fullWidth
            variant="contained"
            disableElevation
            disabled={buttonDisabled}
            onClick={handlePrimaryAction}
            startIcon={buttonIcon}
            sx={{ ...actionButtonSx, flex: 1 }}
          >
            {buttonLabel}
          </Button>
          {showCommitMenu && (
            <Tooltip title="More commit actions" placement="top">
              <Box component="span" sx={{ display: 'flex' }}>
                <Button
                  variant="contained"
                  disableElevation
                  disabled={buttonDisabled}
                  onClick={(e) => setCommitMenuAnchor(e.currentTarget)}
                  aria-label="More commit actions"
                  aria-haspopup="menu"
                  aria-expanded={Boolean(commitMenuAnchor)}
                  sx={{
                    ...actionButtonSx,
                    width: 28,
                    borderLeft: `1px solid ${alpha(accentText, 0.3)}`,
                  }}
                >
                  <KeyboardArrowDown sx={{ fontSize: 18 }} />
                </Button>
              </Box>
            </Tooltip>
          )}
        </Box>

        <Menu
          anchorEl={commitMenuAnchor}
          open={Boolean(commitMenuAnchor)}
          onClose={() => setCommitMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{
            sx: {
              minWidth: 200,
              mt: 0.5,
              '& .MuiMenuItem-root': { fontSize: '13px', py: 0.75, gap: 1 },
            },
          }}
        >
          <MenuItem
            onClick={() => handleCommitMenuAction(false)}
            disabled={isCommitDisabled}
          >
            <Check sx={{ fontSize: 16 }} />
            Commit
            <Typography
              variant="caption"
              sx={{ ml: 'auto', pl: 2, color: 'text.secondary' }}
            >
              ⌘ Enter
            </Typography>
          </MenuItem>
          <MenuItem
            onClick={() => handleCommitMenuAction(true)}
            disabled={isCommitDisabled}
          >
            <CloudUploadOutlined sx={{ fontSize: 16 }} />
            {hasRemote && hasTrackingBranch
              ? 'Commit & Push'
              : 'Commit & Publish Branch'}
          </MenuItem>
        </Menu>
      </Box>

      {projectPath ? (
        <AddGitRemoteModal
          isOpen={isAddRemoteModalOpen}
          onClose={handleCloseAddRemoteModal}
          successCallback={handleRemoteAdded}
          path={projectPath}
        />
      ) : null}

      <SshPassphraseModal
        isOpen={sshPassphraseDialogOpen}
        isLoading={isPushing}
        onClose={handleSshPassphraseCancel}
        onSubmit={handleSshPassphraseSubmit}
      />
    </>
  );
};
