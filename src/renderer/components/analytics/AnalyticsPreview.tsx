import React from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  useTheme,
  Link,
} from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import type { Components } from 'react-markdown';
import {
  parseAnalyticsMarkdown,
  extractFrontmatterTitle,
  type AnalyticsBlock,
} from '../../utils/analyticsMarkdown';
import { AnalyticsComponentRenderer } from './AnalyticsComponentRenderer';

// ─── react-markdown component overrides ──────────────────────────────────
const markdownComponents: Components = {
  h1: ({ children }) => (
    <Typography variant="h4" gutterBottom sx={{ mt: 2 }}>
      {children}
    </Typography>
  ),
  h2: ({ children }) => (
    <Typography variant="h5" gutterBottom sx={{ mt: 2 }}>
      {children}
    </Typography>
  ),
  h3: ({ children }) => (
    <Typography variant="h6" gutterBottom sx={{ mt: 1.5 }}>
      {children}
    </Typography>
  ),
  h4: ({ children }) => (
    <Typography
      variant="subtitle1"
      fontWeight={600}
      gutterBottom
      sx={{ mt: 1 }}
    >
      {children}
    </Typography>
  ),
  p: ({ children }) => (
    <Typography variant="body2" sx={{ lineHeight: 1.75, mb: 1 }}>
      {children}
    </Typography>
  ),
  a: ({ children, href }) => (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      underline="hover"
    >
      {children}
    </Link>
  ),
  code: ({ children }) => (
    <code
      style={{
        background: 'rgba(0,0,0,0.06)',
        padding: '1px 4px',
        borderRadius: 3,
        fontFamily: 'monospace',
        fontSize: '0.875em',
      }}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <Box
      component="pre"
      sx={{
        bgcolor: 'action.hover',
        p: 1.5,
        borderRadius: 1,
        overflow: 'auto',
        fontSize: '0.8rem',
        fontFamily: 'monospace',
        mb: 1,
      }}
    >
      {children}
    </Box>
  ),
  blockquote: ({ children }) => (
    <Box
      component="blockquote"
      sx={{
        borderLeft: 3,
        borderColor: 'primary.main',
        pl: 2,
        my: 1,
        color: 'text.secondary',
        fontStyle: 'italic',
      }}
    >
      {children}
    </Box>
  ),
  hr: () => (
    <Box
      component="hr"
      sx={{ border: 'none', borderTop: 1, borderColor: 'divider', my: 2 }}
    />
  ),
  ul: ({ children }) => (
    <Box component="ul" sx={{ pl: 2, mb: 1 }}>
      {children}
    </Box>
  ),
  ol: ({ children }) => (
    <Box component="ol" sx={{ pl: 2, mb: 1 }}>
      {children}
    </Box>
  ),
  li: ({ children }) => (
    <Typography component="li" variant="body2" sx={{ lineHeight: 1.8 }}>
      {children}
    </Typography>
  ),
  table: ({ children }) => (
    <Box
      component="table"
      sx={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.8rem',
        mb: 1,
        '& th, & td': {
          border: 1,
          borderColor: 'divider',
          px: 1.5,
          py: 1,
          textAlign: 'left',
        },
        '& th': {
          fontWeight: 600,
          bgcolor: 'action.hover',
        },
      }}
    >
      {children}
    </Box>
  ),
};

// ─── Clickable SQL Status Badge ──────────────────────────────────────────
const SqlBadge: React.FC<{
  block: { name: string; sql: string };
  status: 'idle' | 'running' | 'success' | 'error';
  rowCount?: number;
  error?: string | null;
  duration?: number;
  onRun: (name: string, sql: string) => void;
}> = ({ block, status, rowCount, error, duration, onRun }) => {
  const theme = useTheme();

  const dot = (
    {
      idle: <span style={{ color: theme.palette.text.disabled }}>○</span>,
      running: <CircularProgress size={10} sx={{ mt: '1px' }} />,
      success: <span style={{ color: '#4caf50' }}>●</span>,
      error: <span style={{ color: '#f44336' }}>●</span>,
    } as Record<string, React.ReactNode>
  )[status];

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

// ─── Main Preview ──────────────────────────────────────────────────────────
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
          return (
            <ReactMarkdown
              key={i}
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight, rehypeRaw]}
              components={markdownComponents}
            >
              {block.markdown}
            </ReactMarkdown>
          );
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
              content={block.content}
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
