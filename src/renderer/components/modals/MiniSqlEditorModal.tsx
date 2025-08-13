import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
} from '@mui/material';
import { Close, Download, ContentCopy } from '@mui/icons-material';
import { toast } from 'react-toastify';
import type { PreviewResult } from '../../../types/frontend';

// Type mapping for database field types
const getReadableTypeName = (typeId: number | string): string => {
  const typeMap: Record<number | string, string> = {
    // PostgreSQL types
    20: 'BIGINT',
    21: 'SMALLINT',
    23: 'INTEGER',
    25: 'TEXT',
    1043: 'VARCHAR',
    1700: 'NUMERIC',
    701: 'FLOAT',
    700: 'REAL',
    1082: 'DATE',
    1083: 'TIME',
    1114: 'TIMESTAMP',
    1184: 'TIMESTAMPTZ',
    16: 'BOOLEAN',

    // Snowflake types
    NUMBER: 'NUMBER',
    STRING: 'STRING',
    BOOLEAN: 'BOOLEAN',
    DATE: 'DATE',
    TIME: 'TIME',
    TIMESTAMP: 'TIMESTAMP',
    TIMESTAMP_LTZ: 'TIMESTAMP_LTZ',
    TIMESTAMP_NTZ: 'TIMESTAMP_NTZ',
    TIMESTAMP_TZ: 'TIMESTAMP_TZ',
    VARIANT: 'VARIANT',
    OBJECT: 'OBJECT',
    ARRAY: 'ARRAY',

    // BigQuery types
    INT64: 'INT64',
    FLOAT64: 'FLOAT64',
    BOOL: 'BOOL',
    DATETIME: 'DATETIME',
    NUMERIC: 'NUMERIC',
    BIGNUMERIC: 'BIGNUMERIC',

    // DuckDB types
    BIGINT: 'BIGINT',
    INTEGER: 'INTEGER',
    SMALLINT: 'SMALLINT',
    TINYINT: 'TINYINT',
    VARCHAR: 'VARCHAR',
    CHAR: 'CHAR',
    DOUBLE: 'DOUBLE',
    REAL: 'REAL',
    DECIMAL: 'DECIMAL',

    // Default fallback
    unknown: 'UNKNOWN',
  };

  return typeMap[typeId] || typeMap.unknown;
};

interface MiniSqlEditorModalProps {
  open: boolean;
  onClose: () => void;
  modelName: string;
  previewResult: PreviewResult | null;
  loading: boolean;
  error?: string;
}

export const MiniSqlEditorModal: React.FC<MiniSqlEditorModalProps> = ({
  open,
  onClose,
  modelName,
  previewResult,
  loading,
  error,
}) => {
  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleDownloadData = () => {
    if (!previewResult?.data) return;

    const csvContent = [
      previewResult.columns?.map((col) => col.name).join(','),
      ...previewResult.data.map((row) =>
        Object.values(row)
          .map((value) => `"${value}"`)
          .join(','),
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${modelName}_preview.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: '70vh',
          minHeight: '400px',
        },
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Preview: {modelName}</Typography>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {loading && (
          <Box display="flex" justifyContent="center" alignItems="center" p={3}>
            <CircularProgress size={24} />
            <Typography sx={{ ml: 2 }}>Loading preview data...</Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body2">{error}</Typography>
          </Alert>
        )}

        {previewResult && !loading && (
          <Box>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Box display="flex" alignItems="center" gap={1}>
                <Chip
                  label={`${previewResult.totalRows || 0} rows`}
                  size="small"
                  color="primary"
                />
                <Chip
                  label={`${previewResult.columns?.length || 0} columns`}
                  size="small"
                  variant="outlined"
                />
              </Box>
              <Box display="flex" gap={1}>
                <Button
                  startIcon={<ContentCopy />}
                  onClick={() =>
                    handleCopyToClipboard(
                      JSON.stringify(previewResult.data, null, 2),
                    )
                  }
                  size="small"
                >
                  Copy JSON
                </Button>
                <Button
                  startIcon={<Download />}
                  onClick={handleDownloadData}
                  size="small"
                >
                  Download CSV
                </Button>
              </Box>
            </Box>

            <TableContainer component={Paper} sx={{ maxHeight: '400px' }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {previewResult.columns?.map((column) => (
                      <TableCell key={column.name} sx={{ fontWeight: 'bold' }}>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">
                            {column.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {getReadableTypeName(column.type)}
                          </Typography>
                        </Box>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewResult.data?.slice(0, 100).map((row, index) => (
                    <TableRow key={index} hover>
                      {previewResult.columns?.map((column) => (
                        <TableCell key={column.name}>
                          <Typography
                            variant="body2"
                            sx={{
                              maxWidth: 200,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontFamily: 'monospace',
                            }}
                            title={String(row[column.name] ?? '')}
                          >
                            {row[column.name] !== null &&
                            row[column.name] !== undefined
                              ? String(row[column.name])
                              : '—'}
                          </Typography>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {previewResult.data && previewResult.data.length > 100 && (
              <Box mt={2} textAlign="center">
                <Typography variant="body2" color="text.secondary">
                  Showing first 100 rows of {previewResult.data.length} total
                  rows
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
