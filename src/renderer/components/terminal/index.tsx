import React from 'react';
import SplitPane from 'split-pane-react';
import {
  IconButton,
  Typography,
  useColorScheme,
  useTheme,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Tooltip,
  Box,
} from '@mui/material';
import TerminalIcon from '@mui/icons-material/Terminal';
import {
  CloseRounded,
  CodeOutlined,
  MinimizeRounded,
  PauseOutlined,
  MoreVertRounded,
  StopRounded,
  PowerOffRounded,
  TimerRounded,
} from '@mui/icons-material';
import { Terminal } from './terminal';
import {
  Root,
  Sash,
  EditorWrapper,
  TerminalWrapper,
  TerminalHeader,
  Taskbar,
  TaskbarItem,
} from './styles';
import { ProcessTerminal } from './processTerminal';
import { useProcess } from '../../hooks';
import { Project } from '../../../types/backend';

type Props = {
  project: Project;
  children: React.ReactNode;
};

export const TerminalLayout: React.FC<Props> = ({ children, project }) => {
  const { mode } = useColorScheme();
  const theme = useTheme();
  const { isRunning, stop, forceStop, pid, duration, status, command } =
    useProcess();

  const [selectedTab, setSelectedTab] = React.useState(0);
  const [lock, setLock] = React.useState(false);
  const [sizes, setSizes] = React.useState<number[]>([
    window.innerHeight - 300,
    300,
  ]);
  const [isMinimized, setIsMinimized] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [isStoppingGracefully, setIsStoppingGracefully] = React.useState(false);
  const [hasStartedProcess, setHasStartedProcess] =
    React.useState<boolean>(false);
  const lastTerminalHeight = React.useRef<number>(300);

  const handleMinimize = () => {
    setIsMinimized(true);
    // eslint-disable-next-line prefer-destructuring
    lastTerminalHeight.current = sizes[1];
    setSizes([window.innerHeight, 0]);
  };

  const handleRestore = () => {
    setIsMinimized(false);
    setSizes([
      window.innerHeight - lastTerminalHeight.current,
      lastTerminalHeight.current,
    ]);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleGracefulStop = async () => {
    setIsStoppingGracefully(true);
    handleMenuClose();
    await stop();
    setSelectedTab(0);
  };

  const handleForceStop = async () => {
    handleMenuClose();
    await forceStop();
    setSelectedTab(0);
  };

  const handleQuickStop = async () => {
    await stop();
    setSelectedTab(0);
  };

  const renderSash = () => (!isMinimized ? <Sash /> : null);

  // Auto-switch to process tab when a process starts
  React.useEffect(() => {
    if (isRunning) {
      setHasStartedProcess(true);
    }
    if (isRunning && selectedTab !== 1) {
      setSelectedTab(1);
    }
  }, [isRunning]);

  // // Reset stopping state when process stops
  // React.useEffect(() => {
  //   if (!isRunning) {
  //     setIsStoppingGracefully(false);
  //   }
  // }, [isRunning]);

  const getBackgroundColor = (
    themeMode: string | undefined,
    isSelected: boolean = false,
  ) => {
    if (isSelected) {
      return theme.palette.action.selected;
    }
    switch (themeMode) {
      case 'dark':
        return theme.palette.grey[800];
      case 'light':
        return theme.palette.grey[300];
      case 'system':
        return theme.palette.background.paper;
      default:
        return theme.palette.background.default;
    }
  };

  const getTextColor = (themeMode: string | undefined) => {
    switch (themeMode) {
      case 'dark':
        return theme.palette.common.white;
      case 'light':
        return theme.palette.common.black;
      case 'system':
        return theme.palette.text.primary;
      default:
        return theme.palette.text.primary;
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  // eslint-disable-next-line @typescript-eslint/no-shadow
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

  const getStatusIcon = () => {
    if (isStoppingGracefully || status === 'stopping') {
      return (
        <StopRounded
          style={{ color: theme.palette.warning.main, fontSize: 20 }}
        />
      );
    }
    return (
      <PauseOutlined
        style={{ color: theme.palette.success.main, fontSize: 20 }}
      />
    );
  };

  return (
    <Root>
      <SplitPane
        split="horizontal"
        sizes={sizes}
        onChange={(newSizes) => {
          if (!isMinimized) {
            setSizes(newSizes);
          }
        }}
        onDragStart={() => setLock(true)}
        onDragEnd={() => setLock(false)}
        sashRender={renderSash}
      >
        <EditorWrapper style={{ pointerEvents: lock ? 'none' : 'auto' }}>
          {children}
        </EditorWrapper>
        <TerminalWrapper>
          {!isMinimized && (
            <>
              <TerminalHeader>
                {/* CLI Terminal Tab */}
                <IconButton
                  style={{
                    backgroundColor: getBackgroundColor(
                      mode,
                      selectedTab === 0,
                    ),
                    borderRadius: '8px 8px 0 0',
                    padding: '6px 32px',
                    marginRight: '4px',
                    transition: 'background-color 0.2s',
                    height: 32,
                  }}
                  onClick={() => setSelectedTab(0)}
                  size="small"
                >
                  <CodeOutlined
                    style={{
                      color: getTextColor(mode),
                      fontSize: 20,
                    }}
                  />
                </IconButton>

                {/* Process Tab - Only show when running */}
                {hasStartedProcess && (
                  <Box
                    component="button"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      backgroundColor: getBackgroundColor(
                        mode,
                        selectedTab === 1,
                      ),
                      borderRadius: '8px 8px 0 0',
                      padding: '6px 8px 6px 16px',
                      marginRight: '4px',
                      position: 'relative',
                      transition: 'background-color 0.2s',
                      height: 32,
                      cursor: 'pointer',
                      border: 'none',
                      minWidth: 0,
                      gap: 1,
                    }}
                    onClick={() => setSelectedTab(1)}
                  >
                    {/* Process Status Icon */}
                    <IconButton
                      size="small"
                      style={{ padding: 0, minWidth: 'auto' }}
                    >
                      {getStatusIcon()}
                    </IconButton>

                    {/* Process Info */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        minWidth: 0,
                      }}
                    >
                      {pid && (
                        <Chip
                          label={`PID: ${pid}`}
                          size="small"
                          variant="outlined"
                          sx={{ height: 18, fontSize: '0.65rem' }}
                        />
                      )}
                      {duration && (
                        <Chip
                          label={formatDuration(duration)}
                          size="small"
                          color={getStatusColor(status)}
                          sx={{ height: 18, fontSize: '0.65rem' }}
                        />
                      )}
                    </Box>

                    {/* Stop Options Menu */}
                    <Tooltip title="Stop options">
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMenuOpen(e);
                        }}
                        size="small"
                        disabled={status === 'stopping'}
                        sx={{
                          padding: 0.5,
                          color: getTextColor(mode),
                          minWidth: 'auto',
                        }}
                      >
                        <MoreVertRounded style={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>

                    {/* Quick Stop */}
                    <Tooltip title="Quick stop (Ctrl+C)">
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickStop();
                          setHasStartedProcess(false);
                        }}
                        size="small"
                        disabled={status === 'stopping'}
                        sx={{
                          padding: 0.5,
                          color: getTextColor(mode),
                          minWidth: 'auto',
                        }}
                      >
                        <CloseRounded style={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
                {/* Minimize Button */}
                <IconButton
                  onClick={handleMinimize}
                  size="small"
                  style={{ marginLeft: 'auto' }}
                >
                  <div style={{ marginTop: -8 }}>
                    <MinimizeRounded
                      style={{
                        color: getTextColor(mode),
                      }}
                    />
                  </div>
                </IconButton>
              </TerminalHeader>

              {/* Tab Content */}
              {selectedTab === 0 && <Terminal project={project} />}
              {selectedTab === 1 && <ProcessTerminal />}
            </>
          )}
        </TerminalWrapper>
      </SplitPane>

      {/* Minimized Taskbar */}
      {isMinimized && (
        <Taskbar>
          <TaskbarItem onClick={handleRestore}>
            <Typography fontSize={14} sx={{ mr: 1 }} fontWeight="bold">
              Terminal
            </Typography>
            <TerminalIcon fontSize="small" />
            {isRunning && (
              <Chip
                label="Running"
                size="small"
                color="success"
                sx={{ ml: 1, height: 18, fontSize: '0.65rem' }}
              />
            )}
          </TaskbarItem>

          {/* Quick stop when minimized */}
          {isRunning && (
            <TaskbarItem
              onClick={handleQuickStop}
              sx={{
                color: theme.palette.warning.main,
                '&:hover': {
                  backgroundColor: `${theme.palette.warning.main}20`,
                },
              }}
            >
              <Tooltip title="Stop process">
                <CloseRounded fontSize="small" />
              </Tooltip>
            </TaskbarItem>
          )}
        </Taskbar>
      )}

      {/* Stop Options Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: { minWidth: 200 },
        }}
      >
        <MenuItem onClick={handleGracefulStop} disabled={status === 'stopping'}>
          <ListItemIcon>
            <StopRounded fontSize="small" color="warning" />
          </ListItemIcon>
          <ListItemText
            primary="Graceful Stop"
            secondary="Send SIGTERM (5s timeout)"
          />
        </MenuItem>

        <MenuItem onClick={handleForceStop}>
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
    </Root>
  );
};
