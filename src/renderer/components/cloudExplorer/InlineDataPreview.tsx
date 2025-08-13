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
  TextField,
  InputAdornment,
  TablePagination,
  Button,
} from '@mui/material';
import {
  Search,
  TableView,
  Schema,
  Analytics,
  ArrowBack,
  Fullscreen,
} from '@mui/icons-material';
import type { PreviewResult } from '../../../types/frontend';
import { DataPreviewModal } from './DataPreviewModal';
import { formatFileSize } from '../../utils/fileUtils';

interface InlineDataPreviewProps {
  fileName: string;
  previewResult: PreviewResult | null;
  loading: boolean;
  error?: string;
  onBack: () => void;
  fileSize?: number; // Size in bytes
}

/**
 * Sanitize text to remove problematic Unicode characters that might cause display issues
 */
const sanitizeText = (text: string): string => {
  if (typeof text !== 'string') return String(text);

  // Remove Unicode combining characters and other problematic characters
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
    .replace(/[\u200b-\u200f\u2060-\u206f]/g, '') // Remove zero-width characters
    .replace(/[\u2000-\u200a]/g, ' ') // Replace various spaces with regular space
    .replace(/[^\u0020-\u007e]/g, (char) => {
      // Keep common printable Unicode characters, replace others with �
      const code = char.charCodeAt(0);
      if (code >= 0x80 && code <= 0x024f) return char; // Extended Latin
      if (code >= 0x1e00 && code <= 0x1eff) return char; // Latin Extended Additional
      return '�';
    })
    .trim();
};

export const InlineDataPreview: React.FC<InlineDataPreviewProps> = ({
  fileName,
  previewResult,
  loading,
  error,
  onBack,
  fileSize,
}) => {
  const [currentTab, setCurrentTab] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setPage(0); // Reset pagination when searching
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Filter data based on search term
  const filteredData = React.useMemo(() => {
    if (!previewResult?.data || !searchTerm) return previewResult?.data || [];

    return previewResult.data.filter((row) => {
      // Handle both array and object data formats
      let values: any[];
      if (Array.isArray(row)) {
        values = row;
      } else {
        values = Object.values(row);
      }

      return values.some((value) =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase()),
      );
    });
  }, [previewResult?.data, searchTerm]);

  // Paginate filtered data
  const paginatedData = React.useMemo(() => {
    const startIndex = page * rowsPerPage;
    return filteredData.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredData, page, rowsPerPage]);

  const renderDataTable = () => {
    if (!previewResult?.data || previewResult.data.length === 0) {
      return (
        <Box sx={{ textAlign: 'center', p: 4 }}>
          <Typography color="text.secondary">No data to display</Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search in data..."
            value={searchTerm}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 300 }}
          />
          <Typography variant="body2" color="text.secondary">
            {filteredData.length} rows
            {searchTerm && ` (filtered from ${previewResult.data.length})`}
          </Typography>
        </Box>

        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <TableContainer
            component={Paper}
            sx={{
              flex: 1,
              minHeight: 300,
              overflow: 'auto',
              maxHeight: 'calc(100vh - 430px)',
              maxWidth: 'calc(100vw - 430px)',
            }}
          >
            <Table
              stickyHeader
              size="small"
              sx={{
                minWidth: 'max-content',
              }}
            >
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
                {paginatedData.map((row, index) => (
                  <TableRow
                    key={index}
                    hover
                    sx={{
                      '& .MuiTableCell-root': {
                        py: 0.5,
                      },
                    }}
                  >
                    {previewResult.columns?.map((column, colIndex) => {
                      // Handle both array and object data formats
                      let cellValue: any;
                      if (Array.isArray(row)) {
                        // Array format - use column index
                        cellValue = row[colIndex];
                      } else {
                        // Object format - use column name
                        cellValue = row[column.name];
                      }

                      return (
                        <TableCell
                          key={column.name}
                          sx={{
                            minWidth: 150,
                            py: 0.5,
                          }}
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
              count={filteredData.length}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[10, 25, 50, 100]}
            />
          </Box>
        </Box>
      </Box>
    );
  };

  const renderSchemaTab = () => {
    if (!previewResult?.columns || previewResult.columns.length === 0) {
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
                  <Typography variant="body2" color="text.secondary">
                    {column.type}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  const renderStatsTab = () => {
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
              {previewResult?.data?.length || 0}
            </Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Total Columns
            </Typography>
            <Typography variant="h4">
              {previewResult?.columns?.length || 0}
            </Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              File Size
            </Typography>
            <Typography variant="h4">{formatFileSize(fileSize)}</Typography>
          </Paper>
        </Box>
      </Box>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            p: 4,
            alignItems: 'center',
          }}
        >
          <CircularProgress />
          <Typography sx={{ ml: 2 }}>Loading data preview...</Typography>
        </Box>
      );
    }

    if (error) {
      return (
        <Alert severity="error" sx={{ m: 2 }}>
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
          {currentTab === 0 && renderDataTable()}
          {currentTab === 1 && renderSchemaTab()}
          {currentTab === 2 && renderStatsTab()}
        </Box>
      </Box>
    );
  };

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
          mb: 1,
          borderBottom: 1,
          borderColor: 'divider',
          pb: 2,
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
        <Box>
          <Button
            variant="outlined"
            startIcon={<Fullscreen />}
            onClick={() => setFullscreenOpen(true)}
          >
            Fullscreen
          </Button>
        </Box>
      </Box>

      {/* Content */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          p: 2,
          pt: 0,
        }}
      >
        {renderContent()}
      </Box>

      {/* Fullscreen Modal */}
      <DataPreviewModal
        open={fullscreenOpen}
        onClose={() => setFullscreenOpen(false)}
        fileName={fileName}
        previewResult={previewResult}
        loading={loading}
        error={error}
        fileSize={fileSize}
      />
    </Box>
  );
};
