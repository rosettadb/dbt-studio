import React from 'react';
import {
  Box,
  Chip,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CloseRounded,
  MoreVertRounded,
  PowerOffRounded,
  StopRounded,
  TimerRounded,
} from '@mui/icons-material';
import { ProcessTerminal } from '../processTerminal';
import { useProcess } from '../../../hooks';
import { tabButtonSx } from './tabButtonSx';
import type { TerminalPanelContext, TerminalPanelDefinition } from './types';

const formatDuration = (ms: number | null) => {
  if (!ms) return '0s';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'running':
      return 'success';
    case 'starting':
      return 'info';
    case 'stopping':
      return 'warning';
    case 'stopped':
      return 'default';
    default:
      return 'default';
  }
};

// Tab chrome for the long-running "PID server" process (dbt docs serve):
// pid/duration chips, a stop menu and a close button that clears the session.
const ProcessTabLabel: React.FC<
  TerminalPanelContext & { selected: boolean; onSelect: () => void }
> = ({ selected, onSelect }) => {
  const { pid, duration, status, command, stop, forceStop, clearOutput } =
    useProcess();
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);
  const closeMenu = () => setMenuAnchor(null);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      <Box
        component="button"
        type="button"
        onClick={onSelect}
        sx={(theme) => ({
          ...tabButtonSx(theme, selected),
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          padding: '0 6px 0 10px',
          cursor: 'pointer',
          outline: 'none',
        })}
      >
        <Typography sx={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1 }}>
          PID SERVER
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {pid && (
            <Chip
              label={`PID: ${pid}`}
              size="small"
              variant="outlined"
              sx={{ height: 16, fontSize: '0.6rem' }}
            />
          )}
          {duration && (
            <Chip
              label={formatDuration(duration)}
              size="small"
              color={getStatusColor(status)}
              sx={{ height: 16, fontSize: '0.6rem' }}
            />
          )}
        </Box>

        <Tooltip title="Stop options">
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              setMenuAnchor(e.currentTarget);
            }}
            size="small"
            sx={{ padding: 0.25, color: 'inherit', minWidth: 'auto' }}
          >
            <MoreVertRounded style={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Close PID server tab">
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              clearOutput();
            }}
            size="small"
            sx={{ padding: 0.25, color: 'inherit', minWidth: 'auto' }}
          >
            <CloseRounded style={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        PaperProps={{ sx: { minWidth: 200 } }}
      >
        <MenuItem
          onClick={async () => {
            closeMenu();
            await stop();
          }}
          disabled={status === 'stopping'}
        >
          <ListItemIcon>
            <StopRounded fontSize="small" color="warning" />
          </ListItemIcon>
          <ListItemText
            primary="Graceful Stop"
            secondary="Send SIGTERM (5s timeout)"
          />
        </MenuItem>

        <MenuItem
          onClick={async () => {
            closeMenu();
            await forceStop();
          }}
        >
          <ListItemIcon>
            <PowerOffRounded fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText primary="Force Kill" secondary="Immediate SIGKILL" />
        </MenuItem>

        {command && (
          <MenuItem disabled>
            <ListItemIcon>
              <TimerRounded fontSize="small" />
            </ListItemIcon>
            <Tooltip title={command}>
              <ListItemText
                primary="Command:"
                secondary={
                  command.length > 30
                    ? `${command.substring(0, 30)}...`
                    : command
                }
              />
            </Tooltip>
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
};

export const processPanel: TerminalPanelDefinition = {
  id: 'process',
  label: 'PID SERVER',
  keepMounted: true,
  useState: () => {
    const { isRunning, output, error, startTime } = useProcess();
    // Visible from the first start until the user closes the tab (which
    // clears the output); clearing while running keeps it visible.
    return {
      visible: isRunning || output.length > 0 || error.length > 0,
      activity: startTime ?? 0,
    };
  },
  Component: () => <ProcessTerminal />,
  Label: ProcessTabLabel,
};
