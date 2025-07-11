import React from 'react';
import { Typography, useColorScheme, useTheme } from '@mui/material';
import AnsiToHtml from 'ansi-to-html';
import { useProcess } from '../../hooks';
import { OutputBox, TerminalContainer } from './styles';

const ProcessTerminal: React.FC = () => {
  const { mode } = useColorScheme();
  const theme = useTheme();
  const { output, error, stop } = useProcess();
  const outputRef = React.useRef<HTMLDivElement>(null);

  // Theme-based terminal colors using Material UI theme
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

  // Create ansiConverter based on current theme
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

  React.useEffect(() => {
    if (outputRef.current) {
      (outputRef.current as HTMLElement).scrollTop = (
        outputRef?.current as HTMLElement
      ).scrollHeight;
    }
  }, [output, error]);

  React.useEffect(() => {
    const container = outputRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = window.electron.app.os === 'darwin';
      const isStopCombo =
        (isMac && e.metaKey && e.key === 'c') ||
        (!isMac && e.ctrlKey && e.key === 'c');

      if (isStopCombo) {
        e.preventDefault();
        stop();
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    // eslint-disable-next-line consistent-return
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <TerminalContainer>
      <OutputBox
        ref={outputRef}
        tabIndex={0}
        style={{
          backgroundColor: terminalColors.bg,
          color: terminalColors.fg,
        }}
      >
        {output.map((line, index) => (
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
        {error.map((line, index) => (
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
