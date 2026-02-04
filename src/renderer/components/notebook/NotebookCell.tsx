/**
 * Notebook Cell Component
 * Wrapper for different cell types (SQL, Markdown, Visualization)
 */

import React from 'react';
import { Box, Paper, IconButton, Menu, MenuItem, Tooltip } from '@mui/material';
import {
  MoreVert as MoreIcon,
  PlayArrow as RunIcon,
  Delete as DeleteIcon,
  ContentCopy as DuplicateIcon,
  ArrowUpward as MoveUpIcon,
  ArrowDownward as MoveDownIcon,
} from '@mui/icons-material';
import { NotebookCell as NotebookCellType } from '../../../types/notebook';
import { SQLCell } from './SQLCell';
import { MarkdownCell } from './MarkdownCell';

interface NotebookCellProps {
  cell: NotebookCellType;
  isFirst: boolean;
  isLast: boolean;
  isExecuting: boolean;
  onRun: (content: string) => void;
  onUpdate: (content: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onClearOutput: () => void;
}

export const NotebookCell: React.FC<NotebookCellProps> = ({
  cell,
  isFirst,
  isLast,
  isExecuting,
  onRun,
  onUpdate,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onClearOutput,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [isHovered, setIsHovered] = React.useState(false);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleAction = (action: () => void) => {
    action();
    handleMenuClose();
  };

  return (
    <Paper
      elevation={isHovered ? 3 : 1}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        mb: 2,
        position: 'relative',
        transition: 'all 0.2s ease',
        '&:hover': {
          boxShadow: 3,
        },
      }}
    >
      {/* Cell Actions Toolbar */}
      <Box
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          gap: 0.5,
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.2s ease',
          zIndex: 10,
        }}
      >
        {cell.type === 'sql' && (
          <Tooltip title="Run Cell (Cmd+Enter)">
            <IconButton
              size="small"
              onClick={() => onRun(cell.content)}
              disabled={isExecuting}
              sx={{
                bgcolor: 'primary.main',
                color: 'white',
                '&:hover': { bgcolor: 'primary.dark' },
              }}
            >
              <RunIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        <Tooltip title="More Actions">
          <IconButton size="small" onClick={handleMenuOpen}>
            <MoreIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          {!isFirst && (
            <MenuItem onClick={() => handleAction(onMoveUp)}>
              <MoveUpIcon fontSize="small" sx={{ mr: 1 }} />
              Move Up
            </MenuItem>
          )}
          {!isLast && (
            <MenuItem onClick={() => handleAction(onMoveDown)}>
              <MoveDownIcon fontSize="small" sx={{ mr: 1 }} />
              Move Down
            </MenuItem>
          )}
          <MenuItem onClick={() => handleAction(onDuplicate)}>
            <DuplicateIcon fontSize="small" sx={{ mr: 1 }} />
            Duplicate
          </MenuItem>
          {cell.output && (
            <MenuItem onClick={() => handleAction(onClearOutput)}>
              Clear Output
            </MenuItem>
          )}
          <MenuItem
            onClick={() => handleAction(onDelete)}
            sx={{ color: 'error.main' }}
          >
            <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
            Delete Cell
          </MenuItem>
        </Menu>
      </Box>

      {/* Cell Content */}
      <Box sx={{ p: 2, pt: 5 }}>
        {cell.type === 'sql' && (
          <SQLCell
            cell={cell}
            isExecuting={isExecuting}
            onRun={onRun}
            onUpdate={onUpdate}
          />
        )}

        {cell.type === 'markdown' && (
          <MarkdownCell cell={cell} onUpdate={onUpdate} />
        )}

        {cell.type === 'visualization' && (
          <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
            Visualization cells coming soon...
          </Box>
        )}
      </Box>
    </Paper>
  );
};
