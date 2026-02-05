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
          p: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <ErrorIcon color="error" />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" color="error" gutterBottom>
              Execution Error
            </Typography>
            <Typography
              variant="body2"
              component="pre"
              sx={{
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                m: 0,
              }}
            >
              {output.error}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
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
          p: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SuccessIcon color="success" />
          <Box>
            <Typography variant="body2" color="text.secondary">
              Query executed successfully (no results)
            </Typography>
            <Typography variant="caption" color="text.secondary">
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
          p: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SuccessIcon color="success" fontSize="small" />
          <Chip
            label={`${output.rowCount} rows`}
            size="small"
            color="primary"
            variant="outlined"
          />
          <Chip
            label={`${output.executionTime}ms`}
            size="small"
            variant="outlined"
          />
        </Box>

        <Tooltip title="Export Results">
          <IconButton
            size="small"
            onClick={(e) => setExportMenuAnchor(e.currentTarget)}
            disabled={isExporting}
          >
            {isExporting ? (
              <CircularProgress size={20} />
            ) : (
              <ExportIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>

        <Menu
          anchorEl={exportMenuAnchor}
          open={Boolean(exportMenuAnchor)}
          onClose={() => setExportMenuAnchor(null)}
        >
          <MenuItem onClick={() => handleExport('csv')}>
            <ListItemIcon>
              <CsvIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>CSV (Comma-Separated)</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleExport('tsv')}>
            <ListItemIcon>
              <TsvIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>TSV (Tab-Separated)</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleExport('json')}>
            <ListItemIcon>
              <JsonIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>JSON</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleExport('parquet')}>
            <ListItemIcon>
              <ParquetIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Parquet</ListItemText>
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
                    }}
                  >
                    {row[column] === null ? (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        fontStyle="italic"
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
        />
      )}
    </Paper>
  );
};
