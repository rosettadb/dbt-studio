import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  useTheme,
  useColorScheme,
} from '@mui/material';
import {
  ClearAll,
  ContentCopy,
  WrapText,
  Fullscreen,
  FullscreenExit,
  MinimizeRounded,
  Terminal as TerminalIcon,
} from '@mui/icons-material';
import AnsiToHtml from 'ansi-to-html';
import { toast } from 'react-toastify';
import { useRunner } from '../../hooks';

type Props = {
  title?: string;
  onMinimize?: () => void;
};

const FULLSCREEN_Z = 9999;

const HeaderButton: React.FC<{
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}> = ({ title, onClick, active, children }) => (
  <Tooltip title={title}>
    <IconButton
      size="small"
      onClick={onClick}
      sx={{
        color: active ? 'primary.main' : 'text.secondary',
      }}
    >
      {children}
    </IconButton>
  </Tooltip>
);

export const RunnerLogViewer: React.FC<Props> = ({
  title = 'Runner Logs',
  onMinimize,
}) => {
  const theme = useTheme();
  const { mode } = useColorScheme();
  const { logs: lines, isRunning, status } = useRunner();
  const outputRef = React.useRef<HTMLDivElement>(null);

  const [paused, setPaused] = React.useState(false);
  const [localClearedAt, setLocalClearedAt] = React.useState(0);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [wrap, setWrap] = React.useState(true);

  const isDark = mode === 'dark';
  const fg = isDark ? theme.palette.common.white : theme.palette.common.black;
  const bg = isDark ? theme.palette.grey[900] : theme.palette.grey[50];

  const ansiConverter = React.useMemo(
    () =>
      new AnsiToHtml({
        fg,
        bg,
        newline: true,
        escapeXML: true,
        stream: false,
      }),
    [fg, bg],
  );

  // A new run resets `lines` back to empty (see RunnerProvider.run) - if
  // localClearedAt were left pointing at the old (now much larger) index,
  // the new run's output would stay hidden until it grew past that index.
  React.useEffect(() => {
    if (lines.length === 0 && localClearedAt !== 0) {
      setLocalClearedAt(0);
    }
  }, [lines.length, localClearedAt]);

  const visibleLines = React.useMemo(
    () => lines.slice(localClearedAt),
    [lines, localClearedAt],
  );

  React.useEffect(() => {
    if (paused) return;
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [visibleLines, paused]);

  // Exit fullscreen on Escape.
  React.useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const handleCopy = () => {
    const text = visibleLines.map((l) => l.message).join('\n');
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success('Logs copied'))
      .catch(() => toast.error('Failed to copy logs'));
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const atBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight < 24;
    setPaused(!atBottom);
  };

  const renderLogLine = (
    entry: { message: string; isError: boolean },
    idx: number,
  ) => (
    // eslint-disable-next-line react/no-array-index-key
    <Box
      key={idx}
      sx={{
        whiteSpace: wrap ? 'pre-wrap' : 'pre',
        wordBreak: wrap ? 'break-word' : 'normal',
        color: entry.isError ? theme.palette.error.main : 'inherit',
      }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: ansiConverter.toHtml(entry.message),
      }}
    />
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        bgcolor: bg,
        ...(fullscreen
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: FULLSCREEN_Z,
            }
          : {}),
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <TerminalIcon
          fontSize="small"
          sx={{ color: isRunning ? 'success.main' : 'text.disabled' }}
        />
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: isRunning ? 'success.main' : 'text.disabled',
            fontSize: '0.65rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
          }}
        >
          {status}
        </Typography>
        {paused && (
          <Typography
            variant="caption"
            sx={{ color: 'warning.main', fontSize: '0.65rem' }}
          >
            scroll paused
          </Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />

        <HeaderButton
          title={wrap ? 'Disable word wrap' : 'Enable word wrap'}
          onClick={() => setWrap((v) => !v)}
          active={wrap}
        >
          <WrapText sx={{ fontSize: 16 }} />
        </HeaderButton>
        <HeaderButton title="Copy visible logs" onClick={handleCopy}>
          <ContentCopy sx={{ fontSize: 14 }} />
        </HeaderButton>
        <HeaderButton
          title="Clear view (run keeps going)"
          onClick={() => setLocalClearedAt(lines.length)}
        >
          <ClearAll sx={{ fontSize: 16 }} />
        </HeaderButton>
        {onMinimize && (
          <HeaderButton title="Minimize" onClick={onMinimize}>
            <MinimizeRounded sx={{ fontSize: 18 }} />
          </HeaderButton>
        )}
        <HeaderButton
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          onClick={() => setFullscreen((v) => !v)}
          active={fullscreen}
        >
          {fullscreen ? (
            <FullscreenExit sx={{ fontSize: 18 }} />
          ) : (
            <Fullscreen sx={{ fontSize: 18 }} />
          )}
        </HeaderButton>
      </Box>

      <Box
        ref={outputRef}
        onScroll={handleScroll}
        sx={{
          flexGrow: 1,
          overflow: 'auto',
          px: 1.5,
          py: 0.75,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: '0.75rem',
          lineHeight: 1.4,
          color: fg,
        }}
      >
        {visibleLines.length === 0 ? (
          <Typography
            variant="caption"
            sx={{ color: 'text.disabled', fontStyle: 'italic' }}
          >
            Waiting for logs...
          </Typography>
        ) : (
          visibleLines.map(renderLogLine)
        )}
      </Box>
    </Box>
  );
};
