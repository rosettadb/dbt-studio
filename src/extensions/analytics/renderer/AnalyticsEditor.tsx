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
import {
  Box,
  Button,
  Chip,
  Typography,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  InsertChart,
  PlayArrow,
  ViewColumn,
  ViewStream,
  Code,
  CodeOff,
  ContentCopy,
} from '@mui/icons-material';
import { z } from 'zod';
import MonacoEditor from '@monaco-editor/react';
import SplitPane, { Pane } from 'split-pane-react';
import 'split-pane-react/esm/themes/default.css';
import * as monaco from 'monaco-editor';
import {
  useCreateAnalyticsPage,
  useGetAnalyticsPages,
  useUpdateAnalyticsPage,
} from './analyticsPages.controller';
import {
  useSchemaForConnection,
  useMonacoAutocomplete,
} from '../../../extensionApi/studio/hooks';
import { executeAnalyticsQuery } from './utils/analyticsQueryEngine';
import { AnalyticsPreview } from './AnalyticsPreview';
import {
  QueryExecutor,
  useAnalyticsPageRuntime,
} from './bi/runtime/useAnalyticsPageRuntime';
import { QueryStatusMenu } from './bi/ui/QueryStatusMenu';
import {
  duplicateMarkdown,
  executeExampleQuery,
  getExamplePage,
  requestOpenAnalyticsPage,
} from './bi/examples';
import { AnalyticsPreviewErrorBoundary } from './AnalyticsPreviewErrorBoundary';
import {
  AnalyticsEditorResultsSummary,
  registerAnalyticsEditorBridge,
} from './analyticsEditorBridge.service';
import {
  getAllComponentDefinitions,
  getComponentDefinition,
  getTier1ComponentNames,
} from './registry/analyticsComponentRegistry';

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
const ANALYTICS_BRIDGE_MAX_PREVIEW_ROWS = 5;

const ANALYTICS_STARTER_TEMPLATE = `---
title: My Analytics Page
---

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

export const AnalyticsEditor: React.FC<AnalyticsEditorProps> = ({
  connectionId,
  pageId,
  onSchemaChange,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const { data: pages = [] } = useGetAnalyticsPages(connectionId);
  // Read-only example dashboards are bundled, not stored.
  const example = useMemo(() => getExamplePage(pageId), [pageId]);
  const page = useMemo(
    () =>
      example
        ? {
            id: example.id,
            title: example.title,
            markdownContent: example.markdown,
          }
        : pages.find((p) => p.id === pageId),
    [example, pages, pageId],
  );
  const updateAnalyticsPage = useUpdateAnalyticsPage();
  const createAnalyticsPage = useCreateAnalyticsPage();

  // ── Editor state ──────────────────────────────────────────────────────
  const [markdownContent, setMarkdownContent] = useState('');
  // Page whose content is in `markdownContent`. Set in the same update as the
  // content, so the runtime never sees a new page id with the old markdown.
  const [loadedPageId, setLoadedPageId] = useState<string | null>(null);
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [splitOrientation, setSplitOrientation] = useState<
    'vertical' | 'horizontal'
  >('vertical');
  const [splitSizes, setSplitSizes] = useState<
    [number | string, number | string]
  >(['50%', '50%']);
  const [editorCollapsed, setEditorCollapsed] = useState(false);

  // ── Query execution + inputs (Plan 97 page runtime) ────────────────────
  const executeQuery = useCallback<QueryExecutor>(
    ({ queryName, sql, inputs }) =>
      example
        ? executeExampleQuery(example, { queryName, inputs })
        : executeAnalyticsQuery({ queryName, sql, connectionId }),
    [example, connectionId],
  );
  const runtime = useAnalyticsPageRuntime({
    markdown: markdownContent,
    execute: executeQuery,
    cacheScope: `${connectionId}|${loadedPageId ?? ''}`,
    // Wait until the example's own markdown is loaded before running it.
    autoRun: Boolean(example) && loadedPageId === pageId,
    onSchemaChange,
  });
  const queryCache = runtime.results;
  const queryStatuses = runtime.statuses;
  const queryErrors = runtime.errors;
  const queryDurations = runtime.durations;
  const isRunningQueries = runtime.isRunning;

  // ── Component snippet templates for slash commands ──────────────────
  const componentSnippets: Record<string, string> = {
    Value: `<Value data={} value="" fmt="" />`,
    BigValue: `<BigValue data={} value="" label="" fmt="" />`,
    Delta: `<Delta data={} value="" comparison="" />`,
    DataTable: `<DataTable data={} title="" />`,
    BarChart: `<BarChart data={} x="" y="" title="" />`,
    LineChart: `<LineChart data={} x="" y="" title="" />`,
    AreaChart: `<AreaChart data={} x="" y="" title="" />`,
    PieChart: `<PieChart data={} x="" y="" />`,
    DonutChart: `<DonutChart data={} x="" y="" />`,
    ScatterChart: `<ScatterChart data={} x="" y="" />`,
    Alert: `<Alert severity="info">\n  \n</Alert>`,
    Accordion: `<Accordion title="">\n  \n</Accordion>`,
    Tabs: `<Tabs>\n  <Tab title="First">\n    \n  </Tab>\n</Tabs>`,
    Tab: `<Tab title="">\n  \n</Tab>`,
    Grid: `<Grid columns={2}>\n  <Box>Item 1</Box>\n  <Box>Item 2</Box>\n</Grid>`,
    Stack: `<Stack spacing={2}>\n  <Box>Item</Box>\n  <Box>Item</Box>\n</Stack>`,
    Box: `<Box p={2}>\n  Content\n</Box>`,
    ButtonGroup: `<ButtonGroup options={} default="" />`,
    Select: `<Select data={} value="" label="" />`,
    DateRange: `<DateRange title="" />`,
    Checkbox: `<Checkbox label="" default={false} />`,
    NumberInput: `<NumberInput label="" default={0} />`,
    TextInput: `<TextInput label="" placeholder="" />`,
  };

  // ── Refs ──────────────────────────────────────────────────────────────
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingRef = useRef(false);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const completionProviderRef = useRef<monaco.IDisposable | null>(null);
  const hoverProviderRef = useRef<monaco.IDisposable | null>(null);
  const markdownContentRef = useRef('');
  const runAllQueriesRef = useRef<() => Promise<void>>(async () => undefined);

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
    markdownContentRef.current = markdownContent;
  }, [markdownContent]);

  useEffect(() => {
    return () => {
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
      }
      if (hoverProviderRef.current) {
        hoverProviderRef.current.dispose();
      }
      analyticsCompletionProvider = null;
    };
  }, []);

  // ── Page data → editor sync ───────────────────────────────────────────
  useEffect(() => {
    if (page?.markdownContent !== undefined) {
      isSyncingRef.current = true;
      const content = page.markdownContent || ANALYTICS_STARTER_TEMPLATE;
      setMarkdownContent(content);
      setLoadedPageId(page.id);
      setIsEditorDirty(false);
      setTimeout(() => {
        isSyncingRef.current = false;
      }, 0);
    }
  }, [page?.id]);

  // ── Auto-save with 1s debounce ────────────────────────────────────────
  const handleMarkdownChange = useCallback(
    (value: string) => {
      // Examples are read-only: never write them to the database.
      if (example) return;
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
    [connectionId, pageId, updateAnalyticsPage, example],
  );

  // Flush timer when switching pages to prevent cross-page writes
  useEffect(
    () => () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    },
    [pageId],
  );

  // ── Query execution ───────────────────────────────────────────────────
  const handleRunAllQueries = useCallback(async () => {
    await runtime.runAll();
  }, [runtime.runAll]);

  // Run a single query (called from a preview badge click)
  const handleRunSingleQuery = useCallback(
    async (queryName: string) => {
      await runtime.runQuery(queryName);
    },
    [runtime.runQuery],
  );

  const getBridgeResults = useCallback((): AnalyticsEditorResultsSummary => {
    const current = runtime.snapshot();
    const results = Object.fromEntries(
      Object.entries(current.results).map(([queryName, rows]) => {
        const safeRows = Array.isArray(rows) ? rows : [];
        const firstRow = safeRows[0];
        const columns =
          firstRow && typeof firstRow === 'object' ? Object.keys(firstRow) : [];

        return [
          queryName,
          {
            rowCount: safeRows.length,
            columns,
            rowsPreview: safeRows.slice(0, ANALYTICS_BRIDGE_MAX_PREVIEW_ROWS),
          },
        ];
      }),
    );

    return {
      statuses: current.statuses,
      errors: current.errors,
      durations: current.durations,
      results,
    };
  }, [runtime.snapshot]);

  useEffect(() => {
    runAllQueriesRef.current = handleRunAllQueries;
  }, [handleRunAllQueries]);

  useEffect(() => {
    return registerAnalyticsEditorBridge({
      getContent: () => markdownContentRef.current,
      setContent: (content) => {
        if (example) {
          throw new Error(
            `"${example.title}" is a read-only example. Ask the user to click "Duplicate to my pages" and open the copy first.`,
          );
        }
        handleMarkdownChange(content);
      },
      runQueries: () => runAllQueriesRef.current(),
      getResults: getBridgeResults,
    });
  }, [connectionId, pageId, handleMarkdownChange, getBridgeResults, example]);

  // ── Examples: copy into the user's pages ─────────────────────────────
  const handleDuplicateExample = useCallback(() => {
    if (!example || !connectionId) return;
    const slug = example.routePath.split('/').pop() ?? 'example';
    const existing = new Set(pages.map((p) => p.routePath));
    let routePath = `/${slug}`;
    let n = 2;
    while (existing.has(routePath)) {
      routePath = `/${slug}-${n}`;
      n += 1;
    }
    const title = n > 2 ? `${example.title} ${n - 1}` : example.title;
    createAnalyticsPage.mutate(
      {
        connectionId,
        data: {
          title,
          routePath,
          markdownContent: duplicateMarkdown(example, title),
        },
      },
      {
        onSuccess: (newPage: { id: string }) =>
          requestOpenAnalyticsPage(newPage.id),
      },
    );
  }, [example, connectionId, pages, createAnalyticsPage]);

  // ── Monaco editor mount ───────────────────────────────────────────────
  const handleEditorMount = useCallback(
    (
      editor: monaco.editor.IStandaloneCodeEditor,
      monacoInstance: typeof monaco,
    ) => {
      // Clean up any previous provider
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
        analyticsCompletionProvider = null;
      }

      // ── Register a single combined completion provider ──────────────
      analyticsCompletionProvider =
        monacoInstance.languages.registerCompletionItemProvider('markdown', {
          triggerCharacters: [' ', '.', '_', '/', '<'],
          provideCompletionItems: (model, position) => {
            const text = model.getValue();
            const offset = model.getOffsetAt(position);
            const before = text.slice(0, offset);
            const word = model.getWordUntilPosition(position);
            const lineContent = model.getLineContent(position.lineNumber);
            const linePrefix = lineContent.slice(0, position.column - 1);

            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: word.endColumn,
            };

            // ── Determine context ────────────────────────────────────
            // Count SQL fence opens vs closes
            const opens = (before.match(/^\s*```sql\s+\w*/gm) || []).length;
            const closes = (before.match(/^\s*```\s*$/gm) || []).length;
            const insideSqlFence = opens > closes;

            // ── Inside SQL fence: SQL completions ────────────────────
            if (insideSqlFence) {
              return {
                suggestions: analyticsCompletionsRef.current.map((c: any) => ({
                  ...c,
                  range,
                })),
              };
            }

            // ── Slash commands (at start of line) ────────────────────
            if (linePrefix.trim() === '/' || linePrefix.startsWith('/')) {
              if (linePrefix.trim() === '/') {
                const slashRange = {
                  startLineNumber: position.lineNumber,
                  endLineNumber: position.lineNumber,
                  startColumn: 1,
                  endColumn: position.column,
                };

                const componentNames = getTier1ComponentNames();
                const slashSuggestions = componentNames.map((name) => {
                  const def = getComponentDefinition(name);
                  const description = def?.description ?? '';
                  const snippetBody =
                    componentSnippets[name] ?? `<${name} data={} />`;
                  return {
                    label: `/${name}`,
                    kind: monacoInstance.languages.CompletionItemKind.Snippet,
                    detail: description,
                    insertText: snippetBody,
                    range: slashRange,
                  };
                });

                return { suggestions: slashSuggestions };
              }
              return { suggestions: [] };
            }

            // ── Inside or near a component tag ───────────────────────
            // Check if we're inside a <ComponentName ... > region
            const tagMatch = lineContent.match(/^\s*<([A-Z][A-Za-z]*)/);
            if (tagMatch) {
              const currentTag = tagMatch[1];

              // If no tag name yet (< followed by nothing), suggest component names
              if (!currentTag || lineContent.trim() === '<') {
                return {
                  suggestions: getAllComponentDefinitions().map((def) => ({
                    label: def.name,
                    kind: monacoInstance.languages.CompletionItemKind.Class,
                    detail: def.description,
                    insertText: `${def.name} data={} />`,
                    range,
                  })),
                };
              }

              // After tag name, suggest attributes
              const def = getComponentDefinition(currentTag);
              if (def && def.schema) {
                // eslint-disable-next-line no-underscore-dangle
                const schemaDef =
                  (def.schema as z.ZodObject<any>).shape?.() ?? {};
                const attrKeys = Object.keys(schemaDef);
                return {
                  suggestions: attrKeys.map((attr) => ({
                    label: attr,
                    kind: monacoInstance.languages.CompletionItemKind.Property,
                    // eslint-disable-next-line no-underscore-dangle
                    detail: `${attr} — ${(schemaDef[attr] as z.ZodTypeAny)?._def?.typeName ?? 'string'}`,
                    insertText: `${attr}=""`,
                    range,
                  })),
                };
              }
            }

            // ── General completion: component names after < ──────────
            const lessMatch = linePrefix.match(/<([A-Za-z]*)$/);
            if (lessMatch) {
              const partial = lessMatch[1] ?? '';
              return {
                suggestions: getAllComponentDefinitions()
                  .filter((def) =>
                    def.name.toLowerCase().startsWith(partial.toLowerCase()),
                  )
                  .map((def) => ({
                    label: def.name,
                    kind: monacoInstance.languages.CompletionItemKind.Class,
                    detail: def.description,
                    insertText: `${def.name} data={} />`,
                    range,
                  })),
              };
            }

            return { suggestions: [] };
          },
        });
      completionProviderRef.current = analyticsCompletionProvider;

      // ── Hover provider for component diagnostics ───────────────────
      hoverProviderRef.current?.dispose();
      hoverProviderRef.current = monacoInstance.languages.registerHoverProvider(
        'markdown',
        {
          provideHover: (model, position) => {
            const word = model.getWordAtPosition(position);
            if (!word) return null;
            const lineContent = model.getLineContent(position.lineNumber);

            // Check if the word is a component tag
            const tagMatch = lineContent.match(
              new RegExp(`<(${word.word})(\\s|>|/)`),
            );
            if (tagMatch) {
              const tagName = tagMatch[1];
              const def = getComponentDefinition(tagName);
              if (def) {
                return {
                  contents: [
                    { value: `**\`<${tagName}>\`**` },
                    { value: def.description },
                    { value: `*Category: ${def.category}*` },
                    {
                      value: def.supportsContent
                        ? '*Supports child content*'
                        : '*Self-closing component*',
                    },
                  ],
                };
              }
              return {
                contents: [
                  {
                    value: `**\`<${tagName}>\`** — Unknown component`,
                  },
                  {
                    value:
                      'This component is not registered in the analytics component registry.',
                  },
                ],
              };
            }
            return null;
          },
        },
      );

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

        {example && (
          <>
            <Chip
              size="small"
              label="Example · read-only"
              variant="outlined"
              sx={{ height: 22, fontSize: '0.7rem' }}
            />
            <Tooltip
              title={
                connectionId
                  ? 'Copy this example into your pages so you can edit it'
                  : 'Select a connection first; copies are saved with a connection'
              }
            >
              <span>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<ContentCopy sx={{ fontSize: 14 }} />}
                  onClick={handleDuplicateExample}
                  disabled={!connectionId || createAnalyticsPage.isLoading}
                  sx={{ textTransform: 'none', py: 0.25 }}
                >
                  Duplicate to my pages
                </Button>
              </span>
            </Tooltip>
          </>
        )}

        <QueryStatusMenu
          markdown={markdownContent}
          statuses={queryStatuses}
          errors={queryErrors}
          durations={queryDurations}
          results={queryCache}
          onRunQuery={handleRunSingleQuery}
        />

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
            disabled={editorCollapsed}
          >
            {splitOrientation === 'vertical' ? (
              <ViewColumn sx={{ fontSize: 18 }} />
            ) : (
              <ViewStream sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Tooltip>

        <Tooltip title={editorCollapsed ? 'Show editor' : 'Hide editor'}>
          <IconButton
            size="small"
            onClick={() => setEditorCollapsed((c) => !c)}
          >
            {editorCollapsed ? (
              <Code sx={{ fontSize: 18 }} />
            ) : (
              <CodeOff sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Editor + Preview Split ───────────────────────────────────── */}
      <Box
        sx={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}
      >
        {editorCollapsed ? (
          /* Preview-only mode — editor hidden, AI Agent bridge stays active */
          <AnalyticsPreviewErrorBoundary>
            <AnalyticsPreview
              markdownContent={markdownContent}
              queryCache={queryCache}
              queryStatuses={queryStatuses}
              queryErrors={queryErrors}
              queryDurations={queryDurations}
              onRunQuery={handleRunSingleQuery}
              pageId={pageId}
              inputs={runtime.inputs}
              onInputChange={runtime.setInput}
              showWarnings={!example}
            />
          </AnalyticsPreviewErrorBoundary>
        ) : (
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
                    readOnly: Boolean(example),
                    domReadOnly: Boolean(example),
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
                  inputs={runtime.inputs}
                  onInputChange={runtime.setInput}
                  showWarnings={!example}
                />
              </AnalyticsPreviewErrorBoundary>
            </Pane>
          </SplitPane>
        )}
      </Box>
    </Box>
  );
};
