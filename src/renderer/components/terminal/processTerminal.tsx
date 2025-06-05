import React from 'react';
import { Typography } from '@mui/material';
import AnsiToHtml from 'ansi-to-html';
import { useProcess } from '../../hooks';
import { OutputBox, TerminalContainer } from './styles';

const ansiConverter = new AnsiToHtml({
  fg: '#fff',
  bg: '#1e1e1e',
  newline: true,
  escapeXML: true,
  stream: false,
});

const ProcessTerminal: React.FC = () => {
  const { output, error, stop } = useProcess();
  const outputRef = React.useRef<HTMLDivElement>(null);

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
      console.log(e);
      const isMac = window.electron.app.os === 'darwin';
      const isStopCombo =
        (isMac && e.metaKey && e.key === 'c') ||
        (!isMac && e.ctrlKey && e.key === 'c');

      console.log(isStopCombo);

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
      <OutputBox ref={outputRef} tabIndex={0}>
        {output.map((line, index) => (
          <Typography
            key={`out-${index}`}
            variant="body2"
            color="#fff"
            sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
            dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(line) }}
          />
        ))}
        {error.map((line, index) => (
          <Typography
            key={`err-${index}`}
            variant="body2"
            color="error"
            sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
            dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(line) }}
          />
        ))}
      </OutputBox>
    </TerminalContainer>
  );
};

export { ProcessTerminal };
