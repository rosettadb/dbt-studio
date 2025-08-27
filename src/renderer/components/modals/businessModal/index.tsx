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
  processCallback: (
    path: string,
    query: string,
    selectedFiles: string[],
  ) => void;
  path: string;
  project: Project;
};

export const BusinessModal: React.FC<Props> = ({
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
  const [query, setQuery] = React.useState('');

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
      maxWidth="lg"
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
            Rosetta DBT Business
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ py: 3 }}>
        {/* Query Section */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Write your prompt to generate DBT business models
          </Typography>
          <TextField
            variant="outlined"
            label="Prompt"
            placeholder="Write your prompt to generate a dbt business models."
            onChange={(event) => setQuery(event.target.value)}
            value={query}
            fullWidth
            multiline
            rows={5}
            slotProps={{
              input: {
                style: {
                  minHeight: '60px',
                },
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                height: 'auto',
              },
              '& .MuiInputBase-inputMultiline': {
                height: '60px !important',
                resize: 'none',
              },
            }}
          />
        </Box>

        <Divider sx={{ mb: 4 }} />

        {/* File Selection Section */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select SQL files or folders from {project.path}/models directory
          </Typography>

          {restrictedDirectory && (
            <Typography
              variant="caption"
              color="warning.main"
              sx={{ display: 'block', mb: 2 }}
            >
              Selection restricted to: {restrictedDirectory}
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
              />
            }
            label="Select All SQL Files (models directory only)"
            sx={{
              mb: 2,
              '& .MuiFormControlLabel-label': { fontSize: '0.875rem' },
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
            ({allSelectedFiles.length} total SQL files)
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
                          await updateProject.mutateAsync({
                            ...project,
                            businessDir: result,
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
          onClick={() => processCallback(updatedPath, query, allSelectedFiles)}
          disabled={totalSelectedItems === 0 || query.trim() === ''}
          sx={{
            fontWeight: 500,
            textTransform: 'uppercase',
            px: 3,
            borderRadius: 1.5,
          }}
        >
          Generate Business Models
        </Button>
      </DialogActions>
    </Dialog>
  );
};
