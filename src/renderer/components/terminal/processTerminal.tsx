import React from 'react';
import { Typography, useColorScheme, useTheme, Box, Chip } from '@mui/material';
import AnsiToHtml from 'ansi-to-html';
import { useProcess } from '../../hooks';
import { OutputBox, TerminalContainer } from './styles';

const ProcessTerminal: React.FC = () => {
  const { mode } = useColorScheme();
  const theme = useTheme();
  const {
    output,
    error,
    stop,
    clearOutput,
    isRunning,
    pid,
    command,
    duration,
    status,
  } = useProcess();
  const outputRef = React.useRef<HTMLDivElement>(null);

  // Theme-based terminal colors
  const getTerminalColors = (themeMode: string | undefined) => {
    switch (themeMode) {
      case 'dark':
        return {
          fg: theme.palette.common.white,
          bg: theme.palette.grey[900],
        };
      case 'light':
        return {
          fg: theme.palette.common.black,
          bg: theme.palette.grey[50],
        };
      case 'system':
        return {
          fg: theme.palette.text.primary,
          bg: theme.palette.background.paper,
        };
      default:
        return {
          fg: theme.palette.text.primary,
          bg: theme.palette.background.default,
        };
    }
  };

  const terminalColors = getTerminalColors(mode);

  const ansiConverter = React.useMemo(
    () =>
      new AnsiToHtml({
        fg: terminalColors.fg,
        bg: terminalColors.bg,
        newline: true,
        escapeXML: true,
        stream: false,
      }),
    [terminalColors.fg, terminalColors.bg],
  );

  // Auto scroll to bottom
  React.useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, error]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const container = outputRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = window.electron.app.os === 'darwin';
      const isStopCombo =
        (isMac && e.metaKey && e.key === 'c') ||
        (!isMac && e.ctrlKey && e.key === 'c');
      const isClearCombo = !isMac && e.ctrlKey && e.key === 'l';

      if (isStopCombo && isRunning) {
        e.preventDefault();
        stop();
      } else if (isClearCombo) {
        e.preventDefault();
        clearOutput();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line consistent-return
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, stop, clearOutput]);

  const formatDuration = (ms: number | null) => {
    if (!ms) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
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
    <TerminalContainer>
      {/* Status Bar */}
      <Box
        sx={{
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          backgroundColor: terminalColors.bg,
        }}
      >
        <Chip
          label={status.toUpperCase()}
          color={getStatusColor(status)}
          size="small"
        />
        {pid && <Chip label={`PID: ${pid}`} variant="outlined" size="small" />}
        {duration && (
          <Chip
            label={formatDuration(duration)}
            variant="outlined"
            size="small"
          />
        )}
        {command && (
          <Typography variant="caption" sx={{ ml: 'auto', opacity: 0.7 }}>
            {command.length > 50 ? `${command.substring(0, 50)}...` : command}
          </Typography>
        )}
      </Box>

      <OutputBox
        ref={outputRef}
        tabIndex={0}
        style={{
          backgroundColor: terminalColors.bg,
          color: terminalColors.fg,
        }}
        onDoubleClick={clearOutput}
      >
        {output.map((line: any, index: number) => (
          <Typography
            key={`out-${index}`}
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              color: terminalColors.fg,
            }}
            dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(line) }}
          />
        ))}
        {error.map((line: any, index: number) => (
          <Typography
            key={`err-${index}`}
            variant="body2"
            color="error"
            sx={{
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
            }}
            dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(line) }}
          />
        ))}
      </OutputBox>
    </TerminalContainer>
  );
};

export { ProcessTerminal };
