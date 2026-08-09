import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AccountTree,
  ArrowBack,
  Badge,
  ChevronRight,
  CheckCircle,
  CloudQueue,
  Delete,
  Edit,
  ErrorOutline,
  Folder,
  History,
  Info,
  Inventory2,
  Refresh,
  Search,
  Storage,
  TableChart,
} from '@mui/icons-material';
import { useQueryClient } from 'react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import moment from 'moment';
import {
  cloudStorageImages,
  databaseIcons,
} from '../../../../../assets/connectionIcons';
import type { IcebergInstanceConfig } from '../../../../types/iceberg';
import {
  useGetIcebergInstance,
  useGetIcebergSchema,
  useGetIcebergSnapshots,
  useIcebergTablePreview,
  useListIcebergNamespaces,
  useListIcebergTables,
  useTestIcebergInstance,
} from '../../../controllers/icebergDatalake.controller';
import { IcebergIcon } from './IcebergIcon';

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
  onSelect: (selection: SelectedTable) => void;
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

const IcebergTableRow: React.FC<{
  instanceId: string;
  namespace: string[];
  table: string;
  onSelect: (selection: SelectedTable) => void;
}> = ({ instanceId, namespace, table, onSelect }) => {
  const snapshotsQuery = useGetIcebergSnapshots(instanceId, namespace, table);
  const snapshots = snapshotsQuery.data ?? [];
  const firstSnapshot = snapshots[0];
  const currentSnapshot = snapshots[snapshots.length - 1];
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
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TableChart fontSize="small" color="action" />
          {table}
        </Box>
      </TableCell>
      <TableCell>
        <Chip label="TABLE" size="small" />
      </TableCell>
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
        <Tooltip title="Open table">
          <IconButton
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              onSelect({ namespace, table });
            }}
          >
            <ChevronRight fontSize="small" />
          </IconButton>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
};

const NamespaceTableRows: React.FC<NamespaceTableRowsProps> = ({
  instanceId,
  namespace,
  filter,
  onSelect,
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
        />
      ))}
    </>
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
      {[...(snapshotsQuery.data ?? [])].reverse().map((snapshot) => (
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
  <TableContainer>
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
  </TableContainer>
);

const TableDetail: React.FC<{
  instance: IcebergInstanceConfig;
  selection: SelectedTable;
}> = ({ instance, selection }) => {
  const navigate = useNavigate();
  const [tab, setTab] = React.useState(0);
  const [limit, setLimit] = React.useState(100);
  const [rowFilter, setRowFilter] = React.useState('');
  const [appliedFilter, setAppliedFilter] = React.useState('');
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

  const applyFilter = () => {
    const value = rowFilter.trim();
    if (value && !/^[A-Za-z0-9_\s.'"<>=!()-]+$/.test(value)) {
      setFilterError('The filter contains unsupported characters.');
      return;
    }
    setFilterError(null);
    setAppliedFilter(value);
    if (value === appliedFilter) previewQuery.refetch();
  };

  const renderOverview = () => {
    const snapshots = snapshotsQuery.data ?? [];
    const currentSnapshot = snapshots[snapshots.length - 1];
    return (
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2 }}>
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
          <Paper variant="outlined" sx={{ p: 2 }}>
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
      <TableContainer>
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
      </TableContainer>
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
    const snapshots = snapshotsQuery.data ?? [];
    if (snapshots.length === 0) {
      return <Alert severity="info">No snapshots found.</Alert>;
    }
    return (
      <TableContainer>
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
            {[...snapshots].reverse().map((snapshot, index) => (
              <TableRow
                key={snapshot.snapshotId}
                sx={{ fontWeight: index === 0 ? 700 : 400 }}
              >
                <TableCell sx={{ fontFamily: 'monospace' }}>
                  …{snapshot.snapshotId.slice(-8)}
                </TableCell>
                <TableCell>
                  <Chip
                    label={snapshot.operation}
                    size="small"
                    color={
                      snapshot.operation === 'append' ? 'success' : 'default'
                    }
                  />
                </TableCell>
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
      </TableContainer>
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
            onChange={(event) => setLimit(Number(event.target.value))}
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
        <TableContainer sx={{ mt: 1, maxHeight: 420 }}>
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
        </TableContainer>
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
    );
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Tooltip title="Back to Instance Details">
          <IconButton
            onClick={() =>
              navigate(`/app/data-lake/iceberg/instances/${instance.id}`)
            }
          >
            <ArrowBack />
          </IconButton>
        </Tooltip>
        <TableChart sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" fontWeight={700}>
            {selection.table}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Namespace: {selection.namespace.join('.')} • Apache Iceberg
          </Typography>
        </Box>
        {snapshotsQuery.data?.length ? (
          <Chip
            label={`Snapshot ${snapshotsQuery.data.at(-1)?.snapshotId}`}
            variant="outlined"
          />
        ) : null}
      </Box>
      <Tabs
        value={tab}
        onChange={(_event, value) => setTab(value)}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab icon={<Info />} label="Overview" iconPosition="start" />
        <Tab icon={<TableChart />} label="Schema" iconPosition="start" />
        <Tab icon={<TableChart />} label="Data" iconPosition="start" />
        <Tab icon={<History />} label="History" iconPosition="start" />
        <Tab icon={<Storage />} label="Properties" iconPosition="start" />
      </Tabs>
      <Box sx={{ pt: 3 }}>
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
  const [currentTab, setCurrentTab] = React.useState(0);
  const [tableFilter, setTableFilter] = React.useState('');

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

  const catalogIcon = (() => {
    if (instance.catalogType === 'sql') {
      return (
        <ConfigImageIcon src={databaseIcons.postgresql} alt="PostgreSQL" />
      );
    }
    if (instance.catalogType === 'sqlite') {
      return <ConfigImageIcon src={databaseIcons.sqlite} alt="SQLite" />;
    }
    return <AccountTree fontSize="small" color="action" />;
  })();

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
      return <Alert severity="info">No namespaces or tables found.</Alert>;
    }
    return (
      <>
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
            mb: 2,
            '& .MuiInputBase-input': {
              paddingTop: '2px',
              paddingBottom: '2px',
            },
            '& .MuiOutlinedInput-root': {
              minHeight: '32px',
            },
          }}
        />
        <TableContainer>
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
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {namespacesQuery.data?.map((namespace) => (
                <NamespaceTableRows
                  key={namespace.join('.')}
                  instanceId={instance.id}
                  namespace={namespace}
                  filter={tableFilter}
                  onSelect={openTable}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </>
    );
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <IcebergIcon size={24} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700}>
            {instance.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Apache Iceberg • {instance.catalogType.toUpperCase()} Catalog
          </Typography>
        </Box>
        <Button startIcon={<Refresh />} variant="outlined" onClick={refresh}>
          Refresh
        </Button>
        <Button startIcon={<Edit />} variant="outlined" onClick={onEdit}>
          Edit
        </Button>
        <Button
          startIcon={<Delete />}
          variant="outlined"
          color="error"
          onClick={onDelete}
        >
          Delete
        </Button>
      </Box>
      <Paper variant="outlined">
        <Tabs
          value={currentTab}
          onChange={(_event, value) => setCurrentTab(value)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Tables & Views" />
          <Tab label="Overview" />
          <Tab label="History" />
        </Tabs>
        <Box sx={{ p: 2 }}>
          {currentTab === 0 && renderTables()}
          {currentTab === 1 && (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Paper variant="outlined" sx={{ p: 2 }}>
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
                      color="inherit"
                      size="small"
                      onClick={testConnection}
                      disabled={testInstanceMutation.isLoading}
                      sx={{
                        position: 'relative',
                        pr: 4,
                        minWidth: 140,
                        color: 'text.secondary',
                        borderColor: 'divider',
                        '&:hover': {
                          borderColor: 'primary.main',
                          backgroundColor: 'action.hover',
                        },
                      }}
                    >
                      {testInstanceMutation.isLoading
                        ? 'Testing…'
                        : 'Test Connection'}
                      <Box
                        sx={{
                          position: 'absolute',
                          right: 10,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: testIndicatorColor,
                          border: '1px solid',
                          borderColor: 'background.paper',
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
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography
                    variant="h6"
                    gutterBottom
                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <AccountTree color="primary" />
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
                        primary={
                          instance.catalogType === 'nessie'
                            ? 'Reference'
                            : 'Catalog Name'
                        }
                        secondary={
                          instance.catalogType === 'nessie'
                            ? (instance.nessieReference ?? 'main')
                            : (instance.catalogName ?? 'Local catalog')
                        }
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
                <Paper variant="outlined" sx={{ p: 2 }}>
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
      </Paper>
    </Box>
  );
};
