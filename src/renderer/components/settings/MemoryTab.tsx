import React, { useState } from 'react';
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
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import MemoryIcon from '@mui/icons-material/Memory';
import ArticleIcon from '@mui/icons-material/Article';
import FolderIcon from '@mui/icons-material/Folder';
import {
  useGetMemoryTree,
  useGetMemoryStats,
  useReadMemoryFile,
} from '../../controllers/memory.controller';

export const MemoryTab: React.FC = () => {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const {
    data: tree,
    isLoading: treeLoading,
    isError: treeError,
  } = useGetMemoryTree();
  const { data: stats, isLoading: statsLoading } = useGetMemoryStats();
  const { data: fileContent, isLoading: contentLoading } = useReadMemoryFile(
    selectedPath ?? '',
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

        <Paper variant="outlined" sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {renderContentPanel()}
        </Paper>
      </Box>
    </Box>
  );
};
