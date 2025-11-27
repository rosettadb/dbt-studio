import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Description as FileIcon,
  Code as CodeIcon,
  DataObject as DataIcon,
  Settings as ConfigIcon,
  BugReport as TestIcon,
  Storage as SeedIcon,
  Camera as SnapshotIcon,
  Functions as MacroIcon,
} from '@mui/icons-material';

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

interface FilePickerListViewProps {
  isLoading: boolean;
  searchQuery: string;
  filteredAndGroupedFiles: Record<string, FileItem[]>;
  selectedFiles: string[];
  excludeFiles: string[];
  onFileToggle: (filePath: string) => void;
}

export const FilePickerListView: React.FC<FilePickerListViewProps> = ({
  isLoading,
  searchQuery,
  filteredAndGroupedFiles,
  selectedFiles,
  excludeFiles,
  onFileToggle,
}) => {
  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="400px"
      >
        <Typography>Loading files...</Typography>
      </Box>
    );
  }

  if (Object.keys(filteredAndGroupedFiles).length === 0) {
    const message = searchQuery
      ? 'No files match your search.'
      : 'No files found in project.';
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="400px"
      >
        <Typography color="text.secondary">{message}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxHeight: '400px', overflow: 'auto' }}>
      {Object.entries(filteredAndGroupedFiles).map(([fileType, files]) => {
        const IconComponent =
          DBT_FILE_TYPE_ICONS[fileType as keyof typeof DBT_FILE_TYPE_ICONS] ||
          FileIcon;

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
                      onClick={() => onFileToggle(file.path)}
                      selected={selectedFiles.includes(file.path)}
                      disabled={excludeFiles.includes(file.path)}
                    >
                      <ListItemIcon>
                        <Checkbox
                          checked={selectedFiles.includes(file.path)}
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
                        slotProps={{
                          primary: {
                            variant: 'body2',
                            color: excludeFiles.includes(file.path)
                              ? 'text.disabled'
                              : 'text.primary',
                          },
                          secondary: {
                            variant: 'caption',
                            color: excludeFiles.includes(file.path)
                              ? 'text.disabled'
                              : 'text.secondary',
                          },
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
};
