import React, { useState, useRef, useEffect } from 'react';
import { Box, Button, useTheme } from '@mui/material';
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
  const theme = useTheme();
  const textareaRef = useRef<HTMLDivElement>(null);

  const { data: aheadBehind, refetch: refetchAheadBehind } =
    useGetAheadBehindCount(projectPath, {
      enabled: !!projectPath,
    });

  const { mutate: commitFiles, isLoading: isCommitting } = useGitCommit({
    onSuccess: () => {
      setMessage('');
      setHeight(36);
      if (textareaRef.current) {
        textareaRef.current.textContent = '';
      }
      onCommitSuccess?.();
      refetchAheadBehind();
    },
    onError: (error: any) => {
      // eslint-disable-next-line no-console
      console.error('Commit failed:', error);
    },
  });

  const { mutate: pushFiles, isLoading: isPushing } = useGitPush({
    onSuccess: () => {
      refetchAheadBehind();
      onCommitSuccess?.();
    },
    onError: (error: any) => {
      // eslint-disable-next-line no-console
      console.error('Push failed:', error);
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
    if (message.trim() && stagedFilesCount > 0 && projectPath) {
      commitFiles({
        path: projectPath,
        message: message.trim(),
        files: ['.'],
      });
    }
  };

  const handlePush = () => {
    if (!projectPath) {
      return;
    }

    if (remotes.length === 0) {
      setIsAddRemoteModalOpen(true);
      return;
    }

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
  const shouldShowPublish = !hasRemote && stagedFilesCount === 0;
  const shouldShowPush = hasRemote && aheadCount > 0 && stagedFilesCount === 0;
  let primaryAction: 'commit' | 'push' | 'publish' = 'commit';
  if (shouldShowPublish) {
    primaryAction = 'publish';
  } else if (shouldShowPush) {
    primaryAction = 'push';
  }

  const isLoading = isCommitting || isPushing;
  const isCommitDisabled =
    !message.trim() || stagedFilesCount === 0 || isLoading;
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
      return `Push (${aheadCount})`;
    }
    if (primaryAction === 'publish') {
      return 'Publish Branch';
    }
    return stagedFilesCount > 0 ? `Commit (${stagedFilesCount})` : 'Commit';
  })();

  const handlePrimaryAction = () => {
    if (primaryAction === 'push') {
      handlePush();
      return;
    }
    if (primaryAction === 'publish') {
      setIsAddRemoteModalOpen(true);
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

        {/* Dynamic Commit/Push Button */}
        <Button
          fullWidth
          variant="contained"
          disabled={buttonDisabled}
          onClick={handlePrimaryAction}
          sx={{
            textTransform: 'none',
            fontSize: '13px',
            fontWeight: 500,
            py: 0.75,
            minHeight: 32,
            borderRadius: theme.shape.borderRadius / 8, // Use theme border radius
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
