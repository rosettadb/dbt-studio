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
  DialogContentText,
  Divider,
  InputAdornment,
  Typography,
  Paper,
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

export const IncrementalModal: React.FC<Props> = ({
  isOpen,
  onClose,
  processCallback,
  path,
  project,
}) => {
  const [updatedPath, setUpdatedPath] = React.useState<string>(path);
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

  // Helper function to get directory path from a file/folder path
  const getDirectoryPath = (filePath: string): string => {
    const pathParts = filePath.split('/');
    return pathParts.slice(0, -1).join('/');
  };

  // Helper function to check if a folder directly contains SQL files (not in subfolders)
  const folderContainsSqlFiles = (node: FileNode): boolean => {
    if (node.type === 'file') {
      return false; // This function is only for folders
    }

    if (node.children) {
      // Check only direct children, not recursive
      return node.children.some(
        (child) => child.type === 'file' && child.name.endsWith('.sql'),
      );
    }

    return false;
  };

  // Get all SQL files in a folder (only direct children, not subfolders)
  const getSqlFilesInFolder = (node: FileNode): string[] => {
    const sqlFiles: string[] = [];

    // Only get direct children that are SQL files, don't recurse into subfolders
    if (node.children) {
      node.children.forEach((child) => {
        if (child.type === 'file' && child.name.endsWith('.sql')) {
          sqlFiles.push(child.path);
        }
      });
    }

    return sqlFiles;
  };

  // Recursive function to get all SQL file paths from models directory only
  const getAllSqlFilePaths = (
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
      node.name.endsWith('.sql')
    ) {
      paths.push(node.path);
    }

    if (node.children) {
      node.children.forEach((child) => {
        paths.push(...getAllSqlFilePaths(child, shouldIncludeFiles));
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
      return node.name === 'rosetta' || node.name === '.git';
    }
    return false;
  };

  // Get all directory paths for initial expansion (excluding rosetta and .git)
  const getAllDirectoryPaths = (
    node: FileNode,
    isDirectChild: boolean = false,
  ): string[] => {
    const paths: string[] = [];
    if (node.type === 'folder' && !shouldExcludeNode(node, isDirectChild)) {
      paths.push(node.path);
      if (node.children) {
        node.children.forEach((child) => {
          paths.push(...getAllDirectoryPaths(child, false));
        });
      }
    }
    return paths;
  };

  const handleSelectAllChange = () => {
    if (!files) return;

    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);

    if (newSelectAll) {
      const allSqlFilePaths = getAllSqlFilePaths(files);
      setSelectedFiles(new Set(allSqlFilePaths));
      // Clear folder selections when selecting all files
      setSelectedFolders(new Set());
      // Set restricted directory based on first file
      if (allSqlFilePaths.length > 0) {
        setRestrictedDirectory(getDirectoryPath(allSqlFilePaths[0]));
      }
    } else {
      setSelectedFiles(new Set());
      setSelectedFolders(new Set());
      setRestrictedDirectory(null);
    }
  };

  const handleFileSelection = (filePath: string, isSelected: boolean) => {
    const newSelectedFiles = new Set(selectedFiles);
    const fileDirectory = getDirectoryPath(filePath);

    if (isSelected) {
      // Check if we can select this file based on directory restrictions
      if (restrictedDirectory && restrictedDirectory !== fileDirectory) {
        return; // Don't allow selection from different directory
      }

      newSelectedFiles.add(filePath);

      // Set restricted directory if this is the first selection
      if (!restrictedDirectory) {
        setRestrictedDirectory(fileDirectory);
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

    // Update selectAll state based on whether all SQL files are selected
    if (files) {
      const allSqlFilePaths = getAllSqlFilePaths(files);
      const allSelected = allSqlFilePaths.every((_path) =>
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
    const folderDirectory = getDirectoryPath(folderPath);

    if (isSelected) {
      // Check if we can select this folder based on directory restrictions
      if (restrictedDirectory && restrictedDirectory !== folderDirectory) {
        return; // Don't allow selection from different directory
      }

      newSelectedFolders.add(folderPath);

      // Set restricted directory if this is the first selection
      if (!restrictedDirectory) {
        setRestrictedDirectory(folderDirectory);
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

    const isSqlFile = isFile && node.name.endsWith('.sql');
    const canSelectFile = isSqlFile && shouldEnableSelection;

    // Check if folder can be selected (contains SQL files and is in models directory)
    const canSelectFolder =
      !isFile && shouldEnableSelection && folderContainsSqlFiles(node);

    const isFileSelected = selectedFiles.has(node.path);
    const isFolderSelected = selectedFolders.has(node.path);

    // Check if selection is disabled due to directory restrictions
    const nodeDirectory = getDirectoryPath(node.path);
    const isDisabledByRestriction =
      restrictedDirectory && restrictedDirectory !== nodeDirectory;

    return (
      <TreeItem
        key={nodeId}
        itemId={nodeId}
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
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
                            child.type === 'file' &&
                            child.name.endsWith('.sql'),
                        ).length || 0}{' '}
                        SQL files)
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

      // Auto-expand all directories for better UX (excluding rosetta and .git)
      if (data && data.children) {
        const filteredChildren = data.children.filter(
          (child) => !shouldExcludeNode(child, true),
        );
        const allDirPaths = filteredChildren.flatMap((child) =>
          getAllDirectoryPaths(child, false),
        );
        setExpandedItems(allDirPaths);
      }
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
          allFiles.push(...getSqlFilesInFolder(folderNode));
        }
      });
    }

    return allFiles;
  };

  const totalSelectedItems = selectedFiles.size + selectedFolders.size;
  const allSelectedFiles = getAllSelectedFiles();

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: { height: '80vh' },
        },
      }}
    >
      <DialogTitle>
        Rosetta DBT Incremental
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={(theme) => ({
            position: 'absolute',
            right: 8,
            top: 8,
            color: theme.palette.grey[500],
          })}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 3 }}
      >
        <DialogContentText sx={{ color: 'text.secondary', mb: 1 }}>
          Please select SQL files or folders from {project.path}/models
          directory
          {restrictedDirectory && (
            <Typography
              variant="caption"
              display="block"
              sx={{ mt: 1, color: 'warning.main' }}
            >
              Selection restricted to: {restrictedDirectory}
            </Typography>
          )}
        </DialogContentText>

        {/* File Selection Section */}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <FormControlLabel
            control={
              <Checkbox
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
            label={
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Select All SQL Files (models directory only)
              </Typography>
            }
            sx={{ mb: 2 }}
          />

          <Paper
            variant="outlined"
            sx={{
              height: 300,
              overflow: 'auto',
              p: 1,
            }}
          >
            {files ? (
              <TreeView
                expandedItems={expandedItems}
                onExpandedItemsChange={handleExpandedItemsChange}
                sx={{
                  flexGrow: 1,
                  overflowY: 'auto',
                }}
              >
                {files.children
                  ?.map((child) => renderFileTree(child, true))
                  .filter(Boolean)}
              </TreeView>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                  color: 'text.secondary',
                }}
              >
                <Typography>Loading files...</Typography>
              </Box>
            )}
          </Paper>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 1, display: 'block' }}
          >
            {selectedFiles.size} individual file(s) + {selectedFolders.size}{' '}
            folder(s) selected ({allSelectedFiles.length} total SQL files)
          </Typography>
        </Box>

        <Divider sx={{ my: 1 }} />

        {/* Output Path Section */}
        <Box>
          <DialogContentText sx={{ mb: 2, color: 'text.secondary' }}>
            Please select output path
          </DialogContentText>

          <TextField
            label="Output path"
            variant="outlined"
            fullWidth
            value={updatedPath}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                height: 48,
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'primary.light',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'primary.main',
                },
              },
            }}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      sx={{
                        borderRadius: 1.5,
                        textTransform: 'none',
                        fontWeight: 500,
                        px: 2,
                        '&:hover': {
                          boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.15)',
                        },
                      }}
                      onClick={async () => {
                        const result = await projectsServices.chooseDir({
                          path: updatedPath,
                        });
                        if (result !== 'false') {
                          await updateProject.mutateAsync({
                            ...project,
                            incrementalDir: result,
                          });
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
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => processCallback(updatedPath, allSelectedFiles)}
          disabled={totalSelectedItems === 0}
        >
          Generate Incremental Models
        </Button>
      </DialogActions>
    </Dialog>
  );
};
