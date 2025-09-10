/* eslint-disable no-nested-ternary, no-restricted-syntax */
import { Folder, InsertDriveFile } from '@mui/icons-material';
import { Checkbox, FormControlLabel, Box, Typography } from '@mui/material';
import React from 'react';
import { TreeItem, SimpleTreeView as TreeView } from '@mui/x-tree-view';
import { FileNode } from '../../../types/backend';

export type FileTreeMode = 'business' | 'staging' | 'incremental';

type Props = {
  files: FileNode | undefined;
  mode: FileTreeMode;
  selectAll?: boolean;
  selectedFiles: Set<string>;
  selectedFolders: Set<string>;
  expandedItems: string[];
  restrictedDirectory: string | null;
  onSelectAllChange?: () => void;
  onFileSelection: (filePath: string, isSelected: boolean) => void;
  onFolderSelection: (
    folderPath: string,
    folderNode: FileNode,
    isSelected: boolean,
  ) => void;
  onExpandedItemsChange: (
    event: React.SyntheticEvent,
    itemIds: string[],
  ) => void;
  getDirectoryRestrictionKey: (filePath: string) => string | null;
  getRestrictedDirectoryDisplayName: () => string;
};

export const SelectableFileTree: React.FC<Props> = ({
  files,
  mode,
  selectAll,
  selectedFiles,
  selectedFolders,
  expandedItems,
  restrictedDirectory,
  onSelectAllChange,
  onFileSelection,
  onFolderSelection,
  onExpandedItemsChange,
  getDirectoryRestrictionKey,
  getRestrictedDirectoryDisplayName,
}) => {
  // Configuration based on mode
  const modeConfig = React.useMemo(() => {
    switch (mode) {
      case 'business':
        return {
          fileExtensions: ['.sql', '.yaml', '.yml'],
          selectAllLabel: 'Select All SQL/YAML Files (models directory only)',
          description: 'SQL/YAML files',
          fileCountLabel: 'SQL/YAML files',
        };
      case 'staging':
        return {
          fileExtensions: ['.yaml', '.yml'],
          selectAllLabel: 'Select All YAML Files (models directory only)',
          description: 'YAML files',
          fileCountLabel: 'YAML files',
        };
      case 'incremental':
        return {
          fileExtensions: ['.sql', '.yaml', '.yml'],
          selectAllLabel: 'Select All SQL/YAML Files (models directory only)',
          description: 'SQL/YAML files',
          fileCountLabel: 'SQL/YAML files',
        };
      default:
        return {
          fileExtensions: [],
          selectAllLabel: '',
          description: '',
          fileCountLabel: '',
        };
    }
  }, [mode]);

  // Helper function to check if a file matches the target extensions
  const isTargetFile = (fileName: string): boolean => {
    return modeConfig.fileExtensions.some((ext) => fileName.endsWith(ext));
  };

  // Helper function to check if a folder directly contains target files (not in subfolders)
  const folderContainsTargetFiles = (node: FileNode): boolean => {
    if (node.type === 'file') {
      return false;
    }

    if (node.children) {
      return node.children.some(
        (child) => child.type === 'file' && isTargetFile(child.name),
      );
    }

    return false;
  };

  // Get all target files in a folder (only direct children, not subfolders)
  const getTargetFilesInFolder = (node: FileNode): string[] => {
    const targetFiles: string[] = [];

    if (node.children) {
      node.children.forEach((child) => {
        if (child.type === 'file' && isTargetFile(child.name)) {
          targetFiles.push(child.path);
        }
      });
    }

    return targetFiles;
  };

  const shouldExcludeNode = (
    node: FileNode,
    isDirectChild: boolean = false,
  ): boolean => {
    if (isDirectChild && node.type === 'folder') {
      return (
        node.name === 'rosetta' ||
        node.name === '.git' ||
        node.name === 'target'
      );
    }
    return false;
  };

  const isFileSelected = (filePath: string): boolean => {
    if (selectedFiles.has(filePath)) {
      return true;
    }

    const pathSeparator = window.electron.app.os === 'win32' ? '\\' : '/';

    const pathParts = filePath.split(pathSeparator);

    // eslint-disable-next-line no-plusplus
    for (let i = pathParts.length - 1; i > 0; i--) {
      const parentPath = pathParts.slice(0, i).join(pathSeparator);
      if (selectedFolders.has(parentPath)) {
        return true;
      }
    }

    return false;
  };

  const isFolderOrChildrenSelected = (node: FileNode): boolean => {
    if (selectedFolders.has(node.path)) {
      return true;
    }
    if (node.children) {
      return node.children.some((child) => {
        if (child.type === 'file') {
          return selectedFiles.has(child.path);
        }
        return isFolderOrChildrenSelected(child);
      });
    }

    return false;
  };

  // Helper function to determine checkbox state for folders
  const getFolderCheckboxState = (node: FileNode) => {
    const isDirectlySelected = selectedFolders.has(node.path);
    const hasSelectedChildren = node.children?.some((child) => {
      if (child.type === 'file') {
        return selectedFiles.has(child.path);
      }
      return isFolderOrChildrenSelected(child);
    });

    if (isDirectlySelected) {
      return { checked: true, indeterminate: false };
    }
    if (hasSelectedChildren) {
      return { checked: false, indeterminate: true };
    }
    return { checked: false, indeterminate: false };
  };

  const renderFileTree = (
    node: FileNode,
    isDirectChild: boolean = false,
    isInModelsDir: boolean = false,
  ): React.ReactNode => {
    // Skip excluded folders
    if (shouldExcludeNode(node, isDirectChild)) {
      return null;
    }

    const nodeId = node.path;
    const isFile = node.type === 'file';

    // Check if current node is the models directory
    const isModelsDir = node.type === 'folder' && node.name === 'models';
    const shouldEnableSelection = isInModelsDir || isModelsDir;

    const isTargetFileType = isFile && isTargetFile(node.name);
    const canSelectFile = isTargetFileType && shouldEnableSelection;

    // Check if folder can be selected (contains target files, is in models directory, but not the models directory itself for staging/incremental)
    const canSelectFolder =
      !isFile &&
      shouldEnableSelection &&
      (mode === 'business' || !isModelsDir) && // For business mode, allow selecting models dir; for others, exclude it
      folderContainsTargetFiles(node);

    const fileSelected = isFileSelected(node.path);
    const folderCheckboxState = getFolderCheckboxState(node);

    // Check if selection is disabled due to directory restrictions
    const nodeDirectoryKey = getDirectoryRestrictionKey(node.path);
    const isDisabledByRestriction =
      restrictedDirectory &&
      nodeDirectoryKey &&
      restrictedDirectory !== nodeDirectoryKey;

    return (
      <TreeItem
        key={nodeId}
        itemId={nodeId}
        label={
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {isFile ? (
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={fileSelected}
                    onChange={(e) =>
                      onFileSelection(node.path, e.target.checked)
                    }
                    onClick={(e) => e.stopPropagation()}
                    disabled={!canSelectFile || !!isDisabledByRestriction}
                    sx={{
                      color:
                        canSelectFile && !isDisabledByRestriction
                          ? 'primary.main'
                          : 'action.disabled',
                      '&.Mui-checked': {
                        color: 'primary.main',
                      },
                    }}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                    <InsertDriveFile
                      sx={{
                        mr: 1.5,
                        fontSize: 18,
                        color:
                          canSelectFile && !isDisabledByRestriction
                            ? 'primary.main'
                            : 'action.disabled',
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 400,
                        color:
                          canSelectFile && !isDisabledByRestriction
                            ? 'text.primary'
                            : 'text.disabled',
                      }}
                    >
                      {node.name}
                    </Typography>
                  </Box>
                }
                sx={{ m: 0 }}
              />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {(canSelectFolder || folderCheckboxState.indeterminate) && (
                  <Checkbox
                    size="small"
                    checked={folderCheckboxState.checked}
                    indeterminate={folderCheckboxState.indeterminate}
                    onChange={(e) =>
                      onFolderSelection(node.path, node, e.target.checked)
                    }
                    onClick={(e) => e.stopPropagation()}
                    disabled={
                      !!isDisabledByRestriction &&
                      !folderCheckboxState.indeterminate
                    }
                    sx={{ mr: 1 }}
                  />
                )}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    ml:
                      canSelectFolder || folderCheckboxState.indeterminate
                        ? 0
                        : 1,
                  }}
                >
                  <Folder
                    sx={{
                      mr: 1.5,
                      fontSize: 18,
                      color: isModelsDir
                        ? 'primary.main'
                        : canSelectFolder && !isDisabledByRestriction
                          ? 'secondary.main'
                          : 'text.secondary',
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: isModelsDir ? 600 : 500,
                      color: isModelsDir
                        ? 'primary.main'
                        : canSelectFolder && !isDisabledByRestriction
                          ? 'text.primary'
                          : isDisabledByRestriction
                            ? 'text.disabled'
                            : 'text.primary',
                    }}
                  >
                    {node.name}
                    {canSelectFolder && (
                      <Typography
                        component="span"
                        variant="caption"
                        sx={{ ml: 1, color: 'text.secondary' }}
                      >
                        (contains{' '}
                        {node.children?.filter(
                          (child) =>
                            child.type === 'file' && isTargetFile(child.name),
                        ).length || 0}{' '}
                        {modeConfig.fileCountLabel})
                      </Typography>
                    )}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        }
      >
        {node.children?.map((child) =>
          renderFileTree(child, false, shouldEnableSelection),
        )}
      </TreeItem>
    );
  };

  // Get all selected items (files from individual selection or files from folder selection)
  const getAllSelectedFiles = (): string[] => {
    const allFiles: string[] = [];

    // Add individually selected files
    allFiles.push(...Array.from(selectedFiles));

    // Add files from selected folders
    if (files) {
      selectedFolders.forEach((folderPath) => {
        const findFolderNode = (node: FileNode): FileNode | null => {
          if (node.path === folderPath) return node;
          if (node.children) {
            for (const child of node.children) {
              const found = findFolderNode(child);
              if (found) return found;
            }
          }
          return null;
        };

        const folderNode = findFolderNode(files);
        if (folderNode) {
          allFiles.push(...getTargetFilesInFolder(folderNode));
        }
      });
    }

    return allFiles;
  };

  const allSelectedFiles = getAllSelectedFiles();

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Select {modeConfig.description} or folders from models directory
        {mode !== 'business' && ' (one subdirectory at a time)'}
      </Typography>

      {restrictedDirectory && (
        <Typography
          variant="caption"
          color="warning.main"
          sx={{ display: 'block', mb: 2 }}
        >
          Selection restricted to: {getRestrictedDirectoryDisplayName()}
        </Typography>
      )}

      {onSelectAllChange && (
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={selectAll}
              indeterminate={selectedFiles.size > 0 && !selectAll}
              onChange={onSelectAllChange}
              disabled={selectedFolders.size > 0}
              sx={{
                color: 'primary.main',
                '&.Mui-checked': {
                  color: 'primary.main',
                },
              }}
            />
          }
          label={modeConfig.selectAllLabel}
          sx={{
            mb: 2,
            '& .MuiFormControlLabel-label': {
              fontSize: '0.875rem',
              fontWeight: 500,
            },
          }}
        />
      )}

      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          height: 250,
          overflow: 'auto',
          borderRadius: 1,
          p: 2,
          backgroundColor: 'background.paper',
          '&:hover': {
            borderColor: 'primary.light',
          },
        }}
      >
        {files ? (
          <TreeView
            expandedItems={expandedItems}
            onExpandedItemsChange={onExpandedItemsChange}
            sx={{
              '& .MuiTreeItem-content': {
                padding: '4px 8px',
                borderRadius: 1,
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
              },
            }}
          >
            {files.children
              ?.map((child) => renderFileTree(child, true, false))
              .filter(Boolean)}
          </TreeView>
        ) : (
          <Box
            sx={{
              py: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.secondary',
            }}
          >
            <Typography>Loading files...</Typography>
          </Box>
        )}
      </Box>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mt: 2, display: 'block' }}
      >
        {selectedFiles.size} files + {selectedFolders.size} folders selected (
        {allSelectedFiles.length} total {modeConfig.fileCountLabel})
      </Typography>
    </Box>
  );
};
