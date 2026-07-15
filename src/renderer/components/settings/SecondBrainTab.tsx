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
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useColorScheme,
} from '@mui/material';
import {
  Archive,
  CreateNewFolder,
  FolderOpen,
  Refresh,
  Restore,
  Save,
  Search,
  Stop,
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { toast } from 'react-toastify';
import type * as monaco from 'monaco-editor';
import { MonacoCodeEditor } from '../monaco/MonacoCodeEditor';
import { getMonaco } from '../../lib/monaco/bootstrap';
import {
  openSecondBrainFolder,
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
} from '../../controllers/secondBrain.controller';
import {
  useGetAISettings,
  useSaveAISettings,
} from '../../controllers/aiSettings.controller';
import type { SecondBrainTreeItem } from '../../../types/secondBrain';

type EditorMode = 'edit' | 'preview' | 'split';

const canonicalPages = new Set(['memory.md', 'preferences.md', 'workflows.md']);

const emptyMarkdown = (pageId: string) => {
  const title = pageId
    .split('/')
    .at(-1)!
    .replace(/\.md$/u, '')
    .replace(/[-_]+/gu, ' ')
    .replace(/^./u, (value) => value.toUpperCase());
  return `---
id: ${pageId.replace(/\.md$/u, '').replace(/\//gu, '-')}
title: ${title}
scope: global
updated_by: user
sources: []
---

# ${title}

`;
};

const MarkdownPreview: React.FC<{ content: string }> = ({ content }) => (
  <Box
    sx={{ height: '100%', overflow: 'auto', p: 2, bgcolor: 'background.paper' }}
  >
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
      {content}
    </ReactMarkdown>
  </Box>
);

export const SecondBrainTab: React.FC = () => {
  const { mode } = useColorScheme();
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
  const [modeValue, setModeValue] = React.useState<EditorMode>('edit');
  const [draft, setDraft] = React.useState('');
  const [dirty, setDirty] = React.useState(false);
  const dirtyRef = React.useRef(false);
  const savedContentRef = React.useRef('');
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
    if (!page || dirtyRef.current) return;
    savedContentRef.current = page.content;
    setDraft(page.content);
    if (model.getValue() !== page.content) model.setValue(page.content);
  }, [model, pageQuery.data]);

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
      !window.confirm('Discard the unsaved Second Brain draft?')
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
    model.setValue(content);
    dirtyRef.current = true;
    setDirty(true);
    setModeValue('edit');
  };

  const handleEditorMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
    const subscription = editor.onDidChangeModelContent(() => {
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
      toast.success('Second Brain page saved.');
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
      setLastRefreshMessage(
        result.status === 'no-change'
          ? 'No source changes; no model call or file write was made.'
          : `${result.operationsApplied} of ${result.operationsProposed} proposed changes applied.`,
      );
      if (kind === 'init' && settings) {
        await saveSettings.mutateAsync({
          ...settings,
          secondBrain: { ...settings.secondBrain, initialized: true },
        });
      }
      await statusQuery.refetch();
      await treeQuery.refetch();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const displayContent = selectedRevisionId
    ? (revisionQuery.data?.content ?? '')
    : draft;
  const readOnly = Boolean(selected?.archived || selectedRevisionId);
  const busy =
    initialize.isLoading || previewRefresh.isLoading || applyRefresh.isLoading;
  const visiblePages = search.trim()
    ? (searchQuery.data ?? [])
        .map((hit) =>
          treeQuery.data?.find((page) => page.pageId === hit.pageId),
        )
        .filter((page): page is SecondBrainTreeItem => Boolean(page))
    : (treeQuery.data ?? []);

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          gap={2}
        >
          <Box>
            <Typography variant="h6">Second Brain</Typography>
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
            <Tooltip title="Open the user-owned Second Brain folder">
              <span>
                <IconButton
                  onClick={() =>
                    openSecondBrainFolder().catch((error) =>
                      toast.error(error.message),
                    )
                  }
                  disabled={!status?.initialized}
                >
                  <FolderOpen />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Stack>
      </Paper>

      {!settings?.secondBrain.enabled && (
        <Alert severity="info">
          Enable Second Brain to let agents discover durable Markdown memory
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
                  inputProps={{ 'aria-label': 'Search Second Brain pages' }}
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
                      primary={item.title}
                      secondary={`${item.archived ? 'Archived · ' : ''}${item.pageId}`}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Box>

            <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                px={1.5}
                borderBottom={1}
                borderColor="divider"
              >
                <Tabs
                  value={modeValue}
                  onChange={(_, value) => setModeValue(value)}
                  aria-label="Second Brain editor mode"
                >
                  <Tab value="edit" label="Edit" disabled={readOnly} />
                  <Tab value="preview" label="Preview" />
                  <Tab value="split" label="Split" disabled={readOnly} />
                </Tabs>
                <Stack direction="row" alignItems="center" gap={1}>
                  {dirty && (
                    <Chip size="small" color="warning" label="Unsaved" />
                  )}
                  <Tooltip title="Save Markdown with expected revision hash">
                    <span>
                      <IconButton
                        onClick={handleSave}
                        disabled={!dirty || readOnly || writePage.isLoading}
                      >
                        <Save />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Stack>
              <Box sx={{ height: 560, display: 'flex', minWidth: 0 }}>
                {(modeValue === 'edit' || modeValue === 'split') &&
                  !readOnly && (
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <MonacoCodeEditor
                        model={model}
                        modelKey={newPageId ?? selected?.pageId ?? null}
                        theme={mode === 'dark' ? 'vs-dark' : 'light'}
                        readOnly={false}
                        options={{ wordWrap: 'on', tabSize: 2 }}
                        onMount={handleEditorMount}
                      />
                    </Box>
                  )}
                {(modeValue === 'preview' ||
                  modeValue === 'split' ||
                  readOnly) && (
                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      borderLeft: modeValue === 'split' ? 1 : 0,
                      borderColor: 'divider',
                    }}
                  >
                    <MarkdownPreview content={displayContent} />
                  </Box>
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
                      disabled={canonicalPages.has(pageQuery.data.pageId)}
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
                          setModeValue('preview');
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
