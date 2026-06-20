/**
 * AnalyticsEditor
 *
 * Full-featured Evidence-style analytics page editor with:
 * - Monaco markdown editor (left pane) with SQL autocomplete inside ```sql blocks
 * - Live preview pane (right) rendering markdown text, charts, and KPIs
 * - Auto-save with 1-second debounce (same pattern as NotebookEditor)
 * - "Run All Queries" engine that executes every ```sql block sequentially
 * - Ctrl+Shift+Enter keyboard shortcut to run all queries
 */
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { Box, Typography, IconButton, Tooltip, useTheme } from '@mui/material';
import {
  InsertChart,
  PlayArrow,
  ViewColumn,
  ViewStream,
} from '@mui/icons-material';
import MonacoEditor from '@monaco-editor/react';
import SplitPane, { Pane } from 'split-pane-react';
import 'split-pane-react/esm/themes/default.css';
import * as monaco from 'monaco-editor';
import {
  useGetAnalyticsPages,
  useUpdateAnalyticsPage,
} from '../../controllers/analyticsPages.controller';
import { useSchemaForConnection, useMonacoAutocomplete } from '../../hooks';
import { executeAnalyticsQuery } from '../../utils/analyticsQueryEngine';
import { parseAnalyticsMarkdown } from '../../utils/analyticsMarkdown';
import { AnalyticsPreview } from './AnalyticsPreview';
import { AnalyticsPreviewErrorBoundary } from './AnalyticsPreviewErrorBoundary';

interface AnalyticsEditorProps {
  connectionId: string;
  pageId: string;
  onSchemaChange?: () => void;
}

// Sash separator — same style used in notebooks/sql screens
const VerticalSash = (_: number, active: boolean) => (
  <Box
    sx={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: active ? 'primary.main' : 'transparent',
      transition: 'background-color 0.15s',
      '&:hover': { bgcolor: 'action.hover' },
      cursor: 'col-resize',
    }}
  >
    <Box
      sx={{
        width: 1,
        height: '60%',
        bgcolor: active ? 'primary.main' : 'divider',
        borderRadius: 1,
      }}
    />
  </Box>
);

// Module-level singleton for the markdown SQL completion provider.
// Re-uses the same singleton pattern as NotebookEditor.
let analyticsCompletionProvider: monaco.IDisposable | null = null;
const analyticsCompletionsRef = { current: [] as any[] };

export const AnalyticsEditor: React.FC<AnalyticsEditorProps> = ({
  connectionId,
  pageId,
  onSchemaChange,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const { data: pages = [] } = useGetAnalyticsPages(connectionId);
  const page = useMemo(
    () => pages.find((p) => p.id === pageId),
    [pages, pageId],
  );
  const updateAnalyticsPage = useUpdateAnalyticsPage();

  // ── Editor state ──────────────────────────────────────────────────────
  const [markdownContent, setMarkdownContent] = useState('');
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [splitOrientation, setSplitOrientation] = useState<
    'vertical' | 'horizontal'
  >('vertical');
  const [splitSizes, setSplitSizes] = useState<
    [number | string, number | string]
  >(['50%', '50%']);

  // ── Query execution state ─────────────────────────────────────────────
  const [queryCache, setQueryCache] = useState<Record<string, any[]>>({});
  const [queryStatuses, setQueryStatuses] = useState<
    Record<string, 'idle' | 'running' | 'success' | 'error'>
  >({});
  const [queryErrors, setQueryErrors] = useState<Record<string, string | null>>(
    {},
  );
  const [queryDurations, setQueryDurations] = useState<
    Record<string, number | undefined>
  >({});
  const [isRunningQueries, setIsRunningQueries] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingRef = useRef(false);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const completionProviderRef = useRef<monaco.IDisposable | null>(null);

  // ── Schema for SQL autocomplete ───────────────────────────────────────
  const { data: schemaData } = useSchemaForConnection(connectionId);
  const completions = useMonacoAutocomplete(
    schemaData?.tables || null,
    schemaData?.duckLakeSchema || null,
  );

  // Keep the singleton ref updated so the provider always uses fresh completions
  useEffect(() => {
    analyticsCompletionsRef.current = completions;
  }, [completions]);

  useEffect(() => {
    return () => {
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
      }
      analyticsCompletionProvider = null;
    };
  }, []);

  // ── Page data → editor sync ───────────────────────────────────────────
  useEffect(() => {
    if (page?.markdownContent !== undefined) {
      isSyncingRef.current = true;
      const ANALYTICS_STARTER_TEMPLATE = `---
title: My Analytics Page
---

# My Analytics Dashboard

Write your SQL queries below, then use component tags to visualize them.

\`\`\`sql orders
SELECT
  date_trunc('month', order_date) AS month,
  COUNT(*) AS order_count,
  SUM(total_amount) AS revenue
FROM orders
GROUP BY 1
ORDER BY 1
\`\`\`

<BarChart data={orders} x="month" y="revenue" title="Monthly Revenue" />

<DataTable data={orders} title="Orders by Month" />
`;
      const content = page.markdownContent || ANALYTICS_STARTER_TEMPLATE;
      setMarkdownContent(content);
      setIsEditorDirty(false);
      setTimeout(() => {
        isSyncingRef.current = false;
      }, 0);
    }
  }, [page?.id]);

  // ── Auto-save with 1s debounce ────────────────────────────────────────
  const handleMarkdownChange = useCallback(
    (value: string) => {
      setMarkdownContent(value);
      if (isSyncingRef.current) return;

      setIsEditorDirty(true);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        updateAnalyticsPage.mutate({
          connectionId,
          pageId,
          updates: { markdownContent: value },
        });
        setIsEditorDirty(false);
      }, 1000);
    },
    [connectionId, pageId, updateAnalyticsPage],
  );

  // Flush timer when switching pages to prevent cross-page writes
  useEffect(
    () => () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    },
    [pageId],
  );

  // ── Query execution engine ────────────────────────────────────────────
  const handleRunAllQueries = useCallback(async () => {
    if (isRunningQueries) return;

    const blocks = parseAnalyticsMarkdown(markdownContent);
    const sqlBlocks = blocks.filter((b) => b.type === 'sql') as Array<{
      type: 'sql';
      name: string;
      sql: string;
    }>;

    if (sqlBlocks.length === 0) return;

    setIsRunningQueries(true);

    // Reset all statuses to 'running'
    setQueryStatuses((prev) => {
      const next = { ...prev };
      sqlBlocks.forEach((b) => {
        next[b.name] = 'running';
      });
      return next;
    });

    // Execute each SQL block sequentially using reduce so we avoid for...of
    // (which requires regenerator-runtime) and satisfy no-await-in-loop.
    await sqlBlocks.reduce(
      (chain, block) =>
        chain.then(async () => {
          try {
            const result = await executeAnalyticsQuery({
              queryName: block.name,
              sql: block.sql,
              connectionId,
            });
            setQueryCache((prev) => ({
              ...prev,
              [block.name]: result.data,
            }));
            setQueryStatuses((prev) => ({
              ...prev,
              [block.name]: result.status,
            }));
            setQueryErrors((prev) => ({
              ...prev,
              [block.name]: result.error ?? null,
            }));
            setQueryDurations((prev) => ({
              ...prev,
              [block.name]: result.duration,
            }));

            if (
              onSchemaChange &&
              result.status === 'success' &&
              /^\s*(CREATE|DROP|ALTER|RENAME|TRUNCATE)/i.test(block.sql.trim())
            ) {
              onSchemaChange();
            }
            return undefined; // promise/always-return
          } catch (err: any) {
            setQueryStatuses((prev) => ({ ...prev, [block.name]: 'error' }));
            setQueryErrors((prev) => ({
              ...prev,
              [block.name]: err?.message ?? 'Unexpected error',
            }));
            return undefined; // promise/always-return
          }
        }),
      Promise.resolve(),
    );

    setIsRunningQueries(false);
  }, [isRunningQueries, markdownContent, connectionId, onSchemaChange]);

  // ── Run a single query (called from preview badge click) ─────────────
  const handleRunSingleQuery = useCallback(
    async (queryName: string, sql: string) => {
      setQueryStatuses((prev) => ({ ...prev, [queryName]: 'running' }));
      try {
        const result = await executeAnalyticsQuery({
          queryName,
          sql,
          connectionId,
        });
        setQueryCache((prev) => ({ ...prev, [queryName]: result.data }));
        setQueryStatuses((prev) => ({ ...prev, [queryName]: result.status }));
        setQueryErrors((prev) => ({
          ...prev,
          [queryName]: result.error ?? null,
        }));
        setQueryDurations((prev) => ({
          ...prev,
          [queryName]: result.duration,
        }));
      } catch (err: any) {
        setQueryStatuses((prev) => ({ ...prev, [queryName]: 'error' }));
        setQueryErrors((prev) => ({
          ...prev,
          [queryName]: err?.message ?? 'Error',
        }));
      }
    },
    [connectionId],
  );

  // ── Monaco editor mount ───────────────────────────────────────────────
  const handleEditorMount = useCallback(
    (
      editor: monaco.editor.IStandaloneCodeEditor,
      monacoInstance: typeof monaco,
    ) => {
      // Register SQL autocomplete inside ```sql...``` fences — singleton
      if (!analyticsCompletionProvider) {
        analyticsCompletionProvider =
          monacoInstance.languages.registerCompletionItemProvider('markdown', {
            provideCompletionItems: (model, position) => {
              const text = model.getValue();
              const offset = model.getOffsetAt(position);
              const before = text.slice(0, offset);

              // Count opens vs closes to determine if cursor is inside a ```sql block
              const opens = (before.match(/^```sql\s+\w*/gm) || []).length;
              const closes = (before.match(/^```\s*$/gm) || []).length;
              if (opens <= closes) return { suggestions: [] };

              const word = model.getWordUntilPosition(position);
              const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
              };
              return {
                suggestions: analyticsCompletionsRef.current.map((c) => ({
                  ...c,
                  range,
                })),
              };
            },
          });
        completionProviderRef.current = analyticsCompletionProvider;
      }

      editorRef.current = editor;

      // Ctrl/Cmd+Shift+Enter → run all queries
      /* eslint-disable no-bitwise */
      const runAllKey =
        monacoInstance.KeyMod.CtrlCmd |
        monacoInstance.KeyMod.Shift |
        monacoInstance.KeyCode.Enter;
      /* eslint-enable no-bitwise */
      editor.addCommand(runAllKey, () => {
        handleRunAllQueries();
      });
    },
    [handleRunAllQueries],
  );

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        flex: 1,
      }}
    >
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 0.75,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: 'background.paper',
          flexShrink: 0,
        }}
      >
        <InsertChart sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography
          variant="subtitle2"
          fontWeight={600}
          sx={{ flex: 1 }}
          noWrap
        >
          {page?.title ?? 'Analytics Page'}
        </Typography>

        {isEditorDirty && (
          <Typography variant="caption" color="text.secondary">
            Saving…
          </Typography>
        )}

        <Tooltip title="Run all SQL queries (Ctrl+Shift+Enter)">
          <span>
            <IconButton
              size="small"
              onClick={handleRunAllQueries}
              disabled={isRunningQueries}
              color={isRunningQueries ? 'primary' : 'default'}
            >
              <PlayArrow sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip
          title={
            splitOrientation === 'vertical'
              ? 'Switch to horizontal split'
              : 'Switch to vertical split'
          }
        >
          <IconButton
            size="small"
            onClick={() =>
              setSplitOrientation((o) =>
                o === 'vertical' ? 'horizontal' : 'vertical',
              )
            }
          >
            {splitOrientation === 'vertical' ? (
              <ViewColumn sx={{ fontSize: 18 }} />
            ) : (
              <ViewStream sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Editor + Preview Split ───────────────────────────────────── */}
      <Box
        sx={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}
      >
        <SplitPane
          split={splitOrientation}
          sizes={splitSizes}
          onChange={(sizes) =>
            setSplitSizes(sizes as [number | string, number | string])
          }
          sashRender={VerticalSash}
        >
          {/* Left / Top — Monaco Markdown Editor */}
          <Pane minSize={150}>
            <Box sx={{ height: '100%', overflow: 'hidden' }}>
              <MonacoEditor
                height="100%"
                width="100%"
                language="markdown"
                theme={isDarkMode ? 'vs-dark' : 'light'}
                value={markdownContent}
                onChange={(val) => handleMarkdownChange(val ?? '')}
                options={{
                  fontSize: 13,
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  occurrencesHighlight: 'off',
                  fixedOverflowWidgets: true,
                  padding: { top: 12 },
                }}
                onMount={handleEditorMount}
              />
            </Box>
          </Pane>

          {/* Right / Bottom — Live Preview */}
          <Pane minSize={150}>
            <AnalyticsPreviewErrorBoundary>
              <AnalyticsPreview
                markdownContent={markdownContent}
                queryCache={queryCache}
                queryStatuses={queryStatuses}
                queryErrors={queryErrors}
                queryDurations={queryDurations}
                onRunQuery={handleRunSingleQuery}
                pageId={pageId}
              />
            </AnalyticsPreviewErrorBoundary>
          </Pane>
        </SplitPane>
      </Box>
    </Box>
  );
};
