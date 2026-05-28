import React from 'react';
import { toast } from 'react-toastify';
import {
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
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArchiveIcon from '@mui/icons-material/Archive';
import EditIcon from '@mui/icons-material/Edit';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import PreviewIcon from '@mui/icons-material/Preview';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
import {
  useArchiveMemoryEntry,
  useCreateMemoryEntry,
  useMemoryHealth,
  useMemoryList,
  useMemoryStats,
  useRebuildIndex,
  useRecoverMemoryHealth,
  useRefreshDatabaseContext,
  useRunDreaming,
  useUpdateMemoryEntry,
  useDreamingRuns,
  useDreamingReports,
  useShortTermRecall,
} from '../../controllers/memory.controller';
import {
  useGetAISettings,
  useSaveAISettings,
} from '../../controllers/aiSettings.controller';
import {
  useActiveMemoryDiagnostics,
  useClearActiveMemoryDiagnostics,
} from '../../controllers/activeMemory.controller';
import {
  useWikiStatus,
  useWikiCompile,
  useWikiLint,
  useWikiOpenVault,
  useWikiOpenNote,
  useWikiOpenSearch,
} from '../../controllers/memoryWiki.controller';
import { useFilePicker } from '../../controllers/settings.controller';
import type {
  AgentMemoryActiveMemorySettings,
  AgentMemoryEntry,
  AgentMemoryListFilter,
  AgentMemoryRefreshResult,
  AgentMemoryRecoveryAction,
  AgentMemoryScreenKey,
  AgentMemoryShortTermRecallListFilter,
  AgentMemoryWikiSettings,
  AISettingsConfig,
  MemoryKind,
  NewAgentMemoryEntry,
} from '../../../types/backend';
import { MEMORY_KIND } from '../../../types/backend';

type TabKey = 0 | 1 | 2 | 3 | 4;
type ArchiveFilter = 'active' | 'archived';
type MemoryFormMode = 'create' | 'edit';

type MemorySettings = NonNullable<AISettingsConfig['memory']>;

interface MemoryFormState {
  title: string;
  content: string;
  summary: string;
  kind: MemoryKind | string;
  screenKey: AgentMemoryScreenKey;
  projectId: string;
  connectionId: string;
  notebookId: string;
  importance: string;
  confidence: string;
  tags: string;
}

const DEFAULT_WIKI_SETTINGS: AgentMemoryWikiSettings = {
  enabled: false,
  vaultPath: null,
  debounceMs: 2000,
  includeDatabaseMetadata: false,
  includeManualMemories: true,
  includePromotedMemories: true,
  manualNoteImportEnabled: false,
};

// Plan 38 Track A — Active Memory defaults.
const DEFAULT_ACTIVE_MEMORY_SETTINGS: AgentMemoryActiveMemorySettings = {
  enabled: false,
  mode: 'recent',
  timeoutMs: 15000,
  maxInputTokens: 4000,
  persistTranscripts: false,
  transcriptRetention: 50,
};

const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  enabled: true,
  autoCapture: true,
  injectProjectMetadata: true,
  injectConnectionMetadata: true,
  injectNotebookMetadata: true,
  includeGlobalMemories: true,
  maxPromptMemories: 8,
  maxPromptChars: 6000,
  shortTermEnabled: true,
  dreamingEnabled: false,
  lightDreamingEnabled: true,
  embeddingsEnabled: false,
  embeddingProvider: 'none',
  wiki: DEFAULT_WIKI_SETTINGS,
  activeMemory: DEFAULT_ACTIVE_MEMORY_SETTINGS,
};

const mergeMemorySettings = (
  settings?: AISettingsConfig['memory'],
): MemorySettings => ({
  ...DEFAULT_MEMORY_SETTINGS,
  ...settings,
  wiki: {
    ...DEFAULT_WIKI_SETTINGS,
    ...settings?.wiki,
  },
  activeMemory: {
    ...DEFAULT_ACTIVE_MEMORY_SETTINGS,
    ...settings?.activeMemory,
  },
});

const SCREEN_OPTIONS: { value: AgentMemoryScreenKey | 'all'; label: string }[] =
  [
    { value: 'all', label: 'All screens' },
    { value: 'global', label: 'Global' },
    { value: 'project', label: 'Project' },
    { value: 'sql', label: 'SQL' },
    { value: 'notebooks', label: 'Notebooks' },
  ];

const CREATE_SCREEN_OPTIONS: { value: AgentMemoryScreenKey; label: string }[] =
  [
    { value: 'global', label: 'Global' },
    { value: 'project', label: 'Project' },
    { value: 'sql', label: 'SQL' },
    { value: 'notebooks', label: 'Notebooks' },
  ];

const KIND_OPTIONS: { value: MemoryKind | string; label: string }[] = [
  { value: MEMORY_KIND.MANUAL, label: 'Manual' },
  { value: MEMORY_KIND.DECISION, label: 'Decision' },
  { value: MEMORY_KIND.PROJECT_FACT, label: 'Project fact' },
  { value: MEMORY_KIND.CONNECTION_FACT, label: 'Connection fact' },
  { value: MEMORY_KIND.NOTEBOOK_FACT, label: 'Notebook fact' },
  { value: MEMORY_KIND.USER_PREFERENCE, label: 'User preference' },
  { value: MEMORY_KIND.TASK_STATE, label: 'Task state' },
  { value: MEMORY_KIND.ERROR_RESOLUTION, label: 'Error resolution' },
  { value: MEMORY_KIND.QUERY_PATTERN, label: 'Query pattern' },
  { value: MEMORY_KIND.SCHEMA_FACT, label: 'Schema fact' },
  { value: MEMORY_KIND.DATABASE_METADATA, label: 'Database metadata' },
  { value: MEMORY_KIND.DREAM_SUMMARY, label: 'Dream summary' },
  { value: MEMORY_KIND.REM_PATTERN, label: 'REM pattern' },
];

const EMPTY_FORM: MemoryFormState = {
  title: '',
  content: '',
  summary: '',
  kind: MEMORY_KIND.MANUAL,
  screenKey: 'global',
  projectId: '',
  connectionId: '',
  notebookId: '',
  importance: '0.8',
  confidence: '0.9',
  tags: '',
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const getRunStatusColor = (status: string) => {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'error';
  return 'default';
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const truncate = (value: string, max = 180) =>
  value.length > max ? `${value.slice(0, max - 1)}...` : value;

const parseTags = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

const toOptionalString = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toRatio = (value: string, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
};

const normalizeTags = (tags: string | null) => {
  if (!tags) return '';
  try {
    const parsed = JSON.parse(tags);
    if (Array.isArray(parsed)) return parsed.join(', ');
  } catch {
    return tags;
  }
  return tags;
};

const parseStoredTags = (value: string | null) =>
  parseTags(normalizeTags(value));

const formFromEntry = (entry: AgentMemoryEntry): MemoryFormState => ({
  title: entry.title ?? '',
  content: entry.content,
  summary: entry.summary ?? '',
  kind: entry.kind,
  screenKey: entry.screenKey,
  projectId: entry.projectId ?? '',
  connectionId: entry.connectionId ?? '',
  notebookId: entry.notebookId ?? '',
  importance: String(entry.importance),
  confidence: String(entry.confidence),
  tags: normalizeTags(entry.tags),
});

const buildCreateInput = (form: MemoryFormState): NewAgentMemoryEntry => ({
  screenKey: form.screenKey,
  projectId: toOptionalString(form.projectId),
  connectionId: toOptionalString(form.connectionId),
  notebookId: toOptionalString(form.notebookId),
  kind: form.kind,
  sourceType: 'manual',
  title: toOptionalString(form.title),
  content: form.content.trim(),
  summary: toOptionalString(form.summary),
  importance: toRatio(form.importance, 0.8),
  confidence: toRatio(form.confidence, 0.9),
  tags: parseTags(form.tags),
});

const buildUpdatePatch = (
  form: MemoryFormState,
): Partial<NewAgentMemoryEntry> => ({
  kind: form.kind,
  title: toOptionalString(form.title),
  content: form.content.trim(),
  summary: toOptionalString(form.summary),
  importance: toRatio(form.importance, 0.8),
  confidence: toRatio(form.confidence, 0.9),
  tags: parseTags(form.tags),
});

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 2.5, mb: 1 }}>
    {children}
  </Typography>
);

const SettingRow: React.FC<{
  label: string;
  description: string;
  control: React.ReactNode;
}> = ({ label, description, control }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 2,
      py: 1.25,
    }}
  >
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" fontWeight={600}>
        {label}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {description}
      </Typography>
    </Box>
    <Box sx={{ flexShrink: 0 }}>{control}</Box>
  </Box>
);

const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  detail?: string;
}> = ({ label, value, detail }) => (
  <Box
    sx={{
      border: 1,
      borderColor: 'divider',
      borderRadius: 1,
      p: 1.5,
      minHeight: 82,
    }}
  >
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="h6" sx={{ mt: 0.25 }}>
      {value}
    </Typography>
    {detail && (
      <Typography variant="caption" color="text.secondary">
        {detail}
      </Typography>
    )}
  </Box>
);

type MemoryScopeDisplay = {
  screenKey: AgentMemoryScreenKey;
  projectId: string | null;
  connectionId: string | null;
  notebookId: string | null;
};

const ScopeText: React.FC<{ entry: MemoryScopeDisplay }> = ({ entry }) => {
  const parts = [
    entry.screenKey,
    entry.projectId ? `project:${entry.projectId}` : null,
    entry.connectionId ? `connection:${entry.connectionId}` : null,
    entry.notebookId ? `notebook:${entry.notebookId}` : null,
  ].filter(Boolean);

  return (
    <Typography variant="caption" color="text.secondary">
      {parts.join(' / ')}
    </Typography>
  );
};

const MemoryEntryDialog: React.FC<{
  open: boolean;
  mode: MemoryFormMode;
  form: MemoryFormState;
  saving: boolean;
  onChange: (patch: Partial<MemoryFormState>) => void;
  onClose: () => void;
  onSubmit: () => void;
}> = ({ open, mode, form, saving, onChange, onClose, onSubmit }) => (
  <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
    <DialogTitle>
      {mode === 'create' ? 'Create Memory' : 'Edit Memory'}
    </DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Kind</InputLabel>
            <Select
              label="Kind"
              value={form.kind}
              onChange={(event) => onChange({ kind: event.target.value })}
            >
              {KIND_OPTIONS.map((kind) => (
                <MenuItem key={kind.value} value={kind.value}>
                  {kind.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Screen</InputLabel>
            <Select
              label="Screen"
              value={form.screenKey}
              disabled={mode === 'edit'}
              onChange={(event) =>
                onChange({
                  screenKey: event.target.value as AgentMemoryScreenKey,
                })
              }
            >
              {CREATE_SCREEN_OPTIONS.map((screen) => (
                <MenuItem key={screen.value} value={screen.value}>
                  {screen.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Importance"
            size="small"
            value={form.importance}
            onChange={(event) => onChange({ importance: event.target.value })}
            inputProps={{ inputMode: 'decimal' }}
            sx={{ width: 130 }}
          />
          <TextField
            label="Confidence"
            size="small"
            value={form.confidence}
            onChange={(event) => onChange({ confidence: event.target.value })}
            inputProps={{ inputMode: 'decimal' }}
            sx={{ width: 130 }}
          />
        </Stack>

        {mode === 'create' && (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Project ID"
              size="small"
              value={form.projectId}
              onChange={(event) => onChange({ projectId: event.target.value })}
              fullWidth
            />
            <TextField
              label="Connection ID"
              size="small"
              value={form.connectionId}
              onChange={(event) =>
                onChange({ connectionId: event.target.value })
              }
              fullWidth
            />
            <TextField
              label="Notebook ID"
              size="small"
              value={form.notebookId}
              onChange={(event) => onChange({ notebookId: event.target.value })}
              fullWidth
            />
          </Stack>
        )}

        <TextField
          label="Title"
          size="small"
          value={form.title}
          onChange={(event) => onChange({ title: event.target.value })}
          fullWidth
        />
        <TextField
          label="Content"
          value={form.content}
          onChange={(event) => onChange({ content: event.target.value })}
          fullWidth
          multiline
          minRows={5}
          required
        />
        <TextField
          label="Summary"
          value={form.summary}
          onChange={(event) => onChange({ summary: event.target.value })}
          fullWidth
          multiline
          minRows={2}
        />
        <TextField
          label="Tags"
          size="small"
          value={form.tags}
          onChange={(event) => onChange({ tags: event.target.value })}
          helperText="Comma-separated tags"
          fullWidth
        />
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button type="button" onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button
        type="button"
        variant="contained"
        onClick={onSubmit}
        disabled={saving || form.content.trim().length === 0}
      >
        {saving ? 'Saving...' : 'Save'}
      </Button>
    </DialogActions>
  </Dialog>
);

export const MemorySettingsTab: React.FC = () => {
  const [tab, setTab] = React.useState<TabKey>(0);
  const [search, setSearch] = React.useState('');
  const [screenFilter, setScreenFilter] = React.useState<
    AgentMemoryScreenKey | 'all'
  >('all');
  const [kindFilter, setKindFilter] = React.useState<string>('all');
  const [archiveFilter, setArchiveFilter] =
    React.useState<ArchiveFilter>('active');
  const [projectFilter, setProjectFilter] = React.useState('');
  const [connectionFilter, setConnectionFilter] = React.useState('');
  const [notebookFilter, setNotebookFilter] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogMode, setDialogMode] = React.useState<'create' | 'edit'>(
    'create',
  );

  const [editingEntry, setEditingEntry] =
    React.useState<AgentMemoryEntry | null>(null);
  const [form, setForm] = React.useState<MemoryFormState>(EMPTY_FORM);
  const [preview, setPreview] = React.useState<AgentMemoryRefreshResult | null>(
    null,
  );

  const { data: aiSettings, isLoading: aiSettingsLoading } = useGetAISettings();
  const saveAISettings = useSaveAISettings();
  const filePicker = useFilePicker();
  const statsQuery = useMemoryStats();
  const healthQuery = useMemoryHealth();
  const refreshMetadata = useRefreshDatabaseContext();
  const rebuildIndex = useRebuildIndex();
  const runDreaming = useRunDreaming();
  const recoverHealth = useRecoverMemoryHealth();
  const createMemory = useCreateMemoryEntry();
  const updateMemory = useUpdateMemoryEntry();
  const archiveMemory = useArchiveMemoryEntry();

  const activeMemoryDiagnosticsQuery = useActiveMemoryDiagnostics();
  const clearActiveMemoryDiagnostics = useClearActiveMemoryDiagnostics();

  const { data: wikiStatus, refetch: mutateWikiStatus } = useWikiStatus();
  const { mutateAsync: wikiCompile } = useWikiCompile();
  const { mutateAsync: wikiLint } = useWikiLint();
  const { mutateAsync: wikiOpenVault } = useWikiOpenVault();
  const { mutateAsync: wikiOpenNote } = useWikiOpenNote();
  const { mutateAsync: wikiOpenSearch } = useWikiOpenSearch();
  const [wikiSearchQuery, setWikiSearchQuery] = React.useState('');

  const listFilter = React.useMemo<AgentMemoryListFilter>(() => {
    const filter: AgentMemoryListFilter = {
      archived: archiveFilter === 'archived',
      limit: 200,
    };
    if (search.trim()) filter.search = search.trim();
    if (screenFilter !== 'all') filter.screenKey = screenFilter;
    if (kindFilter !== 'all') filter.kind = kindFilter;
    if (projectFilter.trim()) filter.projectId = projectFilter.trim();
    if (connectionFilter.trim()) filter.connectionId = connectionFilter.trim();
    if (notebookFilter.trim()) filter.notebookId = notebookFilter.trim();
    return filter;
  }, [
    archiveFilter,
    connectionFilter,
    kindFilter,
    notebookFilter,
    projectFilter,
    screenFilter,
    search,
  ]);

  const shortTermFilter =
    React.useMemo<AgentMemoryShortTermRecallListFilter>(() => {
      const filter: AgentMemoryShortTermRecallListFilter = { limit: 100 };
      if (screenFilter !== 'all') filter.screenKey = screenFilter;
      if (projectFilter.trim()) filter.projectId = projectFilter.trim();
      if (connectionFilter.trim()) {
        filter.connectionId = connectionFilter.trim();
      }
      if (notebookFilter.trim()) filter.notebookId = notebookFilter.trim();
      return filter;
    }, [connectionFilter, notebookFilter, projectFilter, screenFilter]);

  const durableEntriesQuery = useMemoryList(listFilter);
  const metadataEntriesQuery = useMemoryList({
    kind: MEMORY_KIND.DATABASE_METADATA,
    archived: false,
    limit: 100,
  });

  const memorySettings = mergeMemorySettings(aiSettings?.memory);

  const shortTermEntriesQuery = useShortTermRecall(shortTermFilter);
  const dreamingRunsQuery = useDreamingRuns({ limit: 50 });
  const dreamingReportsQuery = useDreamingReports({ limit: 200 });

  const shortTermEntries = shortTermEntriesQuery.data ?? [];
  const dreamingRuns = dreamingRunsQuery.data ?? [];

  const reportsByRunId = React.useMemo(() => {
    const map = new Map<number, string[]>();
    (dreamingReportsQuery.data ?? []).forEach((report) => {
      if (report.runId === null) return;
      map.set(report.runId, [...(map.get(report.runId) ?? []), report.content]);
    });
    return new Map(
      Array.from(map.entries()).map(([runId, reports]) => [
        runId,
        reports.reverse().join(' '),
      ]),
    );
  }, [dreamingReportsQuery.data]);

  const durableEntries = React.useMemo(
    () =>
      (durableEntriesQuery.data ?? []).filter(
        (entry) =>
          kindFilter !== 'all' || entry.kind !== MEMORY_KIND.DATABASE_METADATA,
      ),
    [durableEntriesQuery.data, kindFilter],
  );

  const metadataEntries = metadataEntriesQuery.data ?? [];

  const metadataCounts = React.useMemo(() => {
    return metadataEntries.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.sourceType] = (acc[entry.sourceType] ?? 0) + 1;
      return acc;
    }, {});
  }, [metadataEntries]);

  const updateMemorySettings = (patch: Partial<MemorySettings>) => {
    if (!aiSettings) return;
    const currentMemorySettings = mergeMemorySettings(aiSettings.memory);
    saveAISettings.mutate(
      {
        ...aiSettings,
        memory: {
          ...currentMemorySettings,
          ...patch,
          wiki: patch.wiki
            ? {
                ...currentMemorySettings.wiki,
                ...patch.wiki,
              }
            : currentMemorySettings.wiki,
        },
      },
      {
        onError: (error) => {
          toast.error(
            `Failed to save memory settings: ${getErrorMessage(error)}`,
          );
        },
      },
    );
  };

  const updateWikiSettings = (patch: Partial<AgentMemoryWikiSettings>) => {
    updateMemorySettings({
      wiki: {
        ...memorySettings.wiki,
        ...patch,
      },
    });
  };

  const updateActiveMemorySettings = (
    patch: Partial<AgentMemoryActiveMemorySettings>,
  ) => {
    updateMemorySettings({
      activeMemory: {
        ...memorySettings.activeMemory,
        ...patch,
      },
    });
  };

  const handleSelectWikiVault = () => {
    filePicker.mutate(
      {
        properties: ['openDirectory'],
        defaultPath: memorySettings.wiki.vaultPath ?? undefined,
      },
      {
        onSuccess: (filePaths) => {
          const [vaultPath] = filePaths;
          if (!vaultPath) return;
          updateWikiSettings({ vaultPath });
        },
        onError: (error) => {
          toast.error(`Failed to select vault path: ${getErrorMessage(error)}`);
        },
      },
    );
  };

  const handleWikiCompile = async () => {
    try {
      await wikiCompile();
      mutateWikiStatus();
      toast.success('Wiki compilation triggered');
    } catch (err: any) {
      toast.error(`Wiki compile failed: ${err.message}`);
    }
  };

  const handleWikiLint = async () => {
    try {
      await wikiLint({
        screenKey: screenFilter === 'all' ? 'global' : screenFilter,
        projectId: projectFilter.trim() || null,
        connectionId: connectionFilter.trim() || null,
        notebookId: notebookFilter.trim() || null,
      });
      mutateWikiStatus();
      toast.success('Wiki lint completed');
    } catch (err: any) {
      toast.error(`Wiki lint failed: ${err.message}`);
    }
  };

  const handleWikiOpenVault = async () => {
    const result = await wikiOpenVault();
    if (!result.ok) {
      toast.error(result.error ?? 'Failed to open vault in Obsidian');
    }
  };

  const handleWikiOpenNote = async (scopeKey: string) => {
    const result = await wikiOpenNote({ scopeKey });
    if (!result.ok) {
      toast.error(result.error ?? 'Failed to open note in Obsidian');
    }
  };

  const handleWikiOpenSearch = async () => {
    if (!wikiSearchQuery.trim()) {
      toast.warn('Enter a search query first');
      return;
    }
    const result = await wikiOpenSearch({ query: wikiSearchQuery.trim() });
    if (!result.ok) {
      toast.error(result.error ?? 'Failed to open search in Obsidian');
    }
  };

  const openCreateDialog = () => {
    setDialogMode('create');
    setEditingEntry(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEditDialog = (entry: AgentMemoryEntry) => {
    setDialogMode('edit');
    setEditingEntry(entry);
    setForm(formFromEntry(entry));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingEntry(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmitMemory = () => {
    if (form.content.trim().length === 0) return;
    if (dialogMode === 'create') {
      createMemory.mutate(buildCreateInput(form), {
        onSuccess: () => {
          toast.success('Memory created.');
          closeDialog();
        },
        onError: (error) => {
          toast.error(`Failed to create memory: ${getErrorMessage(error)}`);
        },
      });
      return;
    }
    if (!editingEntry) return;
    updateMemory.mutate(
      { id: editingEntry.id, patch: buildUpdatePatch(form) },
      {
        onSuccess: () => {
          toast.success('Memory updated.');
          closeDialog();
        },
        onError: (error) => {
          toast.error(`Failed to update memory: ${getErrorMessage(error)}`);
        },
      },
    );
  };

  const handleArchive = (entry: AgentMemoryEntry) => {
    archiveMemory.mutate(entry.id, {
      onSuccess: () => {
        toast.success('Memory archived.');
      },
      onError: (error) => {
        toast.error(`Failed to archive memory: ${getErrorMessage(error)}`);
      },
    });
  };

  const handleRefreshMetadata = (dryRun: boolean) => {
    refreshMetadata.mutate(
      { dryRun },
      {
        onSuccess: (result) => {
          if (dryRun) {
            setPreview(result);
            return;
          }
          setPreview(null);
          toast.success(`Database metadata refreshed (${result.upserted}).`);
        },
        onError: (error) => {
          toast.error(
            `Failed to refresh database metadata: ${getErrorMessage(error)}`,
          );
        },
      },
    );
  };

  const handleRebuildIndex = () => {
    rebuildIndex.mutate(undefined, {
      onSuccess: () => {
        toast.success('Memory index rebuilt.');
      },
      onError: (error) => {
        toast.error(
          `Failed to rebuild memory index: ${getErrorMessage(error)}`,
        );
      },
    });
  };

  const handleRecoverHealth = (action: AgentMemoryRecoveryAction) => {
    recoverHealth.mutate(
      { action },
      {
        onSuccess: (result) => {
          toast.success(result.message);
        },
        onError: (error) => {
          toast.error(
            `Failed to run memory recovery: ${getErrorMessage(error)}`,
          );
        },
      },
    );
  };

  const handleRunDreaming = () => {
    runDreaming.mutate(undefined, {
      onSuccess: (result) => {
        if (result.ok) {
          toast.success(result.message ?? 'Memory dreaming completed.');
          return;
        }
        toast.error(result.message ?? 'Memory dreaming failed.');
      },
      onError: (error) => {
        toast.error(`Failed to run memory dreaming: ${getErrorMessage(error)}`);
      },
    });
  };

  const renderOverview = () => {
    if (statsQuery.isLoading || healthQuery.isLoading || aiSettingsLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      );
    }

    const stats = statsQuery.data;
    const health = healthQuery.data;

    return (
      <Box sx={{ pt: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              lg: 'repeat(4, minmax(0, 1fr))',
            },
          }}
        >
          <StatTile label="Durable" value={stats?.durableCount ?? '-'} />
          <StatTile label="Active" value={stats?.activeCount ?? '-'} />
          <StatTile label="Short-term" value={stats?.shortTermCount ?? '-'} />
          <StatTile
            label="Database Metadata"
            value={stats?.databaseMetadataCount ?? '-'}
          />
          <StatTile label="Archived" value={stats?.archivedCount ?? '-'} />
          <StatTile
            label="FTS"
            value={stats?.fts5Available ? 'Available' : 'LIKE fallback'}
          />
          <StatTile
            label="Last Dreaming Run"
            value={formatDate(stats?.lastDreamingRunAt)}
          />
          <StatTile
            label="Last Metadata Refresh"
            value={formatDate(stats?.lastMetadataRefreshAt)}
          />
        </Box>

        <SectionTitle>Health</SectionTitle>
        <Divider />
        <Stack direction="row" spacing={1} sx={{ py: 1.25, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            color={health?.ok ? 'success' : 'warning'}
            label={
              health
                ? `Health ${Math.round(health.healthScore * 100)}%`
                : 'Health'
            }
          />
          <Chip
            size="small"
            variant="outlined"
            label={`Stale: ${health?.staleEntries ?? 0}`}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`Orphaned: ${health?.orphanedEntries ?? 0}`}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`Duplicates: ${health?.duplicateEntries ?? 0}`}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`Active: ${health?.activeEntries ?? 0}`}
          />
          {health?.healthSnapshotId ? (
            <Chip
              size="small"
              variant="outlined"
              label={`Snapshot #${health.healthSnapshotId}`}
            />
          ) : null}
        </Stack>
        {health?.issues?.length ? (
          <Stack spacing={0.5} sx={{ pb: 1 }}>
            {health.issues.map((issue) => (
              <Typography key={issue} variant="caption" color="warning.main">
                {issue}
              </Typography>
            ))}
          </Stack>
        ) : null}

        <SectionTitle>Memory Settings</SectionTitle>
        <Divider />
        <SettingRow
          label="Enabled"
          description="Inject scoped memory into agent prompts and allow memory tools."
          control={
            <Switch
              color="success"
              size="small"
              checked={memorySettings.enabled}
              onChange={(event) =>
                updateMemorySettings({ enabled: event.target.checked })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Auto Capture"
          description="Capture useful completed agent turns after the response is saved."
          control={
            <Switch
              color="success"
              size="small"
              checked={memorySettings.autoCapture}
              onChange={(event) =>
                updateMemorySettings({ autoCapture: event.target.checked })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Project Metadata"
          description="Include project metadata memories in matching project agent scopes."
          control={
            <Switch
              color="success"
              size="small"
              checked={memorySettings.injectProjectMetadata}
              onChange={(event) =>
                updateMemorySettings({
                  injectProjectMetadata: event.target.checked,
                })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Connection Metadata"
          description="Include connection metadata memories for SQL and notebook scopes."
          control={
            <Switch
              color="success"
              size="small"
              checked={memorySettings.injectConnectionMetadata}
              onChange={(event) =>
                updateMemorySettings({
                  injectConnectionMetadata: event.target.checked,
                })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Notebook Metadata"
          description="Include notebook metadata memories in notebook agent scopes."
          control={
            <Switch
              color="success"
              size="small"
              checked={memorySettings.injectNotebookMetadata}
              onChange={(event) =>
                updateMemorySettings({
                  injectNotebookMetadata: event.target.checked,
                })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Global Memories"
          description="Allow global memories to be included with scoped retrieval."
          control={
            <Switch
              color="success"
              size="small"
              checked={memorySettings.includeGlobalMemories}
              onChange={(event) =>
                updateMemorySettings({
                  includeGlobalMemories: event.target.checked,
                })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Short-term Recall"
          description="Keep short-term recall candidates for later dreaming passes."
          control={
            <Switch
              color="success"
              size="small"
              checked={memorySettings.shortTermEnabled}
              onChange={(event) =>
                updateMemorySettings({
                  shortTermEnabled: event.target.checked,
                })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Dreaming"
          description="Enable the scheduled memory consolidation pipeline when P6 is wired."
          control={
            <Switch
              color="success"
              size="small"
              checked={memorySettings.dreamingEnabled}
              onChange={(event) =>
                updateMemorySettings({
                  dreamingEnabled: event.target.checked,
                })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Max Prompt Memories"
          description="Maximum number of memory entries injected into a prompt."
          control={
            <TextField
              size="small"
              value={memorySettings.maxPromptMemories}
              inputProps={{ inputMode: 'numeric' }}
              sx={{ width: 110 }}
              onChange={(event) =>
                updateMemorySettings({
                  maxPromptMemories: Math.max(0, Number(event.target.value)),
                })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Max Prompt Chars"
          description="Maximum character budget for injected memory context."
          control={
            <TextField
              size="small"
              value={memorySettings.maxPromptChars}
              inputProps={{ inputMode: 'numeric' }}
              sx={{ width: 120 }}
              onChange={(event) =>
                updateMemorySettings({
                  maxPromptChars: Math.max(0, Number(event.target.value)),
                })
              }
            />
          }
        />

        <SectionTitle>Memory Wiki</SectionTitle>
        <Divider />
        <Stack direction="row" spacing={1} sx={{ py: 1.25, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            color={memorySettings.wiki.enabled ? 'success' : 'default'}
            label={memorySettings.wiki.enabled ? 'Wiki enabled' : 'Wiki off'}
          />
          <Chip
            size="small"
            variant="outlined"
            color={memorySettings.wiki.vaultPath ? 'success' : 'warning'}
            label={
              memorySettings.wiki.vaultPath
                ? 'Vault configured'
                : 'Vault path required'
            }
          />
          <Chip
            size="small"
            variant="outlined"
            label="Human notes excluded from agent search"
          />
        </Stack>
        <SettingRow
          label="Wiki Export"
          description="Export durable SQLite memories into a managed Obsidian vault."
          control={
            <Switch
              color="success"
              size="small"
              checked={memorySettings.wiki.enabled}
              disabled={
                !memorySettings.wiki.vaultPath && !memorySettings.wiki.enabled
              }
              onChange={(event) =>
                updateWikiSettings({ enabled: event.target.checked })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Vault Folder"
          description="Folder where dbt Studio will write managed markdown exports."
          control={
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              sx={{ minWidth: { xs: 260, sm: 420 } }}
            >
              <TextField
                size="small"
                value={memorySettings.wiki.vaultPath ?? ''}
                placeholder="Select Obsidian vault folder"
                onChange={(event) =>
                  updateWikiSettings({
                    vaultPath: event.target.value.trim() || null,
                    enabled: event.target.value.trim()
                      ? memorySettings.wiki.enabled
                      : false,
                  })
                }
                fullWidth
              />
              <Button
                type="button"
                variant="outlined"
                startIcon={<FolderOpenIcon />}
                disabled={filePicker.isLoading}
                onClick={handleSelectWikiVault}
              >
                Browse
              </Button>
            </Stack>
          }
        />
        <Divider />
        <SettingRow
          label="Compile Debounce"
          description="Delay after memory changes before wiki compilation is queued."
          control={
            <TextField
              size="small"
              value={memorySettings.wiki.debounceMs}
              inputProps={{ inputMode: 'numeric' }}
              sx={{ width: 130 }}
              onChange={(event) =>
                updateWikiSettings({
                  debounceMs: Math.max(250, Number(event.target.value) || 0),
                })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Manual Memories"
          description="Include user-created durable memories in managed wiki exports."
          control={
            <Switch
              color="success"
              size="small"
              checked={memorySettings.wiki.includeManualMemories}
              onChange={(event) =>
                updateWikiSettings({
                  includeManualMemories: event.target.checked,
                })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Promoted Memories"
          description="Include memories promoted by the dreaming pipeline."
          control={
            <Switch
              color="success"
              size="small"
              checked={memorySettings.wiki.includePromotedMemories}
              onChange={(event) =>
                updateWikiSettings({
                  includePromotedMemories: event.target.checked,
                })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Database Metadata"
          description="Include database metadata memories in managed wiki exports."
          control={
            <Switch
              color="success"
              size="small"
              checked={memorySettings.wiki.includeDatabaseMetadata}
              onChange={(event) =>
                updateWikiSettings({
                  includeDatabaseMetadata: event.target.checked,
                })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Reviewed Note Import"
          description="Reserved for a future SQLite review/import workflow; raw vault notes stay human-only."
          control={
            <Tooltip title="Not active in Phase B1">
              <span>
                <Switch
                  color="success"
                  size="small"
                  checked={memorySettings.wiki.manualNoteImportEnabled}
                  disabled
                />
              </span>
            </Tooltip>
          }
        />

        <Divider />
        <SettingRow
          label="Wiki Status"
          description="View the status of the background compiler and managed vault exports."
          control={
            <Stack spacing={1} sx={{ minWidth: 260 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" sx={{ width: 120 }}>
                  Managed Scopes:
                </Typography>
                <Chip
                  size="small"
                  label={wikiStatus?.managedScopes.length ?? 0}
                />
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" sx={{ width: 120 }}>
                  Pending Queue:
                </Typography>
                <Chip
                  size="small"
                  color={
                    (wikiStatus?.pendingScopes ?? 0) > 0 ? 'warning' : 'default'
                  }
                  label={wikiStatus?.pendingScopes ?? 0}
                />
              </Stack>
            </Stack>
          }
        />
        <Divider />
        <SettingRow
          label="Wiki Operations"
          description="Manually trigger Wiki sync, linting, or open the vault in Obsidian."
          control={
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button
                variant="outlined"
                size="small"
                startIcon={<SyncIcon />}
                onClick={handleWikiCompile}
                disabled={!memorySettings.wiki.enabled}
              >
                Run Compile
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<PreviewIcon />}
                onClick={handleWikiLint}
                disabled={!memorySettings.wiki.enabled}
              >
                Run Lint
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<FolderOpenIcon />}
                onClick={handleWikiOpenVault}
                disabled={
                  !memorySettings.wiki.enabled || !memorySettings.wiki.vaultPath
                }
              >
                Open Vault
              </Button>
            </Stack>
          }
        />
        <Divider />
        <SettingRow
          label="Search in Obsidian"
          description="Open the Obsidian search panel with a query from the configured vault."
          control={
            <Stack
              direction="row"
              spacing={1}
              sx={{ minWidth: { xs: 260, sm: 400 } }}
            >
              <TextField
                size="small"
                fullWidth
                placeholder="Enter search query…"
                value={wikiSearchQuery}
                onChange={(e) => setWikiSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleWikiOpenSearch();
                }}
                disabled={
                  !memorySettings.wiki.enabled || !memorySettings.wiki.vaultPath
                }
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={<SearchIcon />}
                onClick={handleWikiOpenSearch}
                disabled={
                  !memorySettings.wiki.enabled || !memorySettings.wiki.vaultPath
                }
              >
                Search
              </Button>
            </Stack>
          }
        />
        {wikiStatus && wikiStatus.managedScopes.length > 0 && (
          <>
            <Divider />
            <SettingRow
              label="Managed Wiki Files"
              description="Open a compiled wiki note directly in Obsidian."
              control={
                <Stack spacing={0.75}>
                  {wikiStatus.managedScopes.map((scope) => (
                    <Stack
                      key={scope.scopeKey}
                      direction="row"
                      spacing={1}
                      alignItems="center"
                    >
                      <Chip
                        size="small"
                        label={scope.scopeKey}
                        sx={{ maxWidth: 240, fontFamily: 'monospace' }}
                      />
                      <Chip
                        size="small"
                        color={(() => {
                          if (scope.status === 'error') return 'error' as const;
                          if (scope.status === 'idle')
                            return 'success' as const;
                          return 'warning' as const;
                        })()}
                        label={scope.status}
                        variant="outlined"
                      />
                      {scope.contradictionCount > 0 && (
                        <Chip
                          size="small"
                          color="warning"
                          label={`${scope.contradictionCount} conflicts`}
                        />
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleWikiOpenNote(scope.scopeKey)}
                        disabled={
                          !memorySettings.wiki.enabled ||
                          !memorySettings.wiki.vaultPath ||
                          !scope.filePath
                        }
                      >
                        Open in Obsidian
                      </Button>
                    </Stack>
                  ))}
                </Stack>
              }
            />
          </>
        )}
        <SectionTitle>Active Memory (Proactive Recall)</SectionTitle>
        <Divider />
        <Stack direction="row" spacing={1} sx={{ py: 1.25, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            color={memorySettings.activeMemory.enabled ? 'success' : 'default'}
            label={
              memorySettings.activeMemory.enabled
                ? 'Active Memory on'
                : 'Active Memory off'
            }
          />
        </Stack>
        <SettingRow
          label="Proactive Recall"
          description="Run a memory sub-agent before each main agent turn to pre-fetch relevant context. Uses the globally selected AI provider."
          control={
            <Switch
              color="success"
              size="small"
              checked={memorySettings.activeMemory.enabled}
              onChange={(event) =>
                updateActiveMemorySettings({
                  enabled: event.target.checked,
                })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Recall Mode"
          description="How much conversation history is sent to the recall sub-agent."
          control={
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <Select
                value={memorySettings.activeMemory.mode}
                onChange={(event) =>
                  updateActiveMemorySettings({
                    mode: event.target.value as 'message' | 'recent' | 'full',
                  })
                }
              >
                <MenuItem value="message">
                  Message — current message only
                </MenuItem>
                <MenuItem value="recent">
                  Recent — last 2 user turns (default)
                </MenuItem>
                <MenuItem value="full">Full — entire conversation</MenuItem>
              </Select>
            </FormControl>
          }
        />
        <Divider />
        <SettingRow
          label="Timeout (ms)"
          description="How long the recall sub-agent may run before the main agent proceeds without it. Clamped 1000–60000."
          control={
            <TextField
              size="small"
              value={memorySettings.activeMemory.timeoutMs}
              inputProps={{ inputMode: 'numeric' }}
              sx={{ width: 130 }}
              onBlur={(event) =>
                updateActiveMemorySettings({
                  timeoutMs: Math.max(
                    1000,
                    Math.min(60000, Number(event.target.value) || 15000),
                  ),
                })
              }
              onChange={(event) =>
                updateActiveMemorySettings({
                  timeoutMs: Number(event.target.value) || 15000,
                })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Max Input Tokens"
          description="Maximum conversation tokens sent to the sub-agent. Clamped 100–8000."
          control={
            <TextField
              size="small"
              value={memorySettings.activeMemory.maxInputTokens}
              inputProps={{ inputMode: 'numeric' }}
              sx={{ width: 130 }}
              onBlur={(event) =>
                updateActiveMemorySettings({
                  maxInputTokens: Math.max(
                    100,
                    Math.min(8000, Number(event.target.value) || 4000),
                  ),
                })
              }
              onChange={(event) =>
                updateActiveMemorySettings({
                  maxInputTokens: Number(event.target.value) || 4000,
                })
              }
            />
          }
        />
        <Divider />
        <SettingRow
          label="Persist Transcripts"
          description="Store redacted recall transcripts in agent_memory_diagnostics for debugging."
          control={
            <Switch
              color="success"
              size="small"
              checked={memorySettings.activeMemory.persistTranscripts}
              onChange={(event) =>
                updateActiveMemorySettings({
                  persistTranscripts: event.target.checked,
                })
              }
            />
          }
        />
        {memorySettings.activeMemory.persistTranscripts && (
          <>
            <Divider />
            <SettingRow
              label="Transcript Retention"
              description="Number of diagnostic rows to keep (oldest are deleted first)."
              control={
                <TextField
                  size="small"
                  value={memorySettings.activeMemory.transcriptRetention}
                  inputProps={{ inputMode: 'numeric' }}
                  sx={{ width: 110 }}
                  onChange={(event) =>
                    updateActiveMemorySettings({
                      transcriptRetention: Math.max(
                        1,
                        Number(event.target.value) || 50,
                      ),
                    })
                  }
                />
              }
            />
          </>
        )}

        {memorySettings.activeMemory.enabled && (
          <Box
            sx={{
              mt: 3,
              mb: 1,
              p: 2,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 2 }}
            >
              <Typography variant="subtitle2" fontWeight={600}>
                Active Memory Diagnostics
              </Typography>
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={() => clearActiveMemoryDiagnostics.mutate()}
                disabled={
                  clearActiveMemoryDiagnostics.isLoading ||
                  !activeMemoryDiagnosticsQuery.data?.length
                }
              >
                Clear Diagnostics
              </Button>
            </Stack>

            {(() => {
              if (activeMemoryDiagnosticsQuery.isLoading) {
                return <CircularProgress size={20} />;
              }
              if (activeMemoryDiagnosticsQuery.data?.length === 0) {
                return (
                  <Typography variant="body2" color="text.secondary">
                    No active memory diagnostics available.
                  </Typography>
                );
              }
              return (
                <Stack spacing={1}>
                  {activeMemoryDiagnosticsQuery.data?.map((diag) => (
                    <Box
                      key={diag.id}
                      sx={{
                        p: 1.5,
                        bgcolor: 'background.default',
                        borderRadius: 1,
                      }}
                    >
                      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                        <Chip size="small" label={`ID: ${diag.id}`} />
                        <Chip
                          size="small"
                          color={diag.executionMs > 0 ? 'success' : 'default'}
                          label={`${diag.executionMs} ms`}
                        />
                        {diag.providerId && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={diag.providerId}
                          />
                        )}
                        {diag.modelId && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={diag.modelId}
                          />
                        )}
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Found: ${diag.recallKeysFound || 'none'}`}
                        />
                      </Stack>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', mb: 0.5 }}
                      >
                        Date: {formatDate(diag.createdAt)} | Conversation:{' '}
                        {diag.conversationId}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          color: 'text.secondary',
                        }}
                      >
                        {truncate(
                          diag.completionPayload || 'No summary payload',
                          300,
                        )}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              );
            })()}
          </Box>
        )}

        <SectionTitle>Maintenance</SectionTitle>
        <Divider sx={{ mb: 1.5 }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            type="button"
            variant="outlined"
            startIcon={<RefreshIcon />}
            disabled={refreshMetadata.isLoading}
            onClick={() => handleRefreshMetadata(false)}
          >
            Refresh Database Metadata
          </Button>
          <Button
            type="button"
            variant="outlined"
            startIcon={<SyncIcon />}
            disabled={rebuildIndex.isLoading}
            onClick={handleRebuildIndex}
          >
            Rebuild Index
          </Button>
          <Button
            type="button"
            variant="contained"
            startIcon={<SyncIcon />}
            disabled={runDreaming.isLoading}
            onClick={handleRunDreaming}
          >
            Run Dreaming Now
          </Button>
          <Button
            type="button"
            variant="outlined"
            startIcon={<SyncIcon />}
            disabled={
              recoverHealth.isLoading || (health?.duplicateEntries ?? 0) === 0
            }
            onClick={() => handleRecoverHealth('dedupe')}
          >
            Dedupe Memories
          </Button>
          <Button
            type="button"
            variant="outlined"
            startIcon={<SyncIcon />}
            disabled={
              recoverHealth.isLoading || (health?.orphanedEntries ?? 0) === 0
            }
            onClick={() => handleRecoverHealth('mark_orphans_stale')}
          >
            Mark Orphans Stale
          </Button>
        </Stack>
      </Box>
    );
  };

  const renderDurableMemory = () => (
    <Box sx={{ pt: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1}>
          <TextField
            size="small"
            placeholder="Search memories"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 260, flex: 1 }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Screen</InputLabel>
            <Select
              label="Screen"
              value={screenFilter}
              onChange={(event) =>
                setScreenFilter(
                  event.target.value as AgentMemoryScreenKey | 'all',
                )
              }
            >
              {SCREEN_OPTIONS.map((screen) => (
                <MenuItem key={screen.value} value={screen.value}>
                  {screen.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel>Kind</InputLabel>
            <Select
              label="Kind"
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value)}
            >
              <MenuItem value="all">All durable kinds</MenuItem>
              {KIND_OPTIONS.map((kind) => (
                <MenuItem key={kind.value} value={kind.value}>
                  {kind.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Status</InputLabel>
            <Select
              label="Status"
              value={archiveFilter}
              onChange={(event) =>
                setArchiveFilter(event.target.value as ArchiveFilter)
              }
            >
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="archived">Archived</MenuItem>
            </Select>
          </FormControl>
          <Button
            type="button"
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openCreateDialog}
          >
            Create
          </Button>
        </Stack>

        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1}>
          <TextField
            size="small"
            label="Project ID"
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            fullWidth
          />
          <TextField
            size="small"
            label="Connection ID"
            value={connectionFilter}
            onChange={(event) => setConnectionFilter(event.target.value)}
            fullWidth
          />
          <TextField
            size="small"
            label="Notebook ID"
            value={notebookFilter}
            onChange={(event) => setNotebookFilter(event.target.value)}
            fullWidth
          />
        </Stack>
      </Stack>

      <Divider sx={{ my: 2 }} />

      {durableEntriesQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Memory</TableCell>
                <TableCell>Scope</TableCell>
                <TableCell>Quality</TableCell>
                <TableCell>Updated</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {durableEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary">
                      No matching memories.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                durableEntries.map((entry) => (
                  <TableRow key={entry.id} hover>
                    <TableCell sx={{ minWidth: 320, maxWidth: 520 }}>
                      <Stack spacing={0.5}>
                        <Stack
                          direction="row"
                          spacing={0.75}
                          alignItems="center"
                        >
                          <Chip size="small" label={entry.kind} />
                          <Typography variant="body2" fontWeight={600}>
                            {entry.title ?? `Memory #${entry.id}`}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {truncate(entry.summary || entry.content)}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      <ScopeText entry={entry} />
                    </TableCell>
                    <TableCell sx={{ minWidth: 120 }}>
                      <Typography variant="caption" color="text.secondary">
                        I {entry.importance.toFixed(2)} / C{' '}
                        {entry.confidence.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 170 }}>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(entry.updatedAt)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="Edit memory">
                        <IconButton
                          type="button"
                          size="small"
                          onClick={() => openEditDialog(entry)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {archiveFilter === 'active' && (
                        <Tooltip title="Archive memory">
                          <IconButton
                            type="button"
                            size="small"
                            onClick={() => handleArchive(entry)}
                          >
                            <ArchiveIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );

  const renderDatabaseMetadata = () => (
    <Box sx={{ pt: 2 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        alignItems={{ xs: 'stretch', md: 'center' }}
        justifyContent="space-between"
      >
        <Box>
          <Typography variant="body2" fontWeight={600}>
            Last refresh
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDate(statsQuery.data?.lastMetadataRefreshAt)}
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            type="button"
            variant="outlined"
            startIcon={<PreviewIcon />}
            disabled={refreshMetadata.isLoading}
            onClick={() => handleRefreshMetadata(true)}
          >
            Preview Refresh
          </Button>
          <Button
            type="button"
            variant="contained"
            startIcon={<RefreshIcon />}
            disabled={refreshMetadata.isLoading}
            onClick={() => handleRefreshMetadata(false)}
          >
            Refresh Now
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ py: 1.5, flexWrap: 'wrap' }}>
        {Object.entries(metadataCounts).map(([sourceType, count]) => (
          <Chip
            key={sourceType}
            size="small"
            variant="outlined"
            label={`${sourceType}: ${count}`}
          />
        ))}
      </Stack>

      <Divider sx={{ mb: 2 }} />

      {metadataEntriesQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Metadata</TableCell>
                <TableCell>Source</TableCell>
                <TableCell>Scope</TableCell>
                <TableCell>Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {metadataEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" color="text.secondary">
                      No database metadata memories found.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                metadataEntries.map((entry) => (
                  <TableRow key={entry.id} hover>
                    <TableCell sx={{ minWidth: 360, maxWidth: 560 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {entry.title ?? `Metadata #${entry.id}`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {truncate(entry.content, 220)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 150 }}>
                      <Chip size="small" label={entry.sourceType} />
                    </TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      <ScopeText entry={entry} />
                    </TableCell>
                    <TableCell sx={{ minWidth: 170 }}>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(entry.updatedAt)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );

  const renderShortTermRecall = () => (
    <Box sx={{ pt: 2 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="body2" fontWeight={600}>
            Short-Term Recall Candidates
          </Typography>
          <Typography variant="caption" color="text.secondary">
            These candidates are extracted from recent sessions and will be
            evaluated during Deep Dreaming.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => shortTermEntriesQuery.refetch()}
        >
          Refresh
        </Button>
      </Stack>

      <Divider sx={{ mb: 2 }} />

      {shortTermEntriesQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Content</TableCell>
                <TableCell>Scope</TableCell>
                <TableCell>Score</TableCell>
                <TableCell>Counts</TableCell>
                <TableCell>Last Recalled</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shortTermEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary">
                      No short-term recall candidates found.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                shortTermEntries.map((entry) => (
                  <TableRow key={entry.id} hover>
                    <TableCell sx={{ minWidth: 360, maxWidth: 560 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {`Candidate #${entry.id}`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {truncate(entry.snippet, 220)}
                      </Typography>
                      <Box
                        sx={{
                          mt: 0.5,
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 0.5,
                        }}
                      >
                        {parseStoredTags(entry.conceptTags).map((tag) => (
                          <Chip
                            key={tag}
                            label={tag}
                            size="small"
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      <ScopeText entry={entry} />
                    </TableCell>
                    <TableCell sx={{ minWidth: 100 }}>
                      <Typography variant="body2">
                        {entry.maxScore.toFixed(2)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Total {entry.totalScore.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 130 }}>
                      <Typography variant="body2">
                        {entry.recallCount} recalls
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {entry.dailyCount} daily / {entry.groundedCount}{' '}
                        grounded
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 170 }}>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(entry.lastRecalledAt)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );

  const renderDreamingRuns = () => (
    <Box sx={{ pt: 2 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="body2" fontWeight={600}>
            Dreaming Sweep History
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Logs of recent automated background memory consolidation sweeps.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => dreamingRunsQuery.refetch()}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            disabled={runDreaming.isLoading}
            onClick={handleRunDreaming}
          >
            Run Dreaming Now
          </Button>
        </Stack>
      </Stack>

      <Divider sx={{ mb: 2 }} />

      {dreamingRunsQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Trigger</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Items Processed</TableCell>
                <TableCell>Started At</TableCell>
                <TableCell>Completed At</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dreamingRuns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary">
                      No dreaming runs found.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                dreamingRuns.map((run) => {
                  const report = reportsByRunId.get(run.id);
                  return (
                    <React.Fragment key={run.id}>
                      <TableRow hover>
                        <TableCell sx={{ minWidth: 150 }}>
                          <Typography
                            variant="body2"
                            sx={{ textTransform: 'capitalize' }}
                          >
                            {run.triggerType.replace('_', ' ')}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ minWidth: 120 }}>
                          <Chip
                            label={run.status}
                            size="small"
                            color={getRunStatusColor(run.status)}
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 180 }}>
                          <Typography variant="body2">
                            {run.lightCount} session rows
                          </Typography>
                          {(run.remCount > 0 || run.promotedCount > 0) && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {run.remCount} REM / {run.promotedCount} promoted
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ minWidth: 170 }}>
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(run.startedAt)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ minWidth: 170 }}>
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(run.completedAt)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                      {report && (
                        <TableRow>
                          <TableCell colSpan={5} sx={{ pt: 0 }}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {report}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <Tabs
        value={tab}
        onChange={(_event, value) => setTab(value)}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Overview" />
        <Tab label="Durable Memory" />
        <Tab label="Database Metadata" />
        <Tab label="Short-Term Recall" />
        <Tab label="Dreaming Runs" />
      </Tabs>

      {tab === 0 && renderOverview()}
      {tab === 1 && renderDurableMemory()}
      {tab === 2 && renderDatabaseMetadata()}
      {tab === 3 && renderShortTermRecall()}
      {tab === 4 && renderDreamingRuns()}

      <MemoryEntryDialog
        open={dialogOpen}
        mode={dialogMode}
        form={form}
        saving={createMemory.isLoading || updateMemory.isLoading}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onClose={closeDialog}
        onSubmit={handleSubmitMemory}
      />

      <Dialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Database Metadata Preview</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {preview?.entries.length ?? 0} rows would be upserted.
          </Typography>
          <Stack spacing={1}>
            {(preview?.entries ?? []).slice(0, 50).map((entry, index) => (
              <Box
                key={`${entry.sourceId ?? entry.title ?? index}`}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 1,
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label={entry.sourceType ?? 'metadata'} />
                  <Typography variant="body2" fontWeight={600}>
                    {entry.title ?? entry.sourceId ?? `Preview #${index + 1}`}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {truncate(entry.content, 220)}
                </Typography>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={() => setPreview(null)}>
            Close
          </Button>
          <Button
            type="button"
            variant="contained"
            startIcon={<RefreshIcon />}
            disabled={refreshMetadata.isLoading}
            onClick={() => handleRefreshMetadata(false)}
          >
            Refresh Now
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
