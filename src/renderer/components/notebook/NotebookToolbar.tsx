/**
 * Notebook Toolbar Component
 * Top toolbar with notebook actions (run all, save, export, etc.)
 */

import React from 'react';
import {
  Box,
  Button,
  IconButton,
  Tooltip,
  Typography,
  Chip,
  Divider,
} from '@mui/material';
import {
  PlayArrow as RunAllIcon,
  Save as SaveIcon,
  GetApp as ExportIcon,
  Add as AddIcon,
  Stop as StopIcon,
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
}

export const NotebookToolbar: React.FC<NotebookToolbarProps> = ({
  notebook,
  isExecuting,
  onRunAll,
  onSave,
  onExport,
  onAddCell,
  onInterrupt,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        p: 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Left: Notebook Info */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="h6" noWrap sx={{ maxWidth: 300 }}>
          {notebook.name}
        </Typography>
        <Chip
          label={`${notebook.cells.length} cells`}
          size="small"
          variant="outlined"
        />
        {notebook.lastExecutedAt && (
          <Typography variant="caption" color="text.secondary">
            Last run: {new Date(notebook.lastExecutedAt).toLocaleString()}
          </Typography>
        )}
      </Box>

      {/* Right: Actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* Add Cell Dropdown */}
        <Button
          startIcon={<AddIcon />}
          variant="outlined"
          size="small"
          onClick={() => onAddCell('sql')}
        >
          Add SQL Cell
        </Button>

        <Button
          variant="outlined"
          size="small"
          onClick={() => onAddCell('markdown')}
        >
          Add Markdown
        </Button>

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

        {/* Run All / Stop */}
        {isExecuting ? (
          <Tooltip title="Stop Execution">
            <Button
              startIcon={<StopIcon />}
              variant="contained"
              color="error"
              size="small"
              onClick={onInterrupt}
            >
              Stop
            </Button>
          </Tooltip>
        ) : (
          <Tooltip title="Run All Cells (Cmd+Shift+Enter)">
            <Button
              startIcon={<RunAllIcon />}
              variant="contained"
              color="primary"
              size="small"
              onClick={onRunAll}
              disabled={notebook.cells.length === 0}
            >
              Run All
            </Button>
          </Tooltip>
        )}

        {/* Save */}
        <Tooltip title="Save Notebook (Cmd+S)">
          <IconButton size="small" onClick={onSave}>
            <SaveIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Export */}
        <Tooltip title="Export Notebook">
          <IconButton size="small" onClick={onExport}>
            <ExportIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};
