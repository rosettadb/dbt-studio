/**
 * Notebook Toolbar Component
 * Minimal header with notebook name and actions dropdown
 * Styled similar to MotherDuck UI
 */

import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Chip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  useTheme,
} from '@mui/material';
import {
  PlayArrow as RunAllIcon,
  MoreVert as MoreIcon,
  Edit as RenameIcon,
  ContentCopy as CloneIcon,
  Delete as DeleteIcon,
  GetApp as ExportIcon,
} from '@mui/icons-material';
import { Notebook } from '../../../types/notebook';

interface NotebookToolbarProps {
  notebook: Notebook;
  isExecuting: boolean;
  onRunAll: () => void;
  onSave: () => void;
  onExport: () => void;
  onAddCell: (type: 'sql' | 'markdown') => void;
  onInterrupt: () => void;
  onRename?: () => void;
  onClone?: () => void;
  onDeleteAllCells?: () => void;
  onDeleteNotebook?: () => void;
}

export const NotebookToolbar: React.FC<NotebookToolbarProps> = ({
  notebook,
  isExecuting,
  onRunAll,
  onExport,
  onRename,
  onClone,
  onDeleteAllCells,
  onDeleteNotebook,
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleRename = () => {
    handleMenuClose();
    if (onRename) {
      onRename();
    }
  };

  const handleClone = () => {
    handleMenuClose();
    if (onClone) {
      onClone();
    }
  };

  const handleDeleteAllCells = () => {
    handleMenuClose();
    if (onDeleteAllCells) {
      onDeleteAllCells();
    }
  };

  const handleDeleteNotebook = () => {
    handleMenuClose();
    if (onDeleteNotebook) {
      onDeleteNotebook();
    }
  };

  const handleExport = () => {
    handleMenuClose();
    onExport();
  };

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          py: 1.5,
        }}
      >
        {/* Left: Notebook Info */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography
            variant="h6"
            noWrap
            sx={{
              maxWidth: 400,
              fontWeight: 500,
              color: theme.palette.mode === 'dark' ? 'grey.100' : 'grey.900',
            }}
          >
            {notebook.name}
          </Typography>
          <Chip
            label={`${notebook.cells.length} cells`}
            size="small"
            sx={{
              bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200',
              color: theme.palette.mode === 'dark' ? 'grey.300' : 'grey.700',
              fontWeight: 500,
              fontSize: '0.75rem',
            }}
          />
          {notebook.lastExecutedAt && (
            <Typography
              variant="caption"
              sx={{
                color: theme.palette.mode === 'dark' ? 'grey.500' : 'grey.600',
              }}
            >
              Last run: {new Date(notebook.lastExecutedAt).toLocaleString()}
            </Typography>
          )}
        </Box>

        {/* Right: Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Run All Button */}
          <Button
            startIcon={<RunAllIcon />}
            variant="contained"
            size="small"
            onClick={onRunAll}
            disabled={notebook.cells.length === 0 || isExecuting}
            sx={{
              textTransform: 'none',
              bgcolor: theme.palette.mode === 'dark' ? 'primary.dark' : 'primary.main',
              '&:hover': {
                bgcolor: theme.palette.mode === 'dark' ? 'primary.main' : 'primary.dark',
              },
              '&.Mui-disabled': {
                bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.300',
                color: theme.palette.mode === 'dark' ? 'grey.600' : 'grey.500',
              },
            }}
          >
            Run All
          </Button>

          {/* More Actions Menu */}
          <Button
            variant="outlined"
            size="small"
            onClick={handleMenuOpen}
            sx={{
              minWidth: 'auto',
              px: 1,
              borderColor: theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300',
              color: theme.palette.mode === 'dark' ? 'grey.300' : 'grey.700',
              '&:hover': {
                borderColor: theme.palette.mode === 'dark' ? 'grey.600' : 'grey.400',
                bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
              },
            }}
          >
            <MoreIcon fontSize="small" />
          </Button>

          <Menu
            anchorEl={anchorEl}
            open={open}
            onClose={handleMenuClose}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            PaperProps={{
              sx: {
                mt: 1,
                minWidth: 200,
                bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'background.paper',
                border: '1px solid',
                borderColor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200',
              },
            }}
          >
            <MenuItem
              onClick={handleRename}
              sx={{
                color: theme.palette.mode === 'dark' ? 'grey.300' : 'grey.900',
                '&:hover': {
                  bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                },
              }}
            >
              <ListItemIcon>
                <RenameIcon
                  fontSize="small"
                  sx={{ color: theme.palette.mode === 'dark' ? 'grey.400' : 'grey.600' }}
                />
              </ListItemIcon>
              <ListItemText>Rename</ListItemText>
            </MenuItem>

            <MenuItem
              onClick={handleClone}
              sx={{
                color: theme.palette.mode === 'dark' ? 'grey.300' : 'grey.900',
                '&:hover': {
                  bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                },
              }}
            >
              <ListItemIcon>
                <CloneIcon
                  fontSize="small"
                  sx={{ color: theme.palette.mode === 'dark' ? 'grey.400' : 'grey.600' }}
                />
              </ListItemIcon>
              <ListItemText>Clone</ListItemText>
            </MenuItem>

            <MenuItem
              onClick={handleExport}
              sx={{
                color: theme.palette.mode === 'dark' ? 'grey.300' : 'grey.900',
                '&:hover': {
                  bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                },
              }}
            >
              <ListItemIcon>
                <ExportIcon
                  fontSize="small"
                  sx={{ color: theme.palette.mode === 'dark' ? 'grey.400' : 'grey.600' }}
                />
              </ListItemIcon>
              <ListItemText>Export</ListItemText>
            </MenuItem>

            <Divider sx={{ my: 0.5 }} />

            <MenuItem
              onClick={handleDeleteAllCells}
              sx={{
                color: 'error.main',
                '&:hover': {
                  bgcolor: theme.palette.mode === 'dark' ? 'error.dark' : 'error.light',
                  color: theme.palette.mode === 'dark' ? 'error.light' : 'error.dark',
                },
              }}
            >
              <ListItemIcon>
                <DeleteIcon fontSize="small" sx={{ color: 'error.main' }} />
              </ListItemIcon>
              <ListItemText>Delete all cells</ListItemText>
            </MenuItem>

            <MenuItem
              onClick={handleDeleteNotebook}
              sx={{
                color: 'error.main',
                '&:hover': {
                  bgcolor: theme.palette.mode === 'dark' ? 'error.dark' : 'error.light',
                  color: theme.palette.mode === 'dark' ? 'error.light' : 'error.dark',
                },
              }}
            >
              <ListItemIcon>
                <DeleteIcon fontSize="small" sx={{ color: 'error.main' }} />
              </ListItemIcon>
              <ListItemText>Delete notebook</ListItemText>
            </MenuItem>
          </Menu>
        </Box>
      </Box>

      {/* Divider */}
      <Divider />
    </>
  );
};

