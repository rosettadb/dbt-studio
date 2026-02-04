import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  ArrowDropDown as ArrowDropDownIcon,
} from '@mui/icons-material';
import {
  useDeleteDuckLakeRows,
  useUpdateDuckLakeRows,
  useUpsertDuckLakeRows,
  useExecuteDuckLakeQuery,
  useDuckLakeTableDetails,
} from '../../../controllers/duckLake.controller';
import { DuckLakeQueryResult } from '../../../../types/duckLake';

interface TableDataRowsTabProps {
  instanceId: string;
  tableName: string;
}

export const TableDataRowsTab: React.FC<TableDataRowsTabProps> = ({
  instanceId,
  tableName,
}) => {
  const [updateRowsDialogOpen, setUpdateRowsDialogOpen] = useState(false);
  const [updateRowsQuery, setUpdateRowsQuery] = useState('');

  const [deleteRowsDialogOpen, setDeleteRowsDialogOpen] = useState(false);
  const [deleteRowsQuery, setDeleteRowsQuery] = useState('');

  const [upsertRowsDialogOpen, setUpsertRowsDialogOpen] = useState(false);
  const [upsertRowsQuery, setUpsertRowsQuery] = useState('');

  // Data Grid State
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [queryResult, setQueryResult] = useState<DuckLakeQueryResult | null>(
    null,
  );
  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Export Menu State
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(
    null,
  );
  const exportMenuOpen = Boolean(exportAnchorEl);

  const updateRowsMutation = useUpdateDuckLakeRows();
  const deleteRowsMutation = useDeleteDuckLakeRows();
  const upsertRowsMutation = useUpsertDuckLakeRows();
  const { mutate: executeQuery } = useExecuteDuckLakeQuery();

  // Export handlers
  const handleExportMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setExportAnchorEl(event.currentTarget);
  };

  const handleExportMenuClose = () => {
    setExportAnchorEl(null);
  };

  const exportWithDuckDB = async (
    format: 'CSV' | 'JSON' | 'PARQUET',
    defaultExtension: string,
    fileFilters: { name: string; extensions: string[] }[],
    options: string = '',
  ) => {
    if (!queryResult || !queryResult.rows.length) return;

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'dialog:showSaveDialog',
        {
          title: `Export to ${format}`,
          defaultPath: `${tableName}_export.${defaultExtension}`,
          filters: fileFilters,
        },
      );

      if (result.canceled || !result.filePath) {
        handleExportMenuClose();
        return;
      }

      // Use DuckDB's COPY TO command
      const exportQuery = `COPY (SELECT * FROM "${tableName}") TO '${result.filePath.replace(/'/g, "''")}' (FORMAT ${format}${options ? `, ${options}` : ''})`;

      executeQuery(
        {
          instanceId,
          sql: exportQuery,
        },
        {
          onSuccess: () => {
            // eslint-disable-next-line no-console
            console.log(
              `Successfully exported to ${format}: ${result.filePath}`,
            );
            handleExportMenuClose();
          },
          onError: (error: Error) => {
            // eslint-disable-next-line no-console
            console.error(`${format} export failed:`, error);
            setFetchError(`Failed to export to ${format}: ${error.message}`);
            handleExportMenuClose();
          },
        },
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`${format} export error:`, error);
      setFetchError(`Export error: ${(error as Error).message}`);
      handleExportMenuClose();
    }
  };

  const handleExportCSV = () => {
    exportWithDuckDB(
      'CSV',
      'csv',
      [{ name: 'CSV Files', extensions: ['csv'] }],
      'HEADER',
    );
  };

  const handleExportJSON = () => {
    exportWithDuckDB(
      'JSON',
      'json',
      [{ name: 'JSON Files', extensions: ['json'] }],
      'ARRAY',
    );
  };

  const handleExportParquet = () => {
    exportWithDuckDB('PARQUET', 'parquet', [
      { name: 'Parquet Files', extensions: ['parquet'] },
    ]);
  };

  // Fetch table details to get the total row count
  const { data: tableDetails } = useDuckLakeTableDetails(instanceId, tableName);

  const fetchData = React.useCallback(() => {
    if (!instanceId || !tableName) return;

    setLoadingData(true);
    setFetchError(null);

    // Construct query with safe quoting
    // Note: We use * to get all columns. Pagination is handled by the backend if supported,
    // or we can append LIMIT/OFFSET to the SQL if needed.
    // The executeQuery API supports limit/offset params.
    const sql = `SELECT * FROM "${tableName}"`;

    executeQuery(
      {
        instanceId,
        sql,
        limit: rowsPerPage,
        offset: page * rowsPerPage,
      },
      {
        onSuccess: (data) => {
          setQueryResult(data);
          setLoadingData(false);
        },
        onError: (error: Error) => {
          setFetchError(error.message);
          setLoadingData(false);
        },
      },
    );
  }, [instanceId, tableName, page, rowsPerPage, executeQuery]);

  // Fetch data on mount and when page/rowsPerPage changes
  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh data when table operations succeed
  React.useEffect(() => {
    if (
      updateRowsMutation.isSuccess ||
      deleteRowsMutation.isSuccess ||
      upsertRowsMutation.isSuccess
    ) {
      fetchData();
    }
  }, [
    updateRowsMutation.isSuccess,
    deleteRowsMutation.isSuccess,
    upsertRowsMutation.isSuccess,
    fetchData,
  ]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleOpenUpdateRowsDialog = () => {
    setUpdateRowsQuery(
      `UPDATE ${tableName} SET /* column = value */ WHERE /* condition */;`,
    );
    setUpdateRowsDialogOpen(true);
  };

  const handleConfirmUpdateRows = () => {
    if (!instanceId || !tableName) {
      setUpdateRowsDialogOpen(false);
      return;
    }

    updateRowsMutation.mutate({
      instanceId,
      tableName,
      updateQuery: updateRowsQuery,
    });

    setUpdateRowsDialogOpen(false);
  };

  const handleOpenDeleteRowsDialog = () => {
    setDeleteRowsQuery(`DELETE FROM ${tableName} WHERE /* condition */;`);
    setDeleteRowsDialogOpen(true);
  };

  const handleConfirmDeleteRows = () => {
    if (!instanceId || !tableName) {
      setDeleteRowsDialogOpen(false);
      return;
    }

    deleteRowsMutation.mutate({
      instanceId,
      tableName,
      deleteQuery: deleteRowsQuery,
    });

    setDeleteRowsDialogOpen(false);
  };

  const handleOpenUpsertRowsDialog = () => {
    setUpsertRowsQuery(
      `INSERT INTO ${tableName} (/* cols */) VALUES (/* values */) /* upsert clause */;`,
    );
    setUpsertRowsDialogOpen(true);
  };

  const handleConfirmUpsertRows = () => {
    if (!instanceId || !tableName) {
      setUpsertRowsDialogOpen(false);
      return;
    }

    upsertRowsMutation.mutate({
      instanceId,
      tableName,
      upsertQuery: upsertRowsQuery,
    });

    setUpsertRowsDialogOpen(false);
  };

  return (
    <>
      <Card>
        <CardContent>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 2,
              gap: 2,
            }}
          >
            <Typography variant="h6">Data / Rows (manual SQL)</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                onClick={handleOpenUpdateRowsDialog}
                disabled={
                  updateRowsMutation.isLoading ||
                  deleteRowsMutation.isLoading ||
                  upsertRowsMutation.isLoading
                }
              >
                Update
              </Button>
              <Button
                variant="outlined"
                color="error"
                onClick={handleOpenDeleteRowsDialog}
                disabled={
                  deleteRowsMutation.isLoading ||
                  updateRowsMutation.isLoading ||
                  upsertRowsMutation.isLoading
                }
              >
                Delete
              </Button>
              <Button
                variant="outlined"
                onClick={handleOpenUpsertRowsDialog}
                disabled={
                  upsertRowsMutation.isLoading ||
                  updateRowsMutation.isLoading ||
                  deleteRowsMutation.isLoading
                }
              >
                Upsert
              </Button>
            </Box>
          </Box>

          <Alert severity="info">
            Row operations are executed as raw SQL. Review the query carefully
            before running.
          </Alert>

          <Dialog
            open={updateRowsDialogOpen}
            onClose={() => setUpdateRowsDialogOpen(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Update rows</DialogTitle>
            <DialogContent>
              <TextField
                fullWidth
                multiline
                minRows={8}
                label="UPDATE SQL"
                value={updateRowsQuery}
                onChange={(e) => setUpdateRowsQuery(e.target.value)}
                disabled={updateRowsMutation.isLoading}
                autoFocus
              />
            </DialogContent>
            <DialogActions>
              <Button
                color="inherit"
                onClick={() => setUpdateRowsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleConfirmUpdateRows}
                disabled={
                  updateRowsMutation.isLoading || updateRowsQuery.trim() === ''
                }
              >
                Run
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog
            open={deleteRowsDialogOpen}
            onClose={() => setDeleteRowsDialogOpen(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Delete rows</DialogTitle>
            <DialogContent>
              <TextField
                fullWidth
                multiline
                minRows={8}
                label="DELETE SQL"
                value={deleteRowsQuery}
                onChange={(e) => setDeleteRowsQuery(e.target.value)}
                disabled={deleteRowsMutation.isLoading}
                autoFocus
              />
            </DialogContent>
            <DialogActions>
              <Button
                color="inherit"
                onClick={() => setDeleteRowsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                color="error"
                variant="contained"
                onClick={handleConfirmDeleteRows}
                disabled={
                  deleteRowsMutation.isLoading || deleteRowsQuery.trim() === ''
                }
              >
                Run
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog
            open={upsertRowsDialogOpen}
            onClose={() => setUpsertRowsDialogOpen(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Upsert rows</DialogTitle>
            <DialogContent>
              <TextField
                fullWidth
                multiline
                minRows={8}
                label="UPSERT SQL"
                value={upsertRowsQuery}
                onChange={(e) => setUpsertRowsQuery(e.target.value)}
                disabled={upsertRowsMutation.isLoading}
                autoFocus
              />
            </DialogContent>
            <DialogActions>
              <Button
                color="inherit"
                onClick={() => setUpsertRowsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleConfirmUpsertRows}
                disabled={
                  upsertRowsMutation.isLoading || upsertRowsQuery.trim() === ''
                }
              >
                Run
              </Button>
            </DialogActions>
          </Dialog>
        </CardContent>
      </Card>

      <Card sx={{ mt: 2, overflow: 'hidden', maxWidth: 'calc(100vw - 430px)' }}>
        <CardContent sx={{ overflow: 'hidden' }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <Typography variant="body1">
              Table Data
              {tableDetails?.stats?.recordCount !== undefined && (
                <Typography
                  component="span"
                  variant="body2"
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  ({tableDetails.stats.recordCount.toLocaleString()} total rows)
                </Typography>
              )}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                endIcon={<ArrowDropDownIcon />}
                onClick={handleExportMenuOpen}
                disabled={!queryResult || queryResult.rows.length === 0}
              >
                Export
              </Button>
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
                <Tooltip
                  title="Export as CSV (compatible with Excel)"
                  placement="left"
                >
                  <MenuItem onClick={handleExportCSV}>
                    <ListItemIcon>
                      <DownloadIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Export as CSV</ListItemText>
                  </MenuItem>
                </Tooltip>
                <MenuItem onClick={handleExportJSON}>
                  <ListItemIcon>
                    <DownloadIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Export as JSON</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleExportParquet}>
                  <ListItemIcon>
                    <DownloadIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Export as Parquet</ListItemText>
                </MenuItem>
              </Menu>
              <Tooltip title="Refresh Data">
                <IconButton onClick={fetchData} disabled={loadingData}>
                  {loadingData ? (
                    <CircularProgress size={24} />
                  ) : (
                    <RefreshIcon />
                  )}
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {fetchError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Error fetching data: {fetchError}
            </Alert>
          )}

          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              overflowX: 'hidden',
            }}
          >
            <TableContainer>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {queryResult?.columns.map((col) => (
                      <TableCell
                        key={col.name}
                        sx={{
                          fontWeight: 600,
                          backgroundColor: (theme) =>
                            theme.palette.mode === 'dark'
                              ? theme.palette.grey[900]
                              : theme.palette.grey[50],
                          borderBottom: '2px solid',
                          borderBottomColor: 'divider',
                          py: 1.5,
                          px: 2,
                          minWidth: 120,
                        }}
                      >
                        <Box>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 600,
                              mb: 0.25,
                              color: 'text.primary',
                            }}
                          >
                            {col.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: '0.7rem',
                              color: 'text.secondary',
                            }}
                          >
                            {col.type}
                          </Typography>
                        </Box>
                      </TableCell>
                    ))}
                    {!queryResult && loadingData && (
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          backgroundColor: (theme) =>
                            theme.palette.mode === 'dark'
                              ? theme.palette.grey[900]
                              : theme.palette.grey[50],
                          borderBottom: '2px solid',
                          borderBottomColor: 'divider',
                        }}
                      >
                        Loading columns...
                      </TableCell>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {queryResult?.rows.map((row, rowIndex) => (
                    <TableRow
                      key={rowIndex}
                      hover
                      sx={{
                        '&:hover': {
                          backgroundColor: 'action.hover',
                        },
                      }}
                    >
                      {row.map((cell: any, cellIndex: number) => (
                        <TableCell
                          key={cellIndex}
                          sx={{
                            maxWidth: 300,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            py: 1.5,
                            px: 2,
                            fontSize: '0.875rem',
                          }}
                        >
                          {cell === null ? (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontStyle: 'italic', fontSize: '0.8rem' }}
                            >
                              NULL
                            </Typography>
                          ) : (
                            String(cell)
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {!loadingData &&
                    (!queryResult || queryResult.rows.length === 0) && (
                      <TableRow>
                        <TableCell
                          colSpan={queryResult ? queryResult.columns.length : 1}
                          align="center"
                          sx={{ py: 4 }}
                        >
                          <Typography color="text.secondary" variant="body2">
                            No data returned
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          <TablePagination
            component="div"
            count={tableDetails?.stats?.recordCount || -1}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[10, 25, 50, 100]}
            labelDisplayedRows={({ from, to, count }) => {
              return `${from}-${to} of ${count !== -1 ? count : `more than ${to}`}`;
            }}
          />
        </CardContent>
      </Card>
    </>
  );
};
