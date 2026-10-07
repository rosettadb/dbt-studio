/**
 * Python Cell Outputs
 * Renders nbformat outputs: stream text, errors (ANSI tracebacks), images,
 * sandboxed HTML (e.g. pandas DataFrames), markdown, JSON and plain text.
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Clear,
  Close,
  ContentCopy,
  Fullscreen,
  MoreHoriz,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import AnsiToHtml from 'ansi-to-html';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DataFrameTableOutput } from './DataFrameTableOutput';
import {
  DATAFRAME_MIME,
  SQL_FALLBACK_MIME,
} from '../../../../types/pythonNotebooks';
import type {
  DataFrameCellValue,
  DataFrameTableInfo,
  DisplayDataOutput,
  ExecuteResultOutput,
  MimeBundle,
  PythonCellOutput,
  SqlFallbackInfo,
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

/** The DataFrame table payload, if the bundle carries a usable one. */
function getDataFrameInfo(data: MimeBundle): DataFrameTableInfo | null {
  const info = data[DATAFRAME_MIME] as DataFrameTableInfo | undefined;
  if (!info || typeof info !== 'object') return null;
  if (!Array.isArray(info.columns) || !Array.isArray(info.data)) return null;
  return info;
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

const HtmlOutput: React.FC<{
  html: string;
  /** Size the frame to its content's width instead of the full row. */
  fitContent?: boolean;
}> = ({ html, fitContent = false }) => {
  const theme = useTheme();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(40);
  const [width, setWidth] = useState<number | null>(null);

  const srcDoc = useMemo(() => {
    const color = theme.palette.text.primary;
    const border = theme.palette.divider;
    // The sticky header must be opaque, otherwise scrolled rows show through
    // it. In dark mode the tint is layered over the solid paper color.
    const headerBg =
      theme.palette.mode === 'dark'
        ? `linear-gradient(rgba(255,255,255,0.06),rgba(255,255,255,0.06)),${theme.palette.background.paper}`
        : '#f5f5f5';
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:4px 0;background:transparent;color:${color};
        font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
      table{border-collapse:collapse;font-size:12px}
      th,td{border:1px solid ${border};padding:2px 8px;text-align:right;white-space:nowrap}
      thead th{background:${headerBg};position:sticky;top:0;z-index:1}
      tbody th{text-align:left}
      a{color:inherit}
      img{max-width:100%}
      ${fitContent ? 'body{display:inline-block}' : ''}
    </style></head><body>${html}</body></html>`;
  }, [html, theme.palette, fitContent]);

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
          if (fitContent) {
            setWidth(Math.ceil(doc.body.getBoundingClientRect().width) + 2);
          }
        }
      }}
      style={{
        width: fitContent && width ? width : '100%',
        maxWidth: '100%',
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

/**
 * Shown above a SQL cell result that came back as a list of dicts because
 * pandas is not installed in the notebook environment.
 */
const PandasMissingNotice: React.FC<{
  info: SqlFallbackInfo;
  onInstall?: () => void;
  installing?: boolean;
}> = ({ info, onInstall, installing }) => (
  <Alert
    severity="info"
    sx={{ py: 0, fontSize: 12, alignItems: 'center' }}
    action={
      onInstall && (
        <Button
          size="small"
          onClick={onInstall}
          disabled={installing}
          sx={{ textTransform: 'none', fontSize: 12 }}
          data-testid="python-cell-install-pandas"
        >
          {installing ? 'Installing…' : 'Install pandas'}
        </Button>
      )
    }
  >
    pandas is not installed, so <code>{info.variable}</code> is a list of dicts.
    Install pandas to get a DataFrame.
  </Alert>
);

const ANSI_ESCAPES = /\u001b\[[0-9;]*m/g; // eslint-disable-line no-control-regex

function dataFrameToTsv(info: DataFrameTableInfo): string {
  const text = (value: DataFrameCellValue | undefined) =>
    value === null || value === undefined
      ? ''
      : String(value).replace(/[\t\n]/g, ' ');
  const lines = [[info.indexName, ...info.columns].map(text).join('\t')];
  info.data.forEach((row, position) => {
    lines.push([info.index?.[position], ...row].map(text).join('\t'));
  });
  return lines.join('\n');
}

/**
 * Plain text of a cell's outputs, for "Copy cell output". DataFrames become
 * tab-separated rows (paste into a spreadsheet); other rich outputs use their
 * `text/plain` form.
 */
export function outputsToText(outputs: PythonCellOutput[]): string {
  return outputs
    .map((output) => {
      switch (output.output_type) {
        case 'stream':
          return output.text.replace(/\n$/, '');
        case 'error':
          return [`${output.ename}: ${output.evalue}`, ...output.traceback]
            .join('\n')
            .replace(ANSI_ESCAPES, '');
        case 'display_data':
        case 'execute_result': {
          const info = getDataFrameInfo(output.data);
          if (info) return dataFrameToTsv(info);
          const plain =
            output.data['text/plain'] ?? output.data['text/markdown'];
          return typeof plain === 'string' ? plain : '';
        }
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Copy by setting the text in a one-off `copy` listener. `navigator.clipboard`
 * is unreliable in the context-isolated renderer (FE-04) and there is no
 * clipboard IPC bridge yet; `execCommand('copy')` works inside a user gesture
 * such as a menu click. Selecting a hidden textarea instead doesn't work here:
 * the still-open menu's focus trap takes focus back, so nothing is selected.
 * The listener runs in the capture phase and stops the event: if a code editor
 * holds the selection, its own copy handler would add the code as HTML, which
 * Excel pastes instead of the text.
 */
function copyText(text: string): boolean {
  let copied = false;
  const onCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
    event.stopPropagation();
    copied = true;
  };
  document.addEventListener('copy', onCopy, true);
  try {
    document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    document.removeEventListener('copy', onCopy, true);
  }
  return copied;
}

interface OutputListProps {
  outputs: PythonCellOutput[];
  /** Install pandas into the notebook env and re-run the cell (sql cells). */
  onInstallPandas?: () => void;
  installingPandas?: boolean;
  /** Fullscreen: stretch a single DataFrame output to the full height. */
  fillHeight?: boolean;
}

/** The outputs themselves, one under the other. */
const OutputList: React.FC<OutputListProps> = ({
  outputs,
  onInstallPandas,
  installingPandas,
  fillHeight = false,
}) => {
  // Fullscreen: a single DataFrame output takes all the available height.
  const fill = fillHeight && outputs.length === 1;
  const ansi = useAnsi();
  const theme = useTheme();
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
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
                dangerouslySetInnerHTML={{
                  __html: ansi.toHtml(output.text),
                }}
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
          case 'execute_result': {
            const fallback = output.data[SQL_FALLBACK_MIME] as
              | SqlFallbackInfo
              | undefined;
            const dataFrame = getDataFrameInfo(output.data);
            const html = output.data['text/html'];
            return (
              <Box
                key={key}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                  ...(fill && { flex: 1, minHeight: 0 }),
                }}
              >
                {fallback && (
                  <PandasMissingNotice
                    info={fallback}
                    onInstall={onInstallPandas}
                    installing={installingPandas}
                  />
                )}
                {/* No `Out[n]:` label (as in Colab): every output starts at
                        the same left edge; the cell gutter shows the count. */}
                <Box
                  sx={{ minWidth: 0, ...(fill && { flex: 1, minHeight: 0 }) }}
                >
                  {dataFrame ? (
                    <DataFrameTableOutput
                      fillHeight={fill}
                      info={dataFrame}
                      html={
                        typeof html === 'string' ? (
                          <HtmlOutput html={html} fitContent />
                        ) : undefined
                      }
                    />
                  ) : (
                    <RichOutput output={output} />
                  )}
                </Box>
              </Box>
            );
          }
          default:
            return null;
        }
      })}
    </Box>
  );
};

interface PythonCellOutputsProps extends Omit<OutputListProps, 'fillHeight'> {
  /** Outputs are hidden behind a one-line summary (Colab-style). */
  collapsed?: boolean;
  /** Clicking the "N outputs hidden" summary shows the outputs again. */
  onExpand?: () => void;
  /** Adds "Clear output" to the output actions menu. */
  onClearOutputs?: () => void;
}

const menuItemSx = { fontSize: 13, py: 0.5, minHeight: 'auto' } as const;
const menuIconSx = { fontSize: 16, mr: 1 } as const;

/**
 * Output section of a cell: a ••• actions menu on the left (copy, clear,
 * fullscreen, as in Colab) and the outputs, or a one-line summary while they
 * are hidden. The hide / show chevron lives in the cell's gutter.
 */
export const PythonCellOutputs: React.FC<PythonCellOutputsProps> = ({
  outputs,
  onInstallPandas,
  installingPandas,
  collapsed = false,
  onExpand,
  onClearOutputs,
}) => {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  if (outputs.length === 0) return null;

  const closeMenu = () => setMenuAnchor(null);
  const hiddenSummary = `${outputs.length} output${
    outputs.length === 1 ? '' : 's'
  } hidden`;

  const handleCopy = () => {
    closeMenu();
    if (copyText(outputsToText(outputs))) {
      toast.success('Output copied');
      return;
    }
    toast.error('Could not copy the output');
  };

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 0.5,
          pl: 0.5,
          pr: 1.5,
          py: collapsed ? 0.25 : 0.75,
        }}
      >
        <Tooltip title="Output actions">
          <IconButton
            size="small"
            aria-label="Output actions"
            onClick={(e) => {
              e.stopPropagation();
              setMenuAnchor(e.currentTarget);
            }}
            data-testid="python-cell-output-menu"
            sx={{ p: 0.25 }}
          >
            <MoreHoriz sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        {collapsed ? (
          <Typography
            variant="caption"
            color="text.secondary"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onExpand?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onExpand?.();
            }}
            data-testid="python-cell-outputs-hidden"
            sx={{ cursor: 'pointer', alignSelf: 'center' }}
          >
            {hiddenSummary}
          </Typography>
        ) : (
          <OutputList
            outputs={outputs}
            onInstallPandas={onInstallPandas}
            installingPandas={installingPandas}
          />
        )}
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem
          onClick={handleCopy}
          sx={menuItemSx}
          data-testid="python-cell-output-copy"
        >
          <ContentCopy sx={menuIconSx} /> Copy cell output
        </MenuItem>
        {onClearOutputs && (
          <MenuItem
            onClick={() => {
              closeMenu();
              onClearOutputs();
            }}
            sx={menuItemSx}
            data-testid="python-cell-output-clear"
          >
            <Clear sx={menuIconSx} /> Clear output
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            closeMenu();
            setFullscreen(true);
          }}
          sx={menuItemSx}
          data-testid="python-cell-output-fullscreen"
        >
          <Fullscreen sx={menuIconSx} /> View output fullscreen
        </MenuItem>
      </Menu>

      <Dialog
        fullScreen
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        onClick={(e) => e.stopPropagation()}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            Cell output
          </Typography>
          <Tooltip title="Close (Esc)">
            <IconButton
              size="small"
              aria-label="Close fullscreen output"
              onClick={() => setFullscreen(false)}
              data-testid="python-cell-output-fullscreen-close"
            >
              <Close fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box
          sx={{
            p: 2,
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <OutputList
            fillHeight
            outputs={outputs}
            onInstallPandas={onInstallPandas}
            installingPandas={installingPandas}
          />
        </Box>
      </Dialog>
    </>
  );
};

export default PythonCellOutputs;
