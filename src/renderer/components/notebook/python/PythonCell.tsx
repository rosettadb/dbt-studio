/**
 * Python Cell (chrome)
 * Colab-style cell: a header with the run button and a badge for the cell
 * type (plus the result variable for SQL cells), a gutter on the left with the
 * execution count, the editor (code, sql or text), outputs underneath, and a
 * hover toolbar on the right. Collapsed cells show only the header, with a
 * one-line summary of the source.
 */

import React, { memo, useEffect, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  SvgIcon,
  SvgIconProps,
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
  ExpandLess,
  ExpandMore,
  KeyboardArrowDown,
  KeyboardArrowRight,
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
import type { SqlSchemaCompletionEntry } from '../../../lib/monaco/completions/sqlSchema';
import { PythonCodeCell, RunMode, EditorMountHandler } from './PythonCodeCell';
import { PythonTextCell } from './PythonTextCell';
import { PythonCellOutputs } from './PythonCellOutputs';
import { PythonLogoIcon } from '../NotebookKindIcon';

export type CellRunState = 'idle' | 'queued' | 'running';

const PYTHON_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const CELL_TYPE_LABELS: Record<PythonCellType, string> = {
  code: 'Code',
  sql: 'SQL',
  markdown: 'Text',
};

/** "SQL" lettering as an icon, for the SQL cell badge. */
const SqlTextIcon: React.FC<SvgIconProps> = (props) => (
  // eslint-disable-next-line react/jsx-props-no-spreading
  <SvgIcon viewBox="0 0 24 24" {...props}>
    <text
      x="12"
      y="16"
      textAnchor="middle"
      fontSize="9.5"
      fontWeight="700"
      fontFamily="ui-sans-serif, -apple-system, 'Segoe UI', Roboto, sans-serif"
      fill="currentColor"
    >
      SQL
    </text>
  </SvgIcon>
);

/** The Markdown mark (M + down arrow, public domain by Dustin Curtis). */
const MarkdownIcon: React.FC<SvgIconProps> = (props) => (
  // eslint-disable-next-line react/jsx-props-no-spreading
  <SvgIcon viewBox="0 0 208 128" {...props}>
    <path
      fill="currentColor"
      d="M193 128H15a15 15 0 0 1-15-15V15A15 15 0 0 1 15 0h178a15 15 0 0 1 15 15v98a15 15 0 0 1-15 15zM50 98V59l20 25 20-25v39h20V30H90L70 55 50 30H30v68zm134-34h-20V30h-20v34h-20l30 35z"
    />
  </SvgIcon>
);

/** Start icons for the "Convert to …" menu items (same glyphs as the badges). */
const CELL_TYPE_MENU_ICONS: Record<PythonCellType, React.ReactElement> = {
  code: <PythonLogoIcon sx={{ fontSize: 16, mr: 1 }} />,
  sql: <SqlTextIcon sx={{ fontSize: 18, mr: 1, ml: -0.125 }} />,
  markdown: <MarkdownIcon sx={{ fontSize: 16, mr: 1 }} />,
};

/**
 * Header badge for each cell type: an icon-only chip (a label, not a button),
 * with the type name as tooltip.
 */
const CELL_TYPE_BADGES: Record<
  PythonCellType,
  {
    label: string;
    icon: React.ReactElement;
    color: 'default' | 'primary' | 'info';
  }
> = {
  code: {
    label: 'Python',
    icon: <PythonLogoIcon sx={{ fontSize: '14px !important' }} />,
    color: 'default',
  },
  sql: {
    label: 'SQL',
    icon: <SqlTextIcon sx={{ fontSize: '18px !important' }} />,
    color: 'primary',
  },
  markdown: {
    label: 'Markdown',
    icon: <MarkdownIcon sx={{ fontSize: '16px !important' }} />,
    color: 'default',
  },
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
  /** Collapsed cells show a one-line summary instead of editor and outputs */
  collapsed?: boolean;
  onToggleCollapsed: () => void;
  onEditorMount?: EditorMountHandler;
  /** SQL cells: schema completions for the shared `sql` provider */
  sqlCompletions?: SqlSchemaCompletionEntry;
}

/** First non-empty line of the source, for the collapsed summary. */
function summarize(source: string): string {
  return (
    source
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? ''
  );
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
  collapsed = false,
  onToggleCollapsed,
  onEditorMount,
  sqlCompletions,
}) => {
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [textEditing, setTextEditing] = useState(false);
  const [renderRequest, setRenderRequest] = useState(0);
  const [editRequest, setEditRequest] = useState(0);
  /** Outputs hidden behind a one-line summary (view-only, not saved). */
  const [outputsCollapsed, setOutputsCollapsed] = useState(false);
  /** Code / SQL editor hidden, header and outputs stay (view-only). */
  const [codeHidden, setCodeHidden] = useState(false);
  /** Header slot the markdown formatting toolbar renders into. */
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const isSql = cell.cell_type === 'sql';
  /** Runs on the kernel and has outputs (code or sql). */
  const isCode = cell.cell_type !== 'markdown';
  const isRunning = runState === 'running';
  const closeMenu = () => setMenuAnchor(null);
  const variable = cell.metadata.rosetta?.variable ?? '';
  const variableValid = PYTHON_IDENTIFIER.test(variable);

  // Running the cell again shows its new output.
  useEffect(() => {
    if (isRunning) setOutputsCollapsed(false);
  }, [isRunning]);

  // Focusing the cell's editor (keyboard navigation, new cell) shows the code.
  useEffect(() => {
    if (focusRequest) setCodeHidden(false);
  }, [focusRequest]);

  let gutterLabel: React.ReactNode;
  if (isRunning) {
    gutterLabel = <CircularProgress size={14} />;
  } else if (runState === 'queued') {
    gutterLabel = '[*]';
  } else {
    gutterLabel = `[${cell.execution_count ?? ' '}]`;
  }

  const badge = CELL_TYPE_BADGES[cell.cell_type];
  const summary = summarize(cell.source);

  const showOutputRow = !collapsed && isCode && cell.outputs.length > 0;

  const gutterSx = {
    width: 52,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    pt: 1.25,
    gap: 0.25,
    borderRight: '1px solid',
    borderColor: 'divider',
    bgcolor:
      theme.palette.mode === 'dark'
        ? 'rgba(255,255,255,0.02)'
        : 'rgba(0,0,0,0.02)',
  } as const;

  // Top of the gutter, right below the execution count.
  const dragHandle = (
    <Box
      className="cell-drag-handle"
      // eslint-disable-next-line react/jsx-props-no-spreading
      {...dragHandleProps}
      sx={{
        display: 'flex',
        opacity: 0,
        cursor: 'grab',
        color: 'text.disabled',
        '&:active': { cursor: 'grabbing' },
      }}
    >
      <DragIndicator sx={{ fontSize: 20 }} />
    </Box>
  );

  const runButton = isCode ? (
    <Tooltip
      title={isRunning ? 'Interrupt (running)' : 'Run cell (Shift+Enter)'}
    >
      {/* Colab-style filled circle, colored from the theme: primary to run,
          error while running (click to interrupt). */}
      <IconButton
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          if (isRunning) onInterrupt();
          else onRun('stay');
        }}
        disabled={runState === 'queued'}
        data-testid={`python-cell-run-${index}`}
        sx={{
          width: 20,
          height: 20,
          p: 0,
          bgcolor: isRunning ? 'error.main' : 'primary.main',
          color: isRunning ? 'error.contrastText' : 'primary.contrastText',
          '&:hover': { bgcolor: isRunning ? 'error.dark' : 'primary.dark' },
          '&.Mui-disabled': {
            bgcolor: 'action.disabledBackground',
            color: 'action.disabled',
          },
        }}
      >
        {isRunning ? (
          <Stop sx={{ fontSize: 13 }} />
        ) : (
          <PlayArrow sx={{ fontSize: 15 }} />
        )}
      </IconButton>
    </Tooltip>
  ) : null;

  return (
    <Box
      data-cell-id={cell.id}
      data-testid={`python-cell-${index}`}
      onClick={onSelect}
      role="presentation"
      sx={{
        display: 'flex',
        flexDirection: 'column',
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
      {/* Editor row: gutter (drag handle, hide / show code) + header and editor */}
      <Box sx={{ display: 'flex' }}>
        <Box sx={gutterSx}>
          {dragHandle}
          {!collapsed && isCode && (
            <Tooltip title={codeHidden ? 'Show code' : 'Hide code'}>
              <IconButton
                size="small"
                aria-label={codeHidden ? 'Show code' : 'Hide code'}
                onClick={(e) => {
                  e.stopPropagation();
                  setCodeHidden((value) => !value);
                }}
                data-testid={`python-cell-code-toggle-${index}`}
                sx={{ p: 0.25, mt: 0.5 }}
              >
                {codeHidden ? (
                  <KeyboardArrowRight sx={{ fontSize: 18 }} />
                ) : (
                  <KeyboardArrowDown sx={{ fontSize: 18 }} />
                )}
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Body */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header: run button, cell type, SQL result variable */}
          <Box
            data-testid={`python-cell-header-${index}`}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1,
              py: 0.5,
              minHeight: 34,
              minWidth: 0,
              borderBottom: collapsed ? 'none' : '1px solid',
              borderColor: 'divider',
            }}
          >
            {isCode && (
              <Tooltip title="Execution count: the order this cell last ran in">
                <Typography
                  variant="caption"
                  data-testid={`python-cell-count-${index}`}
                  sx={{
                    // Same 20px height as the run button and the type badge
                    boxSizing: 'border-box',
                    height: 20,
                    minWidth: 28,
                    px: 0.75,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: '10px',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    lineHeight: 1,
                    color: 'text.secondary',
                  }}
                >
                  {gutterLabel}
                </Typography>
              </Tooltip>
            )}
            {runButton}
            <Tooltip title={`${badge.label} cell`}>
              <Chip
                icon={badge.icon}
                size="small"
                variant="outlined"
                color={badge.color}
                aria-label={`${badge.label} cell`}
                data-testid={`python-cell-type-${index}`}
                sx={{
                  height: 20,
                  px: 0.5,
                  flexShrink: 0,
                  cursor: 'default',
                  '& .MuiChip-icon': { m: 0 },
                  '& .MuiChip-label': { display: 'none' },
                }}
              />
            </Tooltip>
            {!collapsed && !isCode && (
              <Box
                ref={setToolbarSlot}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  flex: 1,
                  minWidth: 0,
                }}
              />
            )}
            {!collapsed && isSql && (
              <>
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
              </>
            )}
            {collapsed && (
              <Box
                onDoubleClick={onToggleCollapsed}
                role="presentation"
                data-testid={`python-cell-summary-${index}`}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  flex: 1,
                  minWidth: 0,
                  cursor: 'pointer',
                }}
              >
                <Typography
                  noWrap
                  sx={{
                    fontFamily: isCode
                      ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
                      : undefined,
                    fontSize: 13,
                    color: summary ? 'text.primary' : 'text.disabled',
                    fontStyle: summary ? 'normal' : 'italic',
                  }}
                >
                  {summary || 'Empty cell'}
                </Typography>
                {isCode && cell.outputs.length > 0 && (
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.disabled', flexShrink: 0, ml: 'auto' }}
                  >
                    {cell.outputs.length} output
                    {cell.outputs.length === 1 ? '' : 's'}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
          {!collapsed && isCode && codeHidden && (
            <Box
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setCodeHidden(false);
              }}
              onKeyDown={(e) => {
                if (e.key === ' ') e.preventDefault();
                if (e.key === 'Enter' || e.key === ' ') setCodeHidden(false);
              }}
              data-testid={`python-cell-code-hidden-${index}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 0.75,
                minWidth: 0,
                cursor: 'pointer',
              }}
            >
              <Typography
                noWrap
                sx={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 13,
                  color: 'text.disabled',
                }}
              >
                {summary || 'Empty cell'}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'text.disabled', flexShrink: 0, ml: 'auto' }}
              >
                {isSql ? 'SQL hidden' : 'Code hidden'}
              </Typography>
            </Box>
          )}
          {!collapsed && isCode && !codeHidden && (
            <PythonCodeCell
              cellId={cell.id}
              source={cell.source}
              isExecuting={isRunning}
              language={isSql ? 'sql' : 'python'}
              onChange={onChange}
              onRun={onRun}
              onFocus={onSelect}
              focusRequest={focusRequest}
              onEditorMount={onEditorMount}
              sqlCompletions={sqlCompletions}
            />
          )}
          {!collapsed && !isCode && (
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
              toolbarContainer={toolbarSlot}
            />
          )}
        </Box>
      </Box>

      {/* Output row: gutter (hide / show output) + outputs, Colab-style */}
      {showOutputRow && (
        <Box sx={{ display: 'flex' }}>
          <Box sx={{ ...gutterSx, pt: 0.5 }}>
            <Tooltip title={outputsCollapsed ? 'Show output' : 'Hide output'}>
              <IconButton
                size="small"
                aria-label={outputsCollapsed ? 'Show output' : 'Hide output'}
                onClick={(e) => {
                  e.stopPropagation();
                  setOutputsCollapsed((value) => !value);
                }}
                data-testid={`python-cell-outputs-toggle-${index}`}
                sx={{ p: 0.25 }}
              >
                {outputsCollapsed ? (
                  <KeyboardArrowRight sx={{ fontSize: 18 }} />
                ) : (
                  <KeyboardArrowDown sx={{ fontSize: 18 }} />
                )}
              </IconButton>
            </Tooltip>
          </Box>
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              borderTop: '1px solid',
              borderColor: 'divider',
            }}
          >
            <PythonCellOutputs
              outputs={cell.outputs}
              onInstallPandas={isSql ? onInstallPandas : undefined}
              installingPandas={installingPandas}
              collapsed={outputsCollapsed}
              onExpand={() => setOutputsCollapsed(false)}
              onClearOutputs={onClearOutputs}
            />
          </Box>
        </Box>
      )}

      {/* Hover toolbar */}
      <Box
        className="cell-hover-toolbar"
        sx={{
          position: 'absolute',
          top: -16,
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
        <Tooltip title={collapsed ? 'Expand cell' : 'Collapse cell'}>
          <IconButton
            size="small"
            onClick={onToggleCollapsed}
            data-testid={`python-cell-collapse-${index}`}
          >
            {collapsed ? (
              <ExpandMore sx={{ fontSize: 18 }} />
            ) : (
              <ExpandLess sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title="Move up">
          <span>
            <IconButton size="small" onClick={onMoveUp} disabled={index === 0}>
              <ArrowUpward sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Move down">
          <IconButton size="small" onClick={onMoveDown}>
            <ArrowDownward sx={{ fontSize: 18 }} />
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
                <Visibility sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Edit markdown">
              <IconButton
                size="small"
                onClick={() => setEditRequest((n) => n + 1)}
                data-testid={`python-cell-edit-markdown-${index}`}
              >
                <Code sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          ))}
        {isCode && (
          <Tooltip title="Convert to text">
            <IconButton size="small" onClick={() => onChangeType('markdown')}>
              <Notes sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
        {!isSql && (
          <Tooltip title="Convert to SQL">
            <IconButton size="small" onClick={() => onChangeType('sql')}>
              <Storage sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Delete cell">
          <IconButton size="small" onClick={onDelete}>
            <Delete sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <IconButton
          size="small"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
        >
          <MoreVert sx={{ fontSize: 18 }} />
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
                {CELL_TYPE_MENU_ICONS[type]} Convert to {CELL_TYPE_LABELS[type]}
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
    prev.collapsed === next.collapsed &&
    prev.onRun === next.onRun &&
    prev.onChange === next.onChange &&
    prev.onChangeVariable === next.onChangeVariable &&
    prev.onEditorMount === next.onEditorMount &&
    prev.sqlCompletions === next.sqlCompletions,
);

PythonCell.displayName = 'PythonCell';

export default PythonCell;
