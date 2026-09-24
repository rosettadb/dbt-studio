/**
 * Python Cell (chrome)
 * Colab-style cell: run gutter on the left with the execution count, the
 * editor (code, sql or text), outputs underneath, and a hover toolbar on the
 * right. SQL cells get a header with the variable that receives the result.
 */

import React, { memo, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  InputBase,
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
  Storage,
  Visibility,
} from '@mui/icons-material';
import type {
  PythonCellType,
  PythonNotebookCell,
} from '../../../../types/pythonNotebooks';
import { PythonCodeCell, RunMode } from './PythonCodeCell';
import { PythonTextCell } from './PythonTextCell';
import { PythonCellOutputs } from './PythonCellOutputs';

export type CellRunState = 'idle' | 'queued' | 'running';

const PYTHON_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const CELL_TYPE_LABELS: Record<PythonCellType, string> = {
  code: 'Code',
  sql: 'SQL',
  markdown: 'Text',
};

interface PythonCellProps {
  cell: PythonNotebookCell;
  index: number;
  isSelected: boolean;
  runState: CellRunState;
  kernelBusy: boolean;
  focusRequest?: number;
  startEditing?: boolean;
  dragHandleProps?: any;
  installingPandas?: boolean;
  onSelect: () => void;
  onChange: (source: string) => void;
  /** SQL cells: rename the variable that receives the result */
  onChangeVariable: (variable: string) => void;
  onRun: (mode: RunMode) => void;
  onInterrupt: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onClearOutputs: () => void;
  onChangeType: (type: PythonCellType) => void;
  onInstallPandas: () => void;
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
  installingPandas,
  onSelect,
  onChange,
  onChangeVariable,
  onRun,
  onInterrupt,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onClearOutputs,
  onChangeType,
  onInstallPandas,
}) => {
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [textEditing, setTextEditing] = useState(false);
  const [renderRequest, setRenderRequest] = useState(0);
  const [editRequest, setEditRequest] = useState(0);
  const isSql = cell.cell_type === 'sql';
  /** Runs on the kernel and has outputs (code or sql). */
  const isCode = cell.cell_type !== 'markdown';
  const isRunning = runState === 'running';
  const closeMenu = () => setMenuAnchor(null);
  const variable = cell.metadata.rosetta?.variable ?? '';
  const variableValid = PYTHON_IDENTIFIER.test(variable);

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
        {isSql && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1,
              py: 0.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Chip
              icon={<Storage sx={{ fontSize: '14px !important' }} />}
              label="SQL"
              size="small"
              color="primary"
              variant="outlined"
              sx={{ height: 20, fontSize: 11 }}
            />
            <Typography variant="caption" color="text.secondary">
              Result as
            </Typography>
            <Tooltip
              title={
                variableValid
                  ? 'Python variable that receives the result (DataFrame when pandas is installed)'
                  : 'Must be a valid Python identifier'
              }
            >
              <InputBase
                value={variable}
                onChange={(e) => onChangeVariable(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                error={!variableValid}
                spellCheck={false}
                inputProps={{
                  'data-testid': `python-cell-variable-${index}`,
                  'aria-label': 'Result variable',
                }}
                sx={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  px: 0.75,
                  height: 22,
                  minWidth: 80,
                  border: '1px solid',
                  borderColor: variableValid ? 'divider' : 'error.main',
                  borderRadius: 0.5,
                  '& input': {
                    p: 0,
                    width: `${Math.max(variable.length, 4)}ch`,
                  },
                }}
              />
            </Tooltip>
          </Box>
        )}
        {isCode ? (
          <PythonCodeCell
            cellId={cell.id}
            source={cell.source}
            isExecuting={isRunning}
            language={isSql ? 'sql' : 'python'}
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
            renderRequest={renderRequest}
            editRequest={editRequest}
            onEditingChange={setTextEditing}
          />
        )}
        {isCode && (
          <PythonCellOutputs
            outputs={cell.outputs}
            onInstallPandas={isSql ? onInstallPandas : undefined}
            installingPandas={installingPandas}
          />
        )}
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
        {/* Text cells: toggle between raw markdown and rendered preview.
            Changing the cell type lives in the ⋮ menu only. */}
        {!isCode &&
          (textEditing ? (
            <Tooltip title="Preview (Shift+Enter)">
              <IconButton
                size="small"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setRenderRequest((n) => n + 1)}
                data-testid={`python-cell-preview-${index}`}
              >
                <Visibility sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Edit markdown">
              <IconButton
                size="small"
                onClick={() => setEditRequest((n) => n + 1)}
                data-testid={`python-cell-edit-markdown-${index}`}
              >
                <Code sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          ))}
        {isCode && (
          <Tooltip title="Convert to text">
            <IconButton size="small" onClick={() => onChangeType('markdown')}>
              <Notes sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
        {!isSql && (
          <Tooltip title="Convert to SQL">
            <IconButton size="small" onClick={() => onChangeType('sql')}>
              <Storage sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
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
          {(Object.keys(CELL_TYPE_LABELS) as PythonCellType[])
            .filter((type) => type !== cell.cell_type)
            .map((type) => (
              <MenuItem
                key={type}
                onClick={() => {
                  closeMenu();
                  onChangeType(type);
                }}
                sx={{ fontSize: 13 }}
              >
                Convert to {CELL_TYPE_LABELS[type]}
              </MenuItem>
            ))}
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
    prev.installingPandas === next.installingPandas &&
    prev.onRun === next.onRun &&
    prev.onChange === next.onChange &&
    prev.onChangeVariable === next.onChangeVariable,
);

PythonCell.displayName = 'PythonCell';

export default PythonCell;
