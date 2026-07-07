import React from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  Autocomplete,
  Chip,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  BookmarkBorder as BookmarkBorderIcon,
  CleaningServices as CleaningServicesIcon,
  Code as CodeIcon,
  ContentCopy as CopyIcon,
  DeleteOutline as DeleteOutlineIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  PlayArrow as PlayArrowIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { QueryResult } from '../queryResult';
import type {
  ProjectQueryBookmark,
  ProjectQueryHistoryItem,
  ProjectQueryPanelState,
  ProjectQueryResultsTab,
} from './types';

type Props = {
  state: ProjectQueryPanelState;
  onTabChange: (tab: ProjectQueryResultsTab) => void;
  onLimitChange: (limit: number) => void;
  onClear: () => void;
  onRun?: () => void;
  onOpenSqlInEditor?: (sql: string) => void;
  isFullscreenView?: boolean;
  onCloseFullscreen?: () => void;
  onAddBookmark?: (
    bookmark: Omit<ProjectQueryBookmark, 'id' | 'createdAt'>,
  ) => void;
  onDeleteBookmark?: (id: string) => void;
  onRunHistoryItem?: (item: {
    rawSql: string;
    compiledSql?: string;
    filePath?: string;
    modelName?: string;
  }) => void;
};

const formatDuration = (durationMs?: number) => {
  if (durationMs === undefined) return undefined;
  return durationMs > 1000
    ? `${(durationMs / 1000).toFixed(2)}s`
    : `${durationMs}ms`;
};

const codeBlockSx = {
  m: 0,
  p: 1.5,
  height: '100%',
  overflow: 'auto',
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.5,
  bgcolor: 'background.default',
  border: 1,
  borderColor: 'divider',
  borderRadius: 1,
  whiteSpace: 'pre-wrap',
};

const ProjectQuerySqlTab: React.FC<{
  rawSql?: string;
  compiledSql?: string;
}> = ({ rawSql, compiledSql }) => {
  const [selected, setSelected] = React.useState<'compiled' | 'raw'>(
    compiledSql ? 'compiled' : 'raw',
  );
  const visibleSql = selected === 'compiled' ? compiledSql : rawSql;

  React.useEffect(() => {
    setSelected(compiledSql ? 'compiled' : 'raw');
  }, [compiledSql]);

  if (!rawSql && !compiledSql) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="text.secondary" variant="body2">
          Run a model preview to inspect SQL here.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 1, py: 0.75 }}
      >
        <Tabs
          value={selected}
          onChange={(_event, value) => setSelected(value)}
          sx={{ minHeight: 28, '& .MuiTab-root': { minHeight: 28, py: 0 } }}
        >
          <Tab value="compiled" label="Compiled SQL" disabled={!compiledSql} />
          <Tab value="raw" label="Raw SQL" disabled={!rawSql} />
        </Tabs>
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Copy SQL">
            <span>
              <IconButton
                size="small"
                disabled={!visibleSql}
                onClick={() => {
                  if (visibleSql) {
                    navigator.clipboard.writeText(visibleSql);
                    toast.success('SQL copied');
                  }
                }}
              >
                <CopyIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0, p: 1, pt: 0 }}>
        <Box component="pre" sx={codeBlockSx}>
          {visibleSql}
        </Box>
      </Box>
    </Box>
  );
};

const AddBookmarkModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onSave: (name: string, tags: string[]) => void;
  defaultName?: string;
}> = ({ open, onClose, onSave, defaultName }) => {
  const [name, setName] = React.useState(defaultName || 'Bookmark name');
  const [tags, setTags] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (open) {
      setName(defaultName || 'Bookmark name');
      setTags([]);
    }
  }, [open, defaultName]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add bookmark</DialogTitle>
      <DialogContent
        sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}
      >
        <TextField
          label="Name"
          fullWidth
          size="small"
          value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ mt: 1 }}
        />
        <Autocomplete
          multiple
          freeSolo
          options={[]}
          value={tags}
          onChange={(_event, newValue) => setTags(newValue)}
          renderTags={(value: readonly string[], getTagProps) =>
            value.map((option: string, index: number) => (
              <Chip
                variant="outlined"
                size="small"
                label={option}
                // eslint-disable-next-line react/jsx-props-no-spreading
                {...getTagProps({ index })}
              />
            ))
          }
          renderInput={(params) => (
            <TextField
              // eslint-disable-next-line react/jsx-props-no-spreading
              {...params}
              label="Tags"
              placeholder="Add tag"
              size="small"
            />
          )}
        />
      </DialogContent>
      <DialogActions sx={{ p: 2, pt: 0 }}>
        <Button
          variant="contained"
          size="small"
          disableElevation
          onClick={() => onSave(name, tags)}
        >
          Save
        </Button>
        <Button variant="outlined" size="small" onClick={onClose}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const ProjectQueryHistoryTab: React.FC<{
  history: ProjectQueryHistoryItem[];
  onBookmark?: (item: ProjectQueryHistoryItem) => void;
  onRunHistoryItem?: (item: {
    rawSql: string;
    compiledSql?: string;
    filePath?: string;
    modelName?: string;
  }) => void;
}> = ({ history, onBookmark, onRunHistoryItem }) => {
  if (history.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="text.secondary" variant="body2">
          Execute a query to view history.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ overflow: 'auto', flex: 1 }}>
        {history.map((item) => (
          <Box
            key={item.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 2,
              py: 1,
              minHeight: 40,
              borderBottom: 1,
              borderColor: 'divider',
              '&:hover': {
                bgcolor: 'action.hover',
                '& .actions': { display: 'flex' },
                '& .date': { display: 'none' },
              },
            }}
          >
            <CodeIcon
              sx={{ fontSize: 16, color: 'success.main', mr: 2, flexShrink: 0 }}
            />
            <Typography
              variant="body2"
              sx={{
                flex: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 11,
                mr: 4,
              }}
            >
              {item.rawSql.replace(/\n/g, ' ')}
            </Typography>

            <Typography
              className="date"
              variant="caption"
              color="text.secondary"
              sx={{ ml: 2, flexShrink: 0, display: 'block' }}
            >
              {new Date(item.executedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              {new Date(item.executedAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                year: '2-digit',
              })}
            </Typography>

            <Stack
              className="actions"
              direction="row"
              spacing={0.5}
              sx={{ ml: 4, display: 'none', flexShrink: 0 }}
            >
              {onRunHistoryItem && (
                <Tooltip title="Run query">
                  <IconButton
                    size="small"
                    onClick={() => onRunHistoryItem(item)}
                    sx={{ p: 0.5 }}
                  >
                    <PlayArrowIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
              {onBookmark && (
                <Tooltip title="Bookmark this query">
                  <IconButton
                    size="small"
                    onClick={() => onBookmark(item)}
                    sx={{ p: 0.5 }}
                  >
                    <BookmarkBorderIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

const ProjectQueryBookmarksTab: React.FC<{
  bookmarks: ProjectQueryBookmark[];
  onDeleteBookmark?: (id: string) => void;
  onRunHistoryItem?: (item: {
    rawSql: string;
    compiledSql?: string;
    filePath?: string;
    modelName?: string;
  }) => void;
}> = ({ bookmarks, onDeleteBookmark, onRunHistoryItem }) => {
  if (bookmarks.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="text.secondary" variant="body2">
          No bookmarks saved. Hover over a history item to bookmark it.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ overflow: 'auto', flex: 1 }}>
        {bookmarks.map((item) => (
          <Box
            key={item.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 2,
              py: 1,
              minHeight: 52,
              borderBottom: 1,
              borderColor: 'divider',
              '&:hover': {
                bgcolor: 'action.hover',
                '& .actions': { display: 'flex' },
                '& .date': { display: 'none' },
              },
            }}
          >
            <CodeIcon
              sx={{ fontSize: 16, color: 'success.main', mr: 2, flexShrink: 0 }}
            />

            <Box sx={{ flex: 1, minWidth: 0, mr: 4 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {item.name}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: 10,
                }}
              >
                {item.rawSql.replace(/\n/g, ' ')}
              </Typography>
            </Box>

            {item.tags.length > 0 && (
              <Stack
                direction="row"
                spacing={0.5}
                sx={{
                  mr: 2,
                  flexShrink: 0,
                  display: { xs: 'none', md: 'flex' },
                }}
              >
                {item.tags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    sx={{ height: 16, fontSize: 9 }}
                  />
                ))}
              </Stack>
            )}

            <Typography
              className="date"
              variant="caption"
              color="text.secondary"
              sx={{ flexShrink: 0, display: 'block' }}
            >
              {new Date(item.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              {new Date(item.createdAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                year: '2-digit',
              })}
            </Typography>

            <Stack
              className="actions"
              direction="row"
              spacing={0.5}
              sx={{ display: 'none', flexShrink: 0 }}
            >
              {onRunHistoryItem && (
                <Tooltip title="Run query">
                  <IconButton
                    size="small"
                    onClick={() => onRunHistoryItem(item)}
                    sx={{ p: 0.5 }}
                  >
                    <PlayArrowIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
              {onDeleteBookmark && (
                <Tooltip title="Delete bookmark">
                  <IconButton
                    size="small"
                    onClick={() => onDeleteBookmark(item.id)}
                    sx={{ p: 0.5 }}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export const ProjectQueryResultsPanel: React.FC<Props> = ({
  state,
  onTabChange,
  onLimitChange,
  onClear,
  onRun,
  onOpenSqlInEditor,
  isFullscreenView,
  onCloseFullscreen,
  onAddBookmark,
  onDeleteBookmark,
  onRunHistoryItem,
}) => {
  const theme = useTheme();
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const [addBookmarkModalOpen, setAddBookmarkModalOpen] = React.useState(false);
  const [bookmarkingItem, setBookmarkingItem] =
    React.useState<ProjectQueryHistoryItem | null>(null);

  let previewLabel = 'Preview';
  if (state.result) {
    let durationText = '';
    if (state.lastDurationMs !== undefined) {
      durationText = ` in ${formatDuration(state.lastDurationMs)}`;
    }
    previewLabel = `Preview ${state.limit} rows${durationText}`;
  }

  let previewContent: React.ReactNode = null;
  if (state.result) {
    previewContent = <QueryResult results={state.result} />;
  } else if (!state.isRunning) {
    previewContent = (
      <Typography color="text.secondary" variant="body2" sx={{ p: 1 }}>
        No query result yet.
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          minHeight: 32,
          px: 1,
          py: 0,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor:
            theme.palette.mode === 'dark'
              ? theme.palette.grey[900]
              : theme.palette.grey[50],
        }}
      >
        <Tabs
          value={state.activeTab}
          onChange={(event, newValue) =>
            onTabChange(newValue as ProjectQueryResultsTab)
          }
          sx={{
            minHeight: 32,
            '& .MuiTab-root': {
              minHeight: 32,
              py: 0,
              fontSize: 11,
              fontWeight: 500,
              textTransform: 'uppercase',
            },
          }}
        >
          <Tab value="preview" label={previewLabel} />
          <Tab value="sql" label="SQL" />
          <Tab value="history" label="History" />
          <Tab value="bookmarks" label="Bookmarks" />
        </Tabs>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <TextField
            label="Limit"
            size="small"
            type="number"
            value={state.limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            inputProps={{ min: 1, max: 5000 }}
            sx={{
              width: 86,
              '& .MuiInputLabel-root': {
                fontSize: 10,
                top: -4,
              },
              '& .MuiOutlinedInput-root': {
                height: 28,
                borderRadius: 0,
                fontSize: 12,
              },
              '& input': {
                py: 0.5,
              },
            }}
          />
          <Tooltip title="Run query">
            <span>
              <IconButton
                size="small"
                disabled={!onRun || state.isRunning}
                onClick={onRun}
                sx={{
                  width: 28,
                  height: 28,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 0,
                }}
              >
                <PlayArrowIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Clear results">
            <IconButton
              size="small"
              aria-label="Clear current results"
              onClick={onClear}
              sx={{
                width: 28,
                height: 28,
                border: 1,
                borderColor: 'divider',
                borderRadius: 0,
                color: 'text.secondary',
                '&:hover': {
                  color: 'text.primary',
                  bgcolor: 'action.hover',
                  borderColor: 'text.secondary',
                },
              }}
            >
              <CleaningServicesIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip
            title={isFullscreenView ? 'Exit full screen' : 'Full screen'}
          >
            <span>
              <IconButton
                size="small"
                onClick={
                  isFullscreenView
                    ? onCloseFullscreen
                    : () => setIsFullscreen(true)
                }
                sx={{
                  width: 28,
                  height: 28,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 0,
                  color: 'text.secondary',
                  '&:hover': {
                    color: 'text.primary',
                    bgcolor: 'action.hover',
                    borderColor: 'text.secondary',
                  },
                }}
              >
                {isFullscreenView ? (
                  <FullscreenExitIcon fontSize="small" />
                ) : (
                  <FullscreenIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {state.activeTab === 'preview' && (
          <Box sx={{ height: '100%', overflow: 'auto', p: 1 }}>
            {state.isRunning && (
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ p: 2 }}
              >
                <CircularProgress size={18} />
                <Typography variant="body2">Running preview...</Typography>
              </Stack>
            )}
            {state.error && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {state.error}
              </Alert>
            )}
            {previewContent}
          </Box>
        )}
        {state.activeTab === 'sql' && (
          <ProjectQuerySqlTab
            rawSql={state.rawSql}
            compiledSql={state.compiledSql}
          />
        )}
        {state.activeTab === 'history' && (
          <ProjectQueryHistoryTab
            history={state.history}
            onRunHistoryItem={onRunHistoryItem}
            onBookmark={(item) => {
              setBookmarkingItem(item);
              setAddBookmarkModalOpen(true);
            }}
          />
        )}
        {state.activeTab === 'bookmarks' && (
          <ProjectQueryBookmarksTab
            bookmarks={state.bookmarks}
            onDeleteBookmark={onDeleteBookmark}
            onRunHistoryItem={onRunHistoryItem}
          />
        )}
      </Box>

      <AddBookmarkModal
        open={addBookmarkModalOpen}
        onClose={() => setAddBookmarkModalOpen(false)}
        defaultName={bookmarkingItem?.modelName ?? 'Bookmark name'}
        onSave={(name, tags) => {
          if (bookmarkingItem && onAddBookmark) {
            onAddBookmark({
              name,
              tags,
              projectId: bookmarkingItem.projectId,
              projectName: bookmarkingItem.projectName,
              filePath: bookmarkingItem.filePath,
              modelName: bookmarkingItem.modelName,
              rawSql: bookmarkingItem.rawSql,
              compiledSql: bookmarkingItem.compiledSql,
            });
          }
          setAddBookmarkModalOpen(false);
        }}
      />

      {/* Full screen modal */}
      {!isFullscreenView && (
        <Dialog
          fullScreen
          open={isFullscreen}
          onClose={() => setIsFullscreen(false)}
        >
          <ProjectQueryResultsPanel
            state={state}
            onTabChange={onTabChange}
            onLimitChange={onLimitChange}
            onClear={onClear}
            onRun={onRun}
            onOpenSqlInEditor={onOpenSqlInEditor}
            isFullscreenView
            onCloseFullscreen={() => setIsFullscreen(false)}
          />
        </Dialog>
      )}
    </Box>
  );
};

export default ProjectQueryResultsPanel;
