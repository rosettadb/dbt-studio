import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import {
  parseAnalyticsMarkdown,
  extractFrontmatterTitle,
  type AnalyticsBlock,
} from '../../../extensionApi/studio/analyticsMarkdown';
import { AnalyticsComponentRenderer } from './AnalyticsComponentRenderer';
import { markdownComponents } from './bi/markdown/markdownComponents';
import { SqlBadge } from './bi/ui/placeholders';
import { BiPagePreview } from './bi/BiPagePreview';
import {
  usesLegacyEngine,
  type InputState,
  type InputValue,
} from '../../../extensionApi/studio/analyticsBi';

// Shared with the Plan 97 engine; SqlBadge is re-exported for old imports.
export { SqlBadge } from './bi/ui/placeholders';

// ─── Main Preview ──────────────────────────────────────────────────────────
interface LegacyPreviewProps {
  markdownContent: string;
  queryCache: Record<string, any[]>;
  queryStatuses: Record<string, 'idle' | 'running' | 'success' | 'error'>;
  queryErrors?: Record<string, string | null>;
  queryDurations?: Record<string, number | undefined>;
  onRunQuery?: (queryName: string, sql: string) => void;
  pageId?: string;
}

interface AnalyticsPreviewProps extends LegacyPreviewProps {
  /** Plan 97 engine: current input values. */
  inputs?: InputState;
  /** Plan 97 engine: called when a filter changes. Omit for read-only inputs. */
  onInputChange?: (name: string, value: InputValue) => void;
  /** Plan 97 engine: show attribute warnings (editor only). */
  showWarnings?: boolean;
}

const LegacyAnalyticsPreview: React.FC<LegacyPreviewProps> = ({
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
              rehypePlugins={[rehypeHighlight, rehypeRaw, rehypeSanitize]}
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
              onRunQuery={onRunQuery ?? undefined}
            />
          );
        }

        return null;
      })}
    </Box>
  );
};

/**
 * Renders a page with the Plan 97 engine, or with the previous renderer
 * when the page's frontmatter says `engine: legacy`.
 */
export const AnalyticsPreview: React.FC<AnalyticsPreviewProps> = ({
  markdownContent,
  queryCache,
  queryStatuses,
  queryErrors,
  queryDurations,
  onRunQuery,
  pageId,
  inputs,
  onInputChange,
  showWarnings,
}) => {
  if (usesLegacyEngine(markdownContent)) {
    return (
      <LegacyAnalyticsPreview
        markdownContent={markdownContent}
        queryCache={queryCache}
        queryStatuses={queryStatuses}
        queryErrors={queryErrors}
        queryDurations={queryDurations}
        onRunQuery={onRunQuery}
        pageId={pageId}
      />
    );
  }
  return (
    <BiPagePreview
      markdownContent={markdownContent}
      queryCache={queryCache}
      queryStatuses={queryStatuses}
      queryErrors={queryErrors}
      queryDurations={queryDurations}
      onRunQuery={onRunQuery}
      pageId={pageId}
      inputs={inputs}
      onInputChange={onInputChange}
      showWarnings={showWarnings}
    />
  );
};
