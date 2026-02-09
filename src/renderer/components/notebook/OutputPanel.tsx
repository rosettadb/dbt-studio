/**
 * Output Panel Component
 * Displays cell execution results (table, error, or empty)
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
} from '@mui/material';
import {
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  GetApp as ExportIcon,
  Description as CsvIcon,
  TableChart as TsvIcon,
  Storage as ParquetIcon,
  Code as JsonIcon,
} from '@mui/icons-material';
import { CellOutput } from '../../../types/notebook';
import { notebookService } from '../../services/notebook.service';

interface OutputPanelProps {
  output: CellOutput;
  cellId: string;
}

export const OutputPanel: React.FC<OutputPanelProps> = ({ output, cellId }) => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(
    null,
  );
  const [isExporting, setIsExporting] = useState(false);

  // Debug logging
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[OutputPanel] Rendering with output:', {
      type: output.type,
      dataLength: output.data?.length,
      columns: output.columns,
      rowCount: output.rowCount,
      error: output.error,
    });
  }, [output]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleExport = async (format: 'csv' | 'tsv' | 'json' | 'parquet') => {
    if (output.type === 'table' && output.data) {
      setIsExporting(true);
      setExportMenuAnchor(null);

      try {
        const filePath = await notebookService.exportData(
          cellId,
          format,
          output.data,
        );
        // eslint-disable-next-line no-console
        console.log(`Data exported to: ${filePath}`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Export failed:', error);
      } finally {
        setIsExporting(false);
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
            theme.palette.mode === 'dark' ? 'error.dark' : 'error.light',
          p: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
          <ErrorIcon color="error" sx={{ fontSize: 18 }} />
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="subtitle2"
              color="error"
              gutterBottom
              sx={{ fontSize: 12, mb: 0.5 }}
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
                lineHeight: 1.4,
              }}
            >
              {output.error}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 0.5, fontSize: 10 }}
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
          p: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <SuccessIcon color="success" sx={{ fontSize: 18 }} />
          <Box>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: 12 }}
            >
              Query executed successfully (no results)
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: 10 }}
            >
              Execution time: {output.executionTime}ms
            </Typography>
          </Box>
        </Box>
      </Paper>
    );
  }

  // Table output
  const paginatedData = output.data.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  return (
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
          py: 0.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
          minHeight: '32px',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <SuccessIcon color="success" sx={{ fontSize: 16 }} />
          <Chip
            label={`${output.rowCount} rows`}
            size="small"
            color="primary"
            variant="outlined"
            sx={{
              height: '20px',
              fontSize: '10px',
              '& .MuiChip-label': { px: 0.75, py: 0 },
            }}
          />
          <Chip
            label={`${output.executionTime}ms`}
            size="small"
            variant="outlined"
            sx={{
              height: '20px',
              fontSize: '10px',
              '& .MuiChip-label': { px: 0.75, py: 0 },
            }}
          />
        </Box>

        <Tooltip title="Export Results">
          <IconButton
            size="small"
            onClick={(e) => setExportMenuAnchor(e.currentTarget)}
            disabled={isExporting}
            sx={{ p: 0.25 }}
          >
            {isExporting ? (
              <CircularProgress size={16} />
            ) : (
              <ExportIcon sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        </Tooltip>

        <Menu
          anchorEl={exportMenuAnchor}
          open={Boolean(exportMenuAnchor)}
          onClose={() => setExportMenuAnchor(null)}
        >
          <MenuItem
            onClick={() => handleExport('csv')}
            sx={{ py: 0.5, fontSize: 12 }}
          >
            <ListItemIcon>
              <CsvIcon sx={{ fontSize: 16 }} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 12 }}>
              CSV (Comma-Separated)
            </ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => handleExport('tsv')}
            sx={{ py: 0.5, fontSize: 12 }}
          >
            <ListItemIcon>
              <TsvIcon sx={{ fontSize: 16 }} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 12 }}>
              TSV (Tab-Separated)
            </ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => handleExport('json')}
            sx={{ py: 0.5, fontSize: 12 }}
          >
            <ListItemIcon>
              <JsonIcon sx={{ fontSize: 16 }} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 12 }}>
              JSON
            </ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => handleExport('parquet')}
            sx={{ py: 0.5, fontSize: 12 }}
          >
            <ListItemIcon>
              <ParquetIcon sx={{ fontSize: 16 }} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 12 }}>
              Parquet
            </ListItemText>
          </MenuItem>
        </Menu>
      </Box>

      {/* Table */}
      <TableContainer sx={{ maxHeight: 400 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {output.columns?.map((column) => (
                <TableCell
                  key={column}
                  sx={{
                    fontWeight: 'bold',
                    fontSize: 12,
                    py: 0.25,
                    px: 1,
                    bgcolor: (theme) =>
                      theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {column}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.map((row, rowIndex) => (
              <TableRow
                key={rowIndex}
                hover
                sx={{ '&:last-child td': { border: 0 } }}
              >
                {output.columns?.map((column) => (
                  <TableCell
                    key={column}
                    sx={{
                      maxWidth: 300,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: 12,
                      py: 0.25,
                      px: 1,
                    }}
                  >
                    {row[column] === null ? (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        fontStyle="italic"
                        sx={{ fontSize: 12 }}
                      >
                        NULL
                      </Typography>
                    ) : (
                      String(row[column])
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      {output.rowCount && output.rowCount > 10 && (
        <TablePagination
          component="div"
          count={output.rowCount}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 25, 50, 100]}
          sx={{
            '& .MuiTablePagination-toolbar': {
              minHeight: '40px',
              px: 1,
            },
            '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows':
              {
                fontSize: 11,
                m: 0,
              },
            '& .MuiTablePagination-select': {
              fontSize: 11,
            },
          }}
        />
      )}
    </Paper>
  );
};
