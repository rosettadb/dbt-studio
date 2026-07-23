/* eslint-disable no-alert -- destructive memory actions require explicit user confirmation */
import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Archive,
  Code,
  CreateNewFolder,
  DeleteSweep,
  Download,
  FolderOpen,
  PreviewOutlined,
  Refresh,
  Restore,
  Save,
  Search,
  Stop,
  Terminal,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import type * as monaco from 'monaco-editor';
import { MonacoCodeEditor } from '../monaco/MonacoCodeEditor';
import { FileIcon } from '../fileIcon';
import { MarkdownPreview } from '../editor/markdownPreview';
import {
  ModifiedDot,
  TabButton,
  TabIconSlot,
  TabTitle,
} from '../editor/tabManager/styles';
import { getMonaco } from '../../lib/monaco/bootstrap';
import {
  openSecondBrainWikiFolder,
  openSecondBrainWikiTerminal,
  useApplySecondBrainRefresh,
  useArchiveSecondBrainPage,
  useCancelSecondBrainRefresh,
  useInitializeSecondBrain,
  usePreviewSecondBrainRefresh,
  useRestoreSecondBrainPage,
  useSecondBrainPage,
  useSecondBrainProgress,
  useSecondBrainRevision,
  useSecondBrainRevisions,
  useSecondBrainSearch,
  useSecondBrainStatus,
  useSecondBrainTree,
  useWriteSecondBrainPage,
  useWikiMemorySupportStatus,
  useClearWikiMemorySupportData,
  previewWikiMemorySupportExport,
  exportWikiMemorySupportData,
} from '../../controllers/secondBrain.controller';
import {
  useGetAISettings,
  useSaveAISettings,
} from '../../controllers/aiSettings.controller';
import type { SecondBrainTreeItem } from '../../../types/secondBrain';

const canonicalPages = new Set(['memory.md', 'preferences.md', 'workflows.md']);

const emptyMarkdown = (pageId: string) => {
  const title = pageId
    .split('/')
    .at(-1)!
    .replace(/\.md$/u, '')
    .replace(/[-_]+/gu, ' ')
    .replace(/^./u, (value) => value.toUpperCase());
  return `---
type: Knowledge Note
id: ${pageId.replace(/\.md$/u, '').replace(/\//gu, '-')}
title: ${title}
description: Durable Wiki Memory knowledge.
scope: global
updated_by: user
sources: []
---

# ${title}

`;
};

export const SecondBrainTab: React.FC = () => {
  const theme = useTheme();
  const { data: settings } = useGetAISettings();
  const saveSettings = useSaveAISettings();
  const statusQuery = useSecondBrainStatus();
  const status = statusQuery.data;
  const treeQuery = useSecondBrainTree(Boolean(status?.initialized));
  const [selected, setSelected] = React.useState<SecondBrainTreeItem | null>(
    null,
  );
  const [newPageId, setNewPageId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [draft, setDraft] = React.useState('');
  const [dirty, setDirty] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);
  const dirtyRef = React.useRef(false);
  const savedContentRef = React.useRef('');
  const isApplyingExternalContentRef = React.useRef(false);
  const [selectedRevisionId, setSelectedRevisionId] = React.useState<
    string | undefined
  >();
  const [lastRefreshMessage, setLastRefreshMessage] = React.useState('');
  const pageQuery = useSecondBrainPage(
    selected?.pageId,
    Boolean(selected?.archived),
  );
  const revisionsQuery = useSecondBrainRevisions(
    selected && !selected.archived ? selected.pageId : undefined,
  );
  const revisionQuery = useSecondBrainRevision(
    selected?.pageId,
    selectedRevisionId,
  );
  const searchQuery = useSecondBrainSearch(
    search,
    Boolean(status?.initialized),
  );
  const writePage = useWriteSecondBrainPage();
  const archivePage = useArchiveSecondBrainPage();
  const restorePage = useRestoreSecondBrainPage();
  const initialize = useInitializeSecondBrain();
  const previewRefresh = usePreviewSecondBrainRefresh();
  const applyRefresh = useApplySecondBrainRefresh();
  const cancelRefresh = useCancelSecondBrainRefresh();
  const progress = useSecondBrainProgress();
  const supportQuery = useWikiMemorySupportStatus(Boolean(status?.initialized));
  const clearSupportData = useClearWikiMemorySupportData();
  const model = React.useMemo(() => {
    const monacoNs = getMonaco();
    return monacoNs.editor.createModel(
      '',
      'markdown',
      monacoNs.Uri.parse('inmemory://second-brain/active-page.md'),
    );
  }, []);

  React.useEffect(() => () => model.dispose(), [model]);

  React.useEffect(() => {
    const page = pageQuery.data;
    if (!page || selectedRevisionId || dirtyRef.current) return;
    savedContentRef.current = page.content;
    setDraft(page.content);
    if (model.getValue() !== page.content) {
      isApplyingExternalContentRef.current = true;
      model.setValue(page.content);
      isApplyingExternalContentRef.current = false;
    }
  }, [model, pageQuery.data, selectedRevisionId]);

  React.useEffect(() => {
    if (!selectedRevisionId || !revisionQuery.data) return;
    const { content } = revisionQuery.data;
    isApplyingExternalContentRef.current = true;
    model.setValue(content);
    isApplyingExternalContentRef.current = false;
  }, [model, revisionQuery.data, selectedRevisionId]);

  React.useEffect(() => {
    if (!selected && treeQuery.data?.length) {
      setSelected(
        treeQuery.data.find((page) => page.pageId === 'memory.md') ??
          treeQuery.data[0],
      );
    }
  }, [selected, treeQuery.data]);

  const selectPage = (item: SecondBrainTreeItem) => {
    if (
      dirtyRef.current &&
      !window.confirm('Discard the unsaved Wiki Memory draft?')
    ) {
      return;
    }
    dirtyRef.current = false;
    setDirty(false);
    setNewPageId(null);
    setSelectedRevisionId(undefined);
    setSelected(item);
  };

  const startNewPage = () => {
    const pageId = window.prompt(
      'New Markdown page ID (for example topics/revenue-rules.md)',
    );
    if (!pageId) return;
    if (
      !/^(?:topics|projects|connections|notebooks|analytics)\/[a-z0-9][a-z0-9/_-]*\.md$/u.test(
        pageId,
      )
    ) {
      toast.error('Use a safe Markdown page ID under an allowed folder.');
      return;
    }
    const content = emptyMarkdown(pageId);
    setSelected(null);
    setNewPageId(pageId);
    setSelectedRevisionId(undefined);
    setDraft(content);
    savedContentRef.current = '';
    isApplyingExternalContentRef.current = true;
    model.setValue(content);
    isApplyingExternalContentRef.current = false;
    dirtyRef.current = true;
    setDirty(true);
  };

  const handleEditorMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
    const subscription = editor.onDidChangeModelContent(() => {
      if (isApplyingExternalContentRef.current) return;
      const value = editor.getValue();
      const isDirty = value !== savedContentRef.current;
      setDraft(value);
      dirtyRef.current = isDirty;
      setDirty(isDirty);
    });
    return () => subscription.dispose();
  };

  const handleSave = async () => {
    const pageId = newPageId ?? selected?.pageId;
    if (!pageId || selected?.archived || selectedRevisionId) return;
    try {
      const saved = await writePage.mutateAsync({
        pageId,
        content: draft,
        expectedHash: newPageId ? undefined : pageQuery.data?.hash,
      });
      savedContentRef.current = saved.content;
      dirtyRef.current = false;
      setDraft(saved.content);
      setDirty(false);
      setNewPageId(null);
      setSelected({ ...saved, archived: false });
      toast.success('Wiki Memory page saved.');
    } catch (error) {
      const { code } = error as Error & { code?: string };
      toast.error(
        code === 'CONFLICT'
          ? 'The page changed elsewhere. Your Monaco draft has been preserved.'
          : (error as Error).message,
      );
    }
  };

  const handleEnable = async (enabled: boolean) => {
    if (!settings) return;
    await saveSettings.mutateAsync({
      ...settings,
      secondBrain: { ...settings.secondBrain, enabled },
    });
    await statusQuery.refetch();
  };

  const handleRefresh = async (kind: 'init' | 'preview' | 'apply') => {
    try {
      let response;
      if (kind === 'init') response = await initialize.mutateAsync();
      else if (kind === 'preview') {
        response = await previewRefresh.mutateAsync();
      } else response = await applyRefresh.mutateAsync();
      const { result } = response;
      let refreshMessage = `${result.operationsApplied} applied and ${result.operationsSkipped} skipped from ${result.operationsProposed} proposals.`;
      if (result.status === 'no-change') {
        refreshMessage =
          'No source changes; no model call or file write was made.';
      } else if (result.status === 'partial') {
        refreshMessage = `${result.operationsApplied} applied, ${result.operationsSkipped} skipped, and ${result.operationsFailed} failed.`;
      }
      setLastRefreshMessage(refreshMessage);
      if (kind === 'init' && settings) {
        await saveSettings.mutateAsync({
          ...settings,
          secondBrain: { ...settings.secondBrain, initialized: true },
        });
      }
      await statusQuery.refetch();
      await treeQuery.refetch();
      await supportQuery.refetch();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleExportSupportData = async () => {
    try {
      const preview = await previewWikiMemorySupportExport();
      const approved = window.confirm(
        `Export ${preview.sourceCount} source summaries and ${preview.diagnosticEventCount} diagnostic events? The export contains no wiki pages or raw source evidence.`,
      );
      if (!approved) return;
      const result = await exportWikiMemorySupportData();
      if (result.exported) {
        toast.success('Wiki Memory support data exported.');
      }
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleClearSupportData = async () => {
    const approved = window.confirm(
      'Clear source summaries and diagnostics? Wiki pages, archives, revisions, and refresh cursors will be preserved.',
    );
    if (!approved) return;
    try {
      await clearSupportData.mutateAsync();
      toast.success('Wiki Memory support data cleared.');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const readOnly = Boolean(
    selected?.archived || selected?.generated || selectedRevisionId,
  );
  const displayedContent = selectedRevisionId
    ? (revisionQuery.data?.content ?? '')
    : draft;
  const busy =
    initialize.isLoading || previewRefresh.isLoading || applyRefresh.isLoading;
  const visiblePages = search.trim()
    ? (searchQuery.data ?? [])
        .map((hit) =>
          treeQuery.data?.find((page) => page.pageId === hit.pageId),
        )
        .filter((page): page is SecondBrainTreeItem => Boolean(page))
    : (treeQuery.data ?? []);
  const displayPageTitle = (item: SecondBrainTreeItem) =>
    item.pageId === 'memory.md' || item.pageId === 'index.md'
      ? 'Wiki Memory'
      : item.title;

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          gap={2}
        >
          <Box>
            <Typography variant="h6">Wiki Memory</Typography>
            <Typography variant="body2" color="text.secondary">
              User-owned Markdown memory maintained through progressive
              discovery.
            </Typography>
          </Box>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(settings?.secondBrain.enabled)}
                  onChange={(_, checked) => handleEnable(checked)}
                />
              }
              label="Enabled"
            />
            <Chip
              size="small"
              color={status?.initialized ? 'success' : 'default'}
              label={
                status?.initialized
                  ? `${status.pageCount} pages`
                  : 'Not initialized'
              }
            />
            {status?.okfVersion && (
              <Chip
                size="small"
                variant="outlined"
                label={`OKF ${status.okfVersion}`}
              />
            )}
            <Tooltip title="Open the user-owned OKF wiki folder">
              <span>
                <IconButton
                  onClick={() =>
                    openSecondBrainWikiFolder().catch((error) =>
                      toast.error(error.message),
                    )
                  }
                  disabled={!status?.initialized}
                >
                  <FolderOpen />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Open terminal in the Wiki Memory folder">
              <span>
                <IconButton
                  onClick={() =>
                    openSecondBrainWikiTerminal().catch((error) =>
                      toast.error(error.message),
                    )
                  }
                  disabled={!status?.initialized}
                  aria-label="Open terminal in Wiki Memory folder"
                >
                  <Terminal />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Stack>
      </Paper>

      {!settings?.secondBrain.enabled && (
        <Alert severity="info">
          Enable Wiki Memory to let agents discover durable Markdown memory
          across sessions.
        </Alert>
      )}

      {settings?.secondBrain.enabled && !status?.initialized && (
        <Alert
          severity="info"
          action={
            <Button
              onClick={() => handleRefresh('init')}
              disabled={busy}
              startIcon={busy ? <CircularProgress size={16} /> : <Refresh />}
            >
              Initialize
            </Button>
          }
        >
          Initialization validates the active AI provider, creates the canonical
          Markdown pages, and imports bounded redacted evidence.
        </Alert>
      )}

      {settings?.secondBrain.enabled && status?.initialized && (
        <>
          <Alert severity="info">
            The portable long-term knowledge bundle is stored in{' '}
            <code>wiki/</code>. Concept pages are editable; generated{' '}
            <code>index.md</code> navigation is read-only. State, revisions,
            archive, sources, and maintenance logs are support data outside the
            bundle. The folder icon opens this user-owned OKF wiki bundle.
          </Alert>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              <Button
                variant="outlined"
                startIcon={<Search />}
                onClick={() => handleRefresh('preview')}
                disabled={busy}
              >
                Preview refresh
              </Button>
              <Button
                variant="contained"
                startIcon={busy ? <CircularProgress size={16} /> : <Refresh />}
                onClick={() => handleRefresh('apply')}
                disabled={busy}
              >
                Refresh memory
              </Button>
              {progress?.cancellable && (
                <Button
                  color="warning"
                  startIcon={<Stop />}
                  onClick={() => cancelRefresh.mutate(progress.operationId)}
                >
                  Cancel
                </Button>
              )}
              {progress && (
                <Chip
                  size="small"
                  label={`${progress.stage}: ${progress.message}`}
                />
              )}
              {lastRefreshMessage && (
                <Typography variant="body2" color="text.secondary">
                  {lastRefreshMessage}
                </Typography>
              )}
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack gap={1.5}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'stretch', md: 'center' }}
                gap={1}
              >
                <Box>
                  <Typography variant="subtitle2">Source health</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Sanitized provenance and bounded diagnostics. Raw chats,
                    SQL, notebook content, project files, prompts, credentials,
                    and absolute paths are never stored here.
                  </Typography>
                </Box>
                <Stack direction="row" gap={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Download />}
                    disabled={!supportQuery.data || busy || status?.busy}
                    onClick={handleExportSupportData}
                  >
                    Export
                  </Button>
                  <Button
                    size="small"
                    color="warning"
                    variant="outlined"
                    startIcon={<DeleteSweep />}
                    disabled={
                      clearSupportData.isLoading ||
                      busy ||
                      status?.busy ||
                      !supportQuery.data ||
                      (supportQuery.data.sources.length === 0 &&
                        supportQuery.data.diagnosticEventCount === 0)
                    }
                    onClick={handleClearSupportData}
                  >
                    Clear
                  </Button>
                </Stack>
              </Stack>
              <Stack direction="row" gap={1} flexWrap="wrap">
                {(supportQuery.data?.sources ?? []).map((source) => (
                  <Tooltip
                    key={source.sourceKind}
                    title={`Last attempt: ${new Date(source.lastAttemptedAt).toLocaleString()} · ${source.itemCount} items${source.truncated ? ' · truncated' : ''}`}
                  >
                    <Chip
                      size="small"
                      color={
                        source.result === 'failed' ||
                        source.result === 'partial'
                          ? 'warning'
                          : 'default'
                      }
                      label={`${source.sourceKind}: ${source.result}`}
                    />
                  </Tooltip>
                ))}
                {supportQuery.data?.sources.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Source summaries appear after the next refresh.
                  </Typography>
                )}
                {supportQuery.data && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${supportQuery.data.diagnosticEventCount} diagnostic events · ${supportQuery.data.retentionDays} day retention`}
                  />
                )}
              </Stack>
            </Stack>
          </Paper>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                lg: '260px minmax(0, 1fr) 240px',
              },
              minHeight: 620,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          >
            <Box sx={{ borderRight: { lg: 1 }, borderColor: 'divider', p: 1 }}>
              <Stack direction="row" gap={1} mb={1}>
                <TextField
                  size="small"
                  fullWidth
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search memory"
                  inputProps={{ 'aria-label': 'Search Wiki Memory pages' }}
                />
                <Tooltip title="Create Markdown page">
                  <IconButton onClick={startNewPage}>
                    <CreateNewFolder />
                  </IconButton>
                </Tooltip>
              </Stack>
              <List dense sx={{ maxHeight: 560, overflow: 'auto' }}>
                {visiblePages.map((item) => (
                  <ListItemButton
                    key={`${item.archived ? 'archive' : 'active'}:${item.pageId}`}
                    selected={
                      selected?.pageId === item.pageId &&
                      selected.archived === item.archived
                    }
                    onClick={() => selectPage(item)}
                  >
                    <ListItemText
                      primary={displayPageTitle(item)}
                      secondary={`${item.archived ? 'Archived · ' : ''}${item.generated ? 'Generated · ' : ''}${item.pageId}`}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Box>

            <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <Box
                sx={{
                  display: 'flex',
                  minHeight: 40,
                  bgcolor: 'background.paper',
                }}
              >
                <TabButton active isLast sx={{ flex: '0 1 auto' }}>
                  <TabIconSlot>
                    <FileIcon
                      fileName={newPageId ?? selected?.pageId ?? 'memory.md'}
                    />
                  </TabIconSlot>
                  <TabTitle>
                    {(newPageId ?? selected?.pageId ?? 'Select a page')
                      .split('/')
                      .at(-1)}
                  </TabTitle>
                  <ModifiedDot hidden={!dirty} />
                </TabButton>
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="flex-end"
                  gap={1}
                  sx={{ flex: 1, px: 1.5 }}
                >
                  <Tooltip
                    title={showPreview ? 'Close Preview' : 'Open Preview'}
                  >
                    <span>
                      <IconButton
                        onClick={() => setShowPreview((current) => !current)}
                        size="small"
                        sx={{
                          color: showPreview
                            ? 'primary.main'
                            : 'text.secondary',
                          bgcolor: showPreview
                            ? 'action.selected'
                            : 'transparent',
                          '&:hover': {
                            bgcolor: showPreview
                              ? 'action.selected'
                              : 'action.hover',
                          },
                        }}
                        aria-label={
                          showPreview
                            ? 'Close Markdown preview'
                            : 'Open Markdown preview'
                        }
                      >
                        {showPreview ? (
                          <Code fontSize="small" />
                        ) : (
                          <PreviewOutlined fontSize="small" />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Save Markdown with expected revision hash">
                    <span>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<Save sx={{ fontSize: 16 }} />}
                        onClick={handleSave}
                        disabled={!dirty || readOnly || writePage.isLoading}
                        sx={{ textTransform: 'none' }}
                      >
                        Save
                      </Button>
                    </span>
                  </Tooltip>
                </Stack>
              </Box>
              <Box
                sx={{
                  height: 560,
                  minWidth: 0,
                  borderTop: 1,
                  borderColor: 'divider',
                }}
              >
                {showPreview ? (
                  <MarkdownPreview content={displayedContent} />
                ) : (
                  <MonacoCodeEditor
                    model={model}
                    modelKey={newPageId ?? selected?.pageId ?? null}
                    theme={theme.palette.mode === 'dark' ? 'vs-dark' : 'light'}
                    readOnly={readOnly}
                    onMount={handleEditorMount}
                  />
                )}
              </Box>
            </Box>

            <Box sx={{ borderLeft: { lg: 1 }, borderColor: 'divider', p: 1.5 }}>
              <Typography variant="subtitle2">Page details</Typography>
              <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                {newPageId ?? selected?.pageId ?? 'Select a page'}
              </Typography>
              {pageQuery.data && (
                <>
                  <Typography variant="caption" color="text.secondary">
                    Updated{' '}
                    {new Date(pageQuery.data.modifiedAt).toLocaleString()}
                  </Typography>
                  <Divider sx={{ my: 1.5 }} />
                  {selected?.archived ? (
                    <Button
                      size="small"
                      startIcon={<Restore />}
                      onClick={async () => {
                        if (window.confirm('Restore this archived page?')) {
                          await restorePage.mutateAsync({
                            kind: 'archive',
                            pageId: selected.pageId,
                            expectedHash: pageQuery.data.hash,
                          });
                          setSelected({ ...selected, archived: false });
                        }
                      }}
                    >
                      Restore archived page
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      color="warning"
                      startIcon={<Archive />}
                      disabled={
                        readOnly || canonicalPages.has(pageQuery.data.pageId)
                      }
                      onClick={async () => {
                        if (
                          window.confirm(
                            'Archive this page? History will be retained.',
                          )
                        ) {
                          await archivePage.mutateAsync({
                            pageId: pageQuery.data.pageId,
                            expectedHash: pageQuery.data.hash,
                          });
                          setSelected({ ...pageQuery.data, archived: true });
                        }
                      }}
                    >
                      Archive
                    </Button>
                  )}
                </>
              )}
              {!selected?.archived && selected && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="subtitle2">Revisions</Typography>
                  <List dense>
                    {(revisionsQuery.data ?? []).map((revision) => (
                      <ListItemButton
                        key={revision.revisionId}
                        selected={selectedRevisionId === revision.revisionId}
                        onClick={() => {
                          setSelectedRevisionId(revision.revisionId);
                        }}
                      >
                        <ListItemText
                          primary={new Date(
                            revision.createdAt,
                          ).toLocaleString()}
                          secondary={`${revision.sizeBytes} bytes`}
                        />
                      </ListItemButton>
                    ))}
                  </List>
                  {selectedRevisionId && pageQuery.data && (
                    <Stack gap={1}>
                      <Button
                        size="small"
                        onClick={() => setSelectedRevisionId(undefined)}
                      >
                        Return to current
                      </Button>
                      <Button
                        size="small"
                        startIcon={<Restore />}
                        onClick={async () => {
                          if (
                            window.confirm('Restore this historical revision?')
                          ) {
                            await restorePage.mutateAsync({
                              kind: 'revision',
                              pageId: selected.pageId,
                              revisionId: selectedRevisionId,
                              expectedHash: pageQuery.data.hash,
                            });
                            setSelectedRevisionId(undefined);
                            await pageQuery.refetch();
                          }
                        }}
                      >
                        Restore revision
                      </Button>
                    </Stack>
                  )}
                </>
              )}
            </Box>
          </Box>
        </>
      )}
    </Stack>
  );
};
