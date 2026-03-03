import React, { useState, useRef, useEffect, memo } from 'react';
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
import { NotebookCell as NotebookCellType } from '../../../types/notebooks';
import { SQLCell } from './SQLCell';
import { MarkdownCell } from './MarkdownCell';
import { OutputPanel } from './OutputPanel';

interface NotebookCellProps {
  cell: NotebookCellType;
  index: number;
  connectionId: string; // Changed from instanceId to connectionId for consistency
  notebookId: string; // Added for pagination support
  isExecuting: boolean;
  onRun: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClearOutput: () => void;
  onUpdate: (content: string) => void;
  dragHandleProps?: any;
}

type SectionFilter = 'all' | 'code' | 'output';

const NotebookCellComponent: React.FC<NotebookCellProps> = ({
  cell,
  index,
  connectionId,
  notebookId,
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
  const [outputHeight, setOutputHeight] = useState<number | null>(null);
  const [isHoveringOutput, setIsHoveringOutput] = useState(false);
  const [isDraggingOutput, setIsDraggingOutput] = useState(false);
  const outputResizeHandleRef = useRef<HTMLDivElement>(null);
  const outputHeightRef = useRef<number | null>(null);
  const resizeThrottleRef = useRef<number | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    outputHeightRef.current = outputHeight;
  }, [outputHeight]);

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

  // Handle output section resize
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      setIsDraggingOutput(true);
      const startY = e.clientY;

      // Get current height from ref at the time of mousedown
      const startHeight = outputHeightRef.current || 300;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const newHeight = Math.max(150, Math.min(1000, startHeight + deltaY));

        // Throttle updates to ~60fps (16ms) to reduce re-renders
        if (resizeThrottleRef.current) {
          return; // Skip this update, previous one still pending
        }

        resizeThrottleRef.current = window.requestAnimationFrame(() => {
          setOutputHeight(newHeight);
          resizeThrottleRef.current = null;
        });
      };

      const handleMouseUp = () => {
        // Cancel any pending throttled update
        if (resizeThrottleRef.current) {
          window.cancelAnimationFrame(resizeThrottleRef.current);
          resizeThrottleRef.current = null;
        }

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setIsDraggingOutput(false);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    };

    const resizeHandle = outputResizeHandleRef.current;
    if (resizeHandle) {
      resizeHandle.addEventListener('mousedown', handleMouseDown);
      return () => {
        resizeHandle.removeEventListener('mousedown', handleMouseDown);
      };
    }
    return undefined;
  }, []); // Empty deps - only set up once, use ref to get current height

  return (
    <Box
      sx={{
        mb: 1, // Reduced from 2
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        '&:hover': { borderColor: 'primary.main' },
      }}
    >
      {/* Cell Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5, // Reduced from 1
          px: 1, // Reduced padding
          py: 0.5, // Reduced padding
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
          borderBottom: collapsed ? 'none' : '1px solid',
          borderColor: 'divider',
          minHeight: '32px', // Compact header height
        }}
      >
        {/* Drag Handle */}
        {dragHandleProps && (
          <Box
            // eslint-disable-next-line react/jsx-props-no-spreading
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
              <DragIndicator sx={{ fontSize: 16 }} />
            </Tooltip>
          </Box>
        )}

        {/* Collapse Toggle */}
        <IconButton
          size="small"
          onClick={() => setCollapsed(!collapsed)}
          sx={{ p: 0.25 }}
        >
          {collapsed ? (
            <ExpandMore sx={{ fontSize: 18 }} />
          ) : (
            <ExpandLess sx={{ fontSize: 18 }} />
          )}
        </IconButton>

        {/* Run Button - Moved to beginning */}
        {!collapsed && cell.type === 'sql' && (
          <IconButton
            size="small"
            onClick={onRun}
            disabled={isExecuting}
            color="primary"
            sx={{ p: 0.25 }}
          >
            <PlayArrow sx={{ fontSize: 18 }} />
          </IconButton>
        )}

        {/* Cell Type Badge */}
        <Chip
          label={cell.type.toUpperCase()}
          size="small"
          color={cell.type === 'sql' ? 'primary' : 'default'}
          sx={{
            height: '20px',
            fontSize: '10px',
            '& .MuiChip-label': { px: 0.75, py: 0 },
          }}
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
              fontSize: 11,
            }}
          >
            {getCellSummary()}
          </Typography>
        )}

        {/* Cell Index */}
        {!collapsed && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: 10 }}
          >
            [{index + 1}]
          </Typography>
        )}

        {/* Section Dropdown (expanded, SQL with output) */}
        {!collapsed && cell.type === 'sql' && cell.output && (
          <Box sx={{ display: 'flex', gap: 0.25 }}>
            <Chip
              label="All"
              size="small"
              variant={section === 'all' ? 'filled' : 'outlined'}
              onClick={() => setSection('all')}
              sx={{
                cursor: 'pointer',
                height: '20px',
                fontSize: '10px',
                '& .MuiChip-label': { px: 0.75, py: 0 },
              }}
            />
            <Chip
              label="Code"
              size="small"
              variant={section === 'code' ? 'filled' : 'outlined'}
              onClick={() => setSection('code')}
              sx={{
                cursor: 'pointer',
                height: '20px',
                fontSize: '10px',
                '& .MuiChip-label': { px: 0.75, py: 0 },
              }}
            />
            <Chip
              label="Output"
              size="small"
              variant={section === 'output' ? 'filled' : 'outlined'}
              onClick={() => setSection('output')}
              sx={{
                cursor: 'pointer',
                height: '20px',
                fontSize: '10px',
                '& .MuiChip-label': { px: 0.75, py: 0 },
              }}
            />
          </Box>
        )}

        <Box sx={{ flex: 1 }} />

        {/* More Menu */}
        <IconButton
          size="small"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={{ p: 0.25 }}
        >
          <MoreVert sx={{ fontSize: 18 }} />
        </IconButton>

        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={handleDuplicate} sx={{ py: 0.5, fontSize: 13 }}>
            <ContentCopy sx={{ fontSize: 16, mr: 1 }} /> Duplicate
          </MenuItem>
          {cell.output && (
            <MenuItem
              onClick={handleClearOutput}
              sx={{ py: 0.5, fontSize: 13 }}
            >
              <Clear sx={{ fontSize: 16, mr: 1 }} /> Clear Output
            </MenuItem>
          )}
          <MenuItem onClick={handleDelete} sx={{ py: 0.5, fontSize: 13 }}>
            <Delete sx={{ fontSize: 16, mr: 1 }} /> Delete
          </MenuItem>
        </Menu>
      </Box>

      {/* Cell Content (collapsible) */}
      <Collapse in={!collapsed}>
        <Box sx={{ p: 0.75 }}>
          {/* Code Section - Always show when not filtered to output only */}
          {(section === 'all' || section === 'code') && (
            <Box sx={{ mb: section === 'all' && cell.output ? 0.5 : 0 }}>
              {cell.type === 'sql' ? (
                <SQLCell
                  cell={cell}
                  connectionId={connectionId}
                  isExecuting={isExecuting}
                  onRun={onRun}
                  onUpdate={onUpdate}
                />
              ) : (
                <MarkdownCell cell={cell} onUpdate={onUpdate} />
              )}
            </Box>
          )}

          {/* Output Section - Show below code when available */}
          {(section === 'all' || section === 'output') &&
            cell.output &&
            !isExecuting && (
              <Box
                onMouseEnter={() => setIsHoveringOutput(true)}
                onMouseLeave={() => setIsHoveringOutput(false)}
                sx={{
                  position: 'relative',
                  width: '100%',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    height: outputHeight ? `${outputHeight}px` : 'auto',
                    overflowY: outputHeight ? 'auto' : 'visible',
                    width: '100%',
                  }}
                >
                  <OutputPanel
                    output={cell.output}
                    connectionId={connectionId}
                    notebookId={notebookId}
                    cellId={cell.id}
                    sql={cell.content}
                  />
                </Box>

                {/* Output Resize Handle - Only visible on hover or while dragging */}
                <Box
                  ref={outputResizeHandleRef}
                  sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '8px',
                    cursor: 'row-resize',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isHoveringOutput || isDraggingOutput ? 1 : 0,
                    transition: 'opacity 0.2s ease-in-out',
                    backgroundColor: 'transparent',
                    zIndex: 10,
                    '&:hover': {
                      opacity: 1,
                    },
                  }}
                >
                  {/* Visual handle indicator */}
                  <Box
                    sx={{
                      width: '40px',
                      height: '4px',
                      borderRadius: '2px',
                      backgroundColor: isDraggingOutput
                        ? 'primary.main'
                        : 'divider',
                      transition: 'background-color 0.2s',
                      '&:hover': {
                        backgroundColor: 'primary.main',
                      },
                    }}
                  />
                </Box>
              </Box>
            )}
        </Box>
      </Collapse>
    </Box>
  );
};

// Memoize to prevent unnecessary re-renders
// Only re-render if cell content, index, or execution state changes
export const NotebookCell = memo(
  NotebookCellComponent,
  (prevProps, nextProps) => {
    // Return true if props are equal (skip re-render)
    // Return false if props are different (re-render)
    return (
      prevProps.cell.id === nextProps.cell.id &&
      prevProps.cell.content === nextProps.cell.content &&
      prevProps.cell.output === nextProps.cell.output &&
      prevProps.index === nextProps.index &&
      prevProps.isExecuting === nextProps.isExecuting &&
      prevProps.connectionId === nextProps.connectionId
    );
  },
);

NotebookCell.displayName = 'NotebookCell';
