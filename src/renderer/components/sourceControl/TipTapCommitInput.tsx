import React, { useState, useRef, useEffect } from 'react';
import { Box, Button, useTheme } from '@mui/material';
import { useGitCommit } from '../../controllers';

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

  const { mutate: commitFiles, isLoading } = useGitCommit({
    onSuccess: () => {
      setMessage('');
      setHeight(36);
      if (textareaRef.current) {
        textareaRef.current.textContent = '';
      }
      onCommitSuccess?.();
    },
    onError: (error: any) => {
      // eslint-disable-next-line no-console
      console.error('Commit failed:', error);
    },
  });

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey && e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    }
  };

  const isCommitDisabled =
    !message.trim() || stagedFilesCount === 0 || isLoading;

  // Initialize height on mount
  useEffect(() => {
    updateHeight();
  }, []);

  return (
    <Box
      sx={{
        px: 1.5,
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
          borderRadius: 0.5,
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

      {/* Smaller Commit Button */}
      <Button
        fullWidth
        variant="contained"
        disabled={isCommitDisabled}
        onClick={handleCommit}
        sx={{
          textTransform: 'none',
          fontSize: '13px',
          fontWeight: 500,
          py: 0.75,
          minHeight: 32,
          borderRadius: 0.5,
          backgroundColor: isCommitDisabled
            ? theme.palette.action.disabled
            : theme.palette.primary.main,
          color: isCommitDisabled
            ? theme.palette.action.disabledBackground
            : theme.palette.getContrastText(theme.palette.primary.main),
          '&:hover': {
            backgroundColor: isCommitDisabled
              ? theme.palette.action.disabled
              : theme.palette.primary.dark,
          },
          '&.Mui-disabled': {
            color: theme.palette.action.disabledBackground,
            backgroundColor: theme.palette.action.disabled,
          },
        }}
      >
        {isLoading
          ? 'Committing...'
          : `Commit${stagedFilesCount > 0 ? ` (${stagedFilesCount})` : ''}`}
      </Button>
    </Box>
  );
};
