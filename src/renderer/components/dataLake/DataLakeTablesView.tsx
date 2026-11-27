import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Alert,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
  LinearProgress,
  TablePagination,
} from '@mui/material';
import {
  Add,
  Refresh,
  Delete,
  Close,
  DriveFileRenameOutline,
  Search,
  TableChart,
  TableView,
  Visibility,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import { DataLakeTableImportWizard } from './DataLakeTableImportWizard';
import {
  useDuckLakeTables,
  useDuckLakeViews,
  useImportDuckLakeTable,
  useInvalidateDuckLakeCache,
  useDuckLakeInstance,
  useSetDuckLakeTablePartitionedBy,
  useDeleteDuckLakeTable,
  useRenameDuckLakeTable,
  useExecuteDuckLakeQuery,
} from '../../controllers/duckLake.controller';
import { DuckLakeViewInfo } from '../../../types/duckLake';
import {
  DataLakeRowActions,
  DataLakeTableContainer,
  dataLakeDialogSx,
} from './DataLakeLayout';

// ─── ViewDataPreview ──────────────────────────────────────────────────────────

const ViewDataPreview: React.FC<{
  instanceId: string;
  schemaName: string;
  viewName: string;
}> = ({ instanceId, schemaName, viewName }) => {
  const [page, setPage] = useState(0);
  const rowsPerPage = 25;

  const {
    mutate: executeQuery,
    isLoading,
    data: result,
    error,
  } = useExecuteDuckLakeQuery();

  React.useEffect(() => {
    // Escape double quotes and qualify with schema for safety and disambiguation
    const escapedSchema = schemaName.replace(/"/g, '""');
    const escapedView = viewName.replace(/"/g, '""');
    const quotedPath = `"${escapedSchema}"."${escapedView}"`;
    executeQuery({
      instanceId,
      query: `SELECT * FROM ${quotedPath} LIMIT 100`,
    });
  }, [instanceId, schemaName, viewName, executeQuery]);

  if (isLoading && !result) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Error: {(error as Error).message}</Alert>
      </Box>
    );
  }

  const allRows = result?.data ?? [];
  const paginatedRows = allRows.slice(
    page * rowsPerPage,
    (page + 1) * rowsPerPage,
  );

  return (
    <Box>
      <Box
        sx={{
          mb: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Showing up to 100 sample rows
        </Typography>
        {isLoading && <CircularProgress size={14} />}
      </Box>
      <DataLakeTableContainer maxHeight={400}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {result?.fields?.map((f) => (
                <TableCell key={f.name}>
                  <Box sx={{ color: 'text.primary', lineHeight: 1.3 }}>
                    {f.name}
                  </Box>
                  <Box sx={{ fontSize: 11, fontWeight: 400, lineHeight: 1.3 }}>
                    {f.type}
                  </Box>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedRows.map((row, idx) => (
              // eslint-disable-next-line react/no-array-index-key
              <TableRow key={idx}>
                {Object.values(row).map((val: any, vIdx) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <TableCell key={vIdx} sx={{ whiteSpace: 'nowrap' }}>
                    {val === null ? 'NULL' : String(val)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {allRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={result?.fields?.length ?? 1}
                  align="center"
                  sx={{ py: 4 }}
                >
                  No data
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DataLakeTableContainer>
      <TablePagination
        component="div"
        count={allRows.length}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        rowsPerPageOptions={[25]}
      />
    </Box>
  );
};

// ─── ViewPreviewModal ─────────────────────────────────────────────────────────

const ViewPreviewModal: React.FC<{
  open: boolean;
  onClose: () => void;
  instanceId: string;
  view: DuckLakeViewInfo | null;
}> = ({ open, onClose, instanceId, view }) => {
  if (!view) return null;

  return (
    <Dialog
      slotProps={{ paper: { sx: dataLakeDialogSx } }}
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <TableView fontSize="small" color="action" />
        <Typography variant="h6" component="span" sx={{ flexGrow: 1 }}>
          {view.name}
        </Typography>
        <IconButton aria-label="Close" size="small" onClick={onClose}>
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <ViewDataPreview
          instanceId={instanceId}
          schemaName={view.schema}
          viewName={view.name}
        />
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onClose}
          variant="outlined"
          color="inherit"
          startIcon={<Close />}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Types ────────────────────────────────────────────────────────────────────

type SortDirection = 'asc' | 'desc';

type SortableColumn =
  | 'name'
  | 'kind'
  | 'schema'
  | 'rowCount'
  | 'updatedAt'
  | 'createdAt';

type DuckLakeTableRow = {
  kind: 'TABLE';
  name: string;
  schema: string;
  instanceId: string;
  rowCount?: number;
  sizeBytes?: number;
  updatedAt?: string;
  createdAt: string;
};

type DuckLakeViewRow = {
  kind: 'VIEW';
  name: string;
  schema: string;
  instanceId: string;
  viewInfo: DuckLakeViewInfo;
};

type CombinedRow = DuckLakeTableRow | DuckLakeViewRow;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatBytes = (bytes?: number): string => {
  if (!bytes) return '—';
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${sizes[i]}`;
};

const formatRowCount = (count?: number): string => {
  if (count === undefined || count === null) return '—';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
};

const getSortValue = (row: CombinedRow, column: SortableColumn): string => {
  switch (column) {
    case 'name':
      return row.name.toLowerCase();
    case 'kind':
      return row.kind;
    case 'schema':
      return row.schema.toLowerCase();
    case 'rowCount':
      return row.kind === 'TABLE'
        ? String(row.rowCount ?? 0).padStart(20, '0')
        : '';
    case 'updatedAt':
      return row.kind === 'TABLE' ? (row.updatedAt ?? '') : '';
    case 'createdAt':
      return row.kind === 'TABLE' ? row.createdAt : '';
    default:
      return '';
  }
};

// ─── SortHeader sub-component (defined OUTSIDE DataLakeTablesView) ────────────

interface SortHeaderProps {
  column: SortableColumn;
  label: string;
  align?: 'left' | 'right';
  active: boolean;
  direction: SortDirection;
  onSort: (col: SortableColumn) => void;
}

const SortHeader: React.FC<SortHeaderProps> = ({
  column,
  label,
  align,
  active,
  direction,
  onSort,
}) => (
  <TableCell align={align ?? 'left'} sortDirection={active ? direction : false}>
    <TableSortLabel
      active={active}
      direction={active ? direction : 'asc'}
      onClick={() => onSort(column)}
    >
      {label}
    </TableSortLabel>
  </TableCell>
);

// ─── Main Component ───────────────────────────────────────────────────────────

interface DataLakeTablesViewProps {
  instanceId: string;
}

export const DataLakeTablesView: React.FC<DataLakeTablesViewProps> = ({
  instanceId,
}) => {
  const navigate = useNavigate();

  // ── Data hooks ──────────────────────────────────────────────────────────────
  const tablesQuery = useDuckLakeTables(instanceId);
  const viewsQuery = useDuckLakeViews(instanceId);
  const importTableMutation = useImportDuckLakeTable();
  const setPartitionedByMutation = useSetDuckLakeTablePartitionedBy();
  const deleteTableMutation = useDeleteDuckLakeTable();
  const renameTableMutation = useRenameDuckLakeTable();
  const { invalidateTables } = useInvalidateDuckLakeCache();
  const instanceQuery = useDuckLakeInstance(instanceId);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<SortableColumn>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Inspect modal state
  const [previewView, setPreviewView] = useState<DuckLakeViewInfo | null>(null);

  // Delete dialog state
  const [tableToDelete, setTableToDelete] = useState<DuckLakeTableRow | null>(
    null,
  );

  // Rename dialog state
  const [tableToRename, setTableToRename] = useState<DuckLakeTableRow | null>(
    null,
  );
  const [newTableName, setNewTableName] = useState('');

  // Pagination state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // ── Merge tables + views ─────────────────────────────────────────────────────
  const combinedRows = useMemo<CombinedRow[]>(() => {
    const tableRows: DuckLakeTableRow[] = (tablesQuery.data ?? []).map((t) => ({
      kind: 'TABLE' as const,
      name: t.name,
      schema: t.schema ?? 'main',
      instanceId,
      rowCount: t.rowCount,
      sizeBytes: t.sizeBytes,
      updatedAt: t.updatedAt?.toISOString(),
      createdAt: t.createdAt?.toISOString() ?? new Date().toISOString(),
    }));

    const viewRows: DuckLakeViewRow[] = (viewsQuery.data ?? []).map((v) => ({
      kind: 'VIEW' as const,
      name: v.name,
      schema: v.schema ?? 'main',
      instanceId,
      viewInfo: v,
    }));

    return [...tableRows, ...viewRows];
  }, [tablesQuery.data, viewsQuery.data, instanceId]);

  // ── Client-side filter ───────────────────────────────────────────────────────
  const filtered = useMemo<CombinedRow[]>(() => {
    if (!search.trim()) return combinedRows;
    const q = search.toLowerCase();
    return combinedRows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || r.schema.toLowerCase().includes(q),
    );
  }, [combinedRows, search]);

  // Reset pagination when search changes
  React.useEffect(() => {
    setPage(0);
  }, [search]);

  // ── Client-side sort ─────────────────────────────────────────────────────────
  const sorted = useMemo<CombinedRow[]>(() => {
    return [...filtered].sort((a, b) => {
      const aVal = getSortValue(a, sortColumn);
      const bVal = getSortValue(b, sortColumn);
      const cmp = aVal.localeCompare(bVal);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortColumn, sortDirection]);

  // ── Pagination slice ─────────────────────────────────────────────────────────
  const paginatedRows = useMemo<CombinedRow[]>(() => {
    return sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [sorted, page, rowsPerPage]);

  // ── Sort handler ─────────────────────────────────────────────────────────────
  const handleSort = (column: SortableColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setPage(0);
  };

  // ── Import handler ───────────────────────────────────────────────────────────
  const handleImportTable = (
    tableName: string,
    sourceQuery: string,
    partitionColumns?: string[],
  ) => {
    importTableMutation.mutate(
      { instanceId, tableName, sourceQuery },
      {
        onSuccess: () => {
          if (partitionColumns && partitionColumns.length > 0) {
            setPartitionedByMutation.mutate(
              { instanceId, tableName, columnNames: partitionColumns },
              {
                onSuccess: () => {
                  setImportWizardOpen(false);
                  invalidateTables(instanceId);
                },
                onError: () => {
                  setImportWizardOpen(false);
                  invalidateTables(instanceId);
                },
              },
            );
            return;
          }
          setImportWizardOpen(false);
          invalidateTables(instanceId);
        },
      },
    );
  };

  const handleConfirmDelete = () => {
    if (!tableToDelete) return;
    deleteTableMutation.mutate(
      {
        instanceId: tableToDelete.instanceId,
        tableName: tableToDelete.name,
      },
      { onSettled: () => setTableToDelete(null) },
    );
  };

  const handleConfirmRename = () => {
    if (!tableToRename || !newTableName.trim()) return;
    renameTableMutation.mutate(
      {
        instanceId: tableToRename.instanceId,
        oldName: tableToRename.name,
        newName: newTableName.trim(),
      },
      {
        onSettled: () => {
          setTableToRename(null);
          setNewTableName('');
        },
      },
    );
  };

  // ── Loading / error states ───────────────────────────────────────────────────
  const isLoading = tablesQuery.isLoading || viewsQuery.isLoading;
  const hasError = tablesQuery.isError || viewsQuery.isError;

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (hasError) {
    const errorMsg =
      (tablesQuery.error as Error | undefined)?.message ||
      (viewsQuery.error as Error | undefined)?.message ||
      'Unknown error';
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
            Failed to load tables & views
          </Typography>
          <Typography variant="body2">{errorMsg}</Typography>
        </Alert>
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            tablesQuery.refetch();
            viewsQuery.refetch();
          }}
          startIcon={<Refresh />}
        >
          Retry
        </Button>
      </Box>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Box>
      {/* Toolbar */}
      <Box
        sx={{
          pb: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        {/* Search */}
        <TextField
          size="small"
          placeholder="Search by name or schema…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
              sx: { fontSize: '0.8125rem', height: '32px' },
            },
          }}
          sx={{
            width: 280,
            '& .MuiInputBase-input': {
              paddingTop: '2px',
              paddingBottom: '2px',
            },
            '& .MuiOutlinedInput-root': {
              minHeight: '32px',
            },
          }}
        />

        {/* Import button */}
        <Button
          variant="contained"
          size="small"
          startIcon={<Add />}
          onClick={() => setImportWizardOpen(true)}
          sx={{ height: '32px' }}
        >
          Import Data
        </Button>
      </Box>

      {/* Refetching indicator */}
      {(tablesQuery.isFetching || viewsQuery.isFetching) && (
        <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />
      )}

      {/* Empty state */}
      {sorted.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center',
            py: 5,
            color: 'text.secondary',
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.default',
          }}
        >
          <TableChart sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2">
            {search
              ? 'No tables or views match your search.'
              : 'No tables or views found in this DuckLake instance.'}
          </Typography>
          {search && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<Close />}
              onClick={() => setSearch('')}
              sx={{ mt: 1.5 }}
            >
              Clear search
            </Button>
          )}
        </Box>
      ) : (
        <DataLakeTableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <SortHeader
                  column="name"
                  label="Name"
                  active={sortColumn === 'name'}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  column="kind"
                  label="Type"
                  active={sortColumn === 'kind'}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  column="schema"
                  label="Schema"
                  active={sortColumn === 'schema'}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  column="rowCount"
                  label="Rows"
                  active={sortColumn === 'rowCount'}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <TableCell>Size</TableCell>
                <SortHeader
                  column="updatedAt"
                  label="Updated"
                  active={sortColumn === 'updatedAt'}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  column="createdAt"
                  label="Created"
                  active={sortColumn === 'createdAt'}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <TableCell
                  align="right"
                  aria-label="Actions"
                  sx={{ width: 48 }}
                />
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedRows.map((row) => {
                if (row.kind === 'TABLE') {
                  return (
                    <TableRow
                      key={`table-${row.schema}-${row.name}`}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() =>
                        navigate(
                          `/app/data-lake/duck-lake/instances/${row.instanceId}/tables/${row.name}`,
                        )
                      }
                    >
                      <TableCell>
                        <Box
                          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <TableChart
                            sx={{ fontSize: 16, color: 'text.secondary' }}
                          />
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {row.name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>
                        Table
                      </TableCell>
                      <TableCell>{row.schema}</TableCell>
                      <TableCell>{formatRowCount(row.rowCount)}</TableCell>
                      <TableCell>{formatBytes(row.sizeBytes)}</TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>
                        {row.updatedAt
                          ? moment(row.updatedAt).fromNow()
                          : 'Never'}
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>
                        {moment(row.createdAt).fromNow()}
                      </TableCell>
                      <TableCell align="right">
                        <DataLakeRowActions
                          label={`Actions for ${row.name}`}
                          actions={[
                            {
                              key: 'open',
                              label: 'View details',
                              icon: <Visibility fontSize="small" />,
                              onClick: () =>
                                navigate(
                                  `/app/data-lake/duck-lake/instances/${row.instanceId}/tables/${row.name}`,
                                ),
                            },
                            {
                              key: 'rename',
                              label: 'Rename',
                              icon: <DriveFileRenameOutline fontSize="small" />,
                              onClick: () => {
                                setTableToRename(row);
                                setNewTableName(row.name);
                              },
                              disabled: renameTableMutation.isLoading,
                            },
                            {
                              key: 'delete',
                              label: 'Delete',
                              icon: <Delete fontSize="small" />,
                              onClick: () => setTableToDelete(row),
                              disabled: deleteTableMutation.isLoading,
                              danger: true,
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  );
                }

                // VIEW row
                return (
                  <TableRow
                    key={`view-${row.schema}-${row.name}`}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setPreviewView(row.viewInfo)}
                  >
                    <TableCell>
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <TableView
                          sx={{ fontSize: 16, color: 'text.secondary' }}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {row.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>View</TableCell>
                    <TableCell>{row.schema}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>—</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>—</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>—</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>—</TableCell>
                    <TableCell align="right">
                      <DataLakeRowActions
                        label={`Actions for ${row.name}`}
                        actions={[
                          {
                            key: 'preview',
                            label: 'Preview data',
                            icon: <Visibility fontSize="small" />,
                            onClick: () => setPreviewView(row.viewInfo),
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DataLakeTableContainer>
      )}

      {/* Pagination (only show if we have data) */}
      {sorted.length > 0 && (
        <TablePagination
          component="div"
          count={sorted.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[25, 50, 100]}
        />
      )}

      {/* Import wizard */}
      <DataLakeTableImportWizard
        open={importWizardOpen}
        onClose={() => setImportWizardOpen(false)}
        onImport={handleImportTable}
        isLoading={
          importTableMutation.isLoading || setPartitionedByMutation.isLoading
        }
        dataPath={instanceQuery.data?.dataPath}
      />

      {/* View Inspect Modal */}
      <ViewPreviewModal
        open={!!previewView}
        onClose={() => setPreviewView(null)}
        instanceId={instanceId}
        view={previewView}
      />

      {/* Delete confirmation dialog */}
      <Dialog
        slotProps={{ paper: { sx: dataLakeDialogSx } }}
        open={!!tableToDelete}
        onClose={() => setTableToDelete(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete table</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete{' '}
            <strong>{tableToDelete?.name}</strong>? This will remove the table
            from the DataLake instance.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={() => setTableToDelete(null)}
            color="inherit"
            startIcon={<Close />}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            startIcon={<Delete />}
            disabled={!tableToDelete || deleteTableMutation.isLoading}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename dialog */}
      <Dialog
        slotProps={{ paper: { sx: dataLakeDialogSx } }}
        open={!!tableToRename}
        onClose={() => {
          setTableToRename(null);
          setNewTableName('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rename table</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Rename <strong>{tableToRename?.name}</strong>
          </Typography>
          <TextField
            fullWidth
            label="New table name"
            value={newTableName}
            onChange={(e) => setNewTableName(e.target.value)}
            disabled={renameTableMutation.isLoading}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={() => {
              setTableToRename(null);
              setNewTableName('');
            }}
            color="inherit"
            startIcon={<Close />}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmRename}
            variant="contained"
            startIcon={<DriveFileRenameOutline />}
            disabled={
              !tableToRename ||
              renameTableMutation.isLoading ||
              !newTableName ||
              newTableName.trim() === ''
            }
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
