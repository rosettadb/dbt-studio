/**
 * Preview of an analytics page on the Plan 97 engine.
 *
 * Takes the same query state the old preview took, plus the page's input
 * state. Without `onInputChange` (e.g. the static export) inputs are shown
 * at their defaults and can't be changed.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import {
  buildPageGraph,
  defaultInputState,
  InputState,
  InputValue,
  ParsedPage,
  parsePage,
  QueryStatus,
} from './engine';
import { BiPageContext, BiPageContextValue } from './context';
import { NodeList } from './NodeList';

export interface BiPagePreviewProps {
  markdownContent: string;
  queryCache: Record<string, any[]>;
  queryStatuses: Record<string, QueryStatus>;
  queryErrors?: Record<string, string | null>;
  queryDurations?: Record<string, number | undefined>;
  onRunQuery?: (queryName: string, sql: string) => void;
  pageId?: string;
  inputs?: InputState;
  onInputChange?: (name: string, value: InputValue) => void;
  /** Show attribute warnings (editor). */
  showWarnings?: boolean;
  /**
   * Show a status row for each SQL block. Off by default; a page can turn it
   * on with `show_queries: true` in its frontmatter.
   */
  showQueries?: boolean;
  /** Debounce re-parsing while typing. */
  parseDelayMs?: number;
}

const EMPTY_ERRORS: Record<string, string | null> = {};
const EMPTY_DURATIONS: Record<string, number | undefined> = {};

export const BiPagePreview: React.FC<BiPagePreviewProps> = ({
  markdownContent,
  queryCache,
  queryStatuses,
  queryErrors = EMPTY_ERRORS,
  queryDurations = EMPTY_DURATIONS,
  onRunQuery,
  pageId,
  inputs,
  onInputChange,
  showWarnings = false,
  showQueries,
  parseDelayMs = 300,
}) => {
  const theme = useTheme();
  const [parsed, setParsed] = useState<ParsedPage>(() =>
    parsePage(markdownContent),
  );
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return undefined;
    }
    if (parseDelayMs <= 0) {
      setParsed(parsePage(markdownContent));
      return undefined;
    }
    const timer = setTimeout(
      () => setParsed(parsePage(markdownContent)),
      parseDelayMs,
    );
    return () => clearTimeout(timer);
  }, [markdownContent, parseDelayMs]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo?.({
      top: 0,
      behavior: 'instant' as 'auto',
    });
  }, [pageId]);

  const graph = useMemo(() => buildPageGraph(parsed.nodes), [parsed]);
  const queryNames = useMemo(() => new Set(graph.queries.keys()), [graph]);
  const fallbackInputs = useMemo(
    () => defaultInputState(graph.inputs),
    [graph],
  );

  const contextValue = useMemo<BiPageContextValue>(
    () => ({
      results: queryCache,
      statuses: queryStatuses,
      errors: queryErrors,
      durations: queryDurations,
      queryNames,
      inputs: inputs ?? fallbackInputs,
      setInput: onInputChange ?? (() => undefined),
      readOnlyInputs: !onInputChange,
      showWarnings,
      showQueries:
        showQueries ??
        ['true', 'yes'].includes(
          String(parsed.frontmatter.show_queries ?? '').toLowerCase(),
        ),
      onRunQuery: onRunQuery
        ? (name: string) => onRunQuery(name, graph.queries.get(name)?.sql ?? '')
        : undefined,
    }),
    [
      queryCache,
      queryStatuses,
      queryErrors,
      queryDurations,
      queryNames,
      inputs,
      fallbackInputs,
      onInputChange,
      showWarnings,
      showQueries,
      parsed,
      onRunQuery,
      graph,
    ],
  );

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

  const structural = showWarnings ? parsed.warnings : [];

  return (
    <BiPageContext.Provider value={contextValue}>
      <Box
        ref={scrollRef}
        data-testid="bi-page"
        sx={{
          flex: 1,
          overflow: 'auto',
          px: 3,
          py: 3,
          bgcolor: theme.palette.mode === 'dark' ? '#121212' : '#f7f8fa',
          height: '100%',
          // Grids follow the width of this pane, not the window.
          containerType: 'inline-size',
          containerName: 'bi-page',
        }}
      >
        <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
          {parsed.frontmatter.title && (
            <Typography variant="h4" fontWeight={700} gutterBottom>
              {parsed.frontmatter.title}
            </Typography>
          )}
          {structural.length > 0 && (
            <Box sx={{ mb: 2 }} data-testid="bi-structure-warnings">
              {structural.map((w, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <Typography
                  key={i}
                  variant="caption"
                  color="warning.main"
                  sx={{ display: 'block' }}
                >
                  ⚠ Line {w.line}: {w.message}
                </Typography>
              ))}
            </Box>
          )}
          <NodeList nodes={parsed.nodes} />
        </Box>
      </Box>
    </BiPageContext.Provider>
  );
};
