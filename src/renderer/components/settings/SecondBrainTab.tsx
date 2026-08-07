/* eslint-disable no-alert -- destructive memory actions require explicit user confirmation */
import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Archive,
  Code,
  CreateNewFolder,
  FolderOpen,
  PreviewOutlined,
  Refresh,
  Restore,
  Save,
  Search,
  Stop,
  Terminal,
  WarningAmber,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import type * as monaco from 'monaco-editor';
import { useNavigate } from 'react-router-dom';
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
  useClearAndDisableSecondBrain,
  useInitializeSecondBrain,
  usePauseSecondBrain,
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
import {
  useGetAIProviders,
  useGetActiveAIProvider,
  useSetActiveAIProvider,
} from '../../controllers/aiProviders.controller';
import { useGetSelectedProject } from '../../controllers/projects.controller';
import {
  type SecondBrainProgressEvent,
  type SecondBrainRefreshResult,
  type SecondBrainTreeItem,
} from '../../../types/secondBrain';
import {
  AGENT_MEMORY_ENTRY_FILE,
  PROJECT_AGENT_CONTEXT_FILE,
} from '../../../shared/agentMemoryConstants';
import {
  aiProviderImages,
  defaultIcon,
} from '../../../../assets/connectionIcons';
import {
  getSecondBrainOperationTitle,
  getSecondBrainProgressMessage,
  getSecondBrainProviderTooltip,
  isCurrentSecondBrainProgress,
  isSecondBrainTerminalStage,
  SECOND_BRAIN_GENERATION_HELPERS,
  type SecondBrainOperationKind,
} from './secondBrainOperationUi';

const canonicalPages = new Set([
  AGENT_MEMORY_ENTRY_FILE,
  'preferences.md',
  'workflows.md',
]);

const projectMemoryEnabledKey = (projectId: number | string) =>
  `project-memory-enabled:${projectId}`;

type SecondBrainOperationDialogState = {
  kind: SecondBrainOperationKind;
  phase: 'running' | 'stopping' | 'succeeded' | 'failed' | 'cancelled';
  startedAt: number;
  providerName: string;
  operationId?: string;
  progress?: SecondBrainProgressEvent;
  result?: SecondBrainRefreshResult;
  error?: string;
  stopError?: string;
};

const getOperationPrimaryMessage = (
  operation: SecondBrainOperationDialogState | null,
): string => {
  if (operation?.phase === 'failed') {
    return 'Agent Memory could not be updated.';
  }
  if (operation?.phase === 'cancelled') {
    return 'Agent Memory operation stopped.';
  }
  if (operation?.phase === 'succeeded') return 'Agent Memory is ready.';
  return getSecondBrainProgressMessage(
    operation?.progress,
    operation?.phase === 'stopping',
  );
};

const getOperationResultMessage = (
  result?: SecondBrainRefreshResult,
): string | undefined => {
  if (!result) return undefined;
  if (result.status === 'no-change') {
    return 'No source changes were found. No model call or memory write was needed.';
  }
  return `${result.operationsApplied} applied, ${result.operationsSkipped} skipped, and ${result.operationsFailed} failed from ${result.operationsProposed} proposals.`;
};

const memorySwitchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': {
    color: 'success.main',
  },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
    backgroundColor: 'success.main',
    opacity: 0.55,
  },
  '& .MuiSwitch-switchBase.Mui-checked:hover': {
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
  },
};

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
description: Durable Agent Memory knowledge.
scope: global
updated_by: user
sources: []
---

# ${title}

`;
};

export const SecondBrainTab: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const prefersReducedMotion = useMediaQuery(
    '(prefers-reduced-motion: reduce)',
  );
  const { data: settings } = useGetAISettings();
  const saveSettings = useSaveAISettings();
  const {
    data: providers = [],
    isLoading: providersLoading,
    error: providersError,
  } = useGetAIProviders();
  const {
    data: activeProvider,
    isLoading: activeProviderLoading,
    error: activeProviderError,
  } = useGetActiveAIProvider();
  const setActiveProvider = useSetActiveAIProvider();
  const statusQuery = useSecondBrainStatus();
  const status = statusQuery.data;
  const treeQuery = useSecondBrainTree(Boolean(status?.initialized));
  const [selected, setSelected] = React.useState<SecondBrainTreeItem | null>(
    null,
  );
  const [newPageId, setNewPageId] = React.useState<string | null>(null);
  const [newPageDialogOpen, setNewPageDialogOpen] = React.useState(false);
  const [newPageInput, setNewPageInput] = React.useState('');
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
  const pauseMemory = usePauseSecondBrain();
  const clearAndDisableMemory = useClearAndDisableSecondBrain();
  const cancelRefresh = useCancelSecondBrainRefresh();
  const { progress, clearProgress } = useSecondBrainProgress();
  const [providerSelectionError, setProviderSelectionError] =
    React.useState<string>();
  const [operationDialog, setOperationDialog] =
    React.useState<SecondBrainOperationDialogState | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [generationHelperIndex, setGenerationHelperIndex] = React.useState(0);
  const [memorySettingsTab, setMemorySettingsTab] = React.useState<
    'global' | 'project'
  >('global');
  const [disableDialogOpen, setDisableDialogOpen] = React.useState(false);
  const [disableMode, setDisableMode] = React.useState<'pause' | 'clear'>(
    'pause',
  );
  const [clearConfirmOpen, setClearConfirmOpen] = React.useState(false);
  const { data: selectedProject } = useGetSelectedProject();
  const selectedProjectId = selectedProject?.id as number | string | undefined;
  const projectMemoryEnabledStorageKey =
    selectedProjectId !== undefined
      ? projectMemoryEnabledKey(selectedProjectId)
      : undefined;
  const [projectMemoryEnabled, setProjectMemoryEnabled] = React.useState(true);
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
    if (!projectMemoryEnabledStorageKey) {
      setProjectMemoryEnabled(false);
      return;
    }
    setProjectMemoryEnabled(
      localStorage.getItem(projectMemoryEnabledStorageKey) !== 'false',
    );
  }, [projectMemoryEnabledStorageKey]);

  const operationActive =
    operationDialog?.phase === 'running' ||
    operationDialog?.phase === 'stopping';

  React.useEffect(() => {
    if (!operationDialog || !operationActive || !progress) return;
    if (
      !isCurrentSecondBrainProgress(
        progress,
        operationDialog.operationId,
        operationDialog.startedAt,
      )
    ) {
      return;
    }
    setOperationDialog((current) => {
      if (
        !current ||
        current.progress === progress ||
        !isCurrentSecondBrainProgress(
          progress,
          current.operationId,
          current.startedAt,
        )
      ) {
        return current;
      }
      return {
        ...current,
        operationId: current.operationId ?? progress.operationId,
        progress,
      };
    });
  }, [
    operationActive,
    operationDialog?.operationId,
    operationDialog?.startedAt,
    progress,
  ]);

  React.useEffect(() => {
    if (!operationDialog || !operationActive) {
      setElapsedSeconds(0);
      return undefined;
    }
    const updateElapsed = () =>
      setElapsedSeconds(
        Math.max(
          0,
          Math.floor((Date.now() - operationDialog.startedAt) / 1000),
        ),
      );
    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(intervalId);
  }, [operationActive, operationDialog?.startedAt]);

  React.useEffect(() => {
    const generating =
      operationActive && operationDialog?.progress?.stage === 'generating';
    setGenerationHelperIndex(0);
    if (!generating || prefersReducedMotion) return undefined;
    const intervalId = window.setInterval(
      () =>
        setGenerationHelperIndex(
          (current) => (current + 1) % SECOND_BRAIN_GENERATION_HELPERS.length,
        ),
      6_000,
    );
    return () => window.clearInterval(intervalId);
  }, [operationActive, operationDialog?.progress?.stage, prefersReducedMotion]);

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
        treeQuery.data.find(
          (page) => page.pageId === AGENT_MEMORY_ENTRY_FILE,
        ) ?? treeQuery.data[0],
      );
    }
  }, [selected, treeQuery.data]);

  const selectPage = (item: SecondBrainTreeItem) => {
    if (
      dirtyRef.current &&
      !window.confirm('Discard the unsaved Agent Memory draft?')
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
    setNewPageInput('');
    setNewPageDialogOpen(true);
  };

  const confirmNewPage = () => {
    const pageId = newPageInput.trim();
    if (!pageId) return;
    if (
      !/^(?:topics|projects|connections|notebooks|analytics)\/[a-z0-9][a-z0-9/_-]*\.md$/u.test(
        pageId,
      )
    ) {
      toast.error('Use a safe Markdown page ID under an allowed folder.');
      return;
    }
    setNewPageDialogOpen(false);
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
      toast.success('Agent Memory page saved.');
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
    if (!enabled) {
      setDisableMode('pause');
      setDisableDialogOpen(true);
      return;
    }
    await saveSettings.mutateAsync({
      ...settings,
      secondBrain: { ...settings.secondBrain, enabled },
    });
    await statusQuery.refetch();
  };

  const handleConfirmDisable = async () => {
    if (disableMode === 'clear') {
      setDisableDialogOpen(false);
      setClearConfirmOpen(true);
      return;
    }
    try {
      await pauseMemory.mutateAsync();
      setDisableDialogOpen(false);
      toast.success('Agent Memory paused.');
      await statusQuery.refetch();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleConfirmClearAndDisable = async () => {
    try {
      await clearAndDisableMemory.mutateAsync();
      setClearConfirmOpen(false);
      setSelected(null);
      setNewPageId(null);
      setDraft('');
      savedContentRef.current = '';
      dirtyRef.current = false;
      setDirty(false);
      model.setValue('');
      toast.success('Agent Memory cleared and disabled.');
      await statusQuery.refetch();
      await treeQuery.refetch();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleSetProjectMemoryEnabled = (enabled: boolean) => {
    if (!projectMemoryEnabledStorageKey) return;
    localStorage.setItem(projectMemoryEnabledStorageKey, String(enabled));
    setProjectMemoryEnabled(enabled);
  };

  const handleProviderChange = async (providerId: string) => {
    setProviderSelectionError(undefined);
    try {
      await setActiveProvider.mutateAsync(providerId);
    } catch (error) {
      setProviderSelectionError((error as Error).message);
    }
  };

  const handleRefresh = async (kind: SecondBrainOperationKind) => {
    if (!activeProvider?.id || operationActive) return;
    const startedAt = Date.now();
    clearProgress();
    setLastRefreshMessage('');
    setOperationDialog({
      kind,
      phase: 'running',
      startedAt,
      providerName: activeProvider.name,
    });
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
      setOperationDialog((current) =>
        current
          ? {
              ...current,
              phase: result.status === 'cancelled' ? 'cancelled' : 'succeeded',
              result,
              progress: undefined,
            }
          : current,
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
      setOperationDialog((current) =>
        current
          ? {
              ...current,
              phase: 'failed',
              error: (error as Error).message,
              progress: undefined,
            }
          : current,
      );
    } finally {
      clearProgress();
    }
  };

  const handleStopRefresh = async () => {
    if (
      !operationDialog?.operationId ||
      operationDialog.phase !== 'running' ||
      !operationDialog.progress?.cancellable
    ) {
      return;
    }
    const { operationId } = operationDialog;
    setOperationDialog((current) =>
      current ? { ...current, phase: 'stopping', stopError: undefined } : null,
    );
    try {
      await cancelRefresh.mutateAsync(operationId);
    } catch (error) {
      setOperationDialog((current) =>
        current
          ? {
              ...current,
              stopError: (error as Error).message,
            }
          : current,
      );
    }
  };

  const closeOperationDialog = () => {
    if (operationActive) return;
    clearProgress();
    setOperationDialog(null);
  };

  const readOnly = Boolean(
    selected?.archived || selected?.generated || selectedRevisionId,
  );
  const displayedContent = selectedRevisionId
    ? (revisionQuery.data?.content ?? '')
    : draft;
  const busy =
    initialize.isLoading ||
    previewRefresh.isLoading ||
    applyRefresh.isLoading ||
    operationActive;
  const providerLoading = providersLoading || activeProviderLoading;
  const hasActiveProvider = Boolean(activeProvider?.id);
  const providerError =
    providerSelectionError ||
    (providersError as Error | null)?.message ||
    (activeProviderError as Error | null)?.message;
  const getProviderIcon = (providerType: string) =>
    aiProviderImages[providerType as keyof typeof aiProviderImages] ??
    defaultIcon;
  const providerIconSx = (providerType?: string) => ({
    width: 18,
    height: 18,
    flexShrink: 0,
    filter:
      theme.palette.mode === 'dark' &&
      providerType !== 'gemini' &&
      providerType !== 'lmstudio'
        ? 'brightness(0) invert(1) opacity(0.85)'
        : undefined,
  });
  const providerSelector = (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      gap={1}
      alignItems={{ xs: 'stretch', sm: 'center' }}
    >
      <FormControl
        size="small"
        sx={{
          minWidth: 200,
          '& .MuiInputBase-root': { height: 32 },
        }}
      >
        <Select
          displayEmpty
          value={activeProvider?.id?.toString() ?? ''}
          onChange={(event) => handleProviderChange(event.target.value)}
          inputProps={{ 'aria-label': 'AI provider' }}
          sx={{
            '& .MuiSelect-select': {
              display: 'flex',
              alignItems: 'center',
            },
          }}
          disabled={
            providerLoading ||
            providers.length === 0 ||
            operationActive ||
            setActiveProvider.isLoading
          }
          renderValue={(providerId) => {
            const provider = providers.find(
              (item) => item.id?.toString() === providerId,
            );
            if (!provider) {
              return (
                <Typography variant="body2" color="text.secondary">
                  AI provider
                </Typography>
              );
            }
            return (
              <Stack direction="row" spacing={1} alignItems="center">
                <Box
                  component="img"
                  src={getProviderIcon(provider.type)}
                  alt=""
                  sx={providerIconSx(provider.type)}
                />
                <Typography variant="body2" noWrap>
                  {provider.name}
                </Typography>
              </Stack>
            );
          }}
        >
          <MenuItem value="" disabled>
            {providerLoading
              ? 'Loading AI providers…'
              : 'Select an AI provider'}
          </MenuItem>
          {providers.map((provider) => (
            <MenuItem key={provider.id} value={provider.id?.toString() ?? ''}>
              <Box
                component="img"
                src={getProviderIcon(provider.type)}
                alt=""
                sx={{ ...providerIconSx(provider.type), mr: 1 }}
              />
              {provider.name} ({provider.type})
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {providers.length === 0 && !providerLoading && (
        <Button
          size="small"
          variant="outlined"
          onClick={() => navigate('/app/settings/ai-providers?tab=Providers')}
        >
          Configure providers
        </Button>
      )}
    </Stack>
  );
  const operationProgress = operationDialog?.progress;
  const operationStopping = operationDialog?.phase === 'stopping';
  const operationPrimaryMessage = getOperationPrimaryMessage(operationDialog);
  const showStop = Boolean(
    operationDialog?.phase === 'running' &&
      operationDialog.operationId &&
      operationProgress?.cancellable &&
      !isSecondBrainTerminalStage(operationProgress.stage),
  );
  const operationHasDeterminateProgress = Boolean(
    operationProgress?.total &&
      operationProgress.total > 0 &&
      operationProgress.completed >= 0 &&
      operationProgress.completed <= operationProgress.total &&
      operationProgress.stage !== 'generating',
  );
  const operationProgressValue = operationHasDeterminateProgress
    ? ((operationProgress?.completed ?? 0) / (operationProgress?.total ?? 1)) *
      100
    : undefined;
  const elapsedLabel = `${Math.floor(elapsedSeconds / 60)}:${String(
    elapsedSeconds % 60,
  ).padStart(2, '0')}`;
  const operationResultMessage = getOperationResultMessage(
    operationDialog?.result,
  );
  const visiblePages = search.trim()
    ? (searchQuery.data ?? [])
        .map((hit) =>
          treeQuery.data?.find((page) => page.pageId === hit.pageId),
        )
        .filter((page): page is SecondBrainTreeItem => Boolean(page))
    : (treeQuery.data ?? []);
  const displayPageTitle = (item: SecondBrainTreeItem) =>
    item.pageId === AGENT_MEMORY_ENTRY_FILE || item.pageId === 'index.md'
      ? 'Agent Memory'
      : item.title;
  return (
    <Stack spacing={1.5}>
      <Paper variant="outlined">
        <Tabs
          value={memorySettingsTab}
          onChange={(_, value: 'global' | 'project') =>
            setMemorySettingsTab(value)
          }
          sx={{
            px: 1.5,
            minHeight: 40,
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTab-root': { minHeight: 40, py: 0.5 },
          }}
        >
          <Tab value="global" label="Global" />
          <Tab value="project" label="Project" />
        </Tabs>
      </Paper>

      {memorySettingsTab === 'global' && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            gap={2}
          >
            <Box>
              <Typography variant="h6">Agent Memory</Typography>
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
                    sx={memorySwitchSx}
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
              <Tooltip title="Open the user-owned Agent Memory wiki folder">
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
              <Tooltip title="Open terminal in the Agent Memory folder">
                <span>
                  <IconButton
                    onClick={() =>
                      openSecondBrainWikiTerminal().catch((error) =>
                        toast.error(error.message),
                      )
                    }
                    disabled={!status?.initialized}
                    aria-label="Open terminal in Agent Memory folder"
                  >
                    <Terminal />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Stack>
        </Paper>
      )}

      {memorySettingsTab === 'project' && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle1">Project Memory</Typography>
              <Typography variant="body2" color="text.secondary">
                Project Memory is stored as{' '}
                <code>{PROJECT_AGENT_CONTEXT_FILE}</code> in this dbt project.
                It travels with the repository and is separate from global Agent
                Memory.
              </Typography>
            </Box>
            {!selectedProject ? (
              <Alert severity="info">
                Select a dbt project to configure project-scoped AI context.
              </Alert>
            ) : (
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                justifyContent="space-between"
                gap={2}
              >
                <Box>
                  <Typography variant="subtitle2">
                    Include {PROJECT_AGENT_CONTEXT_FILE} in Project Agent
                    context
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    The Project Agent reads the current project&apos;s root
                    {PROJECT_AGENT_CONTEXT_FILE} file when starting a request.
                  </Typography>
                </Box>
                <Switch
                  checked={projectMemoryEnabled}
                  onChange={(_, checked) =>
                    handleSetProjectMemoryEnabled(checked)
                  }
                  sx={memorySwitchSx}
                />
              </Stack>
            )}
          </Stack>
        </Paper>
      )}

      {memorySettingsTab === 'global' && !settings?.secondBrain.enabled && (
        <Alert severity="info">
          Enable Agent Memory to let agents discover durable Markdown memory
          across sessions.
        </Alert>
      )}

      {memorySettingsTab === 'global' &&
        settings?.secondBrain.enabled &&
        !status?.initialized && (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              borderColor: 'primary.main',
              bgcolor: 'action.hover',
            }}
          >
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'stretch', md: 'center' }}
              gap={2}
            >
              <Stack direction="row" gap={1.5} alignItems="flex-start">
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'primary.contrastText',
                    bgcolor: 'primary.main',
                    flexShrink: 0,
                  }}
                >
                  <Refresh fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Initialize Agent Memory
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Create the local Markdown memory wiki and run the first
                    refresh so agents can use durable context across sessions.
                  </Typography>
                </Box>
              </Stack>
              <Stack
                direction={{ xs: 'column', lg: 'row' }}
                alignItems={{ xs: 'stretch', lg: 'center' }}
                gap={1}
              >
                <Tooltip
                  title={
                    !hasActiveProvider
                      ? getSecondBrainProviderTooltip('init')
                      : ''
                  }
                >
                  <span>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handleRefresh('init')}
                      disabled={
                        busy ||
                        providerLoading ||
                        setActiveProvider.isLoading ||
                        !hasActiveProvider
                      }
                      startIcon={
                        busy ? (
                          <CircularProgress color="inherit" size={16} />
                        ) : null
                      }
                      sx={{
                        width: { xs: '100%', lg: 'auto' },
                        minWidth: 170,
                        fontWeight: 700,
                      }}
                    >
                      Initialize memory
                    </Button>
                  </span>
                </Tooltip>
                {providerSelector}
              </Stack>
            </Stack>
            {providerError && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                {providerError}
              </Alert>
            )}
          </Paper>
        )}
      {memorySettingsTab === 'global' &&
        settings?.secondBrain.enabled &&
        status?.initialized && (
          <>
            <Paper variant="outlined" sx={{ p: 1 }}>
              <Stack spacing={1}>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  gap={1}
                  alignItems={{ xs: 'stretch', md: 'center' }}
                  justifyContent="space-between"
                >
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    gap={1}
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                  >
                    <Tooltip
                      title={
                        !hasActiveProvider
                          ? getSecondBrainProviderTooltip('preview')
                          : ''
                      }
                    >
                      <span>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<Search />}
                          onClick={() => handleRefresh('preview')}
                          disabled={
                            busy ||
                            providerLoading ||
                            setActiveProvider.isLoading ||
                            !hasActiveProvider
                          }
                          sx={{ width: { xs: '100%', sm: 'auto' } }}
                        >
                          Preview refresh
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip
                      title={
                        !hasActiveProvider
                          ? getSecondBrainProviderTooltip('apply')
                          : ''
                      }
                    >
                      <span>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={
                            busy ? <CircularProgress size={16} /> : <Refresh />
                          }
                          onClick={() => handleRefresh('apply')}
                          disabled={
                            busy ||
                            providerLoading ||
                            setActiveProvider.isLoading ||
                            !hasActiveProvider
                          }
                          sx={{ width: { xs: '100%', sm: 'auto' } }}
                        >
                          Refresh memory
                        </Button>
                      </span>
                    </Tooltip>
                  </Stack>
                  {providerSelector}
                </Stack>
                {lastRefreshMessage && (
                  <Typography variant="body2" color="text.secondary">
                    {lastRefreshMessage}
                  </Typography>
                )}
                {providerError && (
                  <Alert severity="error">{providerError}</Alert>
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
              <Box
                sx={{ borderRight: { lg: 1 }, borderColor: 'divider', p: 1 }}
              >
                <Stack direction="row" gap={1} mb={1}>
                  <TextField
                    size="small"
                    fullWidth
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search memory"
                    inputProps={{ 'aria-label': 'Search Agent Memory pages' }}
                    sx={{
                      '& .MuiInputBase-root': { height: 32 },
                      '& .MuiInputBase-input': { py: 0.5 },
                    }}
                  />
                  <Tooltip title="Create Markdown page">
                    <IconButton
                      size="small"
                      onClick={startNewPage}
                      sx={{ width: 32, height: 32 }}
                    >
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

              <Box
                sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}
              >
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
                        fileName={
                          newPageId ??
                          selected?.pageId ??
                          AGENT_MEMORY_ENTRY_FILE
                        }
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
                      theme={
                        theme.palette.mode === 'dark' ? 'vs-dark' : 'light'
                      }
                      readOnly={readOnly}
                      onMount={handleEditorMount}
                    />
                  )}
                </Box>
              </Box>

              <Box
                sx={{ borderLeft: { lg: 1 }, borderColor: 'divider', p: 1.5 }}
              >
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
                              window.confirm(
                                'Restore this historical revision?',
                              )
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

      <Dialog
        open={Boolean(operationDialog)}
        onClose={() => closeOperationDialog()}
        disableEscapeKeyDown={operationActive}
        maxWidth="sm"
        fullWidth
        aria-labelledby="agent-memory-operation-title"
        aria-describedby="agent-memory-operation-status"
      >
        <DialogTitle id="agent-memory-operation-title">
          {operationDialog
            ? getSecondBrainOperationTitle(operationDialog.kind)
            : 'Agent Memory'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {operationDialog && (
              <Stack direction="row" justifyContent="space-between" gap={2}>
                <Typography variant="caption" color="text.secondary">
                  Provider: {operationDialog.providerName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Elapsed: {elapsedLabel}
                </Typography>
              </Stack>
            )}

            {operationActive && (
              <LinearProgress
                variant={
                  operationHasDeterminateProgress
                    ? 'determinate'
                    : 'indeterminate'
                }
                value={operationProgressValue}
                aria-label="Agent Memory operation progress"
              />
            )}

            <Box
              id="agent-memory-operation-status"
              role="status"
              aria-live="polite"
            >
              <Typography variant="body1" fontWeight={600}>
                {operationPrimaryMessage}
              </Typography>
              {operationActive &&
                operationProgress?.message &&
                operationProgress.message !== operationPrimaryMessage && (
                  <Typography variant="body2" color="text.secondary" mt={0.5}>
                    {operationProgress.message}
                  </Typography>
                )}
            </Box>

            {operationActive && operationProgress?.stage === 'generating' && (
              <Typography
                variant="body2"
                color="text.secondary"
                aria-hidden="true"
              >
                {
                  SECOND_BRAIN_GENERATION_HELPERS[
                    prefersReducedMotion ? 0 : generationHelperIndex
                  ]
                }
              </Typography>
            )}

            {operationResultMessage && (
              <Alert severity="success">{operationResultMessage}</Alert>
            )}
            {operationDialog?.phase === 'cancelled' && (
              <Alert severity="info">
                No additional memory updates applied.
              </Alert>
            )}
            {operationDialog?.error && (
              <Alert severity="error">{operationDialog.error}</Alert>
            )}
            {operationDialog?.stopError && (
              <Alert severity="error">
                Could not stop the operation: {operationDialog.stopError}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          {showStop && (
            <Button
              color="warning"
              startIcon={<Stop />}
              onClick={handleStopRefresh}
              disabled={cancelRefresh.isLoading}
            >
              Stop
            </Button>
          )}
          {operationStopping && (
            <Button
              color="warning"
              startIcon={<CircularProgress size={16} />}
              disabled
            >
              Stopping…
            </Button>
          )}
          {!operationActive && (
            <Button variant="contained" onClick={closeOperationDialog}>
              Close
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog
        open={newPageDialogOpen}
        onClose={() => setNewPageDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create Markdown page</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Page ID"
            placeholder="topics/revenue-rules.md"
            value={newPageInput}
            onChange={(event) => setNewPageInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && newPageInput.trim()) {
                event.preventDefault();
                confirmNewPage();
              }
            }}
            helperText="Use a Markdown path under topics, projects, connections, notebooks, or analytics."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewPageDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={confirmNewPage}
            disabled={!newPageInput.trim()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={disableDialogOpen}
        onClose={() => setDisableDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>How do you want to disable Agent Memory?</DialogTitle>
        <DialogContent>
          <RadioGroup
            value={disableMode}
            onChange={(event) =>
              setDisableMode(event.target.value as 'pause' | 'clear')
            }
          >
            <Paper variant="outlined" sx={{ mb: 1 }}>
              <FormControlLabel
                value="pause"
                control={<Radio />}
                sx={{ alignItems: 'flex-start', m: 0, p: 1.25, width: '100%' }}
                label={
                  <Box>
                    <Typography variant="subtitle2">
                      Pause temporarily
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Stop saving and retrieving Agent Memory. Existing memory
                      files remain intact.
                    </Typography>
                  </Box>
                }
              />
            </Paper>
            <Paper variant="outlined">
              <FormControlLabel
                value="clear"
                control={<Radio />}
                sx={{ alignItems: 'flex-start', m: 0, p: 1.25, width: '100%' }}
                label={
                  <Box>
                    <Typography variant="subtitle2">
                      Clear and disable
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Permanently delete saved Agent Memory and disable memory.
                      This action cannot be undone.
                    </Typography>
                  </Box>
                }
              />
            </Paper>
          </RadioGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDisableDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color={disableMode === 'clear' ? 'error' : 'primary'}
            onClick={handleConfirmDisable}
            disabled={pauseMemory.isLoading}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" gap={1} alignItems="center">
            <WarningAmber color="warning" fontSize="small" />
            <span>Confirm clearing all Agent Memory?</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will permanently delete all saved Agent Memory, including wiki
            pages, revisions, archive, and state. Project{' '}
            {PROJECT_AGENT_CONTEXT_FILE} files are not deleted.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearConfirmOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmClearAndDisable}
            disabled={clearAndDisableMemory.isLoading}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};
