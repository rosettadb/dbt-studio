/**
 * Python Cell Outputs
 * Renders nbformat outputs: stream text, errors (ANSI tracebacks), images,
 * sandboxed HTML (e.g. pandas DataFrames), markdown, JSON and plain text.
 */

import React, { useMemo, useRef, useState } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import AnsiToHtml from 'ansi-to-html';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  DisplayDataOutput,
  ExecuteResultOutput,
  MimeBundle,
  PythonCellOutput,
} from '../../../../types/pythonNotebooks';

const MIME_PRIORITY = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
  'text/html',
  'text/markdown',
  'application/json',
  'text/latex',
  'text/plain',
];

function pickMime(data: MimeBundle): string | null {
  return MIME_PRIORITY.find((mime) => data[mime] !== undefined) ?? null;
}

function useAnsi() {
  const theme = useTheme();
  return useMemo(
    () =>
      new AnsiToHtml({
        fg: theme.palette.text.primary,
        bg: 'transparent',
        newline: false,
        escapeXML: true,
        stream: false,
      }),
    [theme.palette.text.primary],
  );
}

const monoSx = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
  m: 0,
};

const HtmlOutput: React.FC<{ html: string }> = ({ html }) => {
  const theme = useTheme();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(40);

  const srcDoc = useMemo(() => {
    const color = theme.palette.text.primary;
    const border = theme.palette.divider;
    const headerBg =
      theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#f5f5f5';
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:4px 0;background:transparent;color:${color};
        font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
      table{border-collapse:collapse;font-size:12px}
      th,td{border:1px solid ${border};padding:2px 8px;text-align:right;white-space:nowrap}
      thead th{background:${headerBg};position:sticky;top:0}
      tbody th{text-align:left}
      a{color:inherit}
      img{max-width:100%}
    </style></head><body>${html}</body></html>`;
  }, [html, theme.palette]);

  return (
    <iframe
      ref={frameRef}
      title="html-output"
      // No scripts: `allow-same-origin` only, so we can measure the height.
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      onLoad={() => {
        const doc = frameRef.current?.contentDocument;
        if (doc) {
          setHeight(Math.min(doc.documentElement.scrollHeight + 8, 800));
        }
      }}
      style={{
        width: '100%',
        height,
        border: 'none',
        display: 'block',
        overflow: 'auto',
      }}
    />
  );
};

const RichOutput: React.FC<{
  output: DisplayDataOutput | ExecuteResultOutput;
}> = ({ output }) => {
  const mime = pickMime(output.data);
  if (!mime) return null;
  const value = output.data[mime];

  switch (mime) {
    case 'image/png':
    case 'image/jpeg':
    case 'image/gif':
      return (
        <img
          src={`data:${mime};base64,${String(value).replace(/\s/g, '')}`}
          alt="cell output"
          style={{ maxWidth: '100%', display: 'block' }}
        />
      );
    case 'image/svg+xml':
      return (
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(String(value))}`}
          alt="cell output"
          style={{ maxWidth: '100%', display: 'block' }}
        />
      );
    case 'text/html':
      return <HtmlOutput html={String(value)} />;
    case 'text/markdown':
      return (
        <Box sx={{ fontSize: 13, '& p': { my: 0.5 } }}>
          <Markdown remarkPlugins={[remarkGfm]}>{String(value)}</Markdown>
        </Box>
      );
    case 'application/json':
      return (
        <Box component="pre" sx={monoSx}>
          {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
        </Box>
      );
    default:
      return (
        <Box component="pre" sx={monoSx}>
          {String(value)}
        </Box>
      );
  }
};

interface PythonCellOutputsProps {
  outputs: PythonCellOutput[];
}

export const PythonCellOutputs: React.FC<PythonCellOutputsProps> = ({
  outputs,
}) => {
  const ansi = useAnsi();
  const theme = useTheme();

  if (outputs.length === 0) return null;

  return (
    <Box
      sx={{
        px: 1.5,
        py: 1,
        borderTop: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        overflowX: 'auto',
      }}
    >
      {outputs.map((output, index) => {
        const key = `${output.output_type}-${index}`;
        switch (output.output_type) {
          case 'stream':
            return (
              <Box
                key={key}
                component="pre"
                sx={{
                  ...monoSx,
                  color:
                    output.name === 'stderr'
                      ? theme.palette.warning.main
                      : 'text.primary',
                }}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: ansi.toHtml(output.text) }}
              />
            );
          case 'error':
            return (
              <Box
                key={key}
                sx={{
                  bgcolor:
                    theme.palette.mode === 'dark'
                      ? 'rgba(244,67,54,0.08)'
                      : 'rgba(244,67,54,0.06)',
                  borderLeft: '3px solid',
                  borderColor: 'error.main',
                  px: 1,
                  py: 0.5,
                  borderRadius: 0.5,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 600, color: 'error.main' }}
                >
                  {output.ename}
                  {output.evalue ? `: ${output.evalue}` : ''}
                </Typography>
                <Box
                  component="pre"
                  sx={monoSx}
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{
                    __html: ansi.toHtml(output.traceback.join('\n')),
                  }}
                />
              </Box>
            );
          case 'display_data':
          case 'execute_result':
            return (
              <Box key={key} sx={{ display: 'flex', gap: 1 }}>
                {output.output_type === 'execute_result' && (
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: 'monospace',
                      color: 'error.light',
                      minWidth: 44,
                      pt: 0.25,
                    }}
                  >
                    Out[{output.execution_count ?? ' '}]:
                  </Typography>
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <RichOutput output={output} />
                </Box>
              </Box>
            );
          default:
            return null;
        }
      })}
    </Box>
  );
};

export default PythonCellOutputs;
