/**
 * Notebook Toolbar Component
 * Header with notebook name and action icons
 * Styled similar to MotherDuck UI
 */

import React from 'react';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  useTheme,
  Button,
} from '@mui/material';
import {
  PlayArrow as RunAllIcon,
  Add as AddCellIcon,
  CleaningServices as ClearIcon,
  GetApp as ExportIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ContentCopy as DuplicateIcon,
  DeleteSweep as DeleteAllIcon,
} from '@mui/icons-material';
import { Notebook } from '../../../types/notebooks';

interface NotebookToolbarProps {
  notebook: Notebook;
  isExecuting: boolean;
  onRunAll: () => void;
  onExport: () => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onDeleteAllCells?: () => void;
  onDeleteNotebook?: () => void;
  onAddCell?: () => void;
  onClearOutputs?: () => void;
}

export const NotebookToolbar: React.FC<NotebookToolbarProps> = ({
  notebook,
  isExecuting,
  onRunAll,
  onExport,
  onRename,
  onDuplicate,
  onDeleteAllCells,
  onDeleteNotebook,
  onAddCell,
  onClearOutputs,
}) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        py: 1,
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
            fontSize: '1rem',
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
            fontSize: '0.7rem',
            height: 20,
          }}
        />
      </Box>

      {/* Right: Action Icons */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {/* Add Cell */}
        <Tooltip title="Add New Cell">
          <IconButton
            size="small"
            onClick={onAddCell}
            sx={{
              width: 28,
              height: 28,
              color: theme.palette.mode === 'dark' ? 'grey.400' : 'grey.600',
              border: '1px solid',
              borderColor:
                theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300',
              borderRadius: 1,
              '&:hover': {
                bgcolor:
                  theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                borderColor:
                  theme.palette.mode === 'dark' ? 'grey.600' : 'grey.400',
                color: theme.palette.mode === 'dark' ? 'grey.200' : 'grey.800',
              },
            }}
          >
            <AddCellIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        {/* Export Workbook */}
        <Tooltip title="Export Notebook">
          <IconButton
            size="small"
            onClick={onExport}
            sx={{
              width: 28,
              height: 28,
              color: theme.palette.mode === 'dark' ? 'grey.400' : 'grey.600',
              border: '1px solid',
              borderColor:
                theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300',
              borderRadius: 1,
              '&:hover': {
                bgcolor:
                  theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                borderColor:
                  theme.palette.mode === 'dark' ? 'grey.600' : 'grey.400',
                color: theme.palette.mode === 'dark' ? 'grey.200' : 'grey.800',
              },
            }}
          >
            <ExportIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        {/* Edit */}
        <Tooltip title="Edit Workbook">
          <IconButton
            size="small"
            onClick={onRename}
            sx={{
              width: 28,
              height: 28,
              color: theme.palette.mode === 'dark' ? 'grey.400' : 'grey.600',
              border: '1px solid',
              borderColor:
                theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300',
              borderRadius: 1,
              '&:hover': {
                bgcolor:
                  theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                borderColor:
                  theme.palette.mode === 'dark' ? 'grey.600' : 'grey.400',
                color: theme.palette.mode === 'dark' ? 'grey.200' : 'grey.800',
              },
            }}
          >
            <EditIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        {/* Duplicate Workbook */}
        <Tooltip title="Duplicate Workbook">
          <IconButton
            size="small"
            onClick={onDuplicate}
            sx={{
              width: 28,
              height: 28,
              color: theme.palette.mode === 'dark' ? 'grey.400' : 'grey.600',
              border: '1px solid',
              borderColor:
                theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300',
              borderRadius: 1,
              '&:hover': {
                bgcolor:
                  theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                borderColor:
                  theme.palette.mode === 'dark' ? 'grey.600' : 'grey.400',
                color: theme.palette.mode === 'dark' ? 'grey.200' : 'grey.800',
              },
            }}
          >
            <DuplicateIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        {/* Delete All Cells */}
        <Tooltip title="Delete All Cells">
          <IconButton
            size="small"
            onClick={onDeleteAllCells}
            disabled={notebook.cells.length === 0}
            sx={{
              width: 28,
              height: 28,
              color:
                theme.palette.mode === 'dark'
                  ? 'warning.light'
                  : 'warning.main',
              border: '1px solid',
              borderColor:
                theme.palette.mode === 'dark'
                  ? 'warning.dark'
                  : 'warning.light',
              borderRadius: 1,
              '&:hover': {
                bgcolor:
                  theme.palette.mode === 'dark'
                    ? 'warning.dark'
                    : 'warning.light',
                borderColor:
                  theme.palette.mode === 'dark'
                    ? 'warning.main'
                    : 'warning.main',
              },
              '&.Mui-disabled': {
                borderColor:
                  theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200',
                color: theme.palette.mode === 'dark' ? 'grey.700' : 'grey.400',
              },
            }}
          >
            <DeleteAllIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        {/* Delete Workbook */}
        <Tooltip title="Delete Workbook">
          <IconButton
            size="small"
            onClick={onDeleteNotebook}
            sx={{
              width: 28,
              height: 28,
              color:
                theme.palette.mode === 'dark' ? 'error.light' : 'error.main',
              border: '1px solid',
              borderColor:
                theme.palette.mode === 'dark' ? 'error.dark' : 'error.light',
              borderRadius: 1,
              '&:hover': {
                bgcolor:
                  theme.palette.mode === 'dark' ? 'error.dark' : 'error.light',
                borderColor:
                  theme.palette.mode === 'dark' ? 'error.main' : 'error.main',
              },
            }}
          >
            <DeleteIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        {/* Divider */}
        <Box
          sx={{
            width: '0.5px',
            height: 20,
            bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200',
            mx: 0.5,
            opacity: 0.5,
          }}
        />

        {/* Clear Button */}
        <Button
          startIcon={<ClearIcon sx={{ fontSize: 14 }} />}
          variant="outlined"
          size="small"
          onClick={onClearOutputs}
          disabled={notebook.cells.length === 0}
          sx={{
            textTransform: 'none',
            fontSize: '0.8125rem',
            height: 28,
            px: 1.5,
            minWidth: 'auto',
            borderColor:
              theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300',
            color: theme.palette.mode === 'dark' ? 'grey.300' : 'grey.700',
            '&:hover': {
              borderColor:
                theme.palette.mode === 'dark' ? 'grey.600' : 'grey.400',
              bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
            },
            '&.Mui-disabled': {
              borderColor:
                theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200',
              color: theme.palette.mode === 'dark' ? 'grey.700' : 'grey.400',
            },
          }}
        >
          Clear
        </Button>

        {/* Run All Button */}
        <Button
          startIcon={<RunAllIcon sx={{ fontSize: 16 }} />}
          variant="contained"
          size="small"
          onClick={onRunAll}
          disabled={notebook.cells.length === 0 || isExecuting}
          sx={{
            textTransform: 'none',
            fontSize: '0.8125rem',
            height: 28,
            px: 1.5,
            minWidth: 'auto',
            bgcolor:
              theme.palette.mode === 'dark' ? 'primary.dark' : 'primary.main',
            '&:hover': {
              bgcolor:
                theme.palette.mode === 'dark' ? 'primary.main' : 'primary.dark',
            },
            '&.Mui-disabled': {
              bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.300',
              color: theme.palette.mode === 'dark' ? 'grey.600' : 'grey.500',
            },
          }}
        >
          Run All
        </Button>
      </Box>
    </Box>
  );
};
