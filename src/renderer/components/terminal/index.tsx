import React from 'react';
import SplitPane from 'split-pane-react';
import {
  Button,
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
  MinimizeRounded,
  MoreVertRounded,
  StopRounded,
  PowerOffRounded,
  TimerRounded,
} from '@mui/icons-material';
import { Terminal } from './terminal';
import {
  Root,
  EditorWrapper,
  TerminalWrapper,
  TerminalHeader,
  Taskbar,
  TaskbarItem,
} from './styles';
import { ProcessTerminal } from './processTerminal';
import { useProcess, useRunner } from '../../hooks';
import { useSelectedFileContext } from '../../hooks/useSelectedFileContext';
import { Project } from '../../../types/backend';
import { useCurrentModelId } from '../../controllers';
import { LineageModal, LineageView } from '../lineage';

type TerminalMinimizeContextValue = {
  isMinimized: boolean;
  minimize: () => void;
  restore: () => void;
};

const TerminalMinimizeContext =
  React.createContext<TerminalMinimizeContextValue | null>(null);

export const useTerminalMinimize = () =>
  React.useContext(TerminalMinimizeContext);

const MINIMIZED_TERMINAL_HEIGHT = 32;

export type TerminalPanelTab =
  | 'terminal'
  | 'process'
  | 'lineage'
  | 'queryResults'
  | 'runHistory'
  | 'cloudLogs'
  | 'runnerLogs';

export interface TerminalLayoutRef {
  switchTab: (tab: TerminalPanelTab) => void;
}

type Props = {
  project: Project;
  children: React.ReactNode;
  queryResultsPanel?: React.ReactNode;
  showQueryResultsTab?: boolean;
  queryResultsRevision?: number;
  runHistoryPanel?: React.ReactNode;
  showRunHistoryTab?: boolean;
  cloudLogsPanel?: React.ReactNode;
  showCloudLogsTab?: boolean;
  runnerLogsPanel?: React.ReactNode;
  showRunnerLogsTab?: boolean;
};

export const TerminalLayout = React.forwardRef<TerminalLayoutRef, Props>(
  (
    {
      children,
      project,
      queryResultsPanel,
      showQueryResultsTab = false,
      queryResultsRevision = 0,
      runHistoryPanel,
      showRunHistoryTab = false,
      cloudLogsPanel,
      showCloudLogsTab = false,
      runnerLogsPanel,
      showRunnerLogsTab = false,
    },
    ref,
  ) => {
    const { mode } = useColorScheme();
    const theme = useTheme();
    const { isRunning, stop, forceStop, pid, duration, status, command } =
      useProcess();
    const { isRunning: isRunnerRunning } = useRunner();

    const { selectedFilePath } = useSelectedFileContext();

    // Only query for lineage if the file is a SQL model (not .yml/.yaml)
    const isExecutableModel = React.useMemo(() => {
      if (!selectedFilePath) return false;
      const ext = selectedFilePath.toLowerCase().split('.').pop();
      return ext === 'sql';
    }, [selectedFilePath]);

    const {
      data: currentModelData,
      isLoading: isLoadingCurrentModel,
      isError: isErrorCurrentModel,
    } = useCurrentModelId(
      {
        projectId: project.id,
        filePath: selectedFilePath,
      },
      { enabled: !!project.id && !!selectedFilePath && isExecutableModel },
    );

    const showLineageTab =
      isExecutableModel &&
      (Boolean(currentModelData?.modelId) ||
        isLoadingCurrentModel ||
        isErrorCurrentModel);

    const [selectedTab, setSelectedTab] =
      React.useState<TerminalPanelTab>('terminal');

    const [lock, setLock] = React.useState(false);
    const [sizes, setSizes] = React.useState<number[]>([
      window.innerHeight - 300,
      300,
    ]);
    const [isMinimized, setIsMinimized] = React.useState(false);
    const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(
      null,
    );
    const [openLineageModal, setOpenLineageModal] = React.useState(false);
    const [hasStartedProcess, setHasStartedProcess] =
      React.useState<boolean>(false);
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const lastTerminalHeight = React.useRef<number>(300);
    const sizesRef = React.useRef(sizes);
    sizesRef.current = sizes;
    const getLayoutHeight = React.useCallback(
      () => rootRef.current?.clientHeight || window.innerHeight,
      [],
    );

    const handleMinimize = React.useCallback(() => {
      setIsMinimized(true);
      const layoutHeight = getLayoutHeight();
      const [, currentTerminalHeight] = sizesRef.current;
      if (
        typeof currentTerminalHeight === 'number' &&
        currentTerminalHeight > MINIMIZED_TERMINAL_HEIGHT
      ) {
        lastTerminalHeight.current = currentTerminalHeight;
      }
      setSizes([
        layoutHeight - MINIMIZED_TERMINAL_HEIGHT,
        MINIMIZED_TERMINAL_HEIGHT,
      ]);
    }, [getLayoutHeight]);

    const handleRestore = React.useCallback(() => {
      setIsMinimized(false);
      const layoutHeight = getLayoutHeight();
      setSizes([
        layoutHeight - lastTerminalHeight.current,
        lastTerminalHeight.current,
      ]);
    }, [getLayoutHeight]);

    const terminalContextValue = React.useMemo(
      () => ({ isMinimized, minimize: handleMinimize, restore: handleRestore }),
      [isMinimized, handleMinimize, handleRestore],
    );

    React.useImperativeHandle(
      ref,
      () => ({
        switchTab: (tab: TerminalPanelTab) => {
          setSelectedTab((prev) => {
            if (prev !== tab) {
              return tab;
            }
            return prev;
          });
          if (isMinimized) {
            handleRestore();
          }
        },
      }),
      [isMinimized, handleRestore],
    );

    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
      setMenuAnchor(event.currentTarget);
    };

    const handleMenuClose = () => {
      setMenuAnchor(null);
    };

    const handleGracefulStop = async () => {
      handleMenuClose();
      await stop();
      setSelectedTab('terminal');
    };

    const handleForceStop = async () => {
      handleMenuClose();
      await forceStop();
      setSelectedTab('terminal');
    };

    const handleQuickStop = async () => {
      await stop();
      setSelectedTab('terminal');
    };

    const handleCloseProcessTab = React.useCallback(() => {
      setHasStartedProcess(false);
      setSelectedTab((prev) => (prev === 'process' ? 'terminal' : prev));
    }, []);

    const renderSash = (_: number, active: boolean) => {
      if (isMinimized) return null;
      return (
        <div
          style={{
            width: '100%',
            height: '4px',
            cursor: 'row-resize',
            position: 'relative',
            backgroundColor: active ? 'rgba(144,202,249,0.4)' : 'transparent',
            transition: 'background-color 0.15s ease',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: '2px',
              transform: 'translateY(-50%)',
              backgroundColor: active
                ? 'rgba(144,202,249,0.8)'
                : 'rgba(255,255,255,0.08)',
              transition: 'background-color 0.15s ease',
            }}
          />
        </div>
      );
    };

    // Auto-switch to process tab when a process starts
    React.useEffect(() => {
      if (isRunning) {
        setHasStartedProcess(true);
      }
      if (isRunning && selectedTab !== 'process') {
        setSelectedTab('process');
      }
    }, [isRunning]);

    // Auto-switch to runner logs tab when a local pipeline run starts
    React.useEffect(() => {
      if (
        isRunnerRunning &&
        showRunnerLogsTab &&
        selectedTab !== 'runnerLogs'
      ) {
        setSelectedTab('runnerLogs');
      }
    }, [isRunnerRunning, showRunnerLogsTab]);

    // // Reset stopping state when process stops
    // React.useEffect(() => {
    //   if (!isRunning) {
    //     setIsStoppingGracefully(false);
    //   }
    // }, [isRunning]);

    // If Lineage tab is hidden but selected, switch back to terminal
    // Only auto-switch when the query is settled (not loading)
    React.useEffect(() => {
      if (
        !showLineageTab &&
        selectedTab === 'lineage' &&
        !isLoadingCurrentModel
      ) {
        setSelectedTab('terminal');
      }
    }, [showLineageTab, selectedTab, isLoadingCurrentModel]);

    React.useEffect(() => {
      if (showQueryResultsTab && queryResultsRevision > 0) {
        setSelectedTab('queryResults');
        if (isMinimized) {
          handleRestore();
        }
      }
      // handleRestore intentionally reads refs/state and should not retrigger this.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showQueryResultsTab, queryResultsRevision]);

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

    const tabButtonSx = (isSelected: boolean) => ({
      minHeight: 22,
      height: 22,
      padding: '0 10px',
      borderRadius: '4px',
      marginRight: '6px',
      backgroundColor: isSelected
        ? theme.palette.action.selected
        : 'transparent',
      transition: 'background-color 0.15s, border-color 0.15s',
      border: `1px solid ${isSelected ? theme.palette.divider : 'transparent'}`,
      color: isSelected
        ? theme.palette.text.primary
        : theme.palette.text.secondary,
      textTransform: 'none',
      letterSpacing: 0.2,
      '&:hover': {
        backgroundColor: isSelected
          ? theme.palette.action.selected
          : theme.palette.action.hover,
        borderColor: isSelected ? theme.palette.divider : 'transparent',
      },
    });

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

    return (
      <Root ref={rootRef}>
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
            <TerminalMinimizeContext.Provider value={terminalContextValue}>
              {children}
            </TerminalMinimizeContext.Provider>
          </EditorWrapper>
          <TerminalWrapper>
            {isMinimized ? (
              <Taskbar>
                <TaskbarItem onClick={handleRestore}>
                  <Typography fontSize={13} sx={{ mr: 1 }} fontWeight="bold">
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
            ) : (
              <>
                <TerminalHeader
                  sx={{
                    backgroundColor:
                      theme.palette.mode === 'dark'
                        ? theme.palette.grey[900]
                        : theme.palette.grey[50],
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    padding: '4px 6px',
                    height: 32,
                  }}
                >
                  {/* CLI Terminal Tab */}
                  {/* CLI Terminal Tab */}
                  <Button
                    size="small"
                    disableRipple
                    sx={tabButtonSx(selectedTab === 'terminal')}
                    onClick={() => setSelectedTab('terminal')}
                  >
                    <Typography
                      sx={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1 }}
                    >
                      TERMINAL
                    </Typography>
                  </Button>
                  {/* Lineage Terminal Tab */}
                  {showLineageTab && (
                    <Button
                      size="small"
                      disableRipple
                      sx={tabButtonSx(selectedTab === 'lineage')}
                      onClick={() => setSelectedTab('lineage')}
                    >
                      <Typography
                        sx={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1 }}
                      >
                        LINEAGE
                      </Typography>
                    </Button>
                  )}
                  {/* Process Tab - Only show when running */}
                  {hasStartedProcess && (
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Box
                        component="button"
                        type="button"
                        onClick={() => setSelectedTab('process')}
                        sx={{
                          ...tabButtonSx(selectedTab === 'process'),
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.75,
                          padding: '0 6px 0 10px',
                          cursor: 'pointer',
                          outline: 'none',
                        }}
                      >
                        <Typography
                          sx={{
                            fontWeight: 500,
                            fontSize: 10.5,
                            lineHeight: 1,
                          }}
                        >
                          PID SERVER
                        </Typography>

                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                          }}
                        >
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

                        {/* Stop Options Menu */}
                        <Tooltip title="Stop options">
                          <IconButton
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMenuOpen(e);
                            }}
                            size="small"
                            sx={{
                              padding: 0.25,
                              color: 'inherit',
                              minWidth: 'auto',
                            }}
                          >
                            <MoreVertRounded style={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>

                        {/* Close Tab */}
                        <Tooltip title="Close PID server tab">
                          <IconButton
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCloseProcessTab();
                            }}
                            size="small"
                            sx={{
                              padding: 0.25,
                              color: 'inherit',
                              minWidth: 'auto',
                            }}
                          >
                            <CloseRounded style={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  )}
                  {/* Query Results Tab */}
                  {showQueryResultsTab && (
                    <Button
                      size="small"
                      disableRipple
                      sx={tabButtonSx(selectedTab === 'queryResults')}
                      onClick={() => setSelectedTab('queryResults')}
                    >
                      <Typography
                        sx={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1 }}
                      >
                        QUERY RESULTS
                      </Typography>
                    </Button>
                  )}
                  {/* Run History Tab */}
                  {showRunHistoryTab && (
                    <Button
                      size="small"
                      disableRipple
                      sx={tabButtonSx(selectedTab === 'runHistory')}
                      onClick={() => setSelectedTab('runHistory')}
                    >
                      <Typography
                        sx={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1 }}
                      >
                        RUN HISTORY
                      </Typography>
                    </Button>
                  )}
                  {/* Cloud Logs Tab */}
                  {showCloudLogsTab && (
                    <Button
                      size="small"
                      disableRipple
                      sx={tabButtonSx(selectedTab === 'cloudLogs')}
                      onClick={() => setSelectedTab('cloudLogs')}
                    >
                      <Typography
                        sx={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1 }}
                      >
                        CLOUD LOGS
                      </Typography>
                    </Button>
                  )}
                  {/* Runner Logs Tab */}
                  {showRunnerLogsTab && (
                    <Button
                      size="small"
                      disableRipple
                      sx={tabButtonSx(selectedTab === 'runnerLogs')}
                      onClick={() => setSelectedTab('runnerLogs')}
                    >
                      <Typography
                        sx={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1 }}
                      >
                        RUNNER LOGS
                      </Typography>
                    </Button>
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
                <Box
                  sx={{
                    display: selectedTab === 'terminal' ? 'block' : 'none',
                    height: '100%',
                    overflow: 'hidden',
                  }}
                >
                  <Terminal project={project} />
                </Box>
                <Box
                  sx={{
                    display: selectedTab === 'process' ? 'block' : 'none',
                    height: '100%',
                    overflow: 'hidden',
                  }}
                >
                  <ProcessTerminal />
                </Box>
                {selectedTab === 'lineage' && showLineageTab && (
                  <LineageView
                    projectId={project.id}
                    filePath={selectedFilePath}
                    onExpandClick={() => setOpenLineageModal(true)}
                  />
                )}
                {selectedTab === 'queryResults' && showQueryResultsTab && (
                  <Box
                    sx={{
                      height: '100%',
                      bgcolor: 'background.default',
                      overflow: 'hidden',
                    }}
                  >
                    {queryResultsPanel}
                  </Box>
                )}
                {selectedTab === 'runHistory' && showRunHistoryTab && (
                  <Box
                    sx={{
                      height: '100%',
                      bgcolor: 'background.default',
                      overflow: 'hidden',
                    }}
                  >
                    {runHistoryPanel}
                  </Box>
                )}
                {selectedTab === 'cloudLogs' && showCloudLogsTab && (
                  <Box
                    sx={{
                      height: '100%',
                      bgcolor: 'background.default',
                      overflow: 'hidden',
                    }}
                  >
                    {cloudLogsPanel}
                  </Box>
                )}
                {selectedTab === 'runnerLogs' && showRunnerLogsTab && (
                  <Box
                    sx={{
                      height: '100%',
                      bgcolor: 'background.default',
                      overflow: 'hidden',
                    }}
                  >
                    {runnerLogsPanel}
                  </Box>
                )}
              </>
            )}
          </TerminalWrapper>
        </SplitPane>

        {/* Stop Options Menu */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleMenuClose}
          PaperProps={{
            sx: { minWidth: 200 },
          }}
        >
          <MenuItem
            onClick={handleGracefulStop}
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
        <LineageModal
          isOpen={openLineageModal}
          onClose={() => setOpenLineageModal(false)}
          projectId={project.id}
          filePath={selectedFilePath}
        />
      </Root>
    );
  },
);
