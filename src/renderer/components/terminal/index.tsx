import React from 'react';
import SplitPane from 'split-pane-react';
import {
  Button,
  IconButton,
  Typography,
  useColorScheme,
  useTheme,
  Chip,
  Tooltip,
  Box,
} from '@mui/material';
import TerminalIcon from '@mui/icons-material/Terminal';
import { CloseRounded, MinimizeRounded } from '@mui/icons-material';
import {
  Root,
  EditorWrapper,
  TerminalWrapper,
  TerminalHeader,
  Taskbar,
  TaskbarItem,
} from './styles';
import { useProcess } from '../../hooks';
import { Project } from '../../../types/backend';
import {
  DEFAULT_TERMINAL_PANEL_ID,
  listTerminalPanels,
  TerminalPanelContext,
  TerminalPanelDefinition,
} from './panels';
import { tabButtonSx } from './panels/tabButtonSx';

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

type Props = {
  project: Project;
  children: React.ReactNode;
};

// Runs one panel's `useState` hook and reports visibility / activity up to
// the layout. A child component per panel is what lets each panel subscribe
// to its own store with hooks while the layout stays a flat list.
const PanelStateWatcher: React.FC<{
  panel: TerminalPanelDefinition;
  ctx: TerminalPanelContext;
  onVisibility: (id: string, visible: boolean) => void;
  onActivity: (id: string) => void;
}> = ({ panel, ctx, onVisibility, onActivity }) => {
  const { visible, activity } = panel.useState(ctx);

  React.useEffect(() => {
    onVisibility(panel.id, visible);
  }, [panel.id, visible, onVisibility]);

  // Only an *increase after mount* counts: a panel whose store already holds
  // a past run (e.g. runner startTime from before this layout mounted) must
  // not steal focus when the screen opens.
  const previousActivityRef = React.useRef(activity);
  React.useEffect(() => {
    const previous = previousActivityRef.current;
    previousActivityRef.current = activity;
    if (activity === undefined || previous === undefined) return;
    if (activity > previous) onActivity(panel.id);
  }, [panel.id, activity, onActivity]);

  return null;
};

export const TerminalLayout: React.FC<Props> = ({ children, project }) => {
  const { mode } = useColorScheme();
  const theme = useTheme();
  const { isRunning, stop } = useProcess();
  const panels = listTerminalPanels();
  const ctx = React.useMemo<TerminalPanelContext>(
    () => ({ project }),
    [project],
  );

  const [selectedId, setSelectedId] = React.useState<string>(
    DEFAULT_TERMINAL_PANEL_ID,
  );
  const [visibility, setVisibility] = React.useState<Record<string, boolean>>(
    {},
  );

  const [lock, setLock] = React.useState(false);
  const [sizes, setSizes] = React.useState<number[]>([
    window.innerHeight - 300,
    300,
  ]);
  const [isMinimized, setIsMinimized] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const lastTerminalHeight = React.useRef<number>(300);
  const sizesRef = React.useRef(sizes);
  sizesRef.current = sizes;
  const isMinimizedRef = React.useRef(isMinimized);
  isMinimizedRef.current = isMinimized;
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

  const handleVisibility = React.useCallback((id: string, visible: boolean) => {
    setVisibility((current) =>
      current[id] === visible ? current : { ...current, [id]: visible },
    );
  }, []);

  // A panel reported activity (run started, query executed): bring it to
  // the front and un-minimize so the user actually sees it.
  const handleActivity = React.useCallback(
    (id: string) => {
      setSelectedId(id);
      if (isMinimizedRef.current) handleRestore();
    },
    [handleRestore],
  );

  // A panel that disappeared while selected falls back to the terminal so
  // the body is never blank.
  React.useEffect(() => {
    if (
      selectedId !== DEFAULT_TERMINAL_PANEL_ID &&
      visibility[selectedId] === false
    ) {
      setSelectedId(DEFAULT_TERMINAL_PANEL_ID);
    }
  }, [selectedId, visibility]);

  const handleQuickStop = async () => {
    await stop();
    setSelectedId(DEFAULT_TERMINAL_PANEL_ID);
  };

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

  const isVisible = (panel: TerminalPanelDefinition) =>
    visibility[panel.id] ?? panel.id === DEFAULT_TERMINAL_PANEL_ID;

  return (
    <Root ref={rootRef}>
      {panels.map((panel) => (
        <PanelStateWatcher
          key={panel.id}
          panel={panel}
          ctx={ctx}
          onVisibility={handleVisibility}
          onActivity={handleActivity}
        />
      ))}
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
                {panels.filter(isVisible).map((panel) => {
                  const selected = selectedId === panel.id;
                  const onSelect = () => setSelectedId(panel.id);
                  if (panel.Label) {
                    return (
                      <panel.Label
                        key={panel.id}
                        project={project}
                        selected={selected}
                        onSelect={onSelect}
                      />
                    );
                  }
                  return (
                    <Button
                      key={panel.id}
                      size="small"
                      disableRipple
                      sx={tabButtonSx(theme, selected)}
                      onClick={onSelect}
                    >
                      <Typography
                        sx={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1 }}
                      >
                        {panel.label}
                      </Typography>
                    </Button>
                  );
                })}
                {/* Minimize Button */}
                <IconButton
                  onClick={handleMinimize}
                  size="small"
                  style={{ marginLeft: 'auto' }}
                >
                  <div style={{ marginTop: -8 }}>
                    <MinimizeRounded style={{ color: getTextColor(mode) }} />
                  </div>
                </IconButton>
              </TerminalHeader>

              {/* Tab Content */}
              {panels.map((panel) => {
                const selected = selectedId === panel.id && isVisible(panel);
                if (panel.keepMounted) {
                  return (
                    <Box
                      key={panel.id}
                      sx={{
                        display: selected ? 'block' : 'none',
                        height: '100%',
                        overflow: 'hidden',
                      }}
                    >
                      <panel.Component project={project} />
                    </Box>
                  );
                }
                if (!selected) return null;
                return (
                  <Box
                    key={panel.id}
                    sx={{
                      height: '100%',
                      bgcolor: 'background.default',
                      overflow: 'hidden',
                    }}
                  >
                    <panel.Component project={project} />
                  </Box>
                );
              })}
            </>
          )}
        </TerminalWrapper>
      </SplitPane>
    </Root>
  );
};
