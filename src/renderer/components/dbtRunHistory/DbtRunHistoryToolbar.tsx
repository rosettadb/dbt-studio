import React from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  TextField,
  MenuItem,
  Select,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { DbtRunHistoryFilterState } from './types';

interface Props {
  filters: DbtRunHistoryFilterState;
  onFilterChange: (filters: DbtRunHistoryFilterState) => void;
  onRefresh: () => void;
  onClear: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const DbtRunHistoryToolbar: React.FC<Props> = ({
  filters,
  onFilterChange,
  onRefresh,
  onClear,
  isFullscreen,
  onToggleFullscreen,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        padding: 1,
        gap: 2,
        borderBottom: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
      }}
    >
      <Tooltip title="Refresh History">
        <IconButton size="small" onClick={onRefresh}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Tooltip title="Clear History">
        <IconButton size="small" onClick={onClear} color="error">
          <DeleteSweepIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Select
        size="small"
        value={filters.status || ''}
        onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
        displayEmpty
        sx={{ minWidth: 120, height: 28, fontSize: '0.8rem' }}
      >
        <MenuItem value="">All Statuses</MenuItem>
        <MenuItem value="success">Success</MenuItem>
        <MenuItem value="error">Error</MenuItem>
        <MenuItem value="warn">Warning</MenuItem>
        <MenuItem value="running">Running</MenuItem>
      </Select>

      <TextField
        size="small"
        placeholder="Search commands or models..."
        value={filters.search || ''}
        onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
        sx={{
          flexGrow: 1,
          maxWidth: 300,
          '& .MuiInputBase-root': { height: 28, fontSize: '0.8rem' },
        }}
      />

      {onToggleFullscreen && (
        <Tooltip
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          sx={{ ml: 'auto' }}
        >
          <IconButton size="small" onClick={onToggleFullscreen}>
            {isFullscreen ? (
              <FullscreenExitIcon fontSize="small" />
            ) : (
              <FullscreenIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};
