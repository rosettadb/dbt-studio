import React from 'react';
import {
  Box,
  Chip,
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
  AutoAwesome as AiAssistIcon,
  Close as CloseIcon,
  ContentCopy as CopyIcon,
  ContentPasteSearch as CopyAllIcon,
  DeleteSweep as ClearIcon,
  PlayArrowRounded,
  RestartAltRounded,
  StopRounded,
} from '@mui/icons-material';
import AnsiToHtml from 'ansi-to-html';
import { toast } from 'react-toastify';
import { useAppContext } from '../../hooks';
import { OutputBox, TerminalContainer } from '../terminal/styles';
import { buildTerminalAiPrompt } from '../terminal/aiAssist';
import type {
  TerminalPanelContext,
  TerminalPanelDefinition,
} from '../terminal/panels/types';
import { chartsErrorMessage } from '../../controllers/dbtCharts.controller';
import {
  restartChartsServer,
  stopChartsServer,
} from '../../services/dbtCharts.service';
import type {
  ChartsServerState,
  ChartsServerStatus,
} from '../../../shared/dbtCharts';
import {
  clearChartsServerPanelLog,
  closeChartsServerPanel,
  useChartsServerPanel,
} from './chartsServerStore';

// CHARTS SERVER: the bottom-panel tab for `dct serve`, modelled on the
// PID SERVER tab of `dbt docs serve` (ProcessPanel), with its own state so
// the two never share a slot. Studio starts the server when a board opens;
// this tab shows its output and stops, starts or restarts it.

const ACTIVE_STATES: ChartsServerState[] = ['parsing', 'starting', 'running'];

type ChipColor = 'success' | 'info' | 'warning' | 'error' | 'default';

export const chartsStatusColor = (state?: ChartsServerState): ChipColor => {
  switch (state) {
    case 'running':
      return 'success';
    case 'starting':
    case 'parsing':
      return 'info';
    case 'crashed':
    case 'parse-failed':
      return 'error';
    default:
      return 'default';
  }
};

export const formatServerDuration = (ms: number | null): string => {
  if (!ms || ms < 0) return '0s';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

/**
 * Shown from the first start until × closes it: while the server runs, and
 * after it stops, crashes or fails dbt parse (the log stays readable). ×
 * keeps the log, so the tab comes back when the server starts again or
 * "Show server log" asks for it.
 */
export const isChartsServerTabVisible = (
  status: ChartsServerStatus | null,
  lineCount: number,
  revealed: boolean,
  closed = false,
): boolean => {
  if (closed) return false;
  if (status && ACTIVE_STATES.includes(status.state)) return true;
  return revealed || lineCount > 0;
};

const STATE_TEXT: Record<ChartsServerState, string> = {
  stopped: 'STOPPED',
  parsing: 'DBT PARSE',
  'parse-failed': 'PARSE FAILED',
  starting: 'STARTING',
  running: 'RUNNING',
  crashed: 'CRASHED',
};

/** Milliseconds since `startedAt`, ticking every second while `live`. */
const useUptime = (startedAt: number | undefined, live: boolean) => {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!live) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);
  return startedAt && live ? now - startedAt : null;
};

/** The server process for one project: status, uptime and actions. */
const useChartsServerControls = (projectPath: string) => {
  const { status, lines, focusRequest } = useChartsServerPanel(projectPath);
  const state = status?.state ?? 'stopped';
  const active = ACTIVE_STATES.includes(state);
  const uptime = useUptime(status?.startedAt, active);

  const run = (action: () => Promise<unknown>) => {
    action().catch((error) => toast.error(chartsErrorMessage(error)));
  };

  return {
    status,
    state,
    active,
    lines,
    focusRequest,
    uptime,
    start: () => run(() => restartChartsServer(projectPath)),
    // SIGTERM; main kills it if it hasn't exited after 5 seconds.
    stop: () => run(() => stopChartsServer()),
  };
};

// Same look as the SHELL tab's actions (ShellPanel): 16px icons at the
// right end of the tab strip, shown while this tab is selected. Open in
// browser and Reload live in the board pane's own header.
const actionButtonSx = { padding: '3px', color: 'text.secondary' };
const actionIconSx = { fontSize: 16 };

/**
 * Right of the tab strip. Stop and × never show together:
 * - starting or running: ↻ Restart (▶ while it starts) and ■ Stop. Stop
 *   ends the server; the tab stays with its log. Minimise the panel to
 *   just get it out of the way.
 * - not running (stopped, crashed, failed dbt parse): ▶ Start and × Close.
 *   × only hides the tab; the log is kept.
 */
const ChartsServerHeaderActions: React.FC<TerminalPanelContext> = ({
  project,
}) => {
  const { state, active, start, stop } = useChartsServerControls(project.path);
  const running = state === 'running';
  const busy = state === 'starting' || state === 'parsing';
  const startLabel = running ? 'Restart Server' : 'Start Server';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mr: 0.5 }}>
      <Tooltip title={startLabel}>
        <span>
          <IconButton
            size="small"
            aria-label={startLabel}
            sx={actionButtonSx}
            disabled={busy}
            onClick={start}
          >
            {running ? (
              <RestartAltRounded sx={actionIconSx} />
            ) : (
              <PlayArrowRounded sx={actionIconSx} />
            )}
          </IconButton>
        </span>
      </Tooltip>

      {active ? (
        <Tooltip title="Stop Server">
          <IconButton
            size="small"
            aria-label="Stop Server"
            sx={actionButtonSx}
            onClick={stop}
          >
            <StopRounded sx={actionIconSx} />
          </IconButton>
        </Tooltip>
      ) : (
        <Tooltip title="Close Tab">
          <IconButton
            size="small"
            aria-label="Close charts server tab"
            sx={actionButtonSx}
            onClick={closeChartsServerPanel}
          >
            <CloseIcon sx={actionIconSx} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

const ChartsServerTerminal: React.FC<TerminalPanelContext> = ({ project }) => {
  const theme = useTheme();
  const { status, state, uptime, lines } = useChartsServerControls(
    project.path,
  );
  const { openChatWithMessage } = useAppContext();
  const outputRef = React.useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = React.useState<{
    mouseX: number;
    mouseY: number;
    selectedText: string;
  } | null>(null);

  const colors =
    theme.palette.mode === 'dark'
      ? { fg: theme.palette.common.white, bg: theme.palette.grey[900] }
      : { fg: theme.palette.common.black, bg: theme.palette.grey[50] };

  const ansi = React.useMemo(
    () =>
      new AnsiToHtml({
        fg: colors.fg,
        bg: colors.bg,
        newline: true,
        escapeXML: true,
        stream: false,
      }),
    [colors.fg, colors.bg],
  );

  React.useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  const closeMenu = () => setContextMenu(null);
  const copy = (text: string) => {
    if (text) navigator.clipboard?.writeText(text).catch(() => undefined);
    closeMenu();
  };
  const aiPrompt = buildTerminalAiPrompt(
    contextMenu?.selectedText ?? '',
    lines,
    [],
  );

  return (
    <TerminalContainer
      onContextMenu={(event) => {
        event.preventDefault();
        setContextMenu({
          mouseX: event.clientX + 2,
          mouseY: event.clientY - 4,
          selectedText: window.getSelection()?.toString() ?? '',
        });
      }}
    >
      <Box
        sx={{
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          backgroundColor: colors.bg,
        }}
      >
        <Chip
          label={STATE_TEXT[state]}
          color={chartsStatusColor(state)}
          size="small"
        />
        {uptime !== null && status?.pid && (
          <Chip label={`PID: ${status.pid}`} variant="outlined" size="small" />
        )}
        {uptime !== null && (
          <Chip
            label={formatServerDuration(uptime)}
            variant="outlined"
            size="small"
          />
        )}
        {state === 'running' && status?.url && (
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
            {status.url}
          </Typography>
        )}
        {status?.command && (
          <Tooltip title={status.command}>
            <Typography
              variant="caption"
              noWrap
              sx={{ ml: 'auto', opacity: 0.7, minWidth: 0 }}
            >
              {status.command}
            </Typography>
          </Tooltip>
        )}
      </Box>

      <OutputBox
        ref={outputRef}
        tabIndex={0}
        style={{ backgroundColor: colors.bg, color: colors.fg }}
      >
        {lines.map((line, index) => (
          <Typography
            // Lines only ever append or clear, so the index is stable.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              color: colors.fg,
            }}
            dangerouslySetInnerHTML={{ __html: ansi.toHtml(line) }}
          />
        ))}
      </OutputBox>

      <Menu
        open={contextMenu !== null}
        onClose={closeMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem
          dense
          disabled={!contextMenu?.selectedText}
          onClick={() => copy(contextMenu?.selectedText ?? '')}
        >
          <ListItemIcon>
            <CopyIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ variant: 'body2' }}>
            Copy
          </ListItemText>
        </MenuItem>
        <MenuItem dense onClick={() => copy(lines.join('\n'))}>
          <ListItemIcon>
            <CopyAllIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ variant: 'body2' }}>
            Copy All
          </ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          dense
          disabled={!aiPrompt}
          onClick={() => {
            if (aiPrompt) openChatWithMessage(aiPrompt);
            closeMenu();
          }}
        >
          <ListItemIcon>
            <AiAssistIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ variant: 'body2' }}>
            Ask AI Agent
          </ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          dense
          onClick={() => {
            clearChartsServerPanelLog();
            closeMenu();
          }}
        >
          <ListItemIcon>
            <ClearIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ variant: 'body2' }}>
            Clear
          </ListItemText>
        </MenuItem>
      </Menu>
    </TerminalContainer>
  );
};

export const chartsServerPanel: TerminalPanelDefinition = {
  id: 'dbt-charts-server',
  label: 'CHARTS SERVER',
  keepMounted: true,
  useState: ({ project }) => {
    const { status, lines, focusRequest, revealed, closed } =
      useChartsServerPanel(project.path);
    return {
      visible: isChartsServerTabVisible(status, lines.length, revealed, closed),
      activity: focusRequest,
    };
  },
  Component: ChartsServerTerminal,
  HeaderActions: ChartsServerHeaderActions,
};
