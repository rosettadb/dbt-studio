import React from 'react';
import { toast } from 'react-toastify';
import { styled } from '@mui/material/styles';
import {
  Box,
  Backdrop,
  CircularProgress,
  Typography,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import {
  CheckCircleOutline,
  Download as DownloadIcon,
  ArrowDropDown as ArrowDropDownIcon,
  Description as JsonIcon,
  TableChart as CsvIcon,
  InsertDriveFile as ParquetIcon,
} from '@mui/icons-material';
import {
  QueryResponseType,
  SupportedConnectionTypes,
} from '../../../types/backend';
import { CustomTable } from '../customTable';
import { underscoreToTitleCase } from '../../helpers/utils';
import { DuckLakeService } from '../../services/duckLake.service';

const SuccessContainer = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  color: theme.palette.text.primary,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(2),
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  boxShadow: theme.shadows[2],
  margin: theme.spacing(2, 0),
  width: '100%',
}));

const IconWrapper = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '2rem',
}));

type Props = {
  results: QueryResponseType;
  exportContext?: {
    connectionType: SupportedConnectionTypes;
    connectionId?: string;
    duckLakeInstanceId?: string;
    originalSql?: string;
  };
};

export const QueryResult: React.FC<Props> = ({ results, exportContext }) => {
  const formatNumber = React.useCallback((n: number) => {
    try {
      return new Intl.NumberFormat('de-DE').format(n);
    } catch {
      return String(n);
    }
  }, []);
  const originalSql =
    (results as any).originalSql ?? exportContext?.originalSql;

  const isDuckLake =
    exportContext?.connectionType === 'ducklake' &&
    !!exportContext.duckLakeInstanceId &&
    !!originalSql;

  const [columns, setColumns] = React.useState<string[]>(
    results.fields?.map((f) => f.name) ?? [],
  );
  const [rows, setRows] = React.useState<any[]>(results.data ?? []);
  const [totalCount, setTotalCount] = React.useState<number>(
    results.rowCount ?? (results.data ? results.data.length : 0),
  );
  const [loading, setLoading] = React.useState(false);

  const [page, setPage] = React.useState(0);
  const [perPage, setPerPage] = React.useState(10);
  const [order, setOrder] = React.useState<'asc' | 'desc'>('asc');
  const [orderBy, setOrderBy] = React.useState<string | undefined>(undefined);
  const [keyword, setKeyword] = React.useState('');
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  const fetchSeqRef = React.useRef(0);

  const fetchPage = React.useCallback(
    async (newPage: number, newPerPage: number) => {
      if (!isDuckLake) return;
      if (!exportContext?.duckLakeInstanceId || !originalSql) return;

      fetchSeqRef.current += 1;
      const seq = fetchSeqRef.current;

      try {
        setLoading(true);
        setFetchError(null);
        const res = await DuckLakeService.executeQuery({
          instanceId: exportContext.duckLakeInstanceId,
          query: originalSql,
          limit: newPerPage,
          offset: newPage * newPerPage,
        });
        if (seq !== fetchSeqRef.current) return;
        setColumns(res.fields?.map((f) => f.name) ?? []);
        setRows(res.data ?? []);
        if (typeof res.rowCount === 'number') {
          setTotalCount(res.rowCount);
        }
      } catch (e: any) {
        if (seq !== fetchSeqRef.current) return;
        // eslint-disable-next-line no-console
        console.error('[QueryResult] DuckLake page fetch failed:', e);
        setFetchError(e?.message || 'Failed to fetch page data');
      } finally {
        if (seq === fetchSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [isDuckLake, exportContext?.duckLakeInstanceId, originalSql],
  );

  React.useEffect(() => {
    setColumns(results.fields?.map((f) => f.name) ?? []);
    const baseTotal =
      results.rowCount ?? (results.data ? results.data.length : 0);

    if (isDuckLake) {
      setTotalCount(baseTotal);
      setPage(0);
      fetchPage(0, perPage);
    } else {
      setRows(results.data ?? []);
      setTotalCount(baseTotal);
      setPage(0);
    }
    // We intentionally only respond to new results / connection type;
    // perPage changes are handled via customPagination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, isDuckLake, fetchPage]);

  const customPagination = React.useMemo(() => {
    if (!isDuckLake) return undefined;
    return {
      page,
      setPage: (p: number) => {
        setPage(p);
        fetchPage(p, perPage);
      },
      perPage,
      setPerPage: (n: number) => {
        setPerPage(n);
        setPage(0);
        fetchPage(0, n);
      },
      count: totalCount,
      order,
      setOrder: (o: 'asc' | 'desc') => setOrder(o),
      orderBy: orderBy as any,
      setOrderBy: (ob: any) => setOrderBy(ob as string),
      keyword,
      setKeyword: (k: string) => setKeyword(k),
    };
  }, [
    isDuckLake,
    page,
    perPage,
    totalCount,
    order,
    orderBy,
    keyword,
    fetchPage,
  ]);

  const hasRows = rows.length > 0 && columns.length > 0;
  const showingInfo =
    isDuckLake && totalCount > 0
      ? `Showing ${formatNumber(
          Math.min(page * perPage + 1, totalCount),
        )}–${formatNumber(Math.min((page + 1) * perPage, totalCount))} of ${formatNumber(
          totalCount,
        )}`
      : undefined;

  const [exportAnchorEl, setExportAnchorEl] =
    React.useState<null | HTMLElement>(null);
  const exportMenuOpen = Boolean(exportAnchorEl);
  // True while a COPY-to-file export is running on the main process
  const [isExporting, setIsExporting] = React.useState(false);

  const handleExportMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setExportAnchorEl(event.currentTarget);
  };

  const handleExportMenuClose = () => {
    setExportAnchorEl(null);
  };

  // Helper function to normalize SQL for COPY statements
  const normalizeSqlForCopy = (sql: string) => sql.trim().replace(/;+\s*$/, '');

  const handleDownloadJson = async () => {
    if (!hasRows) return;

    // DuckLake: stream the full dataset directly to disk via COPY ... TO (FORMAT JSON)
    // This avoids loading all rows into the renderer (which crashed for 200M-row tables)
    if (isDuckLake && exportContext?.duckLakeInstanceId && originalSql) {
      handleExportMenuClose();
      try {
        const result = await window.electron.ipcRenderer.invoke(
          'dialog:showSaveDialog',
          {
            title: 'Export to JSON (full dataset)',
            defaultPath: 'query_results.json',
            filters: [{ name: 'JSON Files', extensions: ['json'] }],
          },
        );
        if (result.canceled || !result.filePath) return;

        setIsExporting(true);
        const escapedPath = result.filePath.replace(/'/g, "''");
        // DuckDB FORMAT JSON writes NDJSON (one JSON object per line)
        const exportQuery = `COPY (${normalizeSqlForCopy(originalSql)}) TO '${escapedPath}' (FORMAT JSON)`;
        const exportResult = await window.electron.ipcRenderer.invoke(
          'ducklake:query:execute',
          {
            instanceId: exportContext.duckLakeInstanceId,
            query: exportQuery,
          },
        );
        if (exportResult?.error) {
          throw new Error(exportResult.error);
        }
        toast.success('JSON export completed successfully');
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('JSON export error:', error);
        toast.error('JSON export failed');
      } finally {
        setIsExporting(false);
      }
      return;
    }

    // Non-DuckLake: in-memory blob (small result sets only)
    const blob = new Blob([JSON.stringify(rows, null, 2)], {
      type: 'application/json',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query_results.json';
    a.click();
    window.URL.revokeObjectURL(url);
    handleExportMenuClose();
  };

  const handleDownloadCsv = async () => {
    if (!hasRows) return;

    // DuckLake: stream the full dataset directly to disk via COPY ... TO (FORMAT CSV)
    if (isDuckLake && exportContext?.duckLakeInstanceId && originalSql) {
      handleExportMenuClose();
      try {
        const result = await window.electron.ipcRenderer.invoke(
          'dialog:showSaveDialog',
          {
            title: 'Export to CSV (full dataset)',
            defaultPath: 'query_results.csv',
            filters: [{ name: 'CSV Files', extensions: ['csv'] }],
          },
        );
        if (result.canceled || !result.filePath) return;

        setIsExporting(true);
        const escapedPath = result.filePath.replace(/'/g, "''");
        // HEADER (no value) is the correct DuckDB COPY CSV syntax for including header row
        const exportQuery = `COPY (${normalizeSqlForCopy(originalSql)}) TO '${escapedPath}' (FORMAT CSV, HEADER)`;
        const exportResult = await window.electron.ipcRenderer.invoke(
          'ducklake:query:execute',
          {
            instanceId: exportContext.duckLakeInstanceId,
            query: exportQuery,
          },
        );
        if (exportResult?.error) {
          throw new Error(exportResult.error);
        }
        toast.success('CSV export completed successfully');
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('CSV export error:', error);
        toast.error('CSV export failed');
      } finally {
        setIsExporting(false);
      }
      return;
    }

    // Non-DuckLake: in-memory blob (small result sets only)
    const escapeCsvValue = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (/[,"\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const header = columns.join(',');
    const dataRows = rows.map((row: any) =>
      columns.map((col) => escapeCsvValue(row[col])).join(','),
    );
    const csvContent = [header, ...dataRows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query_results.csv';
    a.click();
    window.URL.revokeObjectURL(url);
    handleExportMenuClose();
  };

  const canExportParquet =
    !!originalSql &&
    !!exportContext &&
    ((exportContext.connectionType === 'ducklake' &&
      !!exportContext.duckLakeInstanceId) ||
      (exportContext.connectionType === 'duckdb' &&
        !!exportContext.connectionId));

  const handleExportParquet = async () => {
    if (!canExportParquet || !exportContext?.originalSql) return;

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'dialog:showSaveDialog',
        {
          title: 'Export to Parquet',
          defaultPath: 'query_results.parquet',
          filters: [{ name: 'Parquet Files', extensions: ['parquet'] }],
        },
      );

      if (result.canceled || !result.filePath) {
        handleExportMenuClose();
        return;
      }

      handleExportMenuClose();
      setIsExporting(true);

      const escapedPath = result.filePath.replace(/'/g, "''");
      const baseSql =
        (results as any).originalSql ?? exportContext.originalSql ?? '';
      const exportQuery = `COPY (${normalizeSqlForCopy(baseSql)}) TO '${escapedPath}' (FORMAT PARQUET)`;

      if (
        exportContext.connectionType === 'ducklake' &&
        exportContext.duckLakeInstanceId
      ) {
        const duckLakeExportResult = await window.electron.ipcRenderer.invoke(
          'ducklake:query:execute',
          {
            instanceId: exportContext.duckLakeInstanceId,
            query: exportQuery,
          },
        );
        if (duckLakeExportResult?.error) {
          throw new Error(duckLakeExportResult.error);
        }
      } else if (
        exportContext.connectionType === 'duckdb' &&
        exportContext.connectionId
      ) {
        const duckDbExportResult = await window.electron.ipcRenderer.invoke(
          'connector:executeQuery',
          {
            connectionId: exportContext.connectionId,
            query: exportQuery,
          },
        );
        if (duckDbExportResult?.error) {
          throw new Error(duckDbExportResult.error);
        }
      }

      toast.success('Parquet export completed successfully');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Parquet export error:', error);
      toast.error('Parquet export failed');
      handleExportMenuClose();
    } finally {
      setIsExporting(false);
    }
  };

  // Use isCommand flag if available, otherwise fallback to field check
  const isCommand =
    results.isCommand ||
    ((!results.fields || results.fields.length === 0) && results.success);

  // Show row count for DML or generic commands with rowCount > 0
  const showRowCount =
    results.commandType === 'DML' ||
    (results.commandType !== 'DDL' &&
      results.rowCount !== undefined &&
      results.rowCount > 0);

  if (isCommand) {
    return (
      <SuccessContainer data-testid="sql-results-pane">
        <IconWrapper>
          <CheckCircleOutline fontSize="large" color="success" />
        </IconWrapper>
        <Box>
          <Typography variant="h6" fontWeight="bold">
            Command executed successfully
          </Typography>
          {showRowCount && results.rowCount !== undefined && (
            <Typography variant="body2">
              {`${results.rowCount} row${
                results.rowCount !== 1 ? 's' : ''
              } affected`}
            </Typography>
          )}
          {results.duration !== undefined && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
              Duration:{' '}
              {results.duration! > 1000
                ? `${(results.duration! / 1000).toFixed(2)}s`
                : `${results.duration!}ms`}
            </Typography>
          )}
        </Box>
      </SuccessContainer>
    );
  }

  if (fetchError) {
    return (
      <Box
        data-testid="sql-results-pane"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: 4,
          gap: 2,
        }}
      >
        <Typography color="error" variant="body1">
          {fetchError}
        </Typography>
        <Button variant="outlined" onClick={() => fetchPage(page, perPage)}>
          Retry
        </Button>
      </Box>
    );
  }

  let exportTooltipTitle = 'No data to export';
  if (isExporting) {
    exportTooltipTitle = 'Export in progress...';
  } else if (hasRows) {
    exportTooltipTitle = 'Export query results';
  }

  return (
    <div
      data-testid="sql-results-pane"
      style={{ width: '100%', overflow: 'hidden' }}
    >
      <CustomTable<Record<string, any>>
        id="query-result"
        dataTestId="sql-results-table"
        name=""
        toolbarContent={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {results.duration !== undefined && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ opacity: 0.7 }}
              >
                {results.duration > 1000
                  ? `${(results.duration / 1000).toFixed(2)}s`
                  : `${results.duration}ms`}
              </Typography>
            )}
            {showingInfo && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ opacity: 0.7 }}
              >
                {showingInfo}
              </Typography>
            )}
            <Tooltip title={exportTooltipTitle}>
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={
                    isExporting ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <DownloadIcon />
                    )
                  }
                  endIcon={<ArrowDropDownIcon />}
                  onClick={handleExportMenuOpen}
                  disabled={!hasRows || isExporting}
                >
                  {isExporting ? 'Exporting...' : 'Export'}
                </Button>
              </span>
            </Tooltip>
            <Menu
              anchorEl={exportAnchorEl}
              open={exportMenuOpen}
              onClose={handleExportMenuClose}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
            >
              <MenuItem
                onClick={handleDownloadJson}
                disabled={isExporting}
                dense
                sx={{ py: 0.5, minHeight: 32 }}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <JsonIcon sx={{ fontSize: 16 }} />
                </ListItemIcon>
                <ListItemText
                  primary={
                    isDuckLake ? 'Export JSON (full dataset)' : 'Download JSON'
                  }
                  primaryTypographyProps={{
                    variant: 'body2',
                    sx: { fontSize: 12 },
                  }}
                />
              </MenuItem>
              <MenuItem
                onClick={handleDownloadCsv}
                disabled={isExporting}
                dense
                sx={{ py: 0.5, minHeight: 32 }}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <CsvIcon sx={{ fontSize: 16 }} />
                </ListItemIcon>
                <ListItemText
                  primary={
                    isDuckLake ? 'Export CSV (full dataset)' : 'Download CSV'
                  }
                  primaryTypographyProps={{
                    variant: 'body2',
                    sx: { fontSize: 12 },
                  }}
                />
              </MenuItem>
              {canExportParquet && (
                <MenuItem
                  onClick={handleExportParquet}
                  disabled={isExporting}
                  dense
                  sx={{ py: 0.5, minHeight: 32 }}
                >
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <ParquetIcon sx={{ fontSize: 16 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Export Parquet (full dataset)"
                    primaryTypographyProps={{
                      variant: 'body2',
                      sx: { fontSize: 12 },
                    }}
                  />
                </MenuItem>
              )}
            </Menu>
          </Box>
        }
        rows={rows as any}
        columns={columns.map((column) => ({
          id: column,
          label: underscoreToTitleCase(column),
          render: (value) => {
            const cellValue = value[column];
            // Handle null and undefined
            if (cellValue === null || cellValue === undefined) {
              return (
                <div
                  style={{
                    whiteSpace: 'nowrap',
                    minHeight: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    color: '#999',
                    fontStyle: 'italic',
                  }}
                >
                  NULL
                </div>
              );
            }
            let stringValue: string;
            if (typeof cellValue === 'object') {
              try {
                stringValue = JSON.stringify(cellValue);
              } catch {
                stringValue = String(cellValue);
              }
            } else {
              stringValue = String(cellValue);
            }
            return (
              <div
                style={{
                  whiteSpace: 'nowrap',
                  minHeight: '24px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {stringValue}
              </div>
            );
          },
        }))}
        customPagination={customPagination as any}
        loading={loading}
      />

      <Backdrop
        sx={{
          color: '#fff',
          zIndex: (theme) => theme.zIndex.drawer + 999, // Ensure it's above everything including sidebar
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
        open={isExporting}
      >
        <CircularProgress color="inherit" />
        <Typography variant="h6">
          Exporting large dataset... Please wait
        </Typography>
      </Backdrop>
    </div>
  );
};
