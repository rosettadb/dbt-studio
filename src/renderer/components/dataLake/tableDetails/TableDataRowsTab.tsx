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
  FormControl,
  InputLabel,
  Select,
  Stack,
  Divider,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  ArrowDropDown as ArrowDropDownIcon,
  DeleteOutline as DeleteIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import {
  useDeleteDuckLakeRows,
  useUpdateDuckLakeRows,
  useUpsertDuckLakeRows,
  useExecuteDuckLakeQuery,
  useDuckLakeTableDetails,
} from '../../../controllers/duckLake.controller';
import {
  DuckLakeQueryResult,
  DuckLakeColumnDetail,
} from '../../../../types/duckLake';

interface TableDataRowsTabProps {
  instanceId: string;
  tableName: string;
}

export const TableDataRowsTab: React.FC<TableDataRowsTabProps> = ({
  instanceId,
  tableName,
}) => {
  const [updateRowsDialogOpen, setUpdateRowsDialogOpen] = useState(false);
  // Form state for structured update
  const [whereConditions, setWhereConditions] = useState<
    Array<{ id: string; column: string; operator: string; value: string }>
  >([{ id: 'init', column: '', operator: '=', value: '' }]);
  const [updateFields, setUpdateFields] = useState<
    Array<{ id: string; column: string; value: string }>
  >([{ id: 'init', column: '', value: '' }]);

  // Computed SQL for the preview/submission
  const [generatedUpdateQuery, setGeneratedUpdateQuery] = useState('');

  const [deleteRowsDialogOpen, setDeleteRowsDialogOpen] = useState(false);
  const [deleteConditions, setDeleteConditions] = useState<
    Array<{ id: string; column: string; operator: string; value: string }>
  >([{ id: 'init', column: '', operator: '=', value: '' }]);
  const [generatedDeleteQuery, setGeneratedDeleteQuery] = useState('');

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
  const [actualRowCount, setActualRowCount] = useState<number | null>(null);

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

    console.log('[fetchData] Starting data fetch for table:', tableName);
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
          console.log('[fetchData] Query success, rows:', data.rows?.length);
          setQueryResult(data);
          if (data.totalRows !== undefined) {
            setActualRowCount(data.totalRows);
          }
          setLoadingData(false);
        },
        onError: (error: Error) => {
          console.error('[fetchData] Query error:', error);
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
    // Reset form state
    setWhereConditions([
      { id: Date.now().toString(), column: '', operator: '=', value: '' },
    ]);
    setUpdateFields([{ id: Date.now().toString(), column: '', value: '' }]);
    setGeneratedUpdateQuery('');

    setUpdateRowsDialogOpen(true);
  };

  // Helper to determine if quotes are needed based on column type
  const needsQuotes = (colName: string) => {
    if (!tableDetails?.columns) return true;
    const col = tableDetails.columns.find(
      (c: DuckLakeColumnDetail) => c.columnName === colName,
    );
    if (!col) return true;
    const type = col.columnType.toUpperCase();
    // Numeric and boolean types typically don't need quotes
    // This is a basic heuristic; might need refinement for complex types
    return !(
      type.includes('INT') ||
      type.includes('DOUBLE') ||
      type.includes('FLOAT') ||
      type.includes('DECIMAL') ||
      type.includes('BOOL')
    );
  };

  // Effect to update the generated query whenever form state changes
  React.useEffect(() => {
    if (!updateRowsDialogOpen) return;

    if (
      !tableName ||
      whereConditions.every((c) => !c.column) ||
      updateFields.every((f) => !f.column)
    ) {
      setGeneratedUpdateQuery('');
      return;
    }

    const whereClauses = whereConditions
      .filter((c) => c.column)
      .map((c) => {
        const val = needsQuotes(c.column)
          ? `'${c.value.replace(/'/g, "''")}'`
          : c.value || 'NULL';
        return `${c.column} ${c.operator} ${val}`;
      });

    const whereClause =
      whereClauses.length > 0 ? whereClauses.join(' AND ') : '1=1';

    // Lakehouse Rewrite Pattern (CTAS)
    // This is the only safe way to handle updates in DuckLake without Primary Keys
    const updatedCols = updateFields
      .filter((f) => f.column)
      .map((f) => f.column);

    const caseStatements = updateFields
      .filter((f) => f.column)
      .map((f) => {
        let val: string;
        if (needsQuotes(f.column)) {
          // String/text type - wrap in quotes and escape internal quotes
          val = `'${f.value.replace(/'/g, "''")}'`;
        } else {
          // Numeric/boolean type - use raw value
          val = f.value || 'NULL';
        }
        return `CASE WHEN ${whereClause} THEN ${val} ELSE ${f.column} END AS ${f.column}`;
      });

    const query = `CREATE OR REPLACE TABLE "${tableName}" AS
SELECT
  * EXCLUDE (${updatedCols.join(', ')}),
  ${caseStatements.join(',\n  ')}
FROM "${tableName}";`;

    setGeneratedUpdateQuery(query);
  }, [
    updateRowsDialogOpen,
    tableName,
    whereConditions,
    updateFields,
    tableDetails,
  ]);

  const handleConfirmUpdateRows = () => {
    if (!instanceId || !tableName) {
      setUpdateRowsDialogOpen(false);
      return;
    }

    updateRowsMutation.mutate(
      {
        instanceId,
        tableName,
        updateQuery: generatedUpdateQuery,
      },
      {
        onSuccess: () => {
          setUpdateRowsDialogOpen(false);
          fetchData(); // Refresh data after successful update
        },
        onError: () => {
          setUpdateRowsDialogOpen(false);
        },
      },
    );
  };

  const handleOpenDeleteRowsDialog = () => {
    // Reset form state
    setDeleteConditions([
      { id: Date.now().toString(), column: '', operator: '=', value: '' },
    ]);
    setGeneratedDeleteQuery('');
    setDeleteRowsDialogOpen(true);
  };

  // Effect to update the generated delete query whenever form state changes
  React.useEffect(() => {
    if (!deleteRowsDialogOpen) return;

    if (!tableName || deleteConditions.every((c) => !c.column)) {
      setGeneratedDeleteQuery('');
      return;
    }

    const whereClauses = deleteConditions
      .filter((c) => c.column)
      .map((c) => {
        const val = needsQuotes(c.column)
          ? `'${c.value.replace(/'/g, "''")}'`
          : c.value || 'NULL';
        return `${c.column} ${c.operator} ${val}`;
      });

    const whereClause =
      whereClauses.length > 0 ? whereClauses.join(' AND ') : '1=1';

    const query = `DELETE FROM "${tableName}"
WHERE ${whereClause};`;
    setGeneratedDeleteQuery(query);
  }, [deleteRowsDialogOpen, tableName, deleteConditions, tableDetails]);

  const handleConfirmDeleteRows = () => {
    if (!instanceId || !tableName) {
      setDeleteRowsDialogOpen(false);
      return;
    }

    deleteRowsMutation.mutate(
      {
        instanceId,
        tableName,
        deleteQuery: generatedDeleteQuery,
      },
      {
        onSuccess: () => {
          setDeleteRowsDialogOpen(false);
          fetchData(); // Refresh data after successful delete
        },
        onError: () => {
          setDeleteRowsDialogOpen(false);
        },
      },
    );
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

    upsertRowsMutation.mutate(
      {
        instanceId,
        tableName,
        upsertQuery: upsertRowsQuery,
      },
      {
        onSuccess: () => {
          setUpsertRowsDialogOpen(false);
          fetchData(); // Refresh data after successful upsert
        },
        onError: () => {
          setUpsertRowsDialogOpen(false);
        },
      },
    );
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
              <Stack spacing={3} sx={{ mt: 1 }}>
                {/* SET Section */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    SET (Fields to update)
                  </Typography>
                  <Stack spacing={2}>
                    {updateFields.map((field, index) => (
                      <Box key={field.id} sx={{ display: 'flex', gap: 2 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Column</InputLabel>
                          <Select
                            value={field.column}
                            label="Column"
                            onChange={(e) => {
                              const newFields = [...updateFields];
                              newFields[index].column = e.target.value;
                              setUpdateFields(newFields);
                            }}
                          >
                            {tableDetails?.columns.map(
                              (col: DuckLakeColumnDetail) => (
                                <MenuItem
                                  key={col.columnId}
                                  value={col.columnName}
                                >
                                  {col.columnName}
                                  <Typography
                                    component="span"
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ ml: 1 }}
                                  >
                                    ({col.columnType})
                                  </Typography>
                                </MenuItem>
                              ),
                            )}
                          </Select>
                        </FormControl>
                        <TextField
                          fullWidth
                          size="small"
                          label="Value"
                          value={field.value}
                          onChange={(e) => {
                            const newFields = [...updateFields];
                            newFields[index].value = e.target.value;
                            setUpdateFields(newFields);
                          }}
                        />
                        <IconButton
                          color="error"
                          onClick={() => {
                            if (updateFields.length > 1) {
                              setUpdateFields(
                                updateFields.filter((f) => f.id !== field.id),
                              );
                            } else {
                              // If it's the last one, just clear it
                              setUpdateFields([
                                {
                                  id: Date.now().toString(),
                                  column: '',
                                  value: '',
                                },
                              ]);
                            }
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    ))}
                    <Button
                      startIcon={<AddIcon />}
                      onClick={() =>
                        setUpdateFields([
                          ...updateFields,
                          {
                            id: Date.now().toString(),
                            column: '',
                            value: '',
                          },
                        ])
                      }
                      sx={{ alignSelf: 'start' }}
                    >
                      Add Field
                    </Button>
                  </Stack>
                </Box>

                <Divider />

                {/* Lakehouse Strategy Section */}
                <Alert severity="info" sx={{ mb: 1 }}>
                  DuckLake uses a <strong>Safe Rewrite (CTAS)</strong> pattern
                  to ensure data integrity in an append-only lakehouse.
                </Alert>

                <Divider />

                {/* WHERE Section */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    WHERE (Conditions)
                  </Typography>
                  <Stack spacing={2}>
                    {whereConditions.map((condition, index) => (
                      <Box key={condition.id} sx={{ display: 'flex', gap: 2 }}>
                        <FormControl fullWidth size="small" sx={{ flex: 2 }}>
                          <InputLabel>Column</InputLabel>
                          <Select
                            value={condition.column}
                            label="Column"
                            onChange={(e) => {
                              const newConditions = [...whereConditions];
                              newConditions[index].column = e.target.value;
                              setWhereConditions(newConditions);
                            }}
                          >
                            {tableDetails?.columns.map(
                              (col: DuckLakeColumnDetail) => (
                                <MenuItem
                                  key={col.columnId}
                                  value={col.columnName}
                                >
                                  {col.columnName}
                                  <Typography
                                    component="span"
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ ml: 1 }}
                                  >
                                    ({col.columnType})
                                  </Typography>
                                </MenuItem>
                              ),
                            )}
                          </Select>
                        </FormControl>
                        <FormControl
                          size="small"
                          sx={{ flex: 1, minWidth: 80 }}
                        >
                          <InputLabel>Op</InputLabel>
                          <Select
                            value={condition.operator}
                            label="Op"
                            onChange={(e) => {
                              const newConditions = [...whereConditions];
                              newConditions[index].operator = e.target.value;
                              setWhereConditions(newConditions);
                            }}
                          >
                            <MenuItem value="=">=</MenuItem>
                            <MenuItem value="!=">!=</MenuItem>
                            <MenuItem value=">">&gt;</MenuItem>
                            <MenuItem value=">=">&gt;=</MenuItem>
                            <MenuItem value="<">&lt;</MenuItem>
                            <MenuItem value="<=">&lt;=</MenuItem>
                            <MenuItem value="LIKE">LIKE</MenuItem>
                          </Select>
                        </FormControl>
                        <TextField
                          fullWidth
                          size="small"
                          label="Value"
                          value={condition.value}
                          onChange={(e) => {
                            const newConditions = [...whereConditions];
                            newConditions[index].value = e.target.value;
                            setWhereConditions(newConditions);
                          }}
                          sx={{ flex: 2 }}
                        />
                        <IconButton
                          color="error"
                          onClick={() => {
                            if (whereConditions.length > 1) {
                              setWhereConditions(
                                whereConditions.filter(
                                  (c) => c.id !== condition.id,
                                ),
                              );
                            } else {
                              // If it's the last one, just clear it
                              setWhereConditions([
                                {
                                  id: Date.now().toString(),
                                  column: '',
                                  operator: '=',
                                  value: '',
                                },
                              ]);
                            }
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    ))}
                    <Button
                      startIcon={<AddIcon />}
                      onClick={() =>
                        setWhereConditions([
                          ...whereConditions,
                          {
                            id: Date.now().toString(),
                            column: '',
                            operator: '=',
                            value: '',
                          },
                        ])
                      }
                      sx={{ alignSelf: 'start' }}
                    >
                      Add Condition
                    </Button>
                  </Stack>
                </Box>

                {/* Preview Section */}
                <Box
                  sx={{
                    p: 2,
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Generated Query Preview:
                  </Typography>
                  <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>
                    {generatedUpdateQuery || '(Complete the form to see SQL)'}
                  </pre>
                </Box>
              </Stack>
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
                  updateRowsMutation.isLoading ||
                  generatedUpdateQuery.trim() === ''
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
              <Stack spacing={3} sx={{ mt: 1 }}>
                {/* WHERE Section */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    WHERE (Conditions)
                  </Typography>
                  <Stack spacing={2}>
                    {deleteConditions.map((condition, index) => (
                      <Box key={condition.id} sx={{ display: 'flex', gap: 2 }}>
                        <FormControl fullWidth size="small" sx={{ flex: 2 }}>
                          <InputLabel>Column</InputLabel>
                          <Select
                            value={condition.column}
                            label="Column"
                            onChange={(e) => {
                              const newConditions = [...deleteConditions];
                              newConditions[index].column = e.target.value;
                              setDeleteConditions(newConditions);
                            }}
                          >
                            {tableDetails?.columns.map(
                              (col: DuckLakeColumnDetail) => (
                                <MenuItem
                                  key={col.columnId}
                                  value={col.columnName}
                                >
                                  {col.columnName}
                                  <Typography
                                    component="span"
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ ml: 1 }}
                                  >
                                    ({col.columnType})
                                  </Typography>
                                </MenuItem>
                              ),
                            )}
                          </Select>
                        </FormControl>
                        <FormControl
                          size="small"
                          sx={{ flex: 1, minWidth: 80 }}
                        >
                          <InputLabel>Op</InputLabel>
                          <Select
                            value={condition.operator}
                            label="Op"
                            onChange={(e) => {
                              const newConditions = [...deleteConditions];
                              newConditions[index].operator = e.target.value;
                              setDeleteConditions(newConditions);
                            }}
                          >
                            <MenuItem value="=">=</MenuItem>
                            <MenuItem value="!=">!=</MenuItem>
                            <MenuItem value=">">&gt;</MenuItem>
                            <MenuItem value=">=">&gt;=</MenuItem>
                            <MenuItem value="<">&lt;</MenuItem>
                            <MenuItem value="<=">&lt;=</MenuItem>
                            <MenuItem value="LIKE">LIKE</MenuItem>
                          </Select>
                        </FormControl>
                        <TextField
                          fullWidth
                          size="small"
                          label="Value"
                          value={condition.value}
                          onChange={(e) => {
                            const newConditions = [...deleteConditions];
                            newConditions[index].value = e.target.value;
                            setDeleteConditions(newConditions);
                          }}
                          sx={{ flex: 2 }}
                        />
                        <IconButton
                          color="error"
                          onClick={() => {
                            if (deleteConditions.length > 1) {
                              setDeleteConditions(
                                deleteConditions.filter(
                                  (c) => c.id !== condition.id,
                                ),
                              );
                            } else {
                              // If it's the last one, just clear it
                              setDeleteConditions([
                                {
                                  id: Date.now().toString(),
                                  column: '',
                                  operator: '=',
                                  value: '',
                                },
                              ]);
                            }
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    ))}
                    <Button
                      startIcon={<AddIcon />}
                      onClick={() =>
                        setDeleteConditions([
                          ...deleteConditions,
                          {
                            id: Date.now().toString(),
                            column: '',
                            operator: '=',
                            value: '',
                          },
                        ])
                      }
                      sx={{ alignSelf: 'start' }}
                    >
                      Add Condition
                    </Button>
                  </Stack>
                </Box>

                {/* Preview Section */}
                <Box
                  sx={{
                    p: 2,
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Generated Query Preview:
                  </Typography>
                  <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>
                    {generatedDeleteQuery || '(Select columns to see SQL)'}
                  </pre>
                </Box>
              </Stack>
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
                  deleteRowsMutation.isLoading ||
                  generatedDeleteQuery.trim() === ''
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
              {actualRowCount !== null && (
                <Tooltip title="Actual row count after applying deletes">
                  <Typography
                    component="span"
                    variant="body2"
                    color="text.secondary"
                    sx={{ ml: 1 }}
                  >
                    ({actualRowCount.toLocaleString()} rows)
                  </Typography>
                </Tooltip>
              )}
              {actualRowCount === null &&
                tableDetails?.stats?.recordCount !== undefined && (
                  <Tooltip title="Upper bound from metadata (may include deleted rows)">
                    <Typography
                      component="span"
                      variant="body2"
                      color="text.secondary"
                      sx={{ ml: 1 }}
                    >
                      (~{tableDetails.stats.recordCount.toLocaleString()} rows)
                    </Typography>
                  </Tooltip>
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
            count={actualRowCount ?? tableDetails?.stats?.recordCount ?? -1}
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
