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
} from '@mui/material';
import {
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  GetApp as ExportIcon,
} from '@mui/icons-material';
import { CellOutput } from '../../../types/notebook';

interface OutputPanelProps {
  output: CellOutput;
}

export const OutputPanel: React.FC<OutputPanelProps> = ({ output }) => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

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

  const handleExport = () => {
    if (output.type === 'table' && output.data) {
      // TODO: Implement export functionality (CSV, JSON, etc.)
      // eslint-disable-next-line no-console
      console.log('Export data:', output.data);
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
          <IconButton size="small" onClick={handleExport}>
            <ExportIcon fontSize="small" />
          </IconButton>
        </Tooltip>
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
