import React, { useState, useMemo } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { useGetProjectFiles, useGetSelectedProject } from '../../controllers';
import { ContextFileTree } from './ContextFileTree';
import { FileNode } from '../../../types/backend';

interface FilePickerTreeViewProps {
  searchQuery: string;
  selectedFiles: string[];
  excludeFiles: string[];
  onFileToggle: (filePath: string) => void;
}

export const FilePickerTreeView: React.FC<FilePickerTreeViewProps> = ({
  searchQuery,
  selectedFiles,
  excludeFiles,
  onFileToggle,
}) => {
  const { data: project } = useGetSelectedProject();
  const { data: projectFiles, isLoading } = useGetProjectFiles(project as any, {
    enabled: !!project,
  });
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const handleExpandedItemsChange = (
    event: React.SyntheticEvent,
    itemIds: string[],
  ) => {
    setExpandedItems(itemIds);
  };

  // Filter files based on search query for tree view
  const filteredProjectFiles = useMemo(() => {
    if (!searchQuery || !projectFiles) return projectFiles;

    const filterNode = (node: FileNode): FileNode | null => {
      if (node.type === 'file') {
        const matchesSearch =
          node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          node.path.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesSearch ? node : null;
      }

      if (node.children) {
        const filteredChildren = node.children
          .map(filterNode)
          .filter((child): child is FileNode => child !== null);

        if (filteredChildren.length > 0) {
          return {
            ...node,
            children: filteredChildren,
          };
        }
      }

      return null;
    };

    const filtered = filterNode(projectFiles);
    return filtered || undefined;
  }, [projectFiles, searchQuery]);

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="400px"
      >
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading project files...</Typography>
      </Box>
    );
  }

  if (!projectFiles) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="400px"
      >
        <Typography color="text.secondary">
          No files found in project.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '400px',
        overflow: 'auto',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1,
        backgroundColor: 'background.paper',
        '&:hover': {
          borderColor: 'primary.light',
        },
      }}
    >
      <ContextFileTree
        files={filteredProjectFiles}
        selectedFiles={selectedFiles}
        excludeFiles={excludeFiles}
        onFileSelection={(filePath: string) => {
          onFileToggle(filePath);
        }}
        expandedItems={expandedItems}
        onExpandedItemsChange={handleExpandedItemsChange}
      />
    </Box>
  );
};
