/**
 * PreviewContent — the shared tab content (Data / Schema / Statistics) used
 * by both InlineDataPreview (inline panel) and DataPreviewModal (fullscreen).
 *
 * All state is owned by the parent (InlineDataPreview). This component is
 * purely presentational and receives everything it needs via props.
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  TablePagination,
  Button,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  TableView,
  Schema,
  Analytics,
  FilterList,
  Refresh,
} from '@mui/icons-material';
import type {
  PreviewResult,
  FilterCondition,
  ColumnStat,
} from '../../../types/frontend';
import { DataExplorerModal } from './DataExplorerModal';
import { formatFileSize } from '../../utils/fileUtils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sanitizeText = (text: string): string => {
  if (typeof text !== 'string') return String(text);
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200b-\u200f\u2060-\u206f]/g, '')
    .replace(/[\u2000-\u200a]/g, ' ')
    .replace(/[^\u0020-\u007e]/g, (char) => {
      const code = char.charCodeAt(0);
      if (code >= 0x80 && code <= 0x024f) return char;
      if (code >= 0x1e00 && code <= 0x1eff) return char;
      return '?';
    })
    .trim();
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PreviewContentProps {
  previewResult: PreviewResult | null;
  loading: boolean;
  error?: string;
  fileSize?: number;
  // Pagination state (owned by InlineDataPreview)
  serverPage: number;
  serverPageSize: number;
  activeFilter: FilterCondition[];
  // Stats state (owned by InlineDataPreview)
  statsData: ColumnStat[] | null;
  statsLoading: boolean;
  statsError?: string;
  hasServerContext: boolean;
  // Callbacks
  onPageChange: (page: number, pageSize?: number) => Promise<void>;
  onApplyFilter: (conditions: FilterCondition[]) => Promise<void>;
  onClearFilter: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onStatsTabActivated: () => void;
  // Layout
  tableMaxHeight?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const PreviewContent: React.FC<PreviewContentProps> = ({
  previewResult,
  loading,
  error,
  fileSize,
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
  tableMaxHeight = 'calc(100vh - 460px)',
}) => {
  const [currentTab, setCurrentTab] = useState(0);
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
    if (newValue === 2) {
      onStatsTabActivated();
    }
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    onPageChange(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    onPageChange(0, parseInt(event.target.value, 10));
  };

  const isFiltered = activeFilter.length > 0;
  const totalRows =
    previewResult?.totalRows ?? previewResult?.data?.length ?? 0;
  const detectedFormat = previewResult?.detectedFormat;

  // ── Loading / error / empty states ──────────────────────────────────────────

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          p: 4,
        }}
      >
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading data preview...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        sx={{ m: 2 }}
        action={
          hasServerContext ? (
            <Button color="inherit" size="small" onClick={onRefresh}>
              Retry
            </Button>
          ) : undefined
        }
      >
        <Typography variant="body2">
          Failed to load data preview: {error}
        </Typography>
      </Alert>
    );
  }

  if (!previewResult) {
    return (
      <Box sx={{ textAlign: 'center', p: 4 }}>
        <Typography color="text.secondary">
          No preview data available
        </Typography>
      </Box>
    );
  }

  // ── Data tab ─────────────────────────────────────────────────────────────────

  const renderDataTab = () => {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Toolbar */}
        <Box
          sx={{
            mb: 1,
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {hasServerContext && (
            <Button
              size="small"
              startIcon={<FilterList />}
              onClick={() => setFilterModalOpen(true)}
              disabled={
                !previewResult.columns || previewResult.columns.length === 0
              }
              variant="outlined"
            >
              Filter Data
            </Button>
          )}
          {hasServerContext && (
            <Tooltip title="Refresh data">
              <IconButton size="small" onClick={onRefresh} aria-label="Refresh">
                <Refresh fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          {detectedFormat && (
            <Chip
              label={detectedFormat.toUpperCase()}
              size="small"
              color="info"
              variant="outlined"
            />
          )}
          {isFiltered && (
            <Chip
              label="Filtered"
              size="small"
              color="warning"
              onDelete={onClearFilter}
            />
          )}

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ ml: 'auto' }}
          >
            {`${totalRows.toLocaleString()} rows`}
          </Typography>
        </Box>

        {!previewResult.data || previewResult.data.length === 0 ? (
          <Box sx={{ textAlign: 'center', p: 4 }}>
            <Typography color="text.secondary">No data to display</Typography>
          </Box>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <TableContainer
              component={Paper}
              sx={{
                flex: 1,
                minHeight: 200,
                overflow: 'auto',
                maxHeight: tableMaxHeight,
                maxWidth: '100%',
              }}
            >
              <Table stickyHeader size="small" sx={{ minWidth: 'max-content' }}>
                <TableHead>
                  <TableRow>
                    {previewResult.columns?.map((column) => (
                      <TableCell
                        key={column.name}
                        sx={{
                          fontWeight: 'bold',
                          minWidth: 150,
                          whiteSpace: 'nowrap',
                          py: 1,
                        }}
                      >
                        <Box>
                          <Typography variant="body2">{column.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {column.type}
                          </Typography>
                        </Box>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewResult.data.map((row, index) => (
                    <TableRow
                      // eslint-disable-next-line react/no-array-index-key
                      key={`${serverPage}-${index}`}
                      hover
                      sx={{ '& .MuiTableCell-root': { py: 0.5 } }}
                    >
                      {previewResult.columns?.map((column, colIndex) => {
                        const cellValue = Array.isArray(row)
                          ? row[colIndex]
                          : row[column.name];
                        return (
                          <TableCell
                            key={column.name}
                            sx={{ minWidth: 150, py: 0.5 }}
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                maxWidth: 200,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontFamily: 'monospace',
                              }}
                              title={
                                cellValue !== null && cellValue !== undefined
                                  ? sanitizeText(String(cellValue))
                                  : '—'
                              }
                            >
                              {cellValue !== null && cellValue !== undefined
                                ? sanitizeText(String(cellValue))
                                : '—'}
                            </Typography>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Box sx={{ flexShrink: 0, borderTop: 1, borderColor: 'divider' }}>
              <TablePagination
                component="div"
                count={totalRows}
                page={serverPage}
                onPageChange={handleChangePage}
                rowsPerPage={serverPageSize}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[25, 50, 100, 250]}
                labelDisplayedRows={({ from, to, count }) =>
                  `${from}–${to} of ${count.toLocaleString()} rows`
                }
              />
            </Box>
          </Box>
        )}
      </Box>
    );
  };

  // ── Schema tab ───────────────────────────────────────────────────────────────

  const renderSchemaTab = () => {
    if (!previewResult.columns || previewResult.columns.length === 0) {
      return (
        <Box sx={{ textAlign: 'center', p: 4 }}>
          <Typography color="text.secondary">
            No schema information available
          </Typography>
        </Box>
      );
    }

    return (
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Column Name</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Data Type</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Nullable</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {previewResult.columns.map((column) => (
              <TableRow key={column.name}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {column.name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={column.type}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {column.nullable === false ? 'No' : 'Yes'}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  // ── Statistics tab ───────────────────────────────────────────────────────────

  const renderStatsTab = () => {
    if (statsLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
          <Typography sx={{ ml: 2 }}>Computing statistics...</Typography>
        </Box>
      );
    }

    if (statsError) {
      return (
        <Alert severity="error" sx={{ m: 2 }}>
          {statsError}
        </Alert>
      );
    }

    if (!statsData || statsData.length === 0) {
      // Summary cards shown before per-column stats are loaded
      return (
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Dataset Statistics
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 2,
            }}
          >
            <Paper sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Total Rows
              </Typography>
              <Typography variant="h4">
                {previewResult.totalRows !== undefined
                  ? previewResult.totalRows.toLocaleString()
                  : '—'}
              </Typography>
            </Paper>
            <Paper sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Total Columns
              </Typography>
              <Typography variant="h4">
                {previewResult.columns?.length || '—'}
              </Typography>
            </Paper>
            <Paper sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                File Size
              </Typography>
              <Typography variant="h4">{formatFileSize(fileSize)}</Typography>
            </Paper>
            {detectedFormat && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Format
                </Typography>
                <Typography variant="h4">
                  {detectedFormat.toUpperCase()}
                </Typography>
              </Paper>
            )}
          </Box>
        </Box>
      );
    }

    return (
      <Box sx={{ p: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="subtitle1">Column Statistics</Typography>
          <Chip label="~10k sample" size="small" variant="outlined" />
        </Box>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Column</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Null Count</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Distinct</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Min</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Max</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Mean</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {statsData.map((stat) => (
                <TableRow key={stat.columnName}>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: 'monospace' }}
                    >
                      {stat.columnName}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={stat.columnType}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {stat.nullCount !== null ? stat.nullCount : '—'}
                  </TableCell>
                  <TableCell>
                    {stat.distinctCount !== null ? stat.distinctCount : '—'}
                  </TableCell>
                  <TableCell
                    sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                  >
                    {stat.min ?? '—'}
                  </TableCell>
                  <TableCell
                    sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                  >
                    {stat.max ?? '—'}
                  </TableCell>
                  <TableCell
                    sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                  >
                    {stat.mean ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  // ── Tabs shell ───────────────────────────────────────────────────────────────

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Tabs
        value={currentTab}
        onChange={handleTabChange}
        sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
      >
        <Tab icon={<TableView />} label="Data" />
        <Tab icon={<Schema />} label="Schema" />
        <Tab icon={<Analytics />} label="Statistics" />
      </Tabs>

      <Box sx={{ pt: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {currentTab === 0 && renderDataTab()}
        {currentTab === 1 && renderSchemaTab()}
        {currentTab === 2 && renderStatsTab()}
      </Box>

      {/* Filter modal — shared between inline and fullscreen views */}
      {previewResult.columns && (
        <DataExplorerModal
          open={filterModalOpen}
          onClose={() => setFilterModalOpen(false)}
          onApply={async (conditions) => {
            setFilterModalOpen(false);
            await onApplyFilter(conditions);
          }}
          onClear={async () => {
            setFilterModalOpen(false);
            await onClearFilter();
          }}
          columns={previewResult.columns}
          initialConditions={activeFilter}
        />
      )}
    </Box>
  );
};
