import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AccountTree,
  Add,
  ArrowBack,
  Badge,
  Cable,
  CheckCircle,
  Close,
  CloudQueue,
  CreateNewFolder,
  Delete,
  DriveFileRenameOutline,
  Edit,
  ErrorOutline,
  Folder,
  Info,
  Inventory2,
  PlayArrow,
  Search,
  Storage,
  TableChart,
  Visibility,
  Schema,
  History,
} from '@mui/icons-material';
import { useQueryClient } from 'react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import moment from 'moment';
import {
  cloudStorageImages,
  genericCatalogImage,
  icebergCatalogImages,
} from '../../../../../assets/connectionIcons';
import type {
  IcebergImportFileFormat,
  IcebergInstanceConfig,
  IcebergSnapshotInfo,
} from '../../../../types/iceberg';
import {
  useCreateIcebergNamespace,
  useDropIcebergNamespace,
  useDropIcebergTable,
  useGetIcebergInstance,
  useGetIcebergSchema,
  useGetIcebergSnapshots,
  useIcebergTablePreview,
  useImportIcebergTable,
  useListIcebergNamespaces,
  useListIcebergTables,
  useRenameIcebergTable,
  useTestIcebergInstance,
} from '../../../controllers/icebergDatalake.controller';
import { IcebergIcon } from './IcebergIcon';
import { IcebergOperationBackdrop } from './IcebergOperationBackdrop';
import { IcebergTableImportWizard } from './IcebergTableImportWizard';
import { SettingsRefreshButton } from '../../settings/SettingsLayout';
import {
  DataLakePageHeader,
  DataLakeRowActions,
  DataLakeTableContainer,
  dataLakeContentSx,
  dataLakeTabsSx,
  dataLakeDialogSx,
} from '../DataLakeLayout';

interface IcebergDetailProps {
  instance: IcebergInstanceConfig;
  onEdit: () => void;
  onDelete: () => void;
}

interface SelectedTable {
  namespace: string[];
  table: string;
}

interface NamespaceTableRowsProps {
  instanceId: string;
  namespace: string[];
  filter: string;
  showEmptyRow?: boolean;
  onSelect: (selection: SelectedTable) => void;
  onDelete: (selection: SelectedTable) => void;
  onRename: (selection: SelectedTable) => void;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown Iceberg error';

const formatCellValue = (value: unknown): string => {
  if (value == null) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const ConfigImageIcon: React.FC<{
  src: string;
  alt: string;
  size?: number;
}> = ({ src, alt, size = 20 }) => (
  <Box
    component="img"
    src={src}
    alt={alt}
    sx={{ width: size, height: size, objectFit: 'contain' }}
  />
);

const formatBytes = (value?: string): string => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
};

const sortSnapshots = (snapshots: IcebergSnapshotInfo[]) =>
  [...snapshots].sort(
    (left, right) => Number(left.committedAt) - Number(right.committedAt),
  );

const getCurrentSnapshot = (snapshots: IcebergSnapshotInfo[]) =>
  snapshots.find((snapshot) => snapshot.isCurrent);

const IcebergTableRow: React.FC<{
  instanceId: string;
  namespace: string[];
  table: string;
  onSelect: (selection: SelectedTable) => void;
  onDelete: (selection: SelectedTable) => void;
  onRename: (selection: SelectedTable) => void;
}> = ({ instanceId, namespace, table, onSelect, onDelete, onRename }) => {
  const snapshotsQuery = useGetIcebergSnapshots(instanceId, namespace, table);
  const snapshots = sortSnapshots(snapshotsQuery.data ?? []);
  const firstSnapshot = snapshots[0];
  const currentSnapshot = getCurrentSnapshot(snapshots);
  const summary = currentSnapshot?.summary ?? {};
  let updatedLabel = '—';
  if (snapshotsQuery.isLoading) {
    updatedLabel = 'Loading…';
  } else if (currentSnapshot) {
    updatedLabel = moment(Number(currentSnapshot.committedAt)).fromNow();
  }

  return (
    <TableRow
      hover
      onClick={() => onSelect({ namespace, table })}
      sx={{ cursor: 'pointer' }}
    >
      <TableCell sx={{ fontWeight: 500 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TableChart sx={{ fontSize: 16, color: 'text.secondary' }} />
          {table}
        </Box>
      </TableCell>
      <TableCell sx={{ color: 'text.secondary' }}>Table</TableCell>
      <TableCell>{namespace.join('.')}</TableCell>
      <TableCell>{summary['total-records'] ?? '—'}</TableCell>
      <TableCell>
        {formatBytes(
          summary['total-files-size'] ?? summary['total-data-files-size'],
        )}
      </TableCell>
      <TableCell>{updatedLabel}</TableCell>
      <TableCell>
        {firstSnapshot
          ? moment(Number(firstSnapshot.committedAt)).fromNow()
          : '—'}
      </TableCell>
      <TableCell align="right">
        <DataLakeRowActions
          label={`Actions for ${table}`}
          actions={[
            {
              key: 'open',
              label: 'View details',
              icon: <Visibility fontSize="small" />,
              onClick: () => onSelect({ namespace, table }),
            },
            {
              key: 'rename',
              label: 'Rename',
              icon: <DriveFileRenameOutline fontSize="small" />,
              onClick: () => onRename({ namespace, table }),
            },
            {
              key: 'delete',
              label: 'Delete',
              icon: <Delete fontSize="small" />,
              onClick: () => onDelete({ namespace, table }),
              danger: true,
            },
          ]}
        />
      </TableCell>
    </TableRow>
  );
};

const NamespaceTableRows: React.FC<NamespaceTableRowsProps> = ({
  instanceId,
  namespace,
  filter,
  showEmptyRow = false,
  onSelect,
  onDelete,
  onRename,
}) => {
  const tablesQuery = useListIcebergTables(instanceId, namespace);
  const normalizedFilter = filter.trim().toLowerCase();
  const tables = (tablesQuery.data ?? []).filter((table) =>
    `${namespace.join('.')}.${table}`.toLowerCase().includes(normalizedFilter),
  );

  if (tablesQuery.isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={8}>Loading {namespace.join('.')}…</TableCell>
      </TableRow>
    );
  }
  if (tablesQuery.isError) {
    return (
      <TableRow>
        <TableCell colSpan={8}>{errorMessage(tablesQuery.error)}</TableCell>
      </TableRow>
    );
  }
  return (
    <>
      {tables.map((table) => (
        <IcebergTableRow
          key={`${namespace.join('.')}.${table}`}
          instanceId={instanceId}
          namespace={namespace}
          table={table}
          onSelect={onSelect}
          onDelete={onDelete}
          onRename={onRename}
        />
      ))}
      {showEmptyRow && tables.length === 0 && (
        <TableRow>
          <TableCell colSpan={8} sx={{ color: 'text.secondary', py: 2 }}>
            No tables found in {namespace.join('.')}.
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

const NamespaceGroupHeader: React.FC<{
  instanceId: string;
  namespace: string[];
  onDrop: (namespace: string[]) => void;
}> = ({ instanceId, namespace, onDrop }) => {
  const tablesQuery = useListIcebergTables(instanceId, namespace);
  const count = tablesQuery.data?.length ?? 0;
  return (
    <TableRow sx={{ bgcolor: 'action.hover' }}>
      <TableCell colSpan={8} sx={{ py: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Folder sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="body2" fontWeight={600}>
            {namespace.join('.')}
          </Typography>
          <Chip
            label={
              count === 0 ? 'empty' : `${count} table${count === 1 ? '' : 's'}`
            }
            size="small"
            variant="outlined"
            sx={{
              height: 20,
              '& .MuiChip-label': { fontSize: '0.6875rem', px: 1 },
            }}
          />
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Drop namespace (must be empty)">
            <IconButton
              size="small"
              color="error"
              aria-label="Drop namespace"
              onClick={() => onDrop(namespace)}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </TableCell>
    </TableRow>
  );
};

function TableHistoryRows({
  instanceId,
  namespace,
  table,
}: {
  instanceId: string;
  namespace: string[];
  table: string;
}) {
  const snapshotsQuery = useGetIcebergSnapshots(instanceId, namespace, table);

  if (snapshotsQuery.isLoading) {
    return (
      <TableRow>
        <TableCell>{namespace.join('.')}</TableCell>
        <TableCell>{table}</TableCell>
        <TableCell colSpan={3}>Loading snapshots…</TableCell>
      </TableRow>
    );
  }
  if (snapshotsQuery.isError) {
    return (
      <TableRow>
        <TableCell>{namespace.join('.')}</TableCell>
        <TableCell>{table}</TableCell>
        <TableCell colSpan={3}>{errorMessage(snapshotsQuery.error)}</TableCell>
      </TableRow>
    );
  }
  return (
    <>
      {sortSnapshots(snapshotsQuery.data ?? [])
        .reverse()
        .map((snapshot) => (
          <TableRow
            key={`${namespace.join('.')}.${table}.${snapshot.snapshotId}`}
          >
            <TableCell>{namespace.join('.')}</TableCell>
            <TableCell>{table}</TableCell>
            <TableCell sx={{ fontFamily: 'monospace' }}>
              …{snapshot.snapshotId.slice(-8)}
            </TableCell>
            <TableCell>{snapshot.operation}</TableCell>
            <TableCell>
              {new Date(Number(snapshot.committedAt)).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
    </>
  );
}

const NamespaceHistory: React.FC<{
  instanceId: string;
  namespace: string[];
}> = ({ instanceId, namespace }) => {
  const tablesQuery = useListIcebergTables(instanceId, namespace);

  if (tablesQuery.isLoading) {
    return (
      <TableRow>
        <TableCell>{namespace.join('.')}</TableCell>
        <TableCell colSpan={4}>Loading tables…</TableCell>
      </TableRow>
    );
  }
  if (tablesQuery.isError) {
    return (
      <TableRow>
        <TableCell>{namespace.join('.')}</TableCell>
        <TableCell colSpan={4}>{errorMessage(tablesQuery.error)}</TableCell>
      </TableRow>
    );
  }
  return (
    <>
      {tablesQuery.data?.map((table) => (
        <TableHistoryRows
          key={`${namespace.join('.')}.${table}`}
          instanceId={instanceId}
          namespace={namespace}
          table={table}
        />
      ))}
      {tablesQuery.data?.length === 0 && (
        <TableRow>
          <TableCell>{namespace.join('.')}</TableCell>
          <TableCell colSpan={4}>No tables found.</TableCell>
        </TableRow>
      )}
    </>
  );
};

const InstanceHistory: React.FC<{
  instanceId: string;
  namespaces: string[][];
}> = ({ instanceId, namespaces }) => (
  <DataLakeTableContainer>
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Namespace</TableCell>
          <TableCell>Table</TableCell>
          <TableCell>Snapshot ID</TableCell>
          <TableCell>Operation</TableCell>
          <TableCell>Committed At</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {namespaces.map((namespace) => (
          <NamespaceHistory
            key={namespace.join('.')}
            instanceId={instanceId}
            namespace={namespace}
          />
        ))}
      </TableBody>
    </Table>
  </DataLakeTableContainer>
);

const TableDetail: React.FC<{
  instance: IcebergInstanceConfig;
  selection: SelectedTable;
}> = ({ instance, selection }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = Number(searchParams.get('tab'));
  const initialTab = Number.isInteger(requestedTab)
    ? Math.min(Math.max(requestedTab, 0), 4)
    : 0;
  const requestedLimit = Number(searchParams.get('limit'));
  const initialLimit = [50, 100, 500, 1000].includes(requestedLimit)
    ? requestedLimit
    : 100;
  const initialFilter = searchParams.get('filter') ?? '';
  const [tab, setTab] = React.useState(initialTab);
  const [limit, setLimit] = React.useState(initialLimit);
  const [rowFilter, setRowFilter] = React.useState(initialFilter);
  const [appliedFilter, setAppliedFilter] = React.useState(initialFilter);
  const [filterError, setFilterError] = React.useState<string | null>(null);
  const schemaQuery = useGetIcebergSchema(
    instance.id,
    selection.namespace,
    selection.table,
  );
  const snapshotsQuery = useGetIcebergSnapshots(
    instance.id,
    selection.namespace,
    selection.table,
  );
  const previewQuery = useIcebergTablePreview(
    instance.id,
    selection.namespace,
    selection.table,
    limit,
    appliedFilter,
    tab === 2,
  );

  const updateTableViewParams = React.useCallback(
    (updates: { tab?: number; limit?: number; filter?: string }) => {
      const next = new URLSearchParams(searchParams);
      if (updates.tab !== undefined) next.set('tab', String(updates.tab));
      if (updates.limit !== undefined) {
        next.set('limit', String(updates.limit));
      }
      if (updates.filter !== undefined) {
        if (updates.filter) next.set('filter', updates.filter);
        else next.delete('filter');
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const applyFilter = () => {
    const value = rowFilter.trim();
    if (value && !/^[A-Za-z0-9_\s.'"<>=!()-]+$/.test(value)) {
      setFilterError('The filter contains unsupported characters.');
      return;
    }
    setFilterError(null);
    setAppliedFilter(value);
    updateTableViewParams({ filter: value });
    if (value === appliedFilter) previewQuery.refetch();
  };

  const renderOverview = () => {
    const snapshots = sortSnapshots(snapshotsQuery.data ?? []);
    const currentSnapshot = getCurrentSnapshot(snapshots);
    return (
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Table Information
            </Typography>
            <List dense>
              <ListItemText
                primary="Identifier"
                secondary={`${selection.namespace.join('.')}.${selection.table}`}
              />
              <ListItemText
                primary="Columns"
                secondary={schemaQuery.data?.fields.length ?? '—'}
              />
              <ListItemText
                primary="Properties"
                secondary={
                  Object.keys(schemaQuery.data?.properties ?? {}).length
                }
              />
            </List>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Snapshot Status
            </Typography>
            <List dense>
              <ListItemText primary="Snapshots" secondary={snapshots.length} />
              <ListItemText
                primary="Current Snapshot"
                secondary={currentSnapshot?.snapshotId ?? 'No snapshots'}
              />
              <ListItemText
                primary="Last Operation"
                secondary={currentSnapshot?.operation ?? '—'}
              />
            </List>
          </Paper>
        </Grid>
      </Grid>
    );
  };

  const renderSchema = () => {
    if (schemaQuery.isLoading) {
      return <Skeleton variant="rectangular" height={220} />;
    }
    if (schemaQuery.isError) {
      return <Alert severity="error">{errorMessage(schemaQuery.error)}</Alert>;
    }
    const fields = schemaQuery.data?.fields ?? [];
    if (fields.length === 0) {
      return <Alert severity="info">No schema fields found.</Alert>;
    }
    return (
      <DataLakeTableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Field ID</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Required</TableCell>
              <TableCell>Description</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {fields.map((field) => (
              <TableRow key={field.fieldId}>
                <TableCell>{field.fieldId}</TableCell>
                <TableCell>{field.name}</TableCell>
                <TableCell>{field.type}</TableCell>
                <TableCell>{field.required ? 'Yes' : 'No'}</TableCell>
                <TableCell>{field.doc ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataLakeTableContainer>
    );
  };

  const renderHistory = () => {
    if (snapshotsQuery.isLoading) {
      return <Skeleton variant="rectangular" height={220} />;
    }
    if (snapshotsQuery.isError) {
      return (
        <Alert severity="error">{errorMessage(snapshotsQuery.error)}</Alert>
      );
    }
    const snapshots = sortSnapshots(snapshotsQuery.data ?? []);
    if (snapshots.length === 0) {
      return <Alert severity="info">No snapshots found.</Alert>;
    }
    return (
      <DataLakeTableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Snapshot ID</TableCell>
              <TableCell>Operation</TableCell>
              <TableCell>Committed At</TableCell>
              <TableCell>Added Records</TableCell>
              <TableCell>Total Records</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[...snapshots].reverse().map((snapshot) => (
              <TableRow
                key={snapshot.snapshotId}
                sx={{ fontWeight: snapshot.isCurrent ? 700 : 400 }}
              >
                <TableCell sx={{ fontFamily: 'monospace' }}>
                  …{snapshot.snapshotId.slice(-8)}
                </TableCell>
                <TableCell>{snapshot.operation}</TableCell>
                <TableCell>
                  {new Date(Number(snapshot.committedAt)).toLocaleString()}
                </TableCell>
                <TableCell>
                  {snapshot.summary['added-records'] ?? '—'}
                </TableCell>
                <TableCell>
                  {snapshot.summary['total-records'] ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataLakeTableContainer>
    );
  };

  const renderPreview = () => (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start' }}>
        <TextField
          label="Row filter (optional)"
          size="small"
          value={rowFilter}
          onChange={(event) => setRowFilter(event.target.value)}
          error={!!filterError}
          helperText={filterError ?? 'Example: id >= 2'}
          slotProps={{
            input: {
              sx: { height: '32px', fontSize: '0.8125rem' },
            },
            inputLabel: {
              sx: { fontSize: '0.8125rem' },
            },
            formHelperText: {
              sx: { mt: 0.5, fontSize: '0.6875rem' },
            },
          }}
          sx={{
            flex: 1,
            '& .MuiInputBase-input': { py: 0.5 },
            '& .MuiOutlinedInput-root': { minHeight: '32px' },
          }}
        />
        <FormControl
          size="small"
          sx={{
            minWidth: 110,
            '& .MuiOutlinedInput-root': {
              height: '32px',
              fontSize: '0.8125rem',
            },
            '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
          }}
        >
          <InputLabel>Limit</InputLabel>
          <Select
            value={limit}
            label="Limit"
            onChange={(event) => {
              const nextLimit = Number(event.target.value);
              setLimit(nextLimit);
              updateTableViewParams({ limit: nextLimit });
            }}
          >
            {[50, 100, 500, 1000].map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="contained"
          size="small"
          startIcon={<PlayArrow />}
          onClick={applyFilter}
          disabled={previewQuery.isFetching}
          sx={{ height: '32px', minHeight: '32px' }}
        >
          Run Preview
        </Button>
      </Box>
      {previewQuery.isFetching && <CircularProgress size={22} />}
      {previewQuery.isError && (
        <Alert severity="error">{errorMessage(previewQuery.error)}</Alert>
      )}
      {previewQuery.data && (
        <DataLakeTableContainer maxHeight={420} sx={{ mt: 1 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {previewQuery.data.columns.map((column) => (
                  <TableCell key={column}>{column}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {previewQuery.data.rows.map((row, rowIndex) => (
                <TableRow
                  key={`${selection.namespace.join('.')}.${selection.table}-${rowIndex}`}
                >
                  {row.map((value, columnIndex) => (
                    <TableCell
                      key={`${previewQuery.data?.columns[columnIndex]}-${columnIndex}`}
                    >
                      {formatCellValue(value)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataLakeTableContainer>
      )}
    </Box>
  );

  const renderProperties = () => {
    if (schemaQuery.isLoading) {
      return <Skeleton variant="rectangular" height={160} />;
    }
    const properties = Object.entries(schemaQuery.data?.properties ?? {});
    if (properties.length === 0) {
      return <Alert severity="info">No table properties defined.</Alert>;
    }
    return (
      <DataLakeTableContainer>
        <Table size="small">
          <TableBody>
            {properties.map(([key, value]) => (
              <TableRow key={key}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{key}</TableCell>
                <TableCell>{value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataLakeTableContainer>
    );
  };

  const currentSnapshot = getCurrentSnapshot(snapshotsQuery.data ?? []);

  return (
    <Box sx={dataLakeContentSx}>
      <DataLakePageHeader
        icon={
          <>
            <Tooltip title="Back to Instance Details">
              <IconButton
                size="small"
                aria-label="Back to Instance Details"
                onClick={() =>
                  navigate(`/app/data-lake/iceberg/instances/${instance.id}`)
                }
              >
                <ArrowBack fontSize="small" />
              </IconButton>
            </Tooltip>
            <TableChart sx={{ fontSize: 20, color: 'text.secondary' }} />
          </>
        }
        title={selection.table}
        description={`Namespace: ${selection.namespace.join('.')} • Apache Iceberg`}
        actions={
          currentSnapshot ? (
            <Chip
              size="small"
              variant="outlined"
              label={`Snapshot ${currentSnapshot.snapshotId}`}
            />
          ) : null
        }
      />
      <Tabs
        value={tab}
        onChange={(_event, value) => {
          setTab(value);
          updateTableViewParams({ tab: value });
        }}
        sx={dataLakeTabsSx}
      >
        <Tab icon={<Info />} label="Overview" iconPosition="start" />
        <Tab icon={<Schema />} label="Schema" iconPosition="start" />
        <Tab icon={<TableChart />} label="Data" iconPosition="start" />
        <Tab icon={<History />} label="History" iconPosition="start" />
        <Tab icon={<Storage />} label="Properties" iconPosition="start" />
      </Tabs>
      <Box sx={{ pt: 2 }}>
        {tab === 0 && renderOverview()}
        {tab === 1 && renderSchema()}
        {tab === 2 && renderPreview()}
        {tab === 3 && renderHistory()}
        {tab === 4 && renderProperties()}
      </Box>
    </Box>
  );
};

export const IcebergTableDetails: React.FC = () => {
  const { instanceId = '', tableName = '' } = useParams<{
    instanceId: string;
    tableName: string;
  }>();
  const instanceQuery = useGetIcebergInstance(instanceId);
  const identifier = decodeURIComponent(tableName);
  const parts = identifier.split('.').filter(Boolean);
  const table = parts.pop() ?? '';
  const namespace = parts;

  if (instanceQuery.isLoading) {
    return <CircularProgress />;
  }
  if (
    instanceQuery.isError ||
    !instanceQuery.data ||
    !table ||
    !namespace.length
  ) {
    return <Alert severity="error">Iceberg table could not be loaded.</Alert>;
  }
  return (
    <TableDetail
      instance={instanceQuery.data}
      selection={{ namespace, table }}
    />
  );
};

export const IcebergDetail: React.FC<IcebergDetailProps> = ({
  instance,
  onEdit,
  onDelete,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const namespacesQuery = useListIcebergNamespaces(instance.id);
  const testInstanceMutation = useTestIcebergInstance();
  const importTableMutation = useImportIcebergTable();
  const dropTableMutation = useDropIcebergTable();
  const renameTableMutation = useRenameIcebergTable();
  const createNamespaceMutation = useCreateIcebergNamespace();
  const dropNamespaceMutation = useDropIcebergNamespace();
  const [currentTab, setCurrentTab] = React.useState(0);
  const [tableFilter, setTableFilter] = React.useState('');
  const [importWizardOpen, setImportWizardOpen] = React.useState(false);
  const [tableToDelete, setTableToDelete] =
    React.useState<SelectedTable | null>(null);
  const [tableToRename, setTableToRename] =
    React.useState<SelectedTable | null>(null);
  const [newTableName, setNewTableName] = React.useState('');
  const [namespaceCreateOpen, setNamespaceCreateOpen] = React.useState(false);
  const [newNamespaceName, setNewNamespaceName] = React.useState('');
  const [namespaceToDelete, setNamespaceToDelete] = React.useState<
    string[] | null
  >(null);
  const [namespaceFilter, setNamespaceFilter] = React.useState<string | null>(
    null,
  );
  const [groupByNamespace, setGroupByNamespace] = React.useState(false);
  const namespaceNameValid = (() => {
    const parts = newNamespaceName
      .trim()
      .split('.')
      .map((part) => part.trim())
      .filter(Boolean);
    return (
      parts.length > 0 &&
      parts.every((part) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(part))
    );
  })();

  const handleDeleteTable = () => {
    if (!tableToDelete) return;
    dropTableMutation.mutate(
      {
        id: instance.id,
        namespace: tableToDelete.namespace,
        table: tableToDelete.table,
      },
      {
        onSuccess: (result) => {
          setTableToDelete(null);
          toast.success(
            `Deleted ${result.namespace.join('.')}.${result.table}`,
          );
        },
        onError: (error) => {
          toast.error(errorMessage(error));
        },
      },
    );
  };

  const handleRenameTable = () => {
    if (!tableToRename) return;
    const trimmed = newTableName.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
      toast.error(
        'Table name must start with a letter or underscore and contain only letters, numbers, and underscores',
      );
      return;
    }
    renameTableMutation.mutate(
      {
        id: instance.id,
        namespace: tableToRename.namespace,
        table: tableToRename.table,
        newTable: trimmed,
      },
      {
        onSuccess: (result) => {
          setTableToRename(null);
          setNewTableName('');
          toast.success(
            `Renamed to ${result.namespace.join('.')}.${result.table}`,
          );
        },
        onError: (error) => {
          toast.error(errorMessage(error));
        },
      },
    );
  };

  const handleCreateNamespace = () => {
    const parts = newNamespaceName
      .trim()
      .split('.')
      .map((part) => part.trim())
      .filter(Boolean);
    if (
      parts.length === 0 ||
      parts.some((part) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part))
    ) {
      toast.error(
        'Namespace parts must start with a letter or underscore and contain only letters, numbers, and underscores',
      );
      return;
    }
    const fullName = parts.join('.');
    if (namespacesQuery.data?.some((ns) => ns.join('.') === fullName)) {
      toast.error(`Namespace ${fullName} already exists`);
      return;
    }
    createNamespaceMutation.mutate(
      {
        id: instance.id,
        namespace: parts,
      },
      {
        onSuccess: (result) => {
          setNamespaceCreateOpen(false);
          setNewNamespaceName('');
          toast.success(`Created namespace ${result.namespace.join('.')}`);
        },
        onError: (error) => {
          toast.error(errorMessage(error));
        },
      },
    );
  };

  const handleDropNamespace = () => {
    if (!namespaceToDelete) return;
    dropNamespaceMutation.mutate(
      {
        id: instance.id,
        namespace: namespaceToDelete,
      },
      {
        onSuccess: (result) => {
          setNamespaceToDelete(null);
          // If the dropped namespace was the active filter, clear it so the
          // table body does not render empty with no explanation.
          setNamespaceFilter((current) =>
            current === result.namespace.join('.') ? null : current,
          );
          toast.success(`Dropped namespace ${result.namespace.join('.')}`);
        },
        onError: (error) => {
          toast.error(errorMessage(error));
        },
      },
    );
  };

  const handleImportTable = (
    namespace: string[],
    table: string,
    filePath: string,
    fileFormat: IcebergImportFileFormat,
  ) => {
    importTableMutation.mutate(
      {
        id: instance.id,
        namespace,
        table,
        filePath,
        fileFormat,
      },
      {
        onSuccess: (result) => {
          setImportWizardOpen(false);
          toast.success(
            `Imported ${result.rowCount} rows into ${result.namespace.join('.')}.${result.table}`,
          );
        },
        onError: (error) => {
          toast.error(errorMessage(error));
        },
      },
    );
  };

  const refresh = async () => {
    await queryClient.invalidateQueries(['iceberg', 'namespaces', instance.id]);
    await queryClient.invalidateQueries(['iceberg', 'tables', instance.id]);
    await queryClient.invalidateQueries(['iceberg', 'schema', instance.id]);
    await queryClient.invalidateQueries(['iceberg', 'snapshots', instance.id]);
    await queryClient.invalidateQueries(['iceberg', 'preview', instance.id]);
  };

  const openTable = (selection: SelectedTable) => {
    const identifier = [...selection.namespace, selection.table].join('.');
    navigate(
      `/app/data-lake/iceberg/instances/${instance.id}/tables/${encodeURIComponent(identifier)}`,
    );
  };

  const testConnection = async () => {
    try {
      const result = await testInstanceMutation.mutateAsync(instance.id);
      if (result.success) {
        toast.success('Iceberg catalog connection successful.');
        return;
      }
      toast.error(result.error ?? 'Iceberg catalog connection failed.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const testResult = testInstanceMutation.data;
  const testIndicatorColor = (() => {
    if (testInstanceMutation.isLoading) return 'warning.main';
    if (!testResult) return 'grey.500';
    return testResult.success ? 'success.main' : 'error.main';
  })();

  const connectionStatusIcon = (healthy?: boolean) => {
    if (healthy === true) {
      return <CheckCircle sx={{ color: 'success.main', fontSize: 16 }} />;
    }
    if (healthy === false) {
      return <ErrorOutline sx={{ color: 'error.main', fontSize: 16 }} />;
    }
    return <Info sx={{ color: 'text.secondary', fontSize: 16 }} />;
  };
  let catalogStatusLabel = 'Not tested';
  if (testResult?.catalogConnected === true) {
    catalogStatusLabel = 'Connected';
  } else if (testResult?.catalogConnected === false) {
    catalogStatusLabel = 'Connection failed';
  }
  let warehouseStatusLabel = 'Not verified';
  if (testResult?.warehouseConnected === true) {
    warehouseStatusLabel = 'Accessible';
  } else if (testResult?.warehouseConnected === false) {
    warehouseStatusLabel = 'Access failed';
  }

  const catalogImage =
    icebergCatalogImages[
      instance.catalogType as keyof typeof icebergCatalogImages
    ];
  const catalogIcon = catalogImage ? (
    <ConfigImageIcon
      src={catalogImage}
      alt={`${instance.catalogType} catalog`}
    />
  ) : (
    <AccountTree fontSize="small" color="action" />
  );

  const providerIcon = instance.cloudProvider
    ? cloudStorageImages[instance.cloudProvider]
    : undefined;
  const warehouseIcon = (() => {
    if (instance.storageType === 'local' || instance.storageType === 'nfs') {
      return <Folder fontSize="small" color="action" />;
    }
    return <CloudQueue fontSize="small" color="action" />;
  })();
  let providerRowIcon = <CloudQueue fontSize="small" color="action" />;
  if (providerIcon) {
    providerRowIcon = (
      <ConfigImageIcon
        src={providerIcon}
        alt={instance.cloudProvider ?? 'Cloud storage'}
      />
    );
  } else if (instance.storageType === 'local') {
    providerRowIcon = <Folder fontSize="small" color="action" />;
  }

  const renderTables = () => {
    if (namespacesQuery.isLoading) {
      return <Skeleton variant="rectangular" height={260} />;
    }
    if (namespacesQuery.isError) {
      return (
        <Alert severity="error">{errorMessage(namespacesQuery.error)}</Alert>
      );
    }
    if (namespacesQuery.data?.length === 0) {
      return (
        <Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            No namespaces or tables found. Create a namespace or import a local
            file to create your first table.
          </Alert>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<CreateNewFolder />}
              onClick={() => setNamespaceCreateOpen(true)}
              sx={{ height: '32px' }}
            >
              New Namespace
            </Button>
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
        </Box>
      );
    }
    return (
      <>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            mb: 1.5,
            flexWrap: 'wrap',
          }}
        >
          <TextField
            size="small"
            value={tableFilter}
            onChange={(event) => setTableFilter(event.target.value)}
            placeholder="Search by name or schema…"
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
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={groupByNamespace ? 'grouped' : 'flat'}
              onChange={(_event, value) =>
                setGroupByNamespace(value === 'grouped')
              }
              sx={{ height: '32px' }}
            >
              <ToggleButton value="flat" aria-label="Flat table list">
                <Tooltip title="All tables in one list">
                  <TableChart fontSize="small" />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="grouped" aria-label="Group by namespace">
                <Tooltip title="Group tables by namespace">
                  <AccountTree fontSize="small" />
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
            <Button
              variant="outlined"
              size="small"
              startIcon={<CreateNewFolder />}
              onClick={() => setNamespaceCreateOpen(true)}
              sx={{ height: '32px' }}
            >
              New Namespace
            </Button>
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
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            flexWrap: 'wrap',
            mb: 1.5,
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
            Namespaces:
          </Typography>
          <Tooltip title="Show tables from all namespaces">
            <Chip
              icon={<Folder fontSize="small" />}
              label="All"
              size="small"
              color={!namespaceFilter ? 'primary' : 'default'}
              variant={!namespaceFilter ? 'filled' : 'outlined'}
              onClick={() => setNamespaceFilter(null)}
            />
          </Tooltip>
          {namespacesQuery.data?.map((namespace) => {
            const fullName = namespace.join('.');
            const active = namespaceFilter === fullName;
            return (
              <Tooltip
                key={fullName}
                title={
                  active
                    ? `${fullName} — click again to clear filter`
                    : `${fullName} — click to filter tables`
                }
              >
                <Chip
                  icon={<Folder fontSize="small" />}
                  label={fullName}
                  size="small"
                  color={active ? 'primary' : 'default'}
                  variant={active ? 'filled' : 'outlined'}
                  onClick={() => setNamespaceFilter(active ? null : fullName)}
                  onDelete={() => setNamespaceToDelete(namespace)}
                  deleteIcon={
                    <Delete
                      fontSize="small"
                      sx={{ '&:hover': { color: 'error.main' } }}
                    />
                  }
                />
              </Tooltip>
            );
          })}
        </Box>
        <DataLakeTableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Schema</TableCell>
                <TableCell>Rows</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Updated</TableCell>
                <TableCell>Created</TableCell>
                <TableCell
                  align="right"
                  aria-label="Actions"
                  sx={{ width: 48 }}
                />
              </TableRow>
            </TableHead>
            <TableBody>
              {namespacesQuery.data
                ?.filter(
                  (namespace) =>
                    !namespaceFilter || namespace.join('.') === namespaceFilter,
                )
                .map((namespace) =>
                  groupByNamespace ? (
                    <React.Fragment key={namespace.join('.')}>
                      <NamespaceGroupHeader
                        instanceId={instance.id}
                        namespace={namespace}
                        onDrop={(ns) => setNamespaceToDelete(ns)}
                      />
                      <NamespaceTableRows
                        instanceId={instance.id}
                        namespace={namespace}
                        filter={tableFilter}
                        showEmptyRow={!!namespaceFilter}
                        onSelect={openTable}
                        onDelete={(selection) => setTableToDelete(selection)}
                        onRename={(selection) => {
                          setTableToRename(selection);
                          setNewTableName(selection.table);
                        }}
                      />
                    </React.Fragment>
                  ) : (
                    <NamespaceTableRows
                      key={namespace.join('.')}
                      instanceId={instance.id}
                      namespace={namespace}
                      filter={tableFilter}
                      showEmptyRow={!!namespaceFilter}
                      onSelect={openTable}
                      onDelete={(selection) => setTableToDelete(selection)}
                      onRename={(selection) => {
                        setTableToRename(selection);
                        setNewTableName(selection.table);
                      }}
                    />
                  ),
                )}
            </TableBody>
          </Table>
        </DataLakeTableContainer>
      </>
    );
  };

  const renderImportWizard = () => (
    <IcebergTableImportWizard
      open={importWizardOpen}
      onClose={() => setImportWizardOpen(false)}
      instanceId={instance.id}
      onImport={handleImportTable}
      isLoading={importTableMutation.isLoading}
    />
  );

  // Operations that lock the UI behind a full-screen backdrop until they
  // finish, so the user cannot double-submit, misclick, or navigate away
  // mid-operation. The first in-flight operation's label is shown.
  const blockingOperations = [
    {
      isLoading: importTableMutation.isLoading,
      label: 'Importing table…',
    },
    {
      isLoading: dropTableMutation.isLoading,
      label: 'Deleting table…',
    },
    {
      isLoading: renameTableMutation.isLoading,
      label: 'Renaming table…',
    },
    {
      isLoading: createNamespaceMutation.isLoading,
      label: 'Creating namespace…',
    },
    {
      isLoading: dropNamespaceMutation.isLoading,
      label: 'Dropping namespace…',
    },
    {
      isLoading: testInstanceMutation.isLoading,
      label: 'Testing connection…',
    },
  ];

  let catalogIdentityLabel = 'Catalog Name';
  let catalogIdentityValue = instance.catalogName ?? 'Local catalog';
  if (instance.catalogType === 'nessie') {
    catalogIdentityLabel = 'Reference';
    catalogIdentityValue = instance.nessieReference ?? 'main';
  } else if (instance.catalogType === 'hive') {
    catalogIdentityLabel = 'Metastore URI';
    catalogIdentityValue = instance.hiveUri ?? '—';
  }

  return (
    <Box sx={dataLakeContentSx}>
      <DataLakePageHeader
        icon={
          catalogImage ? (
            <ConfigImageIcon
              src={catalogImage}
              alt={`${instance.catalogType} catalog`}
              size={24}
            />
          ) : (
            <IcebergIcon size={24} />
          )
        }
        title={instance.name}
        description={`Apache Iceberg • ${instance.catalogType.toUpperCase()} Catalog`}
        actions={
          <>
            <SettingsRefreshButton title="Refresh instance" onClick={refresh} />
            <Button
              size="small"
              variant="outlined"
              startIcon={<Edit />}
              onClick={onEdit}
              sx={{ height: '32px' }}
            >
              Edit
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<Delete />}
              onClick={onDelete}
              sx={{ height: '32px' }}
            >
              Delete
            </Button>
          </>
        }
      />
      <Box>
        <Tabs
          value={currentTab}
          onChange={(_event, value) => setCurrentTab(value)}
          sx={dataLakeTabsSx}
        >
          <Tab
            icon={<TableChart />}
            label="Tables & Views"
            iconPosition="start"
          />
          <Tab icon={<Info />} label="Overview" iconPosition="start" />
          <Tab icon={<History />} label="History" iconPosition="start" />
        </Tabs>
        <Box>
          {currentTab === 0 && renderTables()}
          {currentTab === 1 && (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      mb: 1,
                    }}
                  >
                    <Typography
                      variant="h6"
                      sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                    >
                      <Info color="primary" />
                      Health Status
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={testConnection}
                      disabled={testInstanceMutation.isLoading}
                      startIcon={<Cable />}
                    >
                      {testInstanceMutation.isLoading
                        ? 'Testing…'
                        : 'Test Connection'}
                      {/* Last test result, after the label */}
                      <Box
                        component="span"
                        aria-hidden
                        sx={{
                          width: 8,
                          height: 8,
                          ml: 0.75,
                          flexShrink: 0,
                          borderRadius: '50%',
                          bgcolor: testIndicatorColor,
                        }}
                      />
                    </Button>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={4}>
                      <Box
                        sx={{ display: 'flex', gap: 1, alignItems: 'center' }}
                      >
                        {connectionStatusIcon(testResult?.catalogConnected)}
                        <ListItemText
                          primary="Catalog Connection"
                          secondary={catalogStatusLabel}
                        />
                      </Box>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Box
                        sx={{ display: 'flex', gap: 1, alignItems: 'center' }}
                      >
                        {connectionStatusIcon(testResult?.warehouseConnected)}
                        <ListItemText
                          primary="Warehouse Access"
                          secondary={warehouseStatusLabel}
                        />
                      </Box>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <ListItemText
                        primary="Last Checked"
                        secondary={
                          testResult?.checkedAt
                            ? moment(testResult.checkedAt).fromNow()
                            : 'Never'
                        }
                      />
                    </Grid>
                  </Grid>
                  {testResult?.error && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                      {testResult.error}
                    </Alert>
                  )}
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
                  <Typography
                    variant="h6"
                    gutterBottom
                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <ConfigImageIcon
                      src={genericCatalogImage}
                      alt="Catalog configuration"
                      size={24}
                    />
                    Catalog Configuration
                  </Typography>
                  <List dense disablePadding>
                    <ListItem disableGutters>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        {catalogIcon}
                      </ListItemIcon>
                      <ListItemText
                        primary="Catalog Type"
                        secondary={instance.catalogType.toUpperCase()}
                      />
                    </ListItem>
                    <ListItem disableGutters>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Badge fontSize="small" color="action" />
                      </ListItemIcon>
                      <ListItemText
                        primary={catalogIdentityLabel}
                        secondary={catalogIdentityValue}
                      />
                    </ListItem>
                    {instance.catalogType === 'nessie' && (
                      <ListItem disableGutters>
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <Storage fontSize="small" color="action" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Nessie Warehouse"
                          secondary={
                            instance.nessieWarehouse ?? 'Default warehouse'
                          }
                        />
                      </ListItem>
                    )}
                    {instance.catalogType === 'hive' && (
                      <ListItem disableGutters>
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <Badge fontSize="small" color="action" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Hive User / Group"
                          secondary={instance.hiveUgi ?? '(none)'}
                        />
                      </ListItem>
                    )}
                    <ListItem disableGutters>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Folder fontSize="small" color="action" />
                      </ListItemIcon>
                      <ListItemText
                        primary="Namespaces"
                        secondary={namespacesQuery.data?.length ?? '—'}
                      />
                    </ListItem>
                  </List>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
                  <Typography
                    variant="h6"
                    gutterBottom
                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <Storage color="primary" />
                    Warehouse Configuration
                  </Typography>
                  <List dense disablePadding>
                    <ListItem disableGutters>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        {warehouseIcon}
                      </ListItemIcon>
                      <ListItemText
                        primary="Storage Type"
                        secondary={instance.storageType}
                      />
                    </ListItem>
                    <ListItem disableGutters>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        {providerRowIcon}
                      </ListItemIcon>
                      <ListItemText
                        primary="Provider"
                        secondary={
                          instance.storageType === 'server-managed'
                            ? 'Catalog server'
                            : (instance.cloudProvider ?? 'Local filesystem')
                        }
                      />
                    </ListItem>
                    <ListItem disableGutters>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Inventory2 fontSize="small" color="action" />
                      </ListItemIcon>
                      <ListItemText
                        primary="Bucket"
                        secondary={
                          instance.storageType === 'server-managed'
                            ? 'Managed by catalog'
                            : (instance.storageBucket ?? '—')
                        }
                      />
                    </ListItem>
                  </List>
                </Paper>
              </Grid>
            </Grid>
          )}
          {currentTab === 2 && (
            <InstanceHistory
              instanceId={instance.id}
              namespaces={namespacesQuery.data ?? []}
            />
          )}
        </Box>
      </Box>

      {renderImportWizard()}

      {/* Delete table confirmation dialog */}
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
            <strong>
              {tableToDelete?.namespace.join('.')}.{tableToDelete?.table}
            </strong>
            ? This removes the table and its metadata from the catalog.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={() => setTableToDelete(null)}
            color="inherit"
            startIcon={<Close />}
            disabled={dropTableMutation.isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteTable}
            color="error"
            variant="contained"
            startIcon={
              dropTableMutation.isLoading ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <Delete />
              )
            }
            disabled={!tableToDelete || dropTableMutation.isLoading}
          >
            {dropTableMutation.isLoading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename table dialog */}
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
            Rename{' '}
            <strong>
              {tableToRename?.namespace.join('.')}.{tableToRename?.table}
            </strong>
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
            disabled={renameTableMutation.isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRenameTable}
            variant="contained"
            startIcon={<DriveFileRenameOutline />}
            disabled={
              !tableToRename ||
              renameTableMutation.isLoading ||
              !newTableName.trim() ||
              newTableName.trim() === tableToRename.table
            }
          >
            {renameTableMutation.isLoading ? 'Renaming…' : 'Rename'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create namespace dialog */}
      <Dialog
        slotProps={{ paper: { sx: dataLakeDialogSx } }}
        open={namespaceCreateOpen}
        onClose={() => {
          setNamespaceCreateOpen(false);
          setNewNamespaceName('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create namespace</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Namespaces organize tables. Use dot notation for nested namespaces
            (for example <strong>analytics.daily</strong>).
          </Typography>
          <TextField
            fullWidth
            autoFocus
            label="Namespace name"
            placeholder="analytics.daily"
            value={newNamespaceName}
            onChange={(e) => setNewNamespaceName(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !createNamespaceMutation.isLoading) {
                handleCreateNamespace();
              }
            }}
            disabled={createNamespaceMutation.isLoading}
            helperText="Letters, numbers, underscores, and dots only"
          />
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={() => {
              setNamespaceCreateOpen(false);
              setNewNamespaceName('');
            }}
            color="inherit"
            startIcon={<Close />}
            disabled={createNamespaceMutation.isLoading}
          >
            Cancel
          </Button>{' '}
          <Button
            onClick={handleCreateNamespace}
            variant="contained"
            startIcon={
              createNamespaceMutation.isLoading ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <CreateNewFolder />
              )
            }
            disabled={createNamespaceMutation.isLoading || !namespaceNameValid}
          >
            {createNamespaceMutation.isLoading ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Drop namespace confirmation dialog */}
      <Dialog
        slotProps={{ paper: { sx: dataLakeDialogSx } }}
        open={!!namespaceToDelete}
        onClose={() => setNamespaceToDelete(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Drop namespace</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Are you sure you want to drop namespace{' '}
            <strong>{namespaceToDelete?.join('.')}</strong>?
          </Typography>
          <Alert severity="warning">
            The namespace must be empty. Delete its tables first, otherwise the
            catalog will reject the drop. Dropping a parent namespace also
            removes its nested namespaces.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={() => setNamespaceToDelete(null)}
            color="inherit"
            startIcon={<Close />}
            disabled={dropNamespaceMutation.isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDropNamespace}
            color="error"
            variant="contained"
            startIcon={
              dropNamespaceMutation.isLoading ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <Delete />
              )
            }
            disabled={!namespaceToDelete || dropNamespaceMutation.isLoading}
          >
            {dropNamespaceMutation.isLoading ? 'Dropping…' : 'Drop'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Full-screen lock while any Iceberg operation is in flight */}
      <IcebergOperationBackdrop operations={blockingOperations} />
    </Box>
  );
};
