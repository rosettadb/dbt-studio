import React from 'react';
import SplitPane from 'split-pane-react';
import { IconButton, Typography } from '@mui/material';
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
                    backgroundColor: selectedTab === 0 ? '#2e2e2e' : '#a0a0a0',
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
                      color: selectedTab === 0 ? '#fff' : '#000',
                      fontSize: 20,
                    }}
                  />
                </IconButton>

                {running && (
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      backgroundColor:
                        selectedTab === 1 ? '#2e2e2e' : '#a0a0a0',
                      borderRadius: '8px 8px 0 0',
                      padding: '6px 0 6px 32px',
                      marginRight: '4px',
                      position: 'relative',
                      transition: 'background-color 0.2s',
                      height: 32,
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectadTab(1)}
                  >
                    <IconButton size="small" style={{ padding: 0 }}>
                      <PauseOutlined
                        style={{ color: '#368e2b', fontSize: 20 }}
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
                        color: selectedTab === 1 ? '#fff' : '#000',
                      }}
                    >
                      <CloseRounded
                        style={{
                          fontSize: 14,
                        }}
                      />
                    </IconButton>
                  </div>
                )}
                <IconButton
                  onClick={handleMinimize}
                  size="small"
                  style={{ marginLeft: 'auto' }}
                >
                  <div style={{ marginTop: -8 }}>
                    <MinimizeRounded style={{ color: '#000' }} />
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
