import React from 'react';
import SplitPane from 'split-pane-react';
import {
  IconButton,
  Typography,
  useColorScheme,
  useTheme,
} from '@mui/material';
import TerminalIcon from '@mui/icons-material/Terminal';
import {
  CloseRounded,
  CodeOutlined,
  MinimizeRounded,
  PauseOutlined,
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
  const { running, stop } = useProcess();
  const [selectedTab, setSelectadTab] = React.useState(0);
  const [lock, setLock] = React.useState(false);
  const [sizes, setSizes] = React.useState<number[]>([
    window.innerHeight - 300,
    300,
  ]);
  const [isMinimized, setIsMinimized] = React.useState(false);
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

  const renderSash = () => (!isMinimized ? <Sash /> : null);

  React.useEffect(() => {
    setSelectadTab(running ? 1 : 0);
  }, [running]);

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
                  onClick={() => setSelectadTab(0)}
                  size="small"
                >
                  <CodeOutlined
                    style={{
                      color: getTextColor(mode),
                      fontSize: 20,
                    }}
                  />
                </IconButton>

                {running && (
                  <button
                    type="button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      backgroundColor: getBackgroundColor(
                        mode,
                        selectedTab === 1,
                      ),
                      borderRadius: '8px 8px 0 0',
                      padding: '6px 0 6px 32px',
                      marginRight: '4px',
                      position: 'relative',
                      transition: 'background-color 0.2s',
                      height: 32,
                      cursor: 'pointer',
                      border: 'none',
                    }}
                    onClick={() => setSelectadTab(1)}
                  >
                    <IconButton size="small" style={{ padding: 0 }}>
                      <PauseOutlined
                        style={{
                          color: theme.palette.success.main,
                          fontSize: 20,
                        }}
                      />
                    </IconButton>
                    <IconButton
                      onClick={() => {
                        stop();
                        setSelectadTab(0);
                      }}
                      size="small"
                      style={{
                        padding: 4,
                        marginLeft: 12,
                        color: getTextColor(mode),
                      }}
                    >
                      <CloseRounded
                        style={{
                          fontSize: 14,
                        }}
                      />
                    </IconButton>
                  </button>
                )}
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
              {selectedTab === 0 && <Terminal project={project} />}
              {selectedTab === 1 && <ProcessTerminal />}
            </>
          )}
        </TerminalWrapper>
      </SplitPane>

      {isMinimized && (
        <Taskbar>
          <TaskbarItem onClick={handleRestore}>
            <Typography fontSize={14} sx={{ mr: 1 }} fontWeight="bold">
              Terminal
            </Typography>
            <TerminalIcon fontSize="small" />
          </TaskbarItem>
        </Taskbar>
      )}
    </Root>
  );
};
