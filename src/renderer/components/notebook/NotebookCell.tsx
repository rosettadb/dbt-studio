import React, { useState } from 'react';
import {
  Box,
  IconButton,
  Typography,
  Collapse,
  Chip,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import {
  ExpandMore,
  ExpandLess,
  MoreVert,
  PlayArrow,
  Delete,
  ContentCopy,
  Clear,
  DragIndicator,
} from '@mui/icons-material';
import { NotebookCell as NotebookCellType } from '../../../types/notebook';
import { SQLCell } from './SQLCell';
import { MarkdownCell } from './MarkdownCell';
import { OutputPanel } from './OutputPanel';

interface NotebookCellProps {
  cell: NotebookCellType;
  index: number;
  isExecuting: boolean;
  onRun: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClearOutput: () => void;
  onUpdate: (content: string) => void;
  dragHandleProps?: any;
}

type SectionFilter = 'all' | 'code' | 'output';

export const NotebookCell: React.FC<NotebookCellProps> = ({
  cell,
  index,
  isExecuting,
  onRun,
  onDelete,
  onDuplicate,
  onClearOutput,
  onUpdate,
  dragHandleProps,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [section, setSection] = useState<SectionFilter>('all');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  // Generate smart summary for collapsed view
  const getCellSummary = (): string => {
    if (cell.type === 'sql') {
      const firstLine = cell.content.split('\n')[0].trim();
      const preview =
        firstLine.length > 60 ? `${firstLine.substring(0, 60)}...` : firstLine;

      if (cell.output) {
        const { rowCount, executionTime } = cell.output;
        return `${preview} • ${rowCount?.toLocaleString() || 0} rows in ${executionTime}ms`;
      }

      return preview;
    }

    if (cell.type === 'markdown') {
      const firstLine = cell.content
        .split('\n')[0]
        .replace(/^#+\s*/, '')
        .trim();
      return firstLine.length > 80
        ? `${firstLine.substring(0, 80)}...`
        : firstLine;
    }

    return 'Empty cell';
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleDuplicate = () => {
    onDuplicate();
    handleMenuClose();
  };

  const handleClearOutput = () => {
    onClearOutput();
    handleMenuClose();
  };

  const handleDelete = () => {
    onDelete();
    handleMenuClose();
  };

  return (
    <Box
      sx={{
        mb: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        '&:hover': { borderColor: 'primary.main' },
      }}
    >
      {/* Cell Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1,
          bgcolor: 'grey.900',
          borderBottom: collapsed ? 'none' : '1px solid',
          borderColor: 'divider',
        }}
      >
        {/* Drag Handle */}
        {dragHandleProps && (
          <Box
            {...dragHandleProps}
            sx={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'grab',
              '&:active': { cursor: 'grabbing' },
              color: 'text.secondary',
              '&:hover': { color: 'text.primary' },
            }}
          >
            <Tooltip title="Drag to reorder">
              <DragIndicator fontSize="small" />
            </Tooltip>
          </Box>
        )}

        {/* Collapse Toggle */}
        <IconButton size="small" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ExpandMore /> : <ExpandLess />}
        </IconButton>

        {/* Cell Type Badge */}
        <Chip
          label={cell.type.toUpperCase()}
          size="small"
          color={cell.type === 'sql' ? 'primary' : 'default'}
        />

        {/* Cell Summary (collapsed) */}
        {collapsed && (
          <Typography
            variant="body2"
            sx={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: cell.type === 'sql' ? 'monospace' : 'inherit',
              fontSize: 12,
            }}
          >
            {getCellSummary()}
          </Typography>
        )}

        {/* Cell Index */}
        {!collapsed && (
          <Typography variant="caption" color="text.secondary">
            [{index + 1}]
          </Typography>
        )}

        {/* Section Dropdown (expanded, SQL with output) */}
        {!collapsed && cell.type === 'sql' && cell.output && (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Chip
              label="All"
              size="small"
              variant={section === 'all' ? 'filled' : 'outlined'}
              onClick={() => setSection('all')}
              sx={{ cursor: 'pointer' }}
            />
            <Chip
              label="Code"
              size="small"
              variant={section === 'code' ? 'filled' : 'outlined'}
              onClick={() => setSection('code')}
              sx={{ cursor: 'pointer' }}
            />
            <Chip
              label="Output"
              size="small"
              variant={section === 'output' ? 'filled' : 'outlined'}
              onClick={() => setSection('output')}
              sx={{ cursor: 'pointer' }}
            />
          </Box>
        )}

        <Box sx={{ flex: 1 }} />

        {/* Run Button */}
        {!collapsed && cell.type === 'sql' && (
          <IconButton
            size="small"
            onClick={onRun}
            disabled={isExecuting}
            color="primary"
          >
            <PlayArrow />
          </IconButton>
        )}

        {/* More Menu */}
        <IconButton
          size="small"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
        >
          <MoreVert />
        </IconButton>

        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={handleDuplicate}>
            <ContentCopy fontSize="small" sx={{ mr: 1 }} /> Duplicate
          </MenuItem>
          {cell.output && (
            <MenuItem onClick={handleClearOutput}>
              <Clear fontSize="small" sx={{ mr: 1 }} /> Clear Output
            </MenuItem>
          )}
          <MenuItem onClick={handleDelete}>
            <Delete fontSize="small" sx={{ mr: 1 }} /> Delete
          </MenuItem>
        </Menu>
      </Box>

      {/* Cell Content (collapsible) */}
      <Collapse in={!collapsed}>
        <Box sx={{ p: 2 }}>
          {/* Code Section */}
          {(section === 'all' || section === 'code') && (
            <Box sx={{ mb: section === 'all' && cell.output ? 2 : 0 }}>
              {cell.type === 'sql' ? (
                <SQLCell
                  cell={cell}
                  isExecuting={isExecuting}
                  onRun={onRun}
                  onUpdate={onUpdate}
                />
              ) : (
                <MarkdownCell cell={cell} onUpdate={onUpdate} />
              )}
            </Box>
          )}

          {/* Output Section */}
          {(section === 'all' || section === 'output') &&
            cell.output &&
            !isExecuting && <OutputPanel output={cell.output} cellId={cell.id} />}
        </Box>
      </Collapse>
    </Box>
  );
};
