/* eslint-disable no-nested-ternary, no-restricted-syntax */
import { Close as CloseIcon } from '@mui/icons-material';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  IconButton,
  Box,
  Divider,
  InputAdornment,
  Typography,
} from '@mui/material';
import React from 'react';
import { projectsServices } from '../../../services';
import { useUpdateProject } from '../../../controllers';
import { FileNode, Project } from '../../../../types/backend';
import { SelectableFileTree } from '../../selectableFileTree';

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
  const [loading, setLoading] = React.useState(false);

  const updateProject = useUpdateProject();

  // Helper function to get directory path from a file/folder path
  const getDirectoryPath = (filePath: string): string => {
    const pathParts = filePath.split('/');
    return pathParts.slice(0, -1).join('/');
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
          // Get all SQL files in folder (only direct children)
          if (folderNode.children) {
            folderNode.children.forEach((child) => {
              if (child.type === 'file' && child.name.endsWith('.sql')) {
                allFiles.push(child.path);
              }
            });
          }
        }
      });
    }

    return allFiles;
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

  const handleExpandedItemsChange = (
    event: React.SyntheticEvent,
    itemIds: string[],
  ) => {
    setExpandedItems(itemIds);
  };

  const getDirectoryRestrictionKey = (filePath: string): string | null => {
    return getDirectoryPath(filePath);
  };

  const getRestrictedDirectoryDisplayName = (): string => {
    return restrictedDirectory || '';
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
        <SelectableFileTree
          files={files}
          mode="business"
          selectAll={selectAll}
          selectedFiles={selectedFiles}
          selectedFolders={selectedFolders}
          expandedItems={expandedItems}
          restrictedDirectory={restrictedDirectory}
          onSelectAllChange={handleSelectAllChange}
          onFileSelection={handleFileSelection}
          onFolderSelection={handleFolderSelection}
          onExpandedItemsChange={handleExpandedItemsChange}
          getDirectoryRestrictionKey={getDirectoryRestrictionKey}
          getRestrictedDirectoryDisplayName={getRestrictedDirectoryDisplayName}
        />

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
              businessDir: updatedPath,
            });
            processCallback(updatedPath, query, allSelectedFiles);
          }}
          disabled={query.trim() === '' || loading}
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
