/**
 * Kernel Bar
 * Header for a Python notebook: name, environment / kernel status and the
 * notebook-level actions.
 */

import React, { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  CleaningServices as ClearIcon,
  ContentCopy as DuplicateIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  GetApp as ExportIcon,
  Inventory2 as PackagesIcon,
  MoreVert as MoreIcon,
  PlayArrow as RunAllIcon,
  PowerSettingsNew as ShutdownIcon,
  RestartAlt as RestartIcon,
  Stop as InterruptIcon,
  SwapHoriz as ChangeVersionIcon,
  UnfoldLess as CollapseAllIcon,
  UnfoldMore as ExpandAllIcon,
  WidthFull as WideViewIcon,
  WidthNormal as CompactViewIcon,
} from '@mui/icons-material';
import type {
  KernelState,
  NotebookRuntime,
} from '../../../../types/pythonNotebooks';
import { PythonLogoIcon } from '../NotebookKindIcon';

interface KernelBarProps {
  name: string;
  cellCount: number;
  runtime: NotebookRuntime;
  envMessage?: string;
  kernel: KernelState | undefined;
  isRunningAll: boolean;
  onRunAll: () => void;
  onInterrupt: () => void;
  onRestart: () => void;
  onShutdown: () => void;
  onRecreateEnv: () => void;
  onChangeVersion: () => void;
  onOpenPackages: () => void;
  onClearOutputs: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
  /** Full-width layout (true) or the centred compact column (false) */
  wideView: boolean;
  onToggleWideView: () => void;
  /** Every cell is collapsed, so the button offers "Expand all" */
  allCollapsed: boolean;
  onToggleCollapseAll: () => void;
}

const KERNEL_COLORS: Record<
  KernelState['status'],
  'default' | 'success' | 'warning' | 'error' | 'info'
> = {
  stopped: 'default',
  starting: 'info',
  restarting: 'info',
  idle: 'success',
  busy: 'warning',
  error: 'error',
};

export const KernelBar: React.FC<KernelBarProps> = ({
  name,
  cellCount,
  runtime,
  envMessage,
  kernel,
  isRunningAll,
  onRunAll,
  onInterrupt,
  onRestart,
  onShutdown,
  onRecreateEnv,
  onChangeVersion,
  onOpenPackages,
  onClearOutputs,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
  wideView,
  onToggleWideView,
  allCollapsed,
  onToggleCollapseAll,
}) => {
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const closeMenu = () => setMenuAnchor(null);
  const kernelStatus = kernel?.status ?? 'stopped';
  const envReady = runtime.status === 'ready';
  const busy = kernelStatus === 'busy' || isRunningAll;

  const iconButtonSx = {
    width: 28,
    height: 28,
    color: theme.palette.mode === 'dark' ? 'grey.400' : 'grey.600',
    border: '1px solid',
    borderColor: theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300',
    borderRadius: 1,
  };

  let envChip: React.ReactNode;
  if (runtime.status === 'creating') {
    envChip = (
      <Tooltip title={envMessage || 'Creating environment…'}>
        <Chip
          size="small"
          icon={<CircularProgress size={12} sx={{ ml: 0.5 }} />}
          label="Preparing environment…"
          sx={{ height: 22, fontSize: 11, maxWidth: 260 }}
        />
      </Tooltip>
    );
  } else if (runtime.status === 'error' || runtime.status === 'missing') {
    envChip = (
      <Tooltip title={runtime.error || 'The virtualenv is missing'}>
        <Button
          size="small"
          color="error"
          variant="outlined"
          onClick={onRecreateEnv}
          sx={{ height: 22, fontSize: 11, textTransform: 'none', py: 0 }}
        >
          Environment {runtime.status} — recreate
        </Button>
      </Tooltip>
    );
  } else {
    envChip = (
      <Tooltip
        title={`Kernel: ${kernelStatus}${kernel?.error ? ` — ${kernel.error}` : ''}`}
      >
        <Chip
          size="small"
          color={KERNEL_COLORS[kernelStatus]}
          variant={kernelStatus === 'stopped' ? 'outlined' : 'filled'}
          label={
            kernelStatus === 'starting' || kernelStatus === 'restarting'
              ? 'Kernel starting…'
              : `Kernel ${kernelStatus}`
          }
          sx={{ height: 22, fontSize: 11 }}
          data-testid="python-kernel-status"
        />
      </Tooltip>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        py: 1,
        gap: 1,
        bgcolor: theme.palette.background.default,
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}
      >
        <PythonLogoIcon sx={{ fontSize: 20 }} />
        <Typography
          variant="h6"
          noWrap
          sx={{ maxWidth: 360, fontWeight: 500, fontSize: '1rem' }}
        >
          {name}
        </Typography>
        <Chip
          label={`${cellCount} cells`}
          size="small"
          sx={{ height: 20, fontSize: '0.7rem' }}
        />
        <Chip
          label={`Python ${runtime.pythonVersion || '?'}`}
          size="small"
          variant="outlined"
          sx={{ height: 20, fontSize: '0.7rem' }}
        />
        {envChip}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title="Run all cells">
          <span>
            <IconButton
              size="small"
              onClick={onRunAll}
              disabled={!envReady || busy}
              sx={iconButtonSx}
              data-testid="python-run-all"
            >
              <RunAllIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Interrupt kernel">
          <span>
            <IconButton
              size="small"
              onClick={onInterrupt}
              disabled={kernelStatus !== 'busy'}
              sx={iconButtonSx}
            >
              <InterruptIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Restart kernel">
          <span>
            <IconButton
              size="small"
              onClick={onRestart}
              disabled={!envReady || kernelStatus === 'starting'}
              sx={iconButtonSx}
            >
              <RestartIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Packages (pip)">
          <span>
            <IconButton
              size="small"
              onClick={onOpenPackages}
              disabled={!envReady}
              sx={iconButtonSx}
            >
              <PackagesIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Clear all outputs">
          <IconButton size="small" onClick={onClearOutputs} sx={iconButtonSx}>
            <ClearIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip
          title={allCollapsed ? 'Expand all cells' : 'Collapse all cells'}
        >
          <IconButton
            size="small"
            onClick={onToggleCollapseAll}
            sx={iconButtonSx}
            data-testid="python-collapse-all"
          >
            {allCollapsed ? (
              <ExpandAllIcon sx={{ fontSize: 18 }} />
            ) : (
              <CollapseAllIcon sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title={wideView ? 'Compact view' : 'Wide view'}>
          <IconButton
            size="small"
            onClick={onToggleWideView}
            sx={iconButtonSx}
            data-testid="python-wide-view"
          >
            {wideView ? (
              <CompactViewIcon sx={{ fontSize: 18 }} />
            ) : (
              <WideViewIcon sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Tooltip>
        <IconButton
          size="small"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={iconButtonSx}
        >
          <MoreIcon sx={{ fontSize: 18 }} />
        </IconButton>

        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={closeMenu}
        >
          <MenuItem
            onClick={() => {
              closeMenu();
              onRename();
            }}
          >
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Rename</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeMenu();
              onDuplicate();
            }}
          >
            <ListItemIcon>
              <DuplicateIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Duplicate</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeMenu();
              onExport();
            }}
          >
            <ListItemIcon>
              <ExportIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Export as .ipynb</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => {
              closeMenu();
              onChangeVersion();
            }}
          >
            <ListItemIcon>
              <ChangeVersionIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Change Python version…</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeMenu();
              onShutdown();
            }}
            disabled={kernelStatus === 'stopped'}
          >
            <ListItemIcon>
              <ShutdownIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Shut down kernel</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => {
              closeMenu();
              onDelete();
            }}
            sx={{ color: 'error.main' }}
          >
            <ListItemIcon>
              <DeleteIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText>Delete notebook</ListItemText>
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  );
};

export default KernelBar;
