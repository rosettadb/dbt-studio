/**
 * Output Panel Component
 * Displays cell execution results using CustomTable component
 * Updated to support pagination for large datasets (Phase 3)
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Backdrop,
  CircularProgress,
} from '@mui/material';
import {
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Download as DownloadIcon,
  ArrowDropDown as ArrowDropDownIcon,
  Description as JsonIcon,
  TableChart as CsvIcon,
  InsertDriveFile as ParquetIcon,
  BarChart as BarChartIcon,
  Image as ImageIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { QueryResultVisualization } from '../queryResult/queryVisualization/QueryResultVisualization';
import { CellOutput } from '../../../types/notebooks';
import { CustomTable } from '../customTable';
import { useFetchCellPage } from '../../controllers/notebooks.controller';

const MAX_CHART_ROWS = 1000;

interface OutputPanelProps {
  output: CellOutput;
  connectionId: string;
  notebookId: string;
  cellId: string;
  sql: string; // Original SQL query for pagination
}

export const OutputPanel: React.FC<OutputPanelProps> = ({
  output,
  connectionId,
  notebookId,
  cellId,
  sql,
}) => {
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(10);
  const [paginatedData, setPaginatedData] = useState(output.data || []);
  const [chartData, setChartData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(
    null,
  );
  const [isExporting, setIsExporting] = useState(false);
  const fetchCellPage = useFetchCellPage();
  const fetchCellPageAsync = fetchCellPage.mutateAsync;
  const latestRequestId = useRef(0);
  const latestChartRequestId = useRef(0);
  const chartRequestKeyRef = useRef<string | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');

  const [previewAnchorEl, setPreviewAnchorEl] = useState<null | HTMLElement>(
    null,
  );
  const previewMenuOpen = Boolean(previewAnchorEl);
  const exportMenuOpen = Boolean(exportAnchorEl);
  const isDuckLake = connectionId.startsWith('ducklake-');

  const handlePreviewMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setPreviewAnchorEl(event.currentTarget);
  };

  const handlePreviewMenuClose = () => {
    setPreviewAnchorEl(null);
  };

  // Helper function to escape SQL literals
  const escapeSqlLiteral = (value: string) => value.replace(/'/g, "''");
  const normalizeSqlForCopy = (sqlQuery: string) =>
    sqlQuery.trim().replace(/;+$/, '');

  const handleExportMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setExportAnchorEl(event.currentTarget);
  };

  const handleExportMenuClose = () => {
    setExportAnchorEl(null);
  };

  // Reset pagination state when output changes (new query execution)
  React.useEffect(() => {
    // Invalidate any in-flight pagination request from previous output
    latestRequestId.current += 1;
    setLoading(false);
    setPage(0);
    setPaginatedData(output.data || []);
    setChartData(null);
    chartRequestKeyRef.current = null;
  }, [
    cellId,
    sql,
    output.type,
    output.rowCount,
    output.totalRows,
    output.executionTime,
  ]);

  React.useEffect(() => {
    if (viewMode !== 'chart' || output.type !== 'table') return;

    const currentRows = output.data || [];
    const totalRows = output.totalRows ?? output.rowCount ?? currentRows.length;
    if (totalRows <= currentRows.length) {
      return;
    }

    const chartLimit = Math.min(totalRows, MAX_CHART_ROWS);
    const requestKey = `${connectionId}:${notebookId}:${cellId}:${sql}:${chartLimit}`;
    if (chartRequestKeyRef.current === requestKey) {
      return;
    }
    chartRequestKeyRef.current = requestKey;

    latestChartRequestId.current += 1;
    const requestId = latestChartRequestId.current;

    const fetchChartData = async () => {
      try {
        const result = await fetchCellPageAsync({
          connectionId,
          notebookId,
          cellId,
          sql,
          limit: chartLimit,
          offset: 0,
        });
        if (requestId !== latestChartRequestId.current) return;
        if (result.type === 'table' && result.data) {
          setChartData(result.data);
        }
      } catch (error) {
        if (requestId !== latestChartRequestId.current) return;
        // eslint-disable-next-line no-console
        console.error('[OutputPanel] Failed to fetch chart data:', error);
      }
    };

    fetchChartData();
  }, [
    viewMode,
    output.type,
    output.data,
    output.rowCount,
    output.totalRows,
    connectionId,
    notebookId,
    cellId,
    sql,
    fetchCellPageAsync,
  ]);

  // Fetch a specific page - only called when user explicitly changes page
  const fetchPage = useCallback(
    async (newPage: number, newPerPage: number) => {
      // Don't fetch if we're on the first page and already have data
      if (
        newPage === 0 &&
        newPerPage === 10 &&
        output.data &&
        output.data.length > 0
      ) {
        setPaginatedData(output.data);
        return;
      }

      setLoading(true);
      latestRequestId.current += 1;
      const requestId = latestRequestId.current;
      try {
        const result = await fetchCellPage.mutateAsync({
          connectionId,
          notebookId,
          cellId,
          sql,
          limit: newPerPage,
          offset: newPage * newPerPage,
        });

        // Only update state if this is the latest request
        if (requestId !== latestRequestId.current) return;

        if (result.type === 'table' && result.data) {
          setPaginatedData(result.data);
        } else if (result.type === 'empty') {
          setPaginatedData([]);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[OutputPanel] Failed to fetch page:', error);
      } finally {
        // Only update loading state if this is the latest request
        if (requestId === latestRequestId.current) {
          setLoading(false);
        }
      }
    },
    [connectionId, notebookId, cellId, sql, fetchCellPage, output.data],
  );

  // Export handlers (matching SQL screen implementation)
  const handleExportJSON = async () => {
    handleExportMenuClose();

    if (isDuckLake) {
      // DuckLake: Full dataset export via COPY TO
      const instanceId = connectionId.replace('ducklake-', '');
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
        const escapedPath = escapeSqlLiteral(result.filePath);
        const normalizedSql = normalizeSqlForCopy(sql);
        const copyQuery = `COPY (${normalizedSql}) TO '${escapedPath}' (FORMAT JSON)`;

        await window.electron.ipcRenderer.invoke('ducklake:query:execute', {
          instanceId,
          query: copyQuery,
        });

        toast.success('JSON export completed');
      } catch (error: any) {
        // eslint-disable-next-line no-console
        console.error('JSON export error:', error);
        toast.error(`JSON export failed: ${error.message}`);
      } finally {
        setIsExporting(false);
      }
    } else {
      // Regular connection: In-memory export (current page only)
      const json = JSON.stringify(
        paginatedData,
        (_, value) => (typeof value === 'bigint' ? value.toString() : value),
        2,
      );
      const blob = new Blob([json], {
        type: 'application/json',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'query_results.json';
      a.click();
      window.URL.revokeObjectURL(url);
    }
  };

  const handleExportCSV = async () => {
    handleExportMenuClose();

    if (isDuckLake) {
      // DuckLake: Full dataset export via COPY TO
      const instanceId = connectionId.replace('ducklake-', '');
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
        const escapedPath = escapeSqlLiteral(result.filePath);
        const normalizedSql = normalizeSqlForCopy(sql);
        const copyQuery = `COPY (${normalizedSql}) TO '${escapedPath}' (FORMAT CSV, HEADER)`;

        await window.electron.ipcRenderer.invoke('ducklake:query:execute', {
          instanceId,
          query: copyQuery,
        });

        toast.success('CSV export completed');
      } catch (error: any) {
        // eslint-disable-next-line no-console
        console.error('CSV export error:', error);
        toast.error(`CSV export failed: ${error.message}`);
      } finally {
        setIsExporting(false);
      }
    } else {
      // Regular connection: In-memory export (current page only)
      const escapeCsvValue = (value: unknown): string => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (/[,"\n]/.test(str)) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const columns = output.columns || [];
      const csvContent = [
        columns.join(','),
        ...paginatedData.map((row: any) =>
          columns.map((col) => escapeCsvValue(row[col])).join(','),
        ),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'query_results.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    }
  };

  const handleExportParquet = async () => {
    handleExportMenuClose();

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'dialog:showSaveDialog',
        {
          title: 'Export to Parquet (full dataset)',
          defaultPath: 'query_results.parquet',
          filters: [{ name: 'Parquet Files', extensions: ['parquet'] }],
        },
      );

      if (result.canceled || !result.filePath) return;

      setIsExporting(true);

      if (isDuckLake) {
        // DuckLake: Full dataset export via COPY TO
        const instanceId = connectionId.replace('ducklake-', '');
        const escapedPath = escapeSqlLiteral(result.filePath);
        const normalizedSql = normalizeSqlForCopy(sql);
        const copyQuery = `COPY (${normalizedSql}) TO '${escapedPath}' (FORMAT PARQUET)`;

        await window.electron.ipcRenderer.invoke('ducklake:query:execute', {
          instanceId,
          query: copyQuery,
        });
      } else {
        // Regular DB: Use connector export
        await window.electron.ipcRenderer.invoke('connector:executeQuery', {
          connectionId,
          query: `COPY (${normalizeSqlForCopy(sql)}) TO '${escapeSqlLiteral(result.filePath)}' (FORMAT PARQUET)`,
        });
      }

      toast.success('Parquet export completed');
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Parquet export error:', error);
      toast.error(`Parquet export failed: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPng = async () => {
    handleExportMenuClose();
    if (!chartContainerRef.current) return;

    const svgElement = Array.from(
      chartContainerRef.current.querySelectorAll('svg'),
    ).find(
      (svg) =>
        !svg.classList.contains('MuiSvgIcon-root') &&
        svg.getBoundingClientRect().width > 100,
    );
    if (!svgElement) {
      toast.error('No chart SVG found to export');
      return;
    }

    let svgUrl: string | undefined;
    try {
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], {
        type: 'image/svg+xml;charset=utf-8',
      });
      svgUrl = URL.createObjectURL(svgBlob);

      const img = new Image();
      const canvas = document.createElement('canvas');
      const rect = svgElement.getBoundingClientRect();

      await new Promise<void>((resolve, reject) => {
        img.onload = async () => {
          try {
            canvas.width = rect.width * 2;
            canvas.height = rect.height * 2;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Failed to get canvas context'));
              return;
            }
            ctx.scale(2, 2);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, rect.width, rect.height);
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            const base64data = dataUrl.split(',')[1];
            const result = await window.electron.ipcRenderer.invoke(
              'utils:saveBase64File',
              {
                data: base64data,
                options: {
                  title: 'Export Chart as PNG',
                  defaultPath: 'chart.png',
                  filters: [{ name: 'PNG Images', extensions: ['png'] }],
                },
              },
            );
            if (result.canceled) {
              resolve();
              return;
            }
            toast.success('Chart exported as PNG successfully');
            resolve();
          } catch (writeError) {
            // eslint-disable-next-line no-console
            console.error('PNG write error:', writeError);
            toast.error('Failed to save PNG file');
            reject(writeError);
          }
        };
        img.onerror = () => {
          reject(new Error('Failed to load SVG image'));
        };
        img.src = svgUrl!;
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('PNG export error:', error);
      toast.error('Chart export failed');
    } finally {
      if (svgUrl) {
        URL.revokeObjectURL(svgUrl);
      }
    }
  };

  // Error output
  if (output.type === 'error') {
    return (
      <Paper
        elevation={0}
        sx={{
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? '#5c1a1a' : '#fdecea',
          border: (theme) => `1px solid ${theme.palette.error.main}`,
          p: 1,
          mt: 0.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <ErrorIcon
            sx={{
              fontSize: 20,
              color: (theme) => theme.palette.error.main,
              flexShrink: 0,
            }}
          />
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="subtitle2"
              gutterBottom
              sx={{
                fontSize: 12,
                mb: 0.5,
                fontWeight: 600,
                color: (theme) =>
                  theme.palette.mode === 'dark' ? '#ff6b6b' : '#c62828',
              }}
            >
              Execution Error
            </Typography>
            <Typography
              variant="body2"
              component="pre"
              sx={{
                fontFamily: 'monospace',
                fontSize: 11,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                m: 0,
                lineHeight: 1.5,
                color: (theme) =>
                  theme.palette.mode === 'dark' ? '#ffcccc' : '#5f2120',
              }}
            >
              {output.error}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                mt: 0.5,
                fontSize: 10,
                display: 'block',
                color: (theme) =>
                  theme.palette.mode === 'dark' ? '#ff9999' : '#8b3a3a',
              }}
            >
              Execution time: {output.executionTime}ms
            </Typography>
          </Box>
        </Box>
      </Paper>
    );
  }

  // Empty output
  if (output.type === 'empty' || !output.data || output.data.length === 0) {
    return (
      <Paper
        elevation={0}
        sx={{
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
          p: 0.5,
          mt: 0.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <SuccessIcon color="success" sx={{ fontSize: 16 }} />
          <Box>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: 11 }}
            >
              Query executed successfully (no results)
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: 9 }}
            >
              Execution time: {output.executionTime}ms
              {output.totalRows !== undefined &&
                ` • Total rows: ${output.totalRows.toLocaleString()}`}
            </Typography>
          </Box>
        </Box>
      </Paper>
    );
  }

  // Table output - use CustomTable with pagination
  const columns = output.columns || [];
  const hasPagination = output.totalRows !== undefined && output.totalRows > 10;

  // Custom pagination for large datasets
  const customPagination = hasPagination
    ? {
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
        count: output.totalRows || 0,
        order: 'asc' as const,
        setOrder: () => {},
        orderBy: '',
        setOrderBy: () => {},
        keyword: '',
        setKeyword: () => {},
      }
    : undefined;

  // Render function to handle complex types (same as SQL screen)
  const renderCellValue = (row: any, columnId: string) => {
    const cellValue = row[columnId];

    // Handle null/undefined
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
            fontSize: '12px',
          }}
        >
          NULL
        </div>
      );
    }

    // Convert objects and complex types to strings
    let stringValue: string;
    if (typeof cellValue === 'object') {
      try {
        stringValue = JSON.stringify(cellValue);
      } catch {
        stringValue = String(cellValue);
      }
    } else if (typeof cellValue === 'bigint') {
      stringValue = cellValue.toString();
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
          fontSize: '12px',
        }}
      >
        {stringValue}
      </div>
    );
  };

  const toolbarContent = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        ml: 'auto',
      }}
    >
      {/* Execution time with green badge */}
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          bgcolor: 'success.main',
          color: 'success.contrastText',
          px: 1,
          py: 0.25,
          borderRadius: 1,
          fontSize: 11,
          fontWeight: 500,
        }}
      >
        {output.executionTime}ms
      </Box>

      {/* Preview button */}
      <Button
        variant="outlined"
        size="small"
        startIcon={viewMode === 'table' ? <CsvIcon /> : <BarChartIcon />}
        endIcon={<ArrowDropDownIcon />}
        onClick={handlePreviewMenuOpen}
        sx={{ height: 28, minWidth: 90 }}
      >
        {viewMode === 'table' ? 'Table' : 'Chart'}
      </Button>

      {/* Preview menu */}
      <Menu
        anchorEl={previewAnchorEl}
        open={previewMenuOpen}
        onClose={handlePreviewMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            setViewMode('table');
            handlePreviewMenuClose();
          }}
          selected={viewMode === 'table'}
          dense
        >
          <ListItemIcon sx={{ minWidth: 28 }}>
            <CsvIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText
            primary="Table"
            primaryTypographyProps={{ variant: 'body2' }}
          />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setViewMode('chart');
            handlePreviewMenuClose();
          }}
          selected={viewMode === 'chart'}
          dense
        >
          <ListItemIcon sx={{ minWidth: 28 }}>
            <BarChartIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText
            primary="Chart"
            primaryTypographyProps={{ variant: 'body2' }}
          />
        </MenuItem>
      </Menu>

      {/* Export button */}
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
        disabled={!paginatedData || paginatedData.length === 0 || isExporting}
        sx={{ minWidth: 100, height: 28 }}
      >
        {isExporting ? 'Exporting...' : 'Export'}
      </Button>

      {/* Export menu */}
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
        {viewMode === 'chart' ? (
          <MenuItem onClick={handleExportPng} disabled={isExporting} dense>
            <ListItemIcon>
              <ImageIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Export as PNG"
              primaryTypographyProps={{
                variant: 'body2',
                fontSize: '0.875rem',
              }}
            />
          </MenuItem>
        ) : (
          <>
            <MenuItem onClick={handleExportJSON} disabled={isExporting} dense>
              <ListItemIcon>
                <JsonIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={
                  isDuckLake ? 'Export JSON (full dataset)' : 'Download JSON'
                }
                primaryTypographyProps={{
                  variant: 'body2',
                  fontSize: '0.875rem',
                }}
              />
            </MenuItem>

            <MenuItem onClick={handleExportCSV} disabled={isExporting} dense>
              <ListItemIcon>
                <CsvIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={
                  isDuckLake ? 'Export CSV (full dataset)' : 'Download CSV'
                }
                primaryTypographyProps={{
                  variant: 'body2',
                  fontSize: '0.875rem',
                }}
              />
            </MenuItem>

            <MenuItem
              onClick={handleExportParquet}
              disabled={isExporting}
              dense
            >
              <ListItemIcon>
                <ParquetIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Export Parquet (full dataset)"
                primaryTypographyProps={{
                  variant: 'body2',
                  fontSize: '0.875rem',
                }}
              />
            </MenuItem>
          </>
        )}
      </Menu>
    </Box>
  );

  return (
    <Box sx={{ width: '100%', mt: 0.5 }}>
      {viewMode === 'chart' ? (
        <Box
          ref={chartContainerRef}
          sx={{
            width: '100%',
            height: 450,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              pr: 2,
              pl: 2,
              minHeight: 48,
            }}
          >
            <Box
              sx={{
                flex: '1 1 auto',
                overflow: 'hidden',
                mr: 2,
                display: 'flex',
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {output.totalRows !== undefined &&
                  `${output.totalRows.toLocaleString()} rows`}
              </Typography>
            </Box>
            {toolbarContent}
          </Box>
          <QueryResultVisualization
            data={chartData || output.data || paginatedData}
          />
        </Box>
      ) : (
        <CustomTable
          id={`notebook-cell-${cellId}`}
          name="" // Hide the "Cell Output" title
          rows={paginatedData}
          columns={columns.map((col) => ({
            id: col,
            label: col,
            render: (row: any) => renderCellValue(row, col),
          }))}
          customPagination={customPagination as any}
          loading={loading}
          showSearch={false} // Hide the search field
          toolbarContent={toolbarContent}
        />
      )}

      {/* Export loading backdrop */}
      <Backdrop
        sx={{
          color: '#fff',
          zIndex: (theme) => theme.zIndex.drawer + 999,
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
    </Box>
  );
};
