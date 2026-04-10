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
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
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
import { useSelectedFileContext } from '../../hooks/useSelectedFileContext';
import useAppContext from '../../hooks/useAppContext';
import { Project } from '../../../types/backend';
import { useGetFileContent } from '../../controllers';
import { LineageModal } from '../lineage/LineageModal';
import { LineageView } from '../lineage/LineageView';
import { useCurrentModelId } from '../../controllers/lineage.controller';
import { PipelineView } from '../pipelineView';
import {
  isPipelineFile,
  PIPELINE_CONFIG_DIR,
  PIPELINE_CONFIG_FILENAME,
} from '../pipelineView/parsePipelineConfig';
import { pathJoin } from '../../services/settings.services';

type Props = {
  project: Project;
  children: React.ReactNode;
};

export const TerminalLayout: React.FC<Props> = ({ children, project }) => {
  const { mode } = useColorScheme();
  const theme = useTheme();
  const { openFile } = useAppContext();
  const { isRunning, stop, forceStop, pid, duration, status, command } =
    useProcess();

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

  // Check if current file is a pipeline.yml file
  const isPipelineFileActive = React.useMemo(() => {
    if (!selectedFilePath) return false;
    return isPipelineFile(selectedFilePath);
  }, [selectedFilePath]);

  const [selectedTab, setSelectedTab] = React.useState(0);
  const [isPipelineFullscreen, setIsPipelineFullscreen] = React.useState(false);
  // Track if user manually clicked on CI/CD tab (vs auto-switched)
  const [isManualCicdTabSwitch, setIsManualCicdTabSwitch] =
    React.useState(false);

  // Resolve the pipeline file path from the project root
  const [pipelineFilePath, setPipelineFilePath] = React.useState<string>('');
  React.useEffect(() => {
    // eslint-disable-next-line promise/valid-params
    pathJoin(project.path, PIPELINE_CONFIG_DIR, PIPELINE_CONFIG_FILENAME)
      .then(setPipelineFilePath)
      .catch();
  }, [project.path]);

  // Always poll the pipeline file — tab is visible whenever the file exists on disk
  const { data: pipelineFileContent, isSuccess: pipelineFileExists } =
    useGetFileContent(pipelineFilePath, {
      enabled: !!pipelineFilePath,
      refetchInterval: 2000, // Refresh every 2 seconds to stay in sync with file changes
    });

  const showPipelineTab = pipelineFileExists;

  const [lock, setLock] = React.useState(false);
  const [sizes, setSizes] = React.useState<number[]>([
    window.innerHeight - 300,
    300,
  ]);
  const [isMinimized, setIsMinimized] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [openLineageModal, setOpenLineageModal] = React.useState(false);
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

  // If Lineage tab is hidden but selected, switch back to terminal
  // Only auto-switch when the query is settled (not loading)
  React.useEffect(() => {
    if (!showLineageTab && selectedTab === 2 && !isLoadingCurrentModel) {
      setSelectedTab(0);
    }
  }, [showLineageTab, selectedTab, isLoadingCurrentModel]);

  // Auto-switch to CI/CD tab when pipeline.yml file is opened in editor
  React.useEffect(() => {
    if (isPipelineFileActive && selectedTab !== 3) {
      setSelectedTab(3);
      setIsManualCicdTabSwitch(false); // This is an auto-switch
      // Restore terminal if minimized
      if (isMinimized) {
        handleRestore();
      }
    }
  }, [isPipelineFileActive]);

  // Switch back to Terminal when navigating away from pipeline.yml (if not manually on CI/CD tab)
  React.useEffect(() => {
    if (!isPipelineFileActive && selectedTab === 3 && !isManualCicdTabSwitch) {
      setSelectedTab(0);
    }
  }, [isPipelineFileActive, selectedTab, isManualCicdTabSwitch]);

  // If Pipeline tab is hidden but selected, switch back to terminal
  React.useEffect(() => {
    if (!showPipelineTab && selectedTab === 3) {
      setSelectedTab(0);
    }
  }, [showPipelineTab, selectedTab]);

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
    backgroundColor: isSelected ? theme.palette.action.selected : 'transparent',
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
                  sx={tabButtonSx(selectedTab === 0)}
                  onClick={() => setSelectedTab(0)}
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
                    sx={tabButtonSx(selectedTab === 2)}
                    onClick={() => setSelectedTab(2)}
                  >
                    <Typography
                      sx={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1 }}
                    >
                      LINEAGE
                    </Typography>
                  </Button>
                )}
                {/* CI/CD Pipeline Tab */}
                {showPipelineTab && (
                  <Button
                    size="small"
                    disableRipple
                    sx={tabButtonSx(selectedTab === 3)}
                    onClick={() => {
                      setSelectedTab(3);
                      setIsManualCicdTabSwitch(true); // User manually clicked
                    }}
                  >
                    <Typography
                      sx={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1 }}
                    >
                      CI/CD
                    </Typography>
                  </Button>
                )}
                {/* Process Tab - Only show when running */}
                {hasStartedProcess && (
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Box
                      component="button"
                      type="button"
                      onClick={() => setSelectedTab(1)}
                      sx={{
                        ...tabButtonSx(selectedTab === 1),
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        padding: '0 6px 0 10px',
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                    >
                      <Typography
                        sx={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1 }}
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
                          disabled={status === 'stopping'}
                          sx={{
                            padding: 0.25,
                            color: 'inherit',
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
                {/* Fullscreen Toggle - Only for CI/CD tab */}
                {selectedTab === 3 && (
                  <Tooltip
                    title={
                      isPipelineFullscreen ? 'Exit fullscreen' : 'Fullscreen'
                    }
                  >
                    <IconButton
                      onClick={() =>
                        setIsPipelineFullscreen(!isPipelineFullscreen)
                      }
                      size="small"
                      style={{ marginLeft: 'auto' }}
                    >
                      {isPipelineFullscreen ? (
                        <FullscreenExitIcon
                          style={{
                            color: getTextColor(mode),
                            fontSize: 20,
                          }}
                        />
                      ) : (
                        <FullscreenIcon
                          style={{
                            color: getTextColor(mode),
                            fontSize: 20,
                          }}
                        />
                      )}
                    </IconButton>
                  </Tooltip>
                )}
                {/* Minimize Button */}
                <IconButton
                  onClick={handleMinimize}
                  size="small"
                  style={{ marginLeft: selectedTab === 3 ? 0 : 'auto' }}
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
              {selectedTab === 2 && showLineageTab && (
                <LineageView
                  projectId={project.id}
                  filePath={selectedFilePath}
                  onExpandClick={() => setOpenLineageModal(true)}
                />
              )}
              {selectedTab === 3 && showPipelineTab && (
                <Box
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    position: isPipelineFullscreen ? 'fixed' : 'relative',
                    top: isPipelineFullscreen ? 0 : 'auto',
                    left: isPipelineFullscreen ? 0 : 'auto',
                    right: isPipelineFullscreen ? 0 : 'auto',
                    bottom: isPipelineFullscreen ? 0 : 'auto',
                    zIndex: isPipelineFullscreen ? 9999 : 'auto',
                    bgcolor: 'background.default',
                  }}
                >
                  {/* Exit fullscreen button - only shown when fullscreen is active */}
                  {isPipelineFullscreen && (
                    <Tooltip title="Exit fullscreen">
                      <IconButton
                        onClick={() => setIsPipelineFullscreen(false)}
                        size="small"
                        sx={{
                          position: 'absolute',
                          top: 16,
                          right: 16,
                          zIndex: 10000,
                          bgcolor: 'background.paper',
                          '&:hover': {
                            bgcolor: 'action.hover',
                          },
                        }}
                        aria-label="Exit fullscreen"
                      >
                        <FullscreenExitIcon
                          style={{
                            color: getTextColor(mode),
                            fontSize: 20,
                          }}
                        />
                      </IconButton>
                    </Tooltip>
                  )}
                  {/* Always read from pipeline.yml file on disk */}
                  <PipelineView
                    content={pipelineFileContent || ''}
                    onEdit={() => openFile?.(pipelineFilePath)}
                  />
                </Box>
              )}
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
      <LineageModal
        isOpen={openLineageModal}
        onClose={() => setOpenLineageModal(false)}
        projectId={project.id}
        filePath={selectedFilePath}
      />
    </Root>
  );
};
