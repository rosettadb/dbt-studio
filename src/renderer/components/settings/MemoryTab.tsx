import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Chip,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  InputAdornment,
  Stack,
  Divider,
  Button,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import MemoryIcon from '@mui/icons-material/Memory';
import ArticleIcon from '@mui/icons-material/Article';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import TerminalIcon from '@mui/icons-material/Terminal';
import SaveIcon from '@mui/icons-material/Save';
import Editor, { OnMount } from '@monaco-editor/react';
import {
  useGetMemoryTree,
  useGetMemoryStats,
  useReadMemoryFile,
  useWriteMemoryFile,
} from '../../controllers/memory.controller';
import {
  openMemoryDir,
  openMemoryTerminal,
} from '../../services/memory.service';

export const MemoryTab: React.FC = () => {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const {
    data: tree,
    isLoading: treeLoading,
    isError: treeError,
  } = useGetMemoryTree();
  const { data: stats, isLoading: statsLoading } = useGetMemoryStats();
  const { data: fileContent, isLoading: contentLoading } = useReadMemoryFile(
    selectedPath ?? '',
  );
  const writeMutation = useWriteMemoryFile();

  useEffect(() => {
    if (fileContent !== undefined) {
      setEditContent(fileContent);
      setIsDirty(false);
    }
  }, [fileContent]);

  const handleSave = useCallback(async () => {
    if (!selectedPath) return;
    await writeMutation.mutateAsync({
      path: selectedPath,
      content: editContent,
    });
    setIsDirty(false);
  }, [selectedPath, editContent, writeMutation]);

  const handleEditorMount: OnMount = (editor) => {
    editor.addCommand(
      // eslint-disable-next-line no-bitwise
      (window as any).monaco?.KeyMod?.CtrlCmd |
        (window as any).monaco?.KeyCode?.KeyS,
      () => {
        handleSave();
      },
    );
  };

  // eslint-disable-next-line consistent-return
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave],
  );

  const renderStats = () => {
    if (statsLoading) return <CircularProgress size={20} />;
    if (!stats) return null;
    return (
      <Stack direction="row" spacing={1}>
        <Chip
          icon={<MemoryIcon />}
          label={`${stats.fileCount} files`}
          size="small"
          variant="outlined"
        />
        <Chip
          label={`${stats.totalLines} lines`}
          size="small"
          variant="outlined"
        />
        {stats.lastModified && (
          <Chip
            label={`Updated ${new Date(stats.lastModified).toLocaleDateString()}`}
            size="small"
            variant="outlined"
          />
        )}
      </Stack>
    );
  };

  const renderContentPanel = () => {
    if (!selectedPath) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'text.disabled',
          }}
        >
          <FolderIcon sx={{ fontSize: 48, mb: 1 }} />
          <Typography variant="body2">
            Select a memory file to view its contents
          </Typography>
        </Box>
      );
    }
    if (contentLoading) {
      return (
        <Box display="flex" justifyContent="center" my={4}>
          <CircularProgress size={24} />
        </Box>
      );
    }
    return (
      <Box
        component="pre"
        sx={{
          fontFamily: 'monospace',
          fontSize: '13px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          m: 0,
          p: 0,
        }}
      >
        {fileContent || 'File is empty.'}
      </Box>
    );
  };

  const renderTree = (nodes: typeof tree) => {
    if (!nodes || nodes.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          No memory files found.
        </Typography>
      );
    }

    return (
      <List dense disablePadding>
        {nodes.map((node) => (
          <React.Fragment key={node.path}>
            {node.type === 'folder' ? (
              <ListItemText
                primary={node.title}
                secondary={node.path}
                sx={{ px: 2, py: 1 }}
                primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            ) : (
              <ListItemButton
                selected={selectedPath === node.path}
                onClick={() => setSelectedPath(node.path)}
                sx={{ borderRadius: 1, mx: 1 }}
              >
                <ArticleIcon
                  sx={{ mr: 1, fontSize: 18, color: 'text.secondary' }}
                />
                <ListItemText
                  primary={node.title}
                  secondary={node.path}
                  primaryTypographyProps={{ variant: 'body2' }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItemButton>
            )}
            {node.children?.map((child) => (
              <ListItemButton
                key={child.path}
                selected={selectedPath === child.path}
                onClick={() => setSelectedPath(child.path)}
                sx={{ pl: 4, borderRadius: 1, mx: 1 }}
              >
                <ArticleIcon
                  sx={{ mr: 1, fontSize: 18, color: 'text.secondary' }}
                />
                <ListItemText
                  primary={child.title}
                  secondary={child.path}
                  primaryTypographyProps={{ variant: 'body2' }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItemButton>
            ))}
          </React.Fragment>
        ))}
      </List>
    );
  };

  const renderSidebarContent = () => {
    if (treeLoading) {
      return (
        <Box display="flex" justifyContent="center" my={4}>
          <CircularProgress size={24} />
        </Box>
      );
    }
    if (treeError) {
      return (
        <Alert severity="error" sx={{ m: 1 }}>
          Failed to load memory tree.
        </Alert>
      );
    }
    return renderTree(tree);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h6">Long-Term Memory</Typography>
          <Typography variant="body2" color="text.secondary">
            Persistent knowledge shared across all AI agent sessions.
          </Typography>
        </Box>
        {renderStats()}
      </Box>

      <Box sx={{ display: 'flex', gap: 2, minHeight: 400 }}>
        <Paper
          variant="outlined"
          sx={{ width: 280, flexShrink: 0, overflow: 'auto' }}
        >
          <TextField
            fullWidth
            size="small"
            placeholder="Search memory..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ m: 1, width: 'calc(100% - 16px)' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <Divider />
          {renderSidebarContent()}
        </Paper>

        <Paper
          variant="outlined"
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {selectedPath && !contentLoading ? (
            <>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  px: 2,
                  py: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                  {selectedPath}
                </Typography>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<SaveIcon />}
                  disabled={!isDirty || writeMutation.isLoading}
                  onClick={handleSave}
                >
                  {writeMutation.isLoading ? 'Saving...' : 'Save'}
                </Button>
              </Box>
              <Box sx={{ flex: 1, minHeight: 0 }} onKeyDown={handleKeyDown}>
                <Editor
                  language="markdown"
                  theme="vs-dark"
                  value={editContent}
                  onChange={(val) => {
                    setEditContent(val ?? '');
                    setIsDirty(true);
                  }}
                  onMount={handleEditorMount}
                  options={{
                    fontSize: 13,
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                />
              </Box>
            </>
          ) : (
            <Box sx={{ flex: 1 }}>{renderContentPanel()}</Box>
          )}
        </Paper>
      </Box>

      <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
        <Button
          size="small"
          startIcon={<FolderOpenIcon />}
          onClick={() => openMemoryDir()}
        >
          Open in Finder
        </Button>
        <Button
          size="small"
          startIcon={<TerminalIcon />}
          onClick={() => openMemoryTerminal()}
        >
          Open in Terminal
        </Button>
      </Box>
    </Box>
  );
};
