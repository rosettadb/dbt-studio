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
  CloudDone,
  CloudOff,
  ContentCopy,
  WrapText,
  AccessTime,
  Fullscreen,
  FullscreenExit,
} from '@mui/icons-material';
import AnsiToHtml from 'ansi-to-html';
import { toast } from 'react-toastify';
import { useCloudActionLogs } from '../../controllers/rosettaCloud.controller';
import type { CloudLogEntry } from '../../../types/cloudAction';

type Props = {
  actionId: string | null;
  title?: string;
};

const FULLSCREEN_Z = 9999;

function formatTimestamp(nano: string): string {
  // Loki returns timestamps as nanosecond-precision strings.
  const ms = Number(BigInt(nano) / 1_000_000n);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(
    d.getMilliseconds(),
    3,
  )}`;
}

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

export const CloudLogViewer: React.FC<Props> = ({
  actionId,
  title = 'Cloud Logs',
}) => {
  const theme = useTheme();
  const { mode } = useColorScheme();
  const { logs, error, mode: logMode } = useCloudActionLogs(actionId);
  const outputRef = React.useRef<HTMLDivElement>(null);

  const [paused, setPaused] = React.useState(false);
  const [localClearedAt, setLocalClearedAt] = React.useState(0);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [wrap, setWrap] = React.useState(true);
  const [showTimestamps, setShowTimestamps] = React.useState(false);

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

  const visibleLogs = React.useMemo(
    () => logs.slice(localClearedAt),
    [logs, localClearedAt],
  );

  React.useEffect(() => {
    if (paused) return;
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [visibleLogs, paused]);

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
    const text = visibleLogs
      .map((l) =>
        showTimestamps
          ? `${formatTimestamp(l.timestamp)}  ${l.message}`
          : l.message,
      )
      .join('\n');
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

  if (!actionId) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'text.disabled',
          gap: 1,
        }}
      >
        <CloudOff fontSize="small" />
        <Typography variant="body2">No active cloud run</Typography>
      </Box>
    );
  }

  const renderLogLine = (entry: CloudLogEntry, idx: number) => (
    // eslint-disable-next-line react/no-array-index-key
    <Box
      key={`${entry.timestamp}-${idx}`}
      sx={{
        display: 'flex',
        gap: 1,
        whiteSpace: wrap ? 'pre-wrap' : 'pre',
        wordBreak: wrap ? 'break-word' : 'normal',
      }}
    >
      {showTimestamps && (
        <Box
          component="span"
          sx={{
            color: 'text.disabled',
            flexShrink: 0,
            userSelect: 'none',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatTimestamp(entry.timestamp)}
        </Box>
      )}
      <Box
        component="span"
        sx={{ flexGrow: 1, minWidth: 0 }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ansiConverter.toHtml(entry.message),
        }}
      />
    </Box>
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
        <CloudDone fontSize="small" sx={{ color: 'success.main' }} />
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Tooltip title={actionId}>
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'monospace',
              color: 'text.disabled',
              fontSize: '0.7rem',
            }}
          >
            {actionId.slice(0, 8)}
          </Typography>
        </Tooltip>
        <Typography
          variant="caption"
          sx={{
            color: logMode === 'stream' ? 'info.main' : 'text.disabled',
            fontSize: '0.65rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
          }}
        >
          {logMode === 'stream' ? 'live' : 'finalized'}
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
          title={showTimestamps ? 'Hide timestamps' : 'Show timestamps'}
          onClick={() => setShowTimestamps((v) => !v)}
          active={showTimestamps}
        >
          <AccessTime sx={{ fontSize: 16 }} />
        </HeaderButton>
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
          title="Clear view (stream keeps running)"
          onClick={() => setLocalClearedAt(logs.length)}
        >
          <ClearAll sx={{ fontSize: 16 }} />
        </HeaderButton>
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

      {error && (
        <Box
          sx={{
            px: 1.5,
            py: 0.5,
            color: 'error.main',
            fontSize: '0.75rem',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          {error}
        </Box>
      )}

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
        {visibleLogs.length === 0 ? (
          <Typography
            variant="caption"
            sx={{ color: 'text.disabled', fontStyle: 'italic' }}
          >
            Waiting for logs...
          </Typography>
        ) : (
          visibleLogs.map(renderLogLine)
        )}
      </Box>
    </Box>
  );
};
