/* eslint-disable no-nested-ternary, no-restricted-syntax */
import {
  Close as CloseIcon,
  Folder,
  InsertDriveFile,
} from '@mui/icons-material';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Checkbox,
  TextField,
  IconButton,
  FormControlLabel,
  Box,
  Divider,
  InputAdornment,
  Typography,
} from '@mui/material';
import React from 'react';
import { TreeItem, SimpleTreeView as TreeView } from '@mui/x-tree-view';
import { projectsServices } from '../../../services';
import { useUpdateProject } from '../../../controllers';
import { FileNode, Project } from '../../../../types/backend';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  processCallback: (path: string, selectedFiles: string[]) => void;
  path: string;
  project: Project;
};

export const StagingModal: React.FC<Props> = ({
  isOpen,
  onClose,
  processCallback,
  path,
  project,
}) => {
  const [updatedPath, setUpdatedPath] = React.useState<string>(path);
  const [loading, setLoading] = React.useState(false);
  const [selectAll, setSelectAll] = React.useState(false);
  const [selectedFiles, setSelectedFiles] = React.useState<Set<string>>(
    new Set(),
  );
  const [selectedFolders, setSelectedFolders] = React.useState<Set<string>>(
    new Set(),
  );
  const [files, setFiles] = React.useState<FileNode>();
  const [expandedItems, setExpandedItems] = React.useState<string[]>([]);
  const [restrictedDirectory, setRestrictedDirectory] = React.useState<
    string | null
  >(null);

  const updateProject = useUpdateProject();

  // Helper function to get the immediate subdirectory of models for a given path
  const getModelsSubdirectory = (filePath: string): string | null => {
    const pathParts = filePath.split('/');
    const modelsIndex = pathParts.findIndex((part) => part === 'models');

    if (modelsIndex !== -1 && modelsIndex < pathParts.length - 1) {
      // Return path up to the first subdirectory after models
      return pathParts.slice(0, modelsIndex + 2).join('/');
    }

    return null;
  };

  // Helper function to check if a folder directly contains YAML files (not in subfolders)
  const folderContainsYamlFiles = (node: FileNode): boolean => {
    if (node.type === 'file') {
      return false; // This function is only for folders
    }

    if (node.children) {
      // Check only direct children, not recursive
      return node.children.some(
        (child) =>
          child.type === 'file' &&
          (child.name.endsWith('.yaml') || child.name.endsWith('.yml')),
      );
    }

    return false;
  };

  // Get all YAML files in a folder (only direct children, not subfolders)
  const getYamlFilesInFolder = (node: FileNode): string[] => {
    const yamlFiles: string[] = [];

    // Only get direct children that are YAML files, don't recurse into subfolders
    if (node.children) {
      node.children.forEach((child) => {
        if (
          child.type === 'file' &&
          (child.name.endsWith('.yaml') || child.name.endsWith('.yml'))
        ) {
          yamlFiles.push(child.path);
        }
      });
    }

    return yamlFiles;
  };

  // Recursive function to get all YAML file paths from models directory only
  const getAllYamlFilePaths = (
    node: FileNode,
    isInModelsDir: boolean = false,
  ): string[] => {
    const paths: string[] = [];

    // Check if current node is the models directory
    const isModelsDir = node.type === 'folder' && node.name === 'models';
    const shouldIncludeFiles = isInModelsDir || isModelsDir;

    if (
      node.type === 'file' &&
      shouldIncludeFiles &&
      (node.name.endsWith('.yaml') || node.name.endsWith('.yml'))
    ) {
      paths.push(node.path);
    }

    if (node.children) {
      node.children.forEach((child) => {
        paths.push(...getAllYamlFilePaths(child, shouldIncludeFiles));
      });
    }

    return paths;
  };

  // Filter function to exclude rosetta and .git folders
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

  const handleSelectAllChange = () => {
    if (!files) return;

    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);

    if (newSelectAll) {
      const allYamlFilePaths = getAllYamlFilePaths(files);
      setSelectedFiles(new Set(allYamlFilePaths));
      // Clear folder selections when selecting all files
      setSelectedFolders(new Set());
      // Set restricted directory based on first file
      if (allYamlFilePaths.length > 0) {
        setRestrictedDirectory(getModelsSubdirectory(allYamlFilePaths[0]));
      }
    } else {
      setSelectedFiles(new Set());
      setSelectedFolders(new Set());
      setRestrictedDirectory(null);
    }
  };

  const handleFileSelection = (filePath: string, isSelected: boolean) => {
    const newSelectedFiles = new Set(selectedFiles);
    const fileModelsSubdir = getModelsSubdirectory(filePath);

    if (isSelected) {
      // Check if we can select this file based on directory restrictions
      if (restrictedDirectory && restrictedDirectory !== fileModelsSubdir) {
        return; // Don't allow selection from different models subdirectory
      }

      newSelectedFiles.add(filePath);

      // Set restricted directory if this is the first selection
      if (!restrictedDirectory && fileModelsSubdir) {
        setRestrictedDirectory(fileModelsSubdir);
      }

      // Clear any folder selections when selecting individual files
      setSelectedFolders(new Set());
    } else {
      newSelectedFiles.delete(filePath);

      // If no files are selected, clear directory restriction
      if (newSelectedFiles.size === 0) {
        setRestrictedDirectory(null);
      }
    }

    setSelectedFiles(newSelectedFiles);

    // Update selectAll state based on whether all YAML files are selected
    if (files) {
      const allYamlFilePaths = getAllYamlFilePaths(files);
      const allSelected = allYamlFilePaths.every((_path) =>
        newSelectedFiles.has(_path),
      );
      setSelectAll(allSelected);
    }
  };

  const handleFolderSelection = (
    folderPath: string,
    folderNode: FileNode,
    isSelected: boolean,
  ) => {
    const newSelectedFolders = new Set(selectedFolders);
    const folderModelsSubdir = getModelsSubdirectory(folderPath);

    if (isSelected) {
      // Check if we can select this folder based on directory restrictions
      if (restrictedDirectory && restrictedDirectory !== folderModelsSubdir) {
        return; // Don't allow selection from different models subdirectory
      }

      newSelectedFolders.add(folderPath);

      // Set restricted directory if this is the first selection
      if (!restrictedDirectory && folderModelsSubdir) {
        setRestrictedDirectory(folderModelsSubdir);
      }

      // Clear any individual file selections when selecting folders
      setSelectedFiles(new Set());
      setSelectAll(false);
    } else {
      newSelectedFolders.delete(folderPath);

      // If no folders are selected, clear directory restriction
      if (newSelectedFolders.size === 0) {
        setRestrictedDirectory(null);
      }
    }

    setSelectedFolders(newSelectedFolders);
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

    const isYamlFile =
      isFile && (node.name.endsWith('.yaml') || node.name.endsWith('.yml'));
    const canSelectFile = isYamlFile && shouldEnableSelection;

    // Check if folder can be selected (contains YAML files, is in models directory, but not the models directory itself)
    const canSelectFolder =
      !isFile &&
      shouldEnableSelection &&
      !isModelsDir && // Exclude the models directory itself
      folderContainsYamlFiles(node);

    const isFileSelected = selectedFiles.has(node.path);
    const isFolderSelected = selectedFolders.has(node.path);

    // Check if selection is disabled due to directory restrictions
    const nodeModelsSubdir = getModelsSubdirectory(node.path);
    const isDisabledByRestriction =
      restrictedDirectory &&
      nodeModelsSubdir &&
      restrictedDirectory !== nodeModelsSubdir;

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
                    checked={isFileSelected}
                    onChange={(e) =>
                      handleFileSelection(node.path, e.target.checked)
                    }
                    onClick={(e) => e.stopPropagation()}
                    disabled={!canSelectFile || !!isDisabledByRestriction}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                    <InsertDriveFile
                      sx={{
                        mr: 1,
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
                {canSelectFolder && (
                  <Checkbox
                    size="small"
                    checked={isFolderSelected}
                    onChange={(e) =>
                      handleFolderSelection(node.path, node, e.target.checked)
                    }
                    onClick={(e) => e.stopPropagation()}
                    disabled={!!isDisabledByRestriction}
                    sx={{ mr: 1 }}
                  />
                )}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    ml: canSelectFolder ? 0 : 1,
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
                        : // eslint-disable-next-line no-nested-ternary
                          canSelectFolder && !isDisabledByRestriction
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
                            child.type === 'file' &&
                            (child.name.endsWith('.yaml') ||
                              child.name.endsWith('.yml')),
                        ).length || 0}{' '}
                        YAML files)
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

  React.useEffect(() => {
    const loadDirectory = async (projectPath: string) => {
      const data = await projectsServices.loadProjectDirectory({
        path: projectPath,
      });
      setFiles(data);
    };

    if (project.path) {
      loadDirectory(project.path);
    }
  }, [project.path]);

  // Reset selections when files change
  React.useEffect(() => {
    setSelectedFiles(new Set());
    setSelectedFolders(new Set());
    setRestrictedDirectory(null);
    setSelectAll(false);
  }, [files]);

  React.useEffect(() => {
    return () => setLoading(false);
  }, []);

  const handleExpandedItemsChange = (
    event: React.SyntheticEvent,
    itemIds: string[],
  ) => {
    setExpandedItems(itemIds);
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
          allFiles.push(...getYamlFilesInFolder(folderNode));
        }
      });
    }

    return allFiles;
  };

  const totalSelectedItems = selectedFiles.size + selectedFolders.size;
  const allSelectedFiles = getAllSelectedFiles();

  // Get the display name for restricted directory
  const getRestrictedDirectoryDisplayName = (): string => {
    if (!restrictedDirectory) return '';
    const pathParts = restrictedDirectory.split('/');
    const modelsIndex = pathParts.findIndex((part) => part === 'models');
    if (modelsIndex !== -1 && modelsIndex < pathParts.length - 1) {
      return `models/${pathParts[modelsIndex + 1]}`;
    }
    return restrictedDirectory;
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            maxHeight: '90vh',
            borderRadius: 2,
            boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.12)',
          },
        },
      }}
    >
      <DialogTitle sx={{ pb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Rosetta DBT Staging
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ py: 3 }}>
        {/* File Selection Section */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select YAML files or folders from {project.path}/models directory
            (one subdirectory at a time)
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

          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={selectAll}
                indeterminate={selectedFiles.size > 0 && !selectAll}
                onChange={handleSelectAllChange}
                disabled={selectedFolders.size > 0}
                sx={{
                  color: 'primary.main',
                  '&.Mui-checked': {
                    color: 'primary.main',
                  },
                }}
              />
            }
            label="Select All YAML Files (models directory only)"
            sx={{
              mb: 2,
              '& .MuiFormControlLabel-label': {
                fontSize: '0.875rem',
                fontWeight: 500,
              },
            }}
          />

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
                onExpandedItemsChange={handleExpandedItemsChange}
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
            {selectedFiles.size} files + {selectedFolders.size} folders selected
            ({allSelectedFiles.length} total YAML files)
          </Typography>
        </Box>

        <Divider sx={{ mb: 4 }} />

        {/* Output Path Section */}
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Output path
          </Typography>
          <TextField
            fullWidth
            value={updatedPath}
            onChange={(event) => setUpdatedPath(event.target.value)}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <Button
                      variant="outlined"
                      size="small"
                      sx={{
                        borderRadius: 1.5,
                        textTransform: 'none',
                        fontWeight: 500,
                      }}
                      onClick={async () => {
                        const result = await projectsServices.chooseDir({
                          path: updatedPath,
                        });
                        if (result !== 'false') {
                          setUpdatedPath(result);
                        }
                      }}
                    >
                      Browse
                    </Button>
                  </InputAdornment>
                ),
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'primary.light',
                },
              },
            }}
          />
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          pb: 3,
          pt: 2,
          gap: 2,
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <Button
          onClick={onClose}
          color="inherit"
          sx={{
            textTransform: 'none',
            fontWeight: 500,
            px: 3,
          }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={async () => {
            setLoading(true);
            await updateProject.mutateAsync({
              ...project,
              stagingDir: updatedPath,
            });
            processCallback(updatedPath, allSelectedFiles);
          }}
          disabled={totalSelectedItems === 0 || loading}
          sx={{
            textTransform: 'none',
            fontWeight: 500,
            px: 3,
            borderRadius: 1.5,
          }}
        >
          Generate Staging Models
        </Button>
      </DialogActions>
    </Dialog>
  );
};
