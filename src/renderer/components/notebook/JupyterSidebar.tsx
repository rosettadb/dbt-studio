import React, { useState, useCallback } from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  useTheme,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  Add,
  Search,
  Upload,
  Close,
  Description,
  FileDownload,
  Refresh,
} from '@mui/icons-material';
import { PythonNotebook } from '../../../types/notebooks';
import { PythonNotebooksTreeView } from './PythonNotebooksTreeView';

export interface JupyterSidebarProps {
  pythonNotebooks: PythonNotebook[];
  isLoading: boolean;
  onCreateNotebook: () => void;
  onOpenNotebook: (notebookId: string) => void;
  onRenameNotebook: (notebookId: string, currentName: string) => void;
  onDuplicateNotebook: (notebookId: string, currentName: string) => void;
  onDeleteNotebook: (notebookId: string, notebookName: string) => void;
  onRefresh?: () => void;
  onExportNotebook?: () => void;
  onImportNotebook?: () => void;
  canExportNotebook?: boolean;
}

export const JupyterSidebar: React.FC<JupyterSidebarProps> = ({
  pythonNotebooks,
  isLoading,
  onCreateNotebook,
  onOpenNotebook,
  onRenameNotebook,
  onDuplicateNotebook,
  onDeleteNotebook,
  onRefresh,
  onExportNotebook,
  onImportNotebook,
  canExportNotebook = false,
}) => {
  const theme = useTheme();
  const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState('');

  const handleAddMenuOpen = useCallback(
    (e: React.MouseEvent<HTMLElement>) => setAddMenuAnchor(e.currentTarget),
    [],
  );
  const handleAddMenuClose = useCallback(() => setAddMenuAnchor(null), []);
  const handleExportMenuOpen = useCallback(
    (e: React.MouseEvent<HTMLElement>) => setExportMenuAnchor(e.currentTarget),
    [],
  );
  const handleExportMenuClose = useCallback(
    () => setExportMenuAnchor(null),
    [],
  );

  const handleCreate = useCallback(() => {
    handleAddMenuClose();
    onCreateNotebook();
  }, [handleAddMenuClose, onCreateNotebook]);

  const handleImport = useCallback(() => {
    handleAddMenuClose();
    onImportNotebook?.();
  }, [handleAddMenuClose, onImportNotebook]);
  const handleExport = useCallback(() => {
    handleExportMenuClose();
    onExportNotebook?.();
  }, [handleExportMenuClose, onExportNotebook]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value),
    [],
  );
  const handleClearSearch = useCallback(() => setSearchQuery(''), []);
  const iconButtonSx = {
    width: 28,
    height: 28,
    bgcolor: 'transparent',
    '&:hover': { bgcolor: 'action.hover' },
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: 'background.paper',
      }}
    >
      {/* Action bar — same layout as SQL sidebar action bar */}
      <Box
        sx={{
          display: 'flex',
          gap: 0.5,
          p: 1,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <TextField
          fullWidth
          size="small"
          placeholder="Search notebooks..."
          value={searchQuery}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 16, color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                  sx={{ width: 20, height: 20 }}
                >
                  <Close sx={{ fontSize: 14 }} />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              height: 32,
              fontSize: '0.8rem',
              bgcolor: theme.palette.background.default,
            },
          }}
        />

        {onRefresh && (
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={onRefresh} sx={iconButtonSx}>
              <Refresh sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}

        <Tooltip title="Export">
          <IconButton
            size="small"
            onClick={handleExportMenuOpen}
            aria-controls="jupyter-export-menu"
            aria-haspopup="true"
            sx={iconButtonSx}
          >
            <FileDownload sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Add">
          <IconButton
            size="small"
            onClick={handleAddMenuOpen}
            aria-controls="jupyter-add-menu"
            aria-haspopup="true"
            sx={iconButtonSx}
          >
            <Add sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Export menu */}
      <Menu
        id="jupyter-export-menu"
        anchorEl={exportMenuAnchor}
        open={Boolean(exportMenuAnchor)}
        onClose={handleExportMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <MenuItem onClick={handleExport} disabled={!canExportNotebook}>
          <ListItemIcon>
            <FileDownload fontSize="small" />
          </ListItemIcon>
          <ListItemText>Export Selected (.ipynb)</ListItemText>
        </MenuItem>
      </Menu>

      {/* Add menu */}
      <Menu
        id="jupyter-add-menu"
        anchorEl={addMenuAnchor}
        open={Boolean(addMenuAnchor)}
        onClose={handleAddMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <MenuItem onClick={handleCreate}>
          <ListItemIcon>
            <Description fontSize="small" />
          </ListItemIcon>
          <ListItemText>Add New Notebook</ListItemText>
        </MenuItem>
        {onImportNotebook && (
          <MenuItem onClick={handleImport}>
            <ListItemIcon>
              <Upload fontSize="small" />
            </ListItemIcon>
            <ListItemText>Import Notebook (.ipynb)</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Notebook tree — same style as SQL notebooks tree */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <Box sx={{ height: '100%', overflow: 'auto', p: 1 }}>
          <PythonNotebooksTreeView
            notebooks={pythonNotebooks}
            isLoading={isLoading}
            filter={searchQuery}
            onOpenNotebook={onOpenNotebook}
            onRenameNotebook={onRenameNotebook}
            onDuplicateNotebook={onDuplicateNotebook}
            onDeleteNotebook={onDeleteNotebook}
          />
        </Box>
      </Box>
    </Box>
  );
};
