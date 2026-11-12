import React from 'react';
import {
  Box,
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
  DeleteOutline as KillIcon,
  DriveFileRenameOutline as RenameIcon,
  Terminal as TerminalIcon,
} from '@mui/icons-material';
import type { PtySessionInfo } from '../../../../types/pty';
import { shellSessions } from './shellSessions';
import { shellBackground } from './shellTheme';

type Props = {
  projectId: string;
  sessions: PtySessionInfo[];
  activeId?: string;
  onRename: (session: PtySessionInfo) => void;
};

const LIST_WIDTH = 170;

/** The list of open shells on the right of the terminal. */
export const ShellSessionList: React.FC<Props> = ({
  projectId,
  sessions,
  activeId,
  onRename,
}) => {
  const theme = useTheme();
  const [menu, setMenu] = React.useState<{
    mouseX: number;
    mouseY: number;
    session: PtySessionInfo;
  } | null>(null);

  const select = (session: PtySessionInfo) => {
    shellSessions.setActive(projectId, session.id);
    // After React swapped the visible terminal.
    window.setTimeout(() => shellSessions.focus(session.id), 0);
  };

  return (
    <Box
      role="listbox"
      aria-label="Open terminals"
      sx={{
        width: LIST_WIDTH,
        flexShrink: 0,
        height: '100%',
        overflowY: 'auto',
        borderLeft: `1px solid ${theme.palette.divider}`,
        backgroundColor: shellBackground(theme),
        py: 0.5,
      }}
    >
      {sessions.map((session) => {
        const selected = session.id === activeId;
        return (
          <Tooltip
            key={session.id}
            placement="left"
            enterDelay={600}
            title={`${session.profileName} · PID ${session.pid}${
              session.exited ? ' · exited' : ''
            }`}
          >
            <Box
              role="option"
              aria-selected={selected}
              tabIndex={0}
              onClick={() => select(session)}
              onDoubleClick={() => onRename(session)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  select(session);
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({
                  mouseX: event.clientX + 2,
                  mouseY: event.clientY - 4,
                  session,
                });
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                height: 24,
                mx: 0.5,
                pl: 0.75,
                pr: 0.25,
                borderRadius: '4px',
                cursor: 'pointer',
                outline: 'none',
                color: selected
                  ? theme.palette.text.primary
                  : theme.palette.text.secondary,
                opacity: session.exited ? 0.6 : 1,
                backgroundColor: selected
                  ? theme.palette.action.selected
                  : 'transparent',
                '&:hover, &:focus-visible': {
                  backgroundColor: selected
                    ? theme.palette.action.selected
                    : theme.palette.action.hover,
                },
                '& .shell-session-kill': { visibility: 'hidden' },
                '&:hover .shell-session-kill, &:focus-within .shell-session-kill':
                  { visibility: 'visible' },
              }}
            >
              <TerminalIcon sx={{ fontSize: 14, flexShrink: 0 }} />
              <Typography
                noWrap
                sx={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1 }}
              >
                {session.title}
              </Typography>
              <IconButton
                className="shell-session-kill"
                size="small"
                aria-label={`Kill terminal ${session.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  shellSessions.kill(session.id).catch(() => undefined);
                }}
                sx={{ padding: 0.25, color: 'inherit' }}
              >
                <KillIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          </Tooltip>
        );
      })}

      <Menu
        open={menu !== null}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          menu !== null ? { top: menu.mouseY, left: menu.mouseX } : undefined
        }
      >
        <MenuItem
          dense
          onClick={() => {
            if (menu) onRename(menu.session);
            setMenu(null);
          }}
        >
          <ListItemIcon sx={{ minWidth: '28px !important' }}>
            <RenameIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText
            primaryTypographyProps={{ variant: 'body2', fontSize: 12 }}
          >
            Rename…
          </ListItemText>
        </MenuItem>
        <MenuItem
          dense
          onClick={() => {
            if (menu) {
              shellSessions.kill(menu.session.id).catch(() => undefined);
            }
            setMenu(null);
          }}
        >
          <ListItemIcon sx={{ minWidth: '28px !important' }}>
            <KillIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText
            primaryTypographyProps={{ variant: 'body2', fontSize: 12 }}
          >
            Kill Terminal
          </ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
};
