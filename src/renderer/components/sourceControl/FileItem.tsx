import React, { useState } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { Add, Undo, FileOpen, Remove } from '@mui/icons-material';

import { FileIcon } from '../fileIcon';
import { FileStatus } from '../../../types/backend';

interface FileItemProps {
  file: FileStatus;
  onStage?: (filePath: string) => void;
  onUnstage?: (filePath: string) => void;
  onDiscard?: (filePath: string) => void;
  onOpenFile?: (filePath: string) => void;
}

export const FileItem: React.FC<FileItemProps> = ({
  file,
  onStage,
  onUnstage,
  onDiscard,
  onOpenFile,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // A file is staged if it has status 'staged', 'renamed', or 'staged-deleted'
  const isStaged =
    file.status === 'staged' ||
    file.status === 'renamed' ||
    file.status === 'staged-deleted';

  // Get git status letter for display
  const getStatusLetter = (status: string) => {
    switch (status) {
      case 'modified':
        return 'M';
      case 'untracked':
        return 'U';
      case 'staged':
        return 'M'; // Staged files are typically modified
      case 'deleted':
        return 'D';
      case 'staged-deleted':
        return 'D';
      case 'renamed':
        return 'R';
      case 'conflicted':
        return 'C';
      default:
        return 'U';
    }
  };

  const statusLetter = getStatusLetter(file.status);

  // Get relative path for display (remove leading ./ if present)
  const displayPath = file.path.startsWith('./')
    ? file.path.slice(2)
    : file.path;

  // Split path into directory and filename
  const pathParts = displayPath.split('/');
  const fileName = pathParts.pop() || '';

  // Create short directory path (show only parent directory if nested)
  let shortDirectory = '';
  if (pathParts.length > 0) {
    if (pathParts.length > 2) {
      shortDirectory = `.../${pathParts[pathParts.length - 1]}`;
    } else {
      shortDirectory = pathParts.join('/');
    }
  }

  const handleStageToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStaged && onUnstage) {
      onUnstage(file.path);
    } else if (!isStaged && onStage) {
      onStage(file.path);
    }
  };

  const handleDiscard = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDiscard) {
      onDiscard(file.path);
    }
  };

  const handleOpenFile = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (onOpenFile) {
      onOpenFile(file.path);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        px: 1,
        py: 0.125,
        cursor: 'pointer',
        minHeight: '22px',
        '&:hover': {
          backgroundColor: 'action.hover',
        },
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => handleOpenFile()}
    >
      {/* File Icon */}
      <Box sx={{ mr: 1, flexShrink: 0 }}>
        <FileIcon fileName={fileName} />
      </Box>

      {/* File Name and Path */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          mr: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        {/* File Name (Primary) */}
        <Typography
          variant="body2"
          sx={{
            fontSize: '14px',
            color: 'text.primary',
            fontWeight: 500,
            flexShrink: 0,
            textDecoration:
              file.status === 'deleted' || file.status === 'staged-deleted'
                ? 'line-through'
                : 'none',
            opacity:
              file.status === 'deleted' || file.status === 'staged-deleted'
                ? 0.6
                : 1,
          }}
        >
          {fileName}
        </Typography>

        {/* Short Directory Path (Secondary) */}
        {shortDirectory && (
          <Typography
            variant="body2"
            sx={{
              fontSize: '11px',
              color: 'text.secondary',
              opacity:
                file.status === 'deleted' || file.status === 'staged-deleted'
                  ? 0.4
                  : 0.7,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              textDecoration:
                file.status === 'deleted' || file.status === 'staged-deleted'
                  ? 'line-through'
                  : 'none',
            }}
          >
            {shortDirectory}
          </Typography>
        )}
      </Box>

      {/* Action Buttons - Show on Hover */}
      {isHovered && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          {/* Open File Button */}
          <Tooltip title="Open File" placement="top" enterDelay={500}>
            <IconButton
              size="small"
              onClick={(e) => handleOpenFile(e)}
              sx={{
                width: 20,
                height: 20,
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: 'action.hover',
                  color: 'info.main',
                },
              }}
            >
              <FileOpen sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>

          {/* Discard Changes Button - Only for unstaged files */}
          {!isStaged && (
            <Tooltip title="Discard Changes" placement="top" enterDelay={500}>
              <IconButton
                size="small"
                onClick={handleDiscard}
                sx={{
                  width: 20,
                  height: 20,
                  color: 'text.secondary',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                    color: 'warning.main',
                  },
                }}
              >
                <Undo sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}

          {/* Stage/Unstage Button */}
          <Tooltip
            title={isStaged ? 'Unstage Changes' : 'Stage Changes'}
            placement="top"
            enterDelay={500}
          >
            <IconButton
              size="small"
              onClick={handleStageToggle}
              sx={{
                width: 20,
                height: 20,
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: 'action.hover',
                  color: isStaged ? 'error.main' : 'success.main',
                },
              }}
            >
              {isStaged ? (
                <Remove sx={{ fontSize: 14 }} />
              ) : (
                <Add sx={{ fontSize: 14 }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* Git Status Letter */}
      <Box sx={{ flexShrink: 0, mr: 1 }}>
        <Typography
          variant="body2"
          sx={{
            fontSize: '11px',
            color: (() => {
              // Special case: staged deletions should be red
              if (file.status === 'staged-deleted') return 'error.main';
              // Other staged files are green
              if (isStaged) return 'success.main';
              switch (file.status) {
                case 'modified':
                  return 'info.main';
                case 'untracked':
                  return 'success.light';
                case 'deleted':
                  return 'error.main';
                case 'renamed':
                  return 'warning.main';
                case 'conflicted':
                  return 'error.dark';
                default:
                  return 'text.secondary';
              }
            })(),
            fontFamily: 'monospace',
            fontWeight: 600,
            minWidth: '12px',
            textAlign: 'center',
          }}
        >
          {statusLetter}
        </Typography>
      </Box>
    </Box>
  );
};
