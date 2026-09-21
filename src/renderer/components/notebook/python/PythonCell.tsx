/**
 * Python Cell (chrome)
 * Colab-style cell: run gutter on the left with the execution count, the
 * editor (code or text), outputs underneath, and a hover toolbar on the right.
 */

import React, { memo, useState } from 'react';
import {
  Box,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  ArrowDownward,
  ArrowUpward,
  Clear,
  Code,
  ContentCopy,
  Delete,
  DragIndicator,
  MoreVert,
  Notes,
  PlayArrow,
  Stop,
} from '@mui/icons-material';
import type { PythonNotebookCell } from '../../../../types/pythonNotebooks';
import { PythonCodeCell, RunMode } from './PythonCodeCell';
import { PythonTextCell } from './PythonTextCell';
import { PythonCellOutputs } from './PythonCellOutputs';

export type CellRunState = 'idle' | 'queued' | 'running';

interface PythonCellProps {
  cell: PythonNotebookCell;
  index: number;
  isSelected: boolean;
  runState: CellRunState;
  kernelBusy: boolean;
  focusRequest?: number;
  startEditing?: boolean;
  dragHandleProps?: any;
  onSelect: () => void;
  onChange: (source: string) => void;
  onRun: (mode: RunMode) => void;
  onInterrupt: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onClearOutputs: () => void;
  onChangeType: (type: 'code' | 'markdown') => void;
}

const PythonCellComponent: React.FC<PythonCellProps> = ({
  cell,
  index,
  isSelected,
  runState,
  kernelBusy,
  focusRequest,
  startEditing,
  dragHandleProps,
  onSelect,
  onChange,
  onRun,
  onInterrupt,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onClearOutputs,
  onChangeType,
}) => {
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const isCode = cell.cell_type === 'code';
  const isRunning = runState === 'running';
  const closeMenu = () => setMenuAnchor(null);

  let gutterLabel: React.ReactNode;
  if (isRunning) {
    gutterLabel = <CircularProgress size={14} />;
  } else if (runState === 'queued') {
    gutterLabel = '[*]';
  } else {
    gutterLabel = `[${cell.execution_count ?? ' '}]`;
  }

  return (
    <Box
      data-cell-id={cell.id}
      data-testid={`python-cell-${index}`}
      onClick={onSelect}
      role="presentation"
      sx={{
        display: 'flex',
        borderRadius: 1,
        border: '1px solid',
        borderColor: isSelected ? 'primary.main' : 'divider',
        boxShadow: isSelected
          ? `0 0 0 1px ${theme.palette.primary.main}22`
          : 'none',
        bgcolor: 'background.paper',
        position: 'relative',
        transition: 'border-color 120ms ease',
        '&:hover .cell-hover-toolbar': { opacity: 1 },
        '&:hover .cell-drag-handle': { opacity: 1 },
      }}
    >
      {/* Left gutter */}
      <Box
        sx={{
          width: 52,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pt: 0.75,
          gap: 0.25,
          borderRight: '1px solid',
          borderColor: 'divider',
          bgcolor:
            theme.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.02)'
              : 'rgba(0,0,0,0.02)',
        }}
      >
        {isCode ? (
          <Tooltip
            title={isRunning ? 'Interrupt (running)' : 'Run cell (Shift+Enter)'}
          >
            <IconButton
              size="small"
              color={isRunning ? 'error' : 'primary'}
              onClick={(e) => {
                e.stopPropagation();
                if (isRunning) onInterrupt();
                else onRun('stay');
              }}
              disabled={runState === 'queued'}
              data-testid={`python-cell-run-${index}`}
              sx={{ p: 0.5 }}
            >
              {isRunning ? (
                <Stop sx={{ fontSize: 18 }} />
              ) : (
                <PlayArrow sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          </Tooltip>
        ) : (
          <Notes sx={{ fontSize: 16, color: 'text.disabled', mt: 0.5 }} />
        )}
        {isCode && (
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'monospace',
              fontSize: 10,
              color: 'text.secondary',
              display: 'flex',
              alignItems: 'center',
              minHeight: 16,
            }}
          >
            {gutterLabel}
          </Typography>
        )}
        <Box
          className="cell-drag-handle"
          // eslint-disable-next-line react/jsx-props-no-spreading
          {...dragHandleProps}
          sx={{
            mt: 'auto',
            mb: 0.5,
            opacity: 0,
            cursor: 'grab',
            color: 'text.disabled',
            '&:active': { cursor: 'grabbing' },
          }}
        >
          <DragIndicator sx={{ fontSize: 16 }} />
        </Box>
      </Box>

      {/* Body */}
      <Box
        sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
      >
        {isCode ? (
          <PythonCodeCell
            cellId={cell.id}
            source={cell.source}
            isExecuting={isRunning}
            onChange={onChange}
            onRun={onRun}
            onFocus={onSelect}
            focusRequest={focusRequest}
          />
        ) : (
          <PythonTextCell
            source={cell.source}
            onChange={onChange}
            onRender={() => onRun('advance')}
            onFocus={onSelect}
            startEditing={startEditing}
            focusRequest={focusRequest}
          />
        )}
        {isCode && <PythonCellOutputs outputs={cell.outputs} />}
      </Box>

      {/* Hover toolbar */}
      <Box
        className="cell-hover-toolbar"
        sx={{
          position: 'absolute',
          top: -12,
          right: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          opacity: isSelected ? 1 : 0,
          transition: 'opacity 120ms ease',
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          boxShadow: 1,
          zIndex: 2,
        }}
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <Tooltip title="Move up">
          <span>
            <IconButton size="small" onClick={onMoveUp} disabled={index === 0}>
              <ArrowUpward sx={{ fontSize: 14 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Move down">
          <IconButton size="small" onClick={onMoveDown}>
            <ArrowDownward sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={isCode ? 'Convert to text' : 'Convert to code'}>
          <IconButton
            size="small"
            onClick={() => onChangeType(isCode ? 'markdown' : 'code')}
          >
            {isCode ? (
              <Notes sx={{ fontSize: 14 }} />
            ) : (
              <Code sx={{ fontSize: 14 }} />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete cell">
          <IconButton size="small" onClick={onDelete}>
            <Delete sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
        <IconButton
          size="small"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
        >
          <MoreVert sx={{ fontSize: 14 }} />
        </IconButton>
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={closeMenu}
        >
          <MenuItem
            onClick={() => {
              closeMenu();
              onDuplicate();
            }}
            sx={{ fontSize: 13 }}
          >
            <ContentCopy sx={{ fontSize: 16, mr: 1 }} /> Duplicate cell
          </MenuItem>
          {isCode && (
            <MenuItem
              onClick={() => {
                closeMenu();
                onClearOutputs();
              }}
              disabled={cell.outputs.length === 0}
              sx={{ fontSize: 13 }}
            >
              <Clear sx={{ fontSize: 16, mr: 1 }} /> Clear outputs
            </MenuItem>
          )}
          {isCode && !kernelBusy && (
            <MenuItem
              onClick={() => {
                closeMenu();
                onRun('insert');
              }}
              sx={{ fontSize: 13 }}
            >
              <PlayArrow sx={{ fontSize: 16, mr: 1 }} /> Run and insert below
            </MenuItem>
          )}
        </Menu>
      </Box>
    </Box>
  );
};

export const PythonCell = memo(
  PythonCellComponent,
  (prev, next) =>
    prev.cell === next.cell &&
    prev.index === next.index &&
    prev.isSelected === next.isSelected &&
    prev.runState === next.runState &&
    prev.kernelBusy === next.kernelBusy &&
    prev.focusRequest === next.focusRequest &&
    prev.startEditing === next.startEditing &&
    prev.onRun === next.onRun &&
    prev.onChange === next.onChange,
);

PythonCell.displayName = 'PythonCell';

export default PythonCell;
