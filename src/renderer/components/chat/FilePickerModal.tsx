import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Box,
  Typography,
  Chip,
  InputAdornment,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  Description as FileIcon,
  Code as CodeIcon,
  DataObject as DataIcon,
  Settings as ConfigIcon,
  BugReport as TestIcon,
  Storage as SeedIcon,
  Camera as SnapshotIcon,
  Functions as MacroIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useGetProjectFiles, useGetSelectedProject } from '../../controllers';

// DBT file type icons
const DBT_FILE_TYPE_ICONS = {
  model: CodeIcon,
  macro: MacroIcon,
  test: TestIcon,
  schema: DataIcon,
  seed: SeedIcon,
  snapshot: SnapshotIcon,
  project_config: ConfigIcon,
  other: FileIcon,
} as const;

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

export const FilePickerModal: React.FC<FilePickerModalProps> = ({
  open,
  onClose,
  onSelect,
  selectedFiles,
  excludeFiles = [],
}) => {
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
    const selectedFileItems = Object.values(filteredAndGroupedFiles)
      .flat()
      .filter((file) => localSelectedFiles.includes(file.path));

    onSelect(selectedFileItems);
    onClose();
  };

  const handleCancel = () => {
    // Reset to the original selected files state
    setLocalSelectedFiles(selectedFiles);
    setSearchQuery('');
    onClose();
  };

  const totalSelected = localSelectedFiles.length;

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: '80vh' },
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
        {/* Search */}
        <TextField
          fullWidth
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />

        {/* Selected files summary */}
        {totalSelected > 0 && (
          <Box sx={{ mb: 2, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Selected files ({totalSelected}):
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
              {localSelectedFiles.slice(0, 5).map((filePath) => {
                const fileName = filePath.split('/').pop() || filePath;
                return (
                  <Chip
                    key={filePath}
                    label={fileName}
                    size="small"
                    onDelete={() => handleFileToggle(filePath)}
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
        )}

        {/* File groups */}
        <Box sx={{ maxHeight: '50vh', overflow: 'auto' }}>
          {(() => {
            if (isLoading) {
              return <Typography>Loading files...</Typography>;
            }

            if (Object.keys(filteredAndGroupedFiles).length === 0) {
              const message = searchQuery
                ? 'No files match your search.'
                : 'No files found in project.';
              return <Typography color="text.secondary">{message}</Typography>;
            }

            return Object.entries(filteredAndGroupedFiles).map(
              ([fileType, files]) => {
                const IconComponent =
                  DBT_FILE_TYPE_ICONS[
                    fileType as keyof typeof DBT_FILE_TYPE_ICONS
                  ] || FileIcon;

                return (
                  <Accordion key={fileType} defaultExpanded={false}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <IconComponent fontSize="small" />
                        <Typography variant="subtitle2">
                          {fileType.toUpperCase()} ({files.length})
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0 }}>
                      <List dense>
                        {files.map((file) => (
                          <ListItem key={file.path} disablePadding>
                            <ListItemButton
                              onClick={() => handleFileToggle(file.path)}
                              selected={localSelectedFiles.includes(file.path)}
                              disabled={excludeFiles.includes(file.path)}
                            >
                              <ListItemIcon>
                                <Checkbox
                                  checked={localSelectedFiles.includes(
                                    file.path,
                                  )}
                                  disabled={excludeFiles.includes(file.path)}
                                  tabIndex={-1}
                                  disableRipple
                                  size="small"
                                />
                              </ListItemIcon>
                              <ListItemText
                                primary={file.name}
                                secondary={
                                  excludeFiles.includes(file.path)
                                    ? `${file.relativePath} (already in context)`
                                    : file.relativePath
                                }
                                primaryTypographyProps={{
                                  variant: 'body2',
                                  color: excludeFiles.includes(file.path)
                                    ? 'text.disabled'
                                    : 'text.primary',
                                }}
                                secondaryTypographyProps={{
                                  variant: 'caption',
                                  color: excludeFiles.includes(file.path)
                                    ? 'text.disabled'
                                    : 'text.secondary',
                                }}
                              />
                            </ListItemButton>
                          </ListItem>
                        ))}
                      </List>
                    </AccordionDetails>
                  </Accordion>
                );
              },
            );
          })()}
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
