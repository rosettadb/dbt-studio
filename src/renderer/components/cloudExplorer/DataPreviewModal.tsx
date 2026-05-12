/**
 * DataPreviewModal — fullscreen "zoom in" wrapper around the same preview
 * content rendered by InlineDataPreview.
 *
 * All state (pagination, filters, data) lives in InlineDataPreview and is
 * passed down here via props. This component is purely presentational: it
 * wraps the shared content in a fullscreen MUI Dialog so the user gets the
 * same tabs, pagination, and filter controls at full viewport size.
 */

import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  IconButton,
} from '@mui/material';
import { Close, TableView } from '@mui/icons-material';
import type {
  PreviewResult,
  FilterCondition,
  ColumnStat,
} from '../../../types/frontend';
import { PreviewContent } from './PreviewContent';

export interface DataPreviewModalProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  fileSize?: number;
  // All preview state is owned by InlineDataPreview and passed through
  previewResult: PreviewResult | null;
  loading: boolean;
  error?: string;
  serverPage: number;
  serverPageSize: number;
  activeFilter: FilterCondition[];
  statsData: ColumnStat[] | null;
  statsLoading: boolean;
  statsError?: string;
  // Callbacks delegated back to InlineDataPreview
  hasServerContext: boolean;
  onPageChange: (page: number, pageSize?: number) => Promise<void>;
  onApplyFilter: (conditions: FilterCondition[]) => Promise<void>;
  onClearFilter: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onStatsTabActivated: () => void;
}

export const DataPreviewModal: React.FC<DataPreviewModalProps> = ({
  open,
  onClose,
  fileName,
  fileSize,
  previewResult,
  loading,
  error,
  serverPage,
  serverPageSize,
  activeFilter,
  statsData,
  statsLoading,
  statsError,
  hasServerContext,
  onPageChange,
  onApplyFilter,
  onClearFilter,
  onRefresh,
  onStatsTabActivated,
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth fullScreen>
      <DialogTitle sx={{ py: 1.5 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TableView />
            <Typography variant="h6">Preview:</Typography>
            <Chip label={fileName} size="small" variant="outlined" />
          </Box>
          <IconButton
            onClick={onClose}
            size="small"
            aria-label="Close fullscreen"
          >
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent
        sx={{
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        <PreviewContent
          previewResult={previewResult}
          loading={loading}
          error={error}
          fileSize={fileSize}
          serverPage={serverPage}
          serverPageSize={serverPageSize}
          activeFilter={activeFilter}
          statsData={statsData}
          statsLoading={statsLoading}
          statsError={statsError}
          hasServerContext={hasServerContext}
          onPageChange={onPageChange}
          onApplyFilter={onApplyFilter}
          onClearFilter={onClearFilter}
          onRefresh={onRefresh}
          onStatsTabActivated={onStatsTabActivated}
          // In fullscreen the table can use more vertical space
          tableMaxHeight="calc(100vh - 280px)"
        />
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
