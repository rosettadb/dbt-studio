/**
 * InlineDataPreview — inline panel that owns all preview state.
 *
 * Pagination follows the same server-side LIMIT/OFFSET pattern as the SQL
 * Editor (queryResult.tsx) and Notebooks (OutputPanel.tsx): only the current
 * page is held in memory, so 200M-row files never crash the app.
 *
 * The "Fullscreen" button opens DataPreviewModal, which is a thin Dialog
 * wrapper around the same PreviewContent — no state duplication.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Typography, Chip, Button } from '@mui/material';
import { TableView, ArrowBack, Fullscreen } from '@mui/icons-material';
import type {
  PreviewResult,
  FilterCondition,
  ColumnStat,
  CloudProvider,
  CloudStorageConfig,
} from '../../../types/frontend';
import { PreviewContent } from './PreviewContent';
import { DataPreviewModal } from './DataPreviewModal';
import { usePreviewData } from '../../controllers/cloudExplorer.controller';

interface InlineDataPreviewProps {
  fileName: string;
  /** Initial result from the first page load triggered by ExplorerBucketContent */
  previewResult: PreviewResult | null;
  loading: boolean;
  error?: string;
  onBack: () => void;
  fileSize?: number;
  // Cloud context needed for subsequent page fetches
  provider?: CloudProvider;
  config?: CloudStorageConfig | null;
  bucketName?: string;
  objectName?: string;
}

export const InlineDataPreview: React.FC<InlineDataPreviewProps> = ({
  fileName,
  previewResult: initialPreviewResult,
  loading: initialLoading,
  error: initialError,
  onBack,
  fileSize,
  provider,
  config,
  bucketName,
  objectName,
}) => {
  // ── Fullscreen toggle ──────────────────────────────────────────────────────
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  // ── Server-side pagination state ───────────────────────────────────────────
  const [serverPage, setServerPage] = useState(0);
  const [serverPageSize, setServerPageSize] = useState(25);
  const [activeFilter, setActiveFilter] = useState<FilterCondition[]>([]);
  const [currentPageData, setCurrentPageData] = useState<PreviewResult | null>(
    null,
  );
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | undefined>(undefined);
  const [knownTotalRows, setKnownTotalRows] = useState<number | null>(null);

  // ── Column stats state (lazy-loaded on first Statistics tab activation) ────
  const [statsData, setStatsData] = useState<ColumnStat[] | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | undefined>(undefined);
  const statsLoadedRef = useRef(false);

  const previewDataMutation = usePreviewData();

  // The displayed result is the latest fetched page, falling back to the
  // initial result from ExplorerBucketContent on first load.
  const displayResult = currentPageData ?? initialPreviewResult;
  const isLoading = pageLoading || initialLoading;
  const displayError = pageError ?? initialError;

  const hasServerContext = !!(provider && config && bucketName && objectName);

  useEffect(() => {
    setKnownTotalRows(initialPreviewResult?.totalRows ?? null);
  }, [initialPreviewResult?.totalRows, objectName]);

  // ── WHERE clause builder ───────────────────────────────────────────────────
  const buildWhereClause = useCallback(
    (conditions: FilterCondition[]): string => {
      const valid = conditions.filter((c) => c.column && c.value !== '');
      if (valid.length === 0) return '';
      return valid
        .map((c) => {
          const escapedValue = c.value.replace(/'/g, "''");
          const escapedCol = `"${c.column.replace(/"/g, '""')}"`;
          return c.operator === 'LIKE'
            ? `${escapedCol} LIKE '${escapedValue}'`
            : `${escapedCol} ${c.operator} '${escapedValue}'`;
        })
        .join(' AND ');
    },
    [],
  );

  // ── Page navigation — same pattern as SQL Editor fetchPage / Notebooks fetchCellPage
  const handlePageChange = useCallback(
    async (newPage: number, newPageSize?: number) => {
      if (!hasServerContext) return;
      const effectivePageSize = newPageSize ?? serverPageSize;
      setPageLoading(true);
      setPageError(undefined);
      const knownRowsForRequest =
        newPage > 0 ? (knownTotalRows ?? displayResult?.totalRows) : undefined;
      try {
        const result = await previewDataMutation.mutateAsync({
          provider: provider!,
          config: config!,
          bucketName: bucketName!,
          objectName: objectName!,
          previewType: 'sample',
          page: newPage,
          pageSize: effectivePageSize,
          filterConditions: activeFilter,
          knownTotalRows: knownRowsForRequest,
        });
        setCurrentPageData(result);
        if (result.totalRows !== undefined) {
          setKnownTotalRows(result.totalRows);
        }
        setServerPage(newPage);
        if (newPageSize !== undefined) setServerPageSize(newPageSize);
      } catch (err) {
        setPageError(err instanceof Error ? err.message : String(err));
      } finally {
        setPageLoading(false);
      }
    },
    [
      hasServerContext,
      serverPageSize,
      knownTotalRows,
      displayResult?.totalRows,
      activeFilter,
      buildWhereClause,
      previewDataMutation,
      provider,
      config,
      bucketName,
      objectName,
    ],
  );

  // ── Refresh — re-fetches page 0 with current filter ───────────────────────
  const handleRefresh = useCallback(async () => {
    if (!hasServerContext) return;
    setPageLoading(true);
    setPageError(undefined);
    try {
      const result = await previewDataMutation.mutateAsync({
        provider: provider!,
        config: config!,
        bucketName: bucketName!,
        objectName: objectName!,
        previewType: 'sample',
        pageSize: serverPageSize,
        page: 0,
        filterConditions: activeFilter,
      });
      setCurrentPageData(result);
      setKnownTotalRows(result.totalRows ?? null);
      setServerPage(0);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err));
    } finally {
      setPageLoading(false);
    }
  }, [
    hasServerContext,
    activeFilter,
    previewDataMutation,
    provider,
    config,
    bucketName,
    objectName,
    serverPageSize,
  ]);

  // ── Filter apply ───────────────────────────────────────────────────────────
  const handleApplyFilter = useCallback(
    async (conditions: FilterCondition[]) => {
      setActiveFilter(conditions);
      if (!hasServerContext) return;
      setPageLoading(true);
      setPageError(undefined);
      try {
        const result = await previewDataMutation.mutateAsync({
          provider: provider!,
          config: config!,
          bucketName: bucketName!,
          objectName: objectName!,
          previewType: 'sample',
          pageSize: serverPageSize,
          page: 0,
          filterConditions: conditions,
        });
        setCurrentPageData(result);
        setKnownTotalRows(result.totalRows ?? null);
        setServerPage(0);
      } catch (err) {
        setPageError(err instanceof Error ? err.message : String(err));
      } finally {
        setPageLoading(false);
      }
    },
    [
      hasServerContext,
      previewDataMutation,
      provider,
      config,
      bucketName,
      objectName,
      serverPageSize,
    ],
  );

  // ── Filter clear ───────────────────────────────────────────────────────────
  const handleClearFilter = useCallback(async () => {
    setActiveFilter([]);
    if (!hasServerContext) return;
    setPageLoading(true);
    setPageError(undefined);
    try {
      const result = await previewDataMutation.mutateAsync({
        provider: provider!,
        config: config!,
        bucketName: bucketName!,
        objectName: objectName!,
        previewType: 'sample',
        pageSize: serverPageSize,
        page: 0,
        filterConditions: [],
      });
      setCurrentPageData(result);
      setKnownTotalRows(result.totalRows ?? null);
      setServerPage(0);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err));
    } finally {
      setPageLoading(false);
    }
  }, [
    hasServerContext,
    previewDataMutation,
    provider,
    config,
    bucketName,
    objectName,
    serverPageSize,
  ]);

  // ── Statistics lazy load — triggered once when the Statistics tab is opened
  const handleStatsTabActivated = useCallback(() => {
    if (statsLoadedRef.current || !hasServerContext) return;
    setStatsLoading(true);
    setStatsError(undefined);
    (async () => {
      try {
        const result = await previewDataMutation.mutateAsync({
          provider: provider!,
          config: config!,
          bucketName: bucketName!,
          objectName: objectName!,
          previewType: 'stats',
        });
        if (result.success) {
          setStatsData(result.data as unknown as ColumnStat[]);
          statsLoadedRef.current = true;
        } else {
          setStatsError(result.error || 'Failed to load statistics');
          statsLoadedRef.current = false;
        }
      } catch (err) {
        setStatsError(err instanceof Error ? err.message : String(err));
        statsLoadedRef.current = false;
      } finally {
        setStatsLoading(false);
      }
    })();
  }, [
    hasServerContext,
    previewDataMutation,
    provider,
    config,
    bucketName,
    objectName,
  ]);

  // ── Shared props passed to both PreviewContent and DataPreviewModal ────────
  const sharedContentProps = {
    previewResult: displayResult,
    loading: isLoading,
    error: displayError,
    fileSize,
    serverPage,
    serverPageSize,
    activeFilter,
    statsData,
    statsLoading,
    statsError,
    provider,
    config,
    bucketName,
    objectName,
    hasServerContext,
    onPageChange: handlePageChange,
    onApplyFilter: handleApplyFilter,
    onClearFilter: handleClearFilter,
    onRefresh: handleRefresh,
    onStatsTabActivated: handleStatsTabActivated,
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: 'background.paper',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button variant="outlined" startIcon={<ArrowBack />} onClick={onBack}>
            Back to Files
          </Button>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TableView />
            <Typography variant="h5" component="h1">
              Preview:
            </Typography>
            <Chip label={fileName} size="medium" variant="outlined" />
          </Box>
        </Box>

        <Button
          variant="outlined"
          startIcon={<Fullscreen />}
          onClick={() => setFullscreenOpen(true)}
        >
          Fullscreen
        </Button>
      </Box>

      {/* Inline content */}
      <Box
        sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2, pt: 1 }}
      >
        <PreviewContent
          previewResult={sharedContentProps.previewResult}
          loading={sharedContentProps.loading}
          error={sharedContentProps.error}
          fileSize={sharedContentProps.fileSize}
          serverPage={sharedContentProps.serverPage}
          serverPageSize={sharedContentProps.serverPageSize}
          activeFilter={sharedContentProps.activeFilter}
          statsData={sharedContentProps.statsData}
          statsLoading={sharedContentProps.statsLoading}
          statsError={sharedContentProps.statsError}
          hasServerContext={sharedContentProps.hasServerContext}
          onPageChange={sharedContentProps.onPageChange}
          onApplyFilter={sharedContentProps.onApplyFilter}
          onClearFilter={sharedContentProps.onClearFilter}
          onRefresh={sharedContentProps.onRefresh}
          onStatsTabActivated={sharedContentProps.onStatsTabActivated}
        />
      </Box>

      {/* Fullscreen modal — same content, larger viewport */}
      <DataPreviewModal
        open={fullscreenOpen}
        onClose={() => setFullscreenOpen(false)}
        fileName={fileName}
        previewResult={sharedContentProps.previewResult}
        loading={sharedContentProps.loading}
        error={sharedContentProps.error}
        fileSize={sharedContentProps.fileSize}
        serverPage={sharedContentProps.serverPage}
        serverPageSize={sharedContentProps.serverPageSize}
        activeFilter={sharedContentProps.activeFilter}
        statsData={sharedContentProps.statsData}
        statsLoading={sharedContentProps.statsLoading}
        statsError={sharedContentProps.statsError}
        hasServerContext={sharedContentProps.hasServerContext}
        onPageChange={sharedContentProps.onPageChange}
        onApplyFilter={sharedContentProps.onApplyFilter}
        onClearFilter={sharedContentProps.onClearFilter}
        onRefresh={sharedContentProps.onRefresh}
        onStatsTabActivated={sharedContentProps.onStatsTabActivated}
      />
    </Box>
  );
};
