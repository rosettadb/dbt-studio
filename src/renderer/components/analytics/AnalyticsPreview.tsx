/**
 * AnalyticsPreview
 *
 * Live preview pane for the analytics editor. Parses the markdown content
 * into structured blocks and renders each one:
 *   - TextBlock  → MarkdownText (inline renderer)
 *   - SqlBlock   → SqlBadge (clickable, shows status + row count)
 *   - ComponentBlock → AnalyticsComponentRenderer (charts, tables, KPIs)
 */
import React from 'react';
import { Box, Typography, CircularProgress, useTheme } from '@mui/material';
import {
  parseAnalyticsMarkdown,
  extractFrontmatterTitle,
  type AnalyticsBlock,
} from '../../utils/analyticsMarkdown';
import { AnalyticsComponentRenderer } from './AnalyticsComponentRenderer';

// ─── Minimal Markdown Text Renderer ──────────────────────────────────────────
const MarkdownText: React.FC<{ content: string }> = ({ content }) => {
  const theme = useTheme();

  const renderInline = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    // eslint-disable-next-line no-cond-assign
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      if (m[2]) {
        const k = key;
        key += 1;
        parts.push(
          <strong key={k}>
            <em>{m[2]}</em>
          </strong>,
        );
      } else if (m[3]) {
        const k = key;
        key += 1;
        parts.push(<strong key={k}>{m[3]}</strong>);
      } else if (m[4]) {
        const k = key;
        key += 1;
        parts.push(<em key={k}>{m[4]}</em>);
      } else if (m[5]) {
        const k = key;
        key += 1;
        parts.push(
          <code
            key={k}
            style={{
              background: theme.palette.action.hover,
              padding: '1px 4px',
              borderRadius: 3,
              fontFamily: 'monospace',
              fontSize: '0.875em',
            }}
          >
            {m[5]}
          </code>,
        );
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      elements.push(<Box key={i} sx={{ height: 12 }} />);
    } else {
      const h1 = trimmed.match(/^#\s+(.+)/);
      const h2 = trimmed.match(/^##\s+(.+)/);
      const h3 = trimmed.match(/^###\s+(.+)/);
      const h4 = trimmed.match(/^####\s+(.+)/);

      if (h1) {
        elements.push(
          <Typography key={i} variant="h4" gutterBottom sx={{ mt: 2 }}>
            {renderInline(h1[1])}
          </Typography>,
        );
      } else if (h2) {
        elements.push(
          <Typography key={i} variant="h5" gutterBottom sx={{ mt: 2 }}>
            {renderInline(h2[1])}
          </Typography>,
        );
      } else if (h3) {
        elements.push(
          <Typography key={i} variant="h6" gutterBottom sx={{ mt: 1.5 }}>
            {renderInline(h3[1])}
          </Typography>,
        );
      } else if (h4) {
        elements.push(
          <Typography
            key={i}
            variant="subtitle1"
            fontWeight={600}
            gutterBottom
            sx={{ mt: 1 }}
          >
            {renderInline(h4[1])}
          </Typography>,
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        elements.push(
          <Box key={i} component="li" sx={{ ml: 2, lineHeight: 1.8 }}>
            <Typography variant="body2">
              {renderInline(trimmed.slice(2))}
            </Typography>
          </Box>,
        );
      } else if (trimmed.match(/^\d+\.\s/)) {
        const text = trimmed.replace(/^\d+\.\s/, '');
        elements.push(
          <Box key={i} component="li" sx={{ ml: 2, lineHeight: 1.8 }}>
            <Typography variant="body2">{renderInline(text)}</Typography>
          </Box>,
        );
      } else if (trimmed === '---' || trimmed === '***') {
        elements.push(
          <Box
            key={i}
            component="hr"
            sx={{
              border: 'none',
              borderTop: `1px solid ${theme.palette.divider}`,
              my: 2,
            }}
          />,
        );
      } else {
        elements.push(
          <Typography key={i} variant="body2" sx={{ lineHeight: 1.75 }}>
            {renderInline(trimmed)}
          </Typography>,
        );
      }
    }
  }

  return <Box>{elements}</Box>;
};

// ─── Clickable SQL Status Badge ───────────────────────────────────────────────
const SqlBadge: React.FC<{
  block: { name: string; sql: string };
  status: 'idle' | 'running' | 'success' | 'error';
  rowCount?: number;
  error?: string | null;
  duration?: number;
  onRun: (name: string, sql: string) => void;
}> = ({ block, status, rowCount, error, duration, onRun }) => {
  const theme = useTheme();

  const dot = {
    idle: <span style={{ color: theme.palette.text.disabled }}>○</span>,
    running: <CircularProgress size={10} sx={{ mt: '1px' }} />,
    success: <span style={{ color: '#4caf50' }}>●</span>,
    error: <span style={{ color: '#f44336' }}>●</span>,
  }[status];

  return (
    <Box
      onClick={() => onRun(block.name, block.sql)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 0.5,
        my: 0.5,
        borderRadius: 1,
        bgcolor: 'action.hover',
        fontSize: '0.75rem',
        cursor: 'pointer',
        userSelect: 'none',
        '&:hover': { bgcolor: 'action.selected' },
      }}
    >
      {dot}
      <Typography variant="caption" sx={{ fontFamily: 'monospace', flex: 1 }}>
        {block.name}
        {status === 'success' &&
          rowCount !== undefined &&
          ` — ${rowCount} row${rowCount !== 1 ? 's' : ''}`}
        {status === 'success' && duration !== undefined && (
          <Typography
            component="span"
            variant="caption"
            color="text.disabled"
            sx={{ ml: 0.5 }}
          >
            {duration > 1000
              ? `${(duration / 1000).toFixed(2)}s`
              : `${Math.round(duration)}ms`}
          </Typography>
        )}
      </Typography>
      {status === 'error' && error && (
        <Typography
          variant="caption"
          color="error.main"
          sx={{ fontSize: '0.65rem' }}
          noWrap
        >
          {error}
        </Typography>
      )}
      {status === 'idle' && (
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ fontSize: '0.65rem' }}
        >
          click to run
        </Typography>
      )}
    </Box>
  );
};

// ─── Main Preview ─────────────────────────────────────────────────────────────
interface AnalyticsPreviewProps {
  markdownContent: string;
  queryCache: Record<string, any[]>;
  queryStatuses: Record<string, 'idle' | 'running' | 'success' | 'error'>;
  queryErrors?: Record<string, string | null>;
  queryDurations?: Record<string, number | undefined>;
  onRunQuery?: (queryName: string, sql: string) => void;
  pageId?: string;
}

export const AnalyticsPreview: React.FC<AnalyticsPreviewProps> = ({
  markdownContent,
  queryCache,
  queryStatuses,
  queryErrors = {},
  queryDurations = {},
  onRunQuery,
  pageId,
}) => {
  const theme = useTheme();

  // Phase 6.1: Debounced Parsing
  const [blocks, setBlocks] = React.useState<AnalyticsBlock[]>(() =>
    parseAnalyticsMarkdown(markdownContent),
  );
  const [frontmatterTitle, setFrontmatterTitle] = React.useState<string>(
    () => extractFrontmatterTitle(markdownContent) ?? '',
  );

  const parseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isFirstRenderRef = React.useRef(true);

  React.useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return undefined;
    }
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    parseTimerRef.current = setTimeout(() => {
      setBlocks(parseAnalyticsMarkdown(markdownContent));
      setFrontmatterTitle(extractFrontmatterTitle(markdownContent) ?? '');
    }, 300);

    return () => {
      if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    };
  }, [markdownContent]);

  // Phase 6.7: Scroll to top on page change
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [pageId]);

  if (!markdownContent.trim()) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'text.secondary',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Start typing in the editor to see a live preview
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      ref={scrollContainerRef}
      sx={{
        flex: 1,
        overflow: 'auto',
        p: 3,
        bgcolor: theme.palette.mode === 'dark' ? '#121212' : '#fafafa',
        height: '100%',
      }}
    >
      {frontmatterTitle && (
        <Typography variant="h4" fontWeight={700} gutterBottom>
          {frontmatterTitle}
        </Typography>
      )}

      {blocks.map((block: AnalyticsBlock, i: number) => {
        if (block.type === 'text') {
          return <MarkdownText key={i} content={block.markdown} />;
        }

        if (block.type === 'sql') {
          const rowCount = queryCache[block.name]?.length;
          return (
            <SqlBadge
              key={i}
              block={block}
              status={queryStatuses[block.name] ?? 'idle'}
              rowCount={rowCount}
              error={queryErrors[block.name]}
              duration={queryDurations[block.name]}
              onRun={onRunQuery ?? (() => {})}
            />
          );
        }

        if (block.type === 'component') {
          return (
            <AnalyticsComponentRenderer
              key={i}
              tag={block.tag}
              rawProps={block.rawProps}
              queryCache={queryCache}
              queryStatuses={queryStatuses}
            />
          );
        }
        return null;
      })}
    </Box>
  );
};
