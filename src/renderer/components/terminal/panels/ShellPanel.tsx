import React from 'react';
import {
  Box,
  Button,
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
  Add as AddIcon,
  DeleteOutline as KillIcon,
  DeleteSweep as ClearIcon,
  DriveFileRenameOutline as RenameIcon,
  KeyboardArrowDown as ProfilesIcon,
  MoreHoriz as MoreIcon,
  Star as DefaultIcon,
  StarBorder as SetDefaultIcon,
  Terminal as TerminalIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import type {
  PtySessionInfo,
  ShellProfilesResult,
} from '../../../../types/pty';
import { shellSessions } from '../shell/shellSessions';
import { buildShellAppearance, shellBackground } from '../shell/shellTheme';
import {
  getPreferredProfileId,
  openShellSession,
  setPreferredProfileId,
  useProjectShellSessions,
} from '../shell/useShellSessions';
import { ShellTerminalView } from '../shell/ShellTerminalView';
import { ShellSessionList } from '../shell/ShellSessionList';
import { RenameSessionDialog } from '../shell/RenameSessionDialog';
import type { TerminalPanelContext, TerminalPanelDefinition } from './types';

/**
 * The OS shell terminal: real shells (PowerShell, cmd, zsh, bash…) running
 * in the project folder. Several can be open at once; they keep running
 * while another bottom tab, screen or project is shown.
 */
const ShellPanelBody: React.FC<TerminalPanelContext> = ({ project }) => {
  const theme = useTheme();
  const { sessions, active, ready } = useProjectShellSessions(project);
  const [renaming, setRenaming] = React.useState<PtySessionInfo | null>(null);
  const [starting, setStarting] = React.useState(false);

  React.useEffect(() => {
    shellSessions.init().catch(() => undefined);
  }, []);

  React.useEffect(() => {
    shellSessions.setAppearance(buildShellAppearance(theme));
  }, [theme]);

  // Opening the tab with no terminal starts one, once per visit: after the
  // user closes the last terminal the empty state stays until they ask for
  // a new one (or come back to the tab).
  const autoOpenedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!ready || autoOpenedFor.current === project.id) return;
    autoOpenedFor.current = project.id;
    if (shellSessions.sessionsFor(project.id).length > 0) return;
    const start = async () => {
      setStarting(true);
      try {
        // Reports its own failure to the user and resolves either way.
        await openShellSession(project);
      } finally {
        setStarting(false);
      }
    };
    start().catch(() => null);
  }, [ready, project]);

  const openNew = () => {
    openShellSession(project).catch(() => null);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100%',
        width: '100%',
        backgroundColor: shellBackground(theme),
      }}
    >
      {active ? (
        <ShellTerminalView key={active.id} sessionId={active.id} />
      ) : (
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
          }}
        >
          {ready && !starting && (
            <>
              <Typography variant="body2" color="text.secondary">
                No terminal is open for this project.
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={openNew}
              >
                New Terminal
              </Button>
            </>
          )}
        </Box>
      )}

      {sessions.length > 1 && (
        <ShellSessionList
          projectId={project.id}
          sessions={sessions}
          activeId={active?.id}
          onRename={setRenaming}
        />
      )}

      <RenameSessionDialog
        session={renaming}
        onClose={() => setRenaming(null)}
      />
    </Box>
  );
};

const actionButtonSx = { padding: '3px', color: 'text.secondary' };
const actionIconSx = { fontSize: 16 };
const menuIconSx = { minWidth: '28px !important' };
const menuTextProps = { variant: 'body2' as const, fontSize: 12 };

/** Buttons shown on the right of the tab strip while this tab is selected. */
const ShellHeaderActions: React.FC<TerminalPanelContext> = ({ project }) => {
  const { sessions, active } = useProjectShellSessions(project);
  const [profilesAnchor, setProfilesAnchor] =
    React.useState<HTMLElement | null>(null);
  const [moreAnchor, setMoreAnchor] = React.useState<HTMLElement | null>(null);
  const [profiles, setProfiles] = React.useState<ShellProfilesResult | null>(
    null,
  );
  const [preferred, setPreferred] = React.useState<string | null>(() =>
    getPreferredProfileId(),
  );
  const [renaming, setRenaming] = React.useState<PtySessionInfo | null>(null);

  const openProfiles = (event: React.MouseEvent<HTMLElement>) => {
    setProfilesAnchor(event.currentTarget);
    // Looked up on every open: shells get installed and removed.
    shellSessions
      .getProfiles()
      .then(setProfiles)
      .catch(() => {
        setProfiles({ profiles: [], defaultProfileId: null });
        toast.error('The installed shells could not be listed.');
      });
  };

  const closeProfiles = () => setProfilesAnchor(null);
  const closeMore = () => setMoreAnchor(null);

  const defaultProfileId =
    profiles && preferred && profiles.profiles.some((p) => p.id === preferred)
      ? preferred
      : (profiles?.defaultProfileId ?? null);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mr: 0.5 }}>
      <Tooltip title="New Terminal">
        <IconButton
          size="small"
          aria-label="New Terminal"
          sx={actionButtonSx}
          onClick={() => {
            openShellSession(project).catch(() => null);
          }}
        >
          <AddIcon sx={actionIconSx} />
        </IconButton>
      </Tooltip>

      <Tooltip title="New Terminal With Shell…">
        <IconButton
          size="small"
          aria-label="Choose shell for new terminal"
          aria-haspopup="menu"
          sx={{ ...actionButtonSx, ml: '-4px' }}
          onClick={openProfiles}
        >
          <ProfilesIcon sx={actionIconSx} />
        </IconButton>
      </Tooltip>

      <Tooltip title="Kill Terminal">
        <span>
          <IconButton
            size="small"
            aria-label="Kill Terminal"
            sx={actionButtonSx}
            disabled={!active}
            onClick={() => {
              if (active) shellSessions.kill(active.id).catch(() => undefined);
            }}
          >
            <KillIcon sx={actionIconSx} />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title="More Actions…">
        <IconButton
          size="small"
          aria-label="More terminal actions"
          aria-haspopup="menu"
          sx={actionButtonSx}
          onClick={(event) => setMoreAnchor(event.currentTarget)}
        >
          <MoreIcon sx={actionIconSx} />
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={profilesAnchor}
        open={Boolean(profilesAnchor)}
        onClose={closeProfiles}
        slotProps={{ paper: { sx: { minWidth: 240 } } }}
      >
        {!profiles && (
          <MenuItem dense disabled>
            <ListItemText primaryTypographyProps={menuTextProps}>
              Looking for shells…
            </ListItemText>
          </MenuItem>
        )}
        {profiles && profiles.profiles.length === 0 && (
          <MenuItem dense disabled>
            <ListItemText primaryTypographyProps={menuTextProps}>
              No shell was found on this computer.
            </ListItemText>
          </MenuItem>
        )}
        {profiles?.profiles.map((profile) => {
          const isDefault = profile.id === defaultProfileId;
          return (
            <MenuItem
              key={profile.id}
              dense
              title={profile.path}
              onClick={() => {
                closeProfiles();
                openShellSession(project, profile.id).catch(() => null);
              }}
            >
              <ListItemIcon sx={menuIconSx}>
                <TerminalIcon sx={{ fontSize: 16 }} />
              </ListItemIcon>
              <ListItemText primaryTypographyProps={menuTextProps}>
                {profile.name}
              </ListItemText>
              <Tooltip
                title={isDefault ? 'Default shell' : 'Use as default shell'}
                placement="right"
              >
                <span>
                  <IconButton
                    size="small"
                    aria-label={
                      isDefault
                        ? `${profile.name} is the default shell`
                        : `Use ${profile.name} as default shell`
                    }
                    disabled={isDefault}
                    sx={{ padding: '2px', ml: 1.5 }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPreferredProfileId(profile.id);
                      setPreferred(profile.id);
                    }}
                  >
                    {isDefault ? (
                      <DefaultIcon sx={{ fontSize: 15 }} color="primary" />
                    ) : (
                      <SetDefaultIcon sx={{ fontSize: 15 }} />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            </MenuItem>
          );
        })}
      </Menu>

      <Menu
        anchorEl={moreAnchor}
        open={Boolean(moreAnchor)}
        onClose={closeMore}
        slotProps={{ paper: { sx: { minWidth: 200 } } }}
      >
        <MenuItem
          dense
          disabled={!active}
          onClick={() => {
            closeMore();
            if (active) {
              shellSessions.clear(active.id);
              shellSessions.focus(active.id);
            }
          }}
        >
          <ListItemIcon sx={menuIconSx}>
            <ClearIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={menuTextProps}>
            Clear Terminal
          </ListItemText>
        </MenuItem>
        <MenuItem
          dense
          disabled={!active}
          onClick={() => {
            closeMore();
            if (active) setRenaming(active);
          }}
        >
          <ListItemIcon sx={menuIconSx}>
            <RenameIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={menuTextProps}>
            Rename…
          </ListItemText>
        </MenuItem>
        <Divider sx={{ my: '4px !important' }} />
        <MenuItem
          dense
          disabled={sessions.length === 0}
          onClick={() => {
            closeMore();
            shellSessions.killAll(project.id).catch(() => undefined);
          }}
        >
          <ListItemIcon sx={menuIconSx}>
            <KillIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={menuTextProps}>
            Kill All Terminals
          </ListItemText>
        </MenuItem>
      </Menu>

      <RenameSessionDialog
        session={renaming}
        onClose={() => setRenaming(null)}
      />
    </Box>
  );
};

export const shellPanel: TerminalPanelDefinition = {
  id: 'shell',
  label: 'SHELL',
  // Never asks for focus on its own; the terminals live outside React, so
  // the body can unmount while another tab is shown without losing them.
  useState: () => ({ visible: true }),
  Component: ShellPanelBody,
  HeaderActions: ShellHeaderActions,
};
