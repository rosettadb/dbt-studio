import React from 'react';
import { Box, Typography, Checkbox, FormControlLabel } from '@mui/material';
import { TreeItem, SimpleTreeView as TreeView } from '@mui/x-tree-view';
import {
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  Code as CodeIcon,
  DataObject as DataIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';
import { FileNode } from '../../../types/backend';

// DBT file type icons for context tree
const DBT_FILE_ICONS = {
  '.sql': CodeIcon,
  '.yml': DataIcon,
  '.yaml': DataIcon,
  '.py': CodeIcon,
  '.md': DescriptionIcon,
  '.txt': DescriptionIcon,
  '.json': DataIcon,
  '.js': CodeIcon,
  '.ts': CodeIcon,
} as const;

interface ContextFileTreeProps {
  files: FileNode | undefined;
  selectedFiles: string[];
  excludeFiles: string[];
  onFileSelection: (filePath: string, isSelected: boolean) => void;
  expandedItems: string[];
  onExpandedItemsChange: (
    event: React.SyntheticEvent,
    itemIds: string[],
  ) => void;
}

export const ContextFileTree: React.FC<ContextFileTreeProps> = ({
  files,
  selectedFiles,
  excludeFiles,
  onFileSelection,
  expandedItems,
  onExpandedItemsChange,
}) => {
  // Helper function to get file icon based on extension
  const getFileIcon = (fileName: string) => {
    const extension = fileName
      .toLowerCase()
      .substring(fileName.lastIndexOf('.'));
    const IconComponent =
      DBT_FILE_ICONS[extension as keyof typeof DBT_FILE_ICONS] || FileIcon;
    return IconComponent;
  };

  // Helper function to detect DBT file type for styling
  const getDBTFileType = (filePath: string): string => {
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

  // Render tree node recursively
  const renderTreeNode = (node: FileNode): React.ReactNode => {
    const isFile = node.type === 'file';
    const isSelected = selectedFiles.includes(node.path);
    const isExcluded = excludeFiles.includes(node.path);
    const canSelect = isFile && !isExcluded;
    const dbtFileType = isFile ? getDBTFileType(node.path) : '';

    if (isFile) {
      const FileIconComponent = getFileIcon(node.name);

      return (
        <TreeItem
          key={node.path}
          itemId={node.path}
          label={
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={isSelected}
                  disabled={isExcluded}
                  onChange={(e) => onFileSelection(node.path, e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  sx={{
                    color: canSelect ? 'primary.main' : 'action.disabled',
                    '&.Mui-checked': {
                      color: 'primary.main',
                    },
                  }}
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                  <FileIconComponent
                    sx={{
                      mr: 1,
                      fontSize: 16,
                      color: canSelect ? 'primary.main' : 'action.disabled',
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 400,
                      color: canSelect ? 'text.primary' : 'text.disabled',
                    }}
                  >
                    {node.name}
                    {isExcluded && (
                      <Typography
                        component="span"
                        variant="caption"
                        sx={{
                          ml: 1,
                          color: 'text.disabled',
                          fontStyle: 'italic',
                        }}
                      >
                        (already in context)
                      </Typography>
                    )}
                  </Typography>
                  {dbtFileType && dbtFileType !== 'other' && (
                    <Typography
                      component="span"
                      variant="caption"
                      sx={{
                        ml: 1,
                        px: 0.5,
                        py: 0.1,
                        bgcolor: 'primary.light',
                        color: 'primary.contrastText',
                        borderRadius: 0.5,
                        fontSize: '0.6rem',
                        textTransform: 'uppercase',
                      }}
                    >
                      {dbtFileType}
                    </Typography>
                  )}
                </Box>
              }
              sx={{ m: 0, width: '100%' }}
            />
          }
        />
      );
    }

    // Folder node
    return (
      <TreeItem
        key={node.path}
        itemId={node.path}
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', py: 0.25 }}>
            <FolderIcon
              sx={{
                mr: 1,
                fontSize: 16,
                color:
                  node.name === 'models' ? 'primary.main' : 'text.secondary',
              }}
            />
            <Typography
              variant="body2"
              sx={{
                fontWeight: node.name === 'models' ? 600 : 500,
                color: node.name === 'models' ? 'primary.main' : 'text.primary',
              }}
            >
              {node.name}
            </Typography>
          </Box>
        }
      >
        {node.children?.map((child) => renderTreeNode(child))}
      </TreeItem>
    );
  };

  if (!files) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="100%"
      >
        <Typography color="text.secondary">No files available</Typography>
      </Box>
    );
  }

  return (
    <TreeView
      expandedItems={expandedItems}
      onExpandedItemsChange={onExpandedItemsChange}
      sx={{
        '& .MuiTreeItem-content': {
          padding: '2px 4px',
          borderRadius: 1,
          '&:hover': {
            backgroundColor: 'action.hover',
          },
        },
        '& .MuiTreeItem-label': {
          fontSize: '0.875rem',
        },
      }}
    >
      {files.children?.map((child) => renderTreeNode(child))}
    </TreeView>
  );
};
