import React from 'react';
import SplitPane from 'split-pane-react';
import { IconButton, Typography } from '@mui/material';
import TerminalIcon from '@mui/icons-material/Terminal';
import { MinimizeRounded } from '@mui/icons-material';
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

type Props = {
  project: any;
  children: React.ReactNode;
};

export const TerminalLayout: React.FC<Props> = ({ children, project }) => {
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
                <IconButton onClick={handleMinimize} size="small">
                  <div style={{ marginTop: -8 }}>
                    <MinimizeRounded />
                  </div>
                </IconButton>
              </TerminalHeader>
              <Terminal project={project} />
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
