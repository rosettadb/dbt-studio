import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography,
} from '@mui/material';
import { useDbtRunHistory } from '../../hooks/useDbtRunHistory';
import { DbtRunHistoryToolbar } from './DbtRunHistoryToolbar';
import { DbtRunHistoryRunRow } from './DbtRunHistoryRunRow';
import { DbtRunHistoryFilterState } from './types';

interface Props {
  projectId: string;
  onFixWithAI?: (prompt: string) => void;
}

export const DbtRunHistoryPanel: React.FC<Props> = ({
  projectId,
  onFixWithAI,
}) => {
  const { history, clear } = useDbtRunHistory(projectId);
  const [filters, setFilters] = useState<DbtRunHistoryFilterState>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);

  const filteredHistory = useMemo(() => {
    return history.filter((entry) => {
      if (filters.status && entry.status !== filters.status) return false;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesCommand = entry.fullCommand
          .toLowerCase()
          .includes(searchLower);
        const matchesResults = entry.results?.some((r) =>
          r.name.toLowerCase().includes(searchLower),
        );
        if (!matchesCommand && !matchesResults) return false;
      }
      return true;
    });
  }, [history, filters]);

  const handleClear = () => {
    setIsClearDialogOpen(true);
  };

  const handleConfirmClear = () => {
    clear();
    setIsClearDialogOpen(false);
  };

  // Mock refresh since localStorage updates automatically
  const handleRefresh = () => {
    // A real refresh would re-read from disk if we wanted, but our hook auto-syncs.
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        ...(isFullscreen && {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          bgcolor: 'background.default',
        }),
      }}
    >
      <DbtRunHistoryToolbar
        filters={filters}
        onFilterChange={setFilters}
        onRefresh={handleRefresh}
        onClear={handleClear}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen((v) => !v)}
      />

      <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
        {filteredHistory.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              color: 'text.secondary',
              p: 4,
            }}
          >
            <Typography variant="body2">No run history found.</Typography>
          </Box>
        ) : (
          filteredHistory.map((entry) => (
            <DbtRunHistoryRunRow
              key={entry.id}
              entry={entry}
              onFixWithAI={onFixWithAI}
            />
          ))
        )}
      </Box>

      <Dialog
        open={isClearDialogOpen}
        onClose={() => setIsClearDialogOpen(false)}
        aria-labelledby="clear-run-history-dialog-title"
        aria-describedby="clear-run-history-dialog-description"
      >
        <DialogTitle id="clear-run-history-dialog-title">
          Clear Run History
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="clear-run-history-dialog-description">
            Are you sure you want to clear the run history for this project?
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsClearDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleConfirmClear}
            color="error"
            variant="contained"
          >
            Clear
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
