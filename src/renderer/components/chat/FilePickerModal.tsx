import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Chip,
  InputAdornment,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Search as SearchIcon,
  Close as CloseIcon,
  ViewList as ViewListIcon,
  AccountTree as AccountTreeIcon,
} from '@mui/icons-material';
import { useGetProjectFiles, useGetSelectedProject } from '../../controllers';
import { FilePickerTreeView } from './FilePickerTreeView';
import { FilePickerListView } from './FilePickerListView';

interface FileItem {
  path: string;
  name: string;
  relativePath: string;
  type: 'file' | 'directory';
  fileType?: string;
}

interface FilePickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (files: FileItem[]) => void;
  selectedFiles: string[];
  excludeFiles?: string[]; // Files to exclude from selection (already in context)
}

// Selected Files Summary Component
interface SelectedFilesSummaryProps {
  selectedFiles: string[];
  onRemove: (filePath: string) => void;
}

const SelectedFilesSummary: React.FC<SelectedFilesSummaryProps> = ({
  selectedFiles,
  onRemove,
}) => {
  const totalSelected = selectedFiles.length;

  if (totalSelected === 0) return null;

  return (
    <Box sx={{ mb: 2, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
      <Typography variant="caption" color="text.secondary">
        Selected files ({totalSelected}):
      </Typography>
      <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
        {selectedFiles.slice(0, 5).map((filePath) => {
          const fileName = filePath.split('/').pop() || filePath;
          return (
            <Chip
              key={filePath}
              label={fileName}
              size="small"
              onDelete={() => onRemove(filePath)}
              deleteIcon={<CloseIcon />}
            />
          );
        })}
        {totalSelected > 5 && (
          <Chip
            label={`+${totalSelected - 5} more`}
            size="small"
            variant="outlined"
          />
        )}
      </Box>
    </Box>
  );
};

export const FilePickerModal: React.FC<FilePickerModalProps> = ({
  open,
  onClose,
  onSelect,
  selectedFiles,
  excludeFiles = [],
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'tree'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [localSelectedFiles, setLocalSelectedFiles] =
    useState<string[]>(selectedFiles);

  // Sync local state when modal opens or selectedFiles prop changes
  React.useEffect(() => {
    if (open) {
      setLocalSelectedFiles(selectedFiles);
    }
  }, [open, selectedFiles]);

  const { data: project } = useGetSelectedProject();
  const { data: projectFiles = [], isLoading } = useGetProjectFiles(
    project as any,
    {
      enabled: !!project && open,
    },
  );

  // Helper function to detect DBT file type
  const detectFileType = (filePath: string): string => {
    const normalizedPath = filePath.replace(/\\/g, '/');

    if (normalizedPath.includes('/models/')) return 'model';
    if (normalizedPath.includes('/macros/')) return 'macro';
    if (normalizedPath.includes('/tests/')) return 'test';
    if (normalizedPath.includes('/snapshots/')) return 'snapshot';
    if (normalizedPath.includes('/seeds/')) return 'seed';

    const fileName = filePath.split('/').pop() || '';
    if (fileName === 'dbt_project.yml') return 'project_config';
    if (fileName.endsWith('schema.yml') || fileName.endsWith('_schema.yml'))
      return 'schema';

    return 'other';
  };

  // Filter and group files
  const filteredAndGroupedFiles = useMemo(() => {
    if (!projectFiles) return {};

    // Convert project files to our FileItem format
    const allFiles: FileItem[] = [];

    const processNode = (node: any, parentPath = '') => {
      if (node.type === 'file') {
        const relativePath = parentPath
          ? `${parentPath}/${node.name}`
          : node.name;
        allFiles.push({
          path: node.path,
          name: node.name,
          relativePath,
          type: 'file',
          fileType: detectFileType(node.path),
        });
      } else if (node.children) {
        const currentPath = parentPath
          ? `${parentPath}/${node.name}`
          : node.name;
        node.children.forEach((child: any) => processNode(child, currentPath));
      }
    };

    processNode(projectFiles);

    // Filter by search query
    const filtered = allFiles.filter((file) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        file.name.toLowerCase().includes(query) ||
        file.relativePath.toLowerCase().includes(query)
      );
    });

    // Group by file type
    const grouped = filtered.reduce(
      (acc, file) => {
        const type = file.fileType || 'other';
        if (!acc[type]) acc[type] = [];
        acc[type].push(file);
        return acc;
      },
      {} as Record<string, FileItem[]>,
    );

    return grouped;
  }, [projectFiles, searchQuery]);

  const handleFileToggle = (filePath: string) => {
    setLocalSelectedFiles((prev) =>
      prev.includes(filePath)
        ? prev.filter((f) => f !== filePath)
        : [...prev, filePath],
    );
  };

  const handleConfirm = () => {
    // Create FileItem objects from selected file paths
    const selectedFileItems: FileItem[] = [];

    // Helper function to find file info from project files
    const findFileInfo = (filePath: string): FileItem | null => {
      const processNode = (node: any, parentPath = ''): FileItem | null => {
        if (node.type === 'file' && node.path === filePath) {
          const relativePath = parentPath
            ? `${parentPath}/${node.name}`
            : node.name;
          return {
            path: node.path,
            name: node.name,
            relativePath,
            type: 'file',
            fileType: detectFileType(node.path),
          };
        }
        if (node.children) {
          const currentPath = parentPath
            ? `${parentPath}/${node.name}`
            : node.name;
          const found = node.children
            .map((child: any) => processNode(child, currentPath))
            .find((result: any) => result !== null);
          if (found) return found;
        }
        return null;
      };

      return processNode(projectFiles);
    };

    // Convert selected file paths to FileItem objects
    localSelectedFiles.forEach((filePath) => {
      const fileInfo = findFileInfo(filePath);
      if (fileInfo) {
        selectedFileItems.push(fileInfo);
      }
    });

    onSelect(selectedFileItems);
    onClose();
  };

  const handleCancel = () => {
    // Reset to the original selected files state
    setLocalSelectedFiles(selectedFiles);
    setSearchQuery('');
    setActiveTab('list');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: { height: '80vh' },
        },
      }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">Add Context Files</Typography>
          <Button
            size="small"
            onClick={handleCancel}
            sx={{ minWidth: 'auto', p: 0.5 }}
          >
            <CloseIcon />
          </Button>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Search - shared across tabs */}
        <TextField
          fullWidth
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ mb: 2 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            },
          }}
        />

        {/* Selected files summary - shared */}
        <SelectedFilesSummary
          selectedFiles={localSelectedFiles}
          onRemove={handleFileToggle}
        />

        {/* Tab Navigation */}
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
        >
          <Tab
            label="List View"
            value="list"
            icon={<ViewListIcon />}
            iconPosition="start"
            sx={{ textTransform: 'none' }}
          />
          <Tab
            label="Tree View"
            value="tree"
            icon={<AccountTreeIcon />}
            iconPosition="start"
            sx={{ textTransform: 'none' }}
          />
        </Tabs>

        {/* Tab Content */}
        <Box sx={{ minHeight: '400px' }}>
          {activeTab === 'list' && (
            <FilePickerListView
              isLoading={isLoading}
              searchQuery={searchQuery}
              filteredAndGroupedFiles={filteredAndGroupedFiles}
              selectedFiles={localSelectedFiles}
              excludeFiles={excludeFiles}
              onFileToggle={handleFileToggle}
            />
          )}
          {activeTab === 'tree' && (
            <FilePickerTreeView
              searchQuery={searchQuery}
              selectedFiles={localSelectedFiles}
              excludeFiles={excludeFiles}
              onFileToggle={handleFileToggle}
            />
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button variant="contained" onClick={handleConfirm}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};
