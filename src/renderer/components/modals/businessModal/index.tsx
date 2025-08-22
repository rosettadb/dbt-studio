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
  const [files, setFiles] = React.useState<FileNode>();
  const [query, setQuery] = React.useState('');

  const updateProject = useUpdateProject();

  // Recursive function to get all SQL file paths
  const getAllSqlFilePaths = (node: FileNode): string[] => {
    const paths: string[] = [];
    if (node.type === 'file' && node.name.endsWith('.sql')) {
      paths.push(node.path);
    }
    if (node.children) {
      node.children.forEach((child) => {
        paths.push(...getAllSqlFilePaths(child));
      });
    }
    return paths;
  };

  // Filter function to show only SQL files and folders that contain SQL files
  const filterSqlFiles = (node: FileNode): FileNode | null => {
    if (node.type === 'file') {
      return node.name.endsWith('.sql') ? node : null;
    }

    // For folders, recursively filter children
    if (node.children) {
      const filteredChildren = node.children
        .map((child) => filterSqlFiles(child))
        .filter((child) => child !== null) as FileNode[];

      // Only include folder if it has SQL files in it (directly or in subfolders)
      if (filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        };
      }
    }

    return null;
  };

  const handleSelectAllChange = () => {
    if (!files) return;

    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);

    if (newSelectAll) {
      const allSqlFilePaths = getAllSqlFilePaths(files);
      setSelectedFiles(new Set(allSqlFilePaths));
    } else {
      setSelectedFiles(new Set());
    }
  };

  const handleFileSelection = (filePath: string, isSelected: boolean) => {
    const newSelectedFiles = new Set(selectedFiles);

    if (isSelected) {
      newSelectedFiles.add(filePath);
    } else {
      newSelectedFiles.delete(filePath);
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

  const renderFileTree = (node: FileNode): React.ReactNode => {
    const nodeId = node.path;
    const isFile = node.type === 'file';
    const isSelected = selectedFiles.has(node.path);

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
                    checked={isSelected}
                    onChange={(e) =>
                      handleFileSelection(node.path, e.target.checked)
                    }
                    onClick={(e) => e.stopPropagation()}
                    sx={{
                      color: 'primary.main',
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
                        color: 'primary.main',
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 400,
                        color: 'text.primary',
                      }}
                    >
                      {node.name}
                    </Typography>
                  </Box>
                }
                sx={{ m: 0 }}
              />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                <Folder
                  sx={{
                    mr: 1.5,
                    fontSize: 18,
                    color: 'text.secondary',
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 500,
                    color: 'text.primary',
                  }}
                >
                  {node.name}
                </Typography>
              </Box>
            )}
          </Box>
        }
      >
        {node.children?.map((child) => renderFileTree(child))}
      </TreeItem>
    );
  };

  React.useEffect(() => {
    const loadDirectory = async (incrementalPath: string) => {
      const data = await projectsServices.loadProjectDirectory({
        path: incrementalPath,
      });
      setFiles(data);
    };
    if (project.incrementalDir) {
      loadDirectory(project.incrementalDir);
    }
  }, [project.incrementalDir]);

  // Reset selections when files change
  React.useEffect(() => {
    setSelectedFiles(new Set());
    setSelectAll(false);
  }, [files]);

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          height: '85vh',
          borderRadius: 2,
          boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.12)',
        },
      }}
    >
      <DialogTitle
        sx={{
          fontWeight: 500,
          fontSize: '1.25rem',
          borderBottom: 1,
          borderColor: 'divider',
          pb: 2,
        }}
      >
        Rosetta DBT Business
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 12,
            top: 12,
            color: 'text.secondary',
            '&:hover': {
              backgroundColor: 'action.hover',
            },
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 3 }}
      >
        {/* Query Input Section */}
        <Box>
          <DialogContentText sx={{ mb: 2, color: 'text.secondary' }}>
            Write your prompt to generate DBT business models
          </DialogContentText>

          <TextField
            variant="outlined"
            label="Business Logic Prompt"
            placeholder="Describe the business logic you want to implement in your DBT models..."
            onChange={(event) => setQuery(event.target.value)}
            value={query}
            fullWidth
            multiline
            rows={4}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'primary.light',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'primary.main',
                },
              },
              '& .MuiInputBase-inputMultiline': {
                minHeight: '100px',
                resize: 'vertical',
              },
            }}
          />
        </Box>

        <Divider sx={{ my: 1 }} />

        {/* File Selection Section */}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <DialogContentText sx={{ color: 'text.secondary', mb: 2 }}>
            Please select SQL files from {project.stagingDir}
          </DialogContentText>

          <FormControlLabel
            control={
              <Checkbox
                checked={selectAll}
                indeterminate={selectedFiles.size > 0 && !selectAll}
                onChange={handleSelectAllChange}
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
                Select All SQL Files
              </Typography>
            }
            sx={{ mb: 2 }}
          />

          <Paper
            variant="outlined"
            sx={{
              height: 250,
              overflow: 'auto',
              p: 2,
              backgroundColor: 'background.paper',
              borderRadius: 2,
              border: 1,
              borderColor: 'divider',
              '&:hover': {
                borderColor: 'primary.light',
              },
            }}
          >
            {files ? (
              (() => {
                const filteredFiles = filterSqlFiles(files);
                return filteredFiles ? (
                  <TreeView
                    expandedItems={[files.path]}
                    sx={{
                      flexGrow: 1,
                      overflowY: 'auto',
                      '& .MuiTreeItem-content': {
                        padding: '4px 8px',
                        borderRadius: 1,
                        '&:hover': {
                          backgroundColor: 'action.hover',
                        },
                        '&.Mui-selected': {
                          backgroundColor: 'primary.light',
                          '&:hover': {
                            backgroundColor: 'primary.light',
                          },
                        },
                      },
                    }}
                  >
                    {renderFileTree(filteredFiles)}
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
                    <Typography>
                      No SQL files found in this directory
                    </Typography>
                  </Box>
                );
              })()
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
            sx={{
              mt: 2,
              display: 'block',
              fontWeight: 500,
              fontSize: '0.75rem',
            }}
          >
            {selectedFiles.size} SQL file(s) selected
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
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, pt: 2, gap: 2 }}>
        <Button
          onClick={onClose}
          color="inherit"
          sx={{
            borderRadius: 1.5,
            textTransform: 'none',
            fontWeight: 500,
            px: 3,
            color: 'text.secondary',
            '&:hover': {
              backgroundColor: 'action.hover',
            },
          }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() =>
            processCallback(updatedPath, query, Array.from(selectedFiles))
          }
          disabled={selectedFiles.size === 0 || query.trim() === ''}
          sx={{
            borderRadius: 1.5,
            textTransform: 'none',
            fontWeight: 500,
            px: 3,
            '&:hover': {
              boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.15)',
            },
            '&:disabled': {
              backgroundColor: 'action.disabledBackground',
              color: 'action.disabled',
            },
          }}
        >
          Generate Business Models
        </Button>
      </DialogActions>
    </Dialog>
  );
};
