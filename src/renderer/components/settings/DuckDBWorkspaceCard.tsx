import React from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Box,
  TextField,
  Button,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  Tooltip,
  DialogActions,
} from '@mui/material';
import {
  Storage,
  Refresh,
  RestartAlt,
  BugReport,
  FolderOpen,
  ExpandMore,
  CheckCircle,
  Error as ErrorIcon,
  Warning,
  Close,
  DeleteForever,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  useGetDuckDbMetadata,
  useRefreshDuckDbMetadata,
  useReinitializeDuckDb,
  useDiagnoseDuckDb,
} from '../../controllers/settings.controller';
import { DuckDBDiagnostics } from '../../../types/backend';
import { Modal } from '../modals/modal';

export const DuckDBWorkspaceCard: React.FC = () => {
  const [diagnosticsOpen, setDiagnosticsOpen] = React.useState(false);
  const [diagnosticsData, setDiagnosticsData] =
    React.useState<DuckDBDiagnostics | null>(null);
  const [reinitializeModalOpen, setReinitializeModalOpen] =
    React.useState(false);
  const [recreateModalOpen, setRecreateModalOpen] = React.useState(false);

  const {
    data: metadata,
    isLoading,
    error,
  } = useGetDuckDbMetadata({
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const { mutate: refreshMetadata, isLoading: isRefreshing } =
    useRefreshDuckDbMetadata({
      onSuccess: () => {
        toast.success('DuckDB metadata refreshed successfully');
      },
      onError: (err) => {
        toast.error(
          `Failed to refresh metadata: ${err.message || 'Unknown error'}`,
        );
      },
    });

  const { mutate: reinitialize, isLoading: isReinitializing } =
    useReinitializeDuckDb({
      onSuccess: () => {
        toast.success('DuckDB reinitialized successfully');
      },
      onError: (err) => {
        toast.error(
          `Failed to reinitialize DuckDB: ${err.message || 'Unknown error'}`,
        );
      },
    });

  const { mutate: diagnose, isLoading: isDiagnosing } = useDiagnoseDuckDb({
    onSuccess: (data) => {
      setDiagnosticsData(data);
      setDiagnosticsOpen(true);
      toast.info('Diagnostics completed');
    },
    onError: (err) => {
      toast.error(
        `Failed to run diagnostics: ${err.message || 'Unknown error'}`,
      );
    },
  });

  const handleOpenLocation = async () => {
    if (!metadata?.path) {
      toast.error('Database path not available');
      return;
    }

    try {
      const dirPath = metadata.path.substring(
        0,
        metadata.path.lastIndexOf('/'),
      );
      const result = await window.electron.ipcRenderer.invoke(
        'utils:openPath',
        dirPath,
      );

      if (!result.success) {
        toast.error(`Failed to open location: ${result.error}`);
      }
    } catch (err) {
      toast.error('Failed to open database location');
    }
  };

  const handleRefresh = () => {
    refreshMetadata();
  };

  const handleReinitialize = () => {
    setReinitializeModalOpen(true);
  };

  const handleConfirmReinitialize = () => {
    setReinitializeModalOpen(false);
    reinitialize({ dropExisting: false });
  };

  const handleRecreate = () => {
    setRecreateModalOpen(true);
  };

  const handleConfirmRecreate = () => {
    setRecreateModalOpen(false);
    reinitialize({ dropExisting: true });
  };

  const handleDiagnose = () => {
    diagnose();
  };

  const getStatusColor = () => {
    if (!metadata) return 'default';
    switch (metadata.status) {
      case 'ready':
        return 'success';
      case 'error':
        return 'error';
      case 'missing':
        return 'warning';
      case 'initializing':
        return 'info';
      default:
        return 'default';
    }
  };

  const getLockStatusColor = () => {
    if (!metadata) return 'default';
    switch (metadata.lockStatus) {
      case 'idle':
        return 'success';
      case 'active':
        return 'info';
      case 'contended':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getStatusIcon = () => {
    if (!metadata) return null;
    switch (metadata.status) {
      case 'ready':
        return <CheckCircle fontSize="small" />;
      case 'error':
        return <ErrorIcon fontSize="small" />;
      case 'missing':
        return <Warning fontSize="small" />;
      default:
        return null;
    }
  };

  const isOperating = isRefreshing || isReinitializing || isDiagnosing;

  return (
    <Card
      variant="outlined"
      sx={{ maxWidth: 800, borderRadius: 2, borderColor: 'divider', mb: 4 }}
    >
      <CardContent>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <Storage color="primary" />
          <Typography variant="h6" sx={{ m: 0 }}>
            DuckDB Workspace
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" mb={3}>
          Manage the persistent DuckDB database used for Cloud Explorer previews
          and DuckLake catalogs. The database is shared across all operations
          for better performance and resource efficiency.
        </Typography>

        {isLoading && (
          <Box display="flex" justifyContent="center" py={3}>
            <CircularProgress size={32} />
          </Box>
        )}

        {!isLoading && error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to load DuckDB metadata: {error.message || 'Unknown error'}
          </Alert>
        )}

        {!isLoading && !error && metadata && (
          <>
            <Box display="flex" gap={1} mb={3} flexWrap="wrap">
              <Chip
                icon={getStatusIcon() || undefined}
                label={`Status: ${metadata.status}`}
                color={getStatusColor()}
                size="small"
              />
              <Chip
                label={`Lock: ${metadata.lockStatus}`}
                color={getLockStatusColor()}
                size="small"
              />
              <Chip
                label={`Size: ${metadata.sizeHumanReadable}`}
                size="small"
              />
              <Chip
                label={`Connections: ${metadata.activeConnections}/${metadata.poolSize}`}
                size="small"
              />
            </Box>

            <TextField
              fullWidth
              label="Database Location"
              value={metadata.path}
              InputProps={{ readOnly: true }}
              sx={{ mb: 2 }}
            />

            {metadata.status === 'missing' && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight="medium" mb={1}>
                  Database file is missing
                </Typography>
                <Typography variant="body2">
                  The main.duckdb file was not found. Click &quot;Recreate
                  main.duckdb&quot; below to create it with required extensions.
                </Typography>
              </Alert>
            )}

            {metadata.lockStatus === 'contended' && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight="medium" mb={1}>
                  High connection usage detected
                </Typography>
                <Typography variant="body2" mb={1}>
                  The connection pool is heavily utilized (
                  {metadata.activeConnections}/{metadata.maxConnections}).
                  Consider using DuckLake&apos;s &quot;Purge All
                  Connections&quot; feature to free up resources before running
                  diagnostics.
                </Typography>
              </Alert>
            )}

            {metadata.status === 'error' && (
              <Alert severity="error" sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight="medium" mb={1}>
                  Database error detected
                </Typography>
                <Typography variant="body2">
                  The database is in an error state. Try refreshing metadata or
                  reinitializing the database. If the problem persists, run
                  diagnostics to get detailed error information.
                </Typography>
              </Alert>
            )}

            {diagnosticsData && (
              <Accordion
                expanded={diagnosticsOpen}
                onChange={() => setDiagnosticsOpen(!diagnosticsOpen)}
                sx={{ mb: 2 }}
              >
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <BugReport fontSize="small" />
                    <Typography>Diagnostics Report</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      Connection Pool
                    </Typography>
                    <Box component="pre" sx={{ fontSize: '0.75rem', mb: 2 }}>
                      {JSON.stringify(diagnosticsData.pool, null, 2)}
                    </Box>

                    {diagnosticsData.leaks.length > 0 && (
                      <>
                        <Typography variant="subtitle2" gutterBottom>
                          Potential Leaks ({diagnosticsData.leaks.length})
                        </Typography>
                        <Box
                          component="pre"
                          sx={{ fontSize: '0.75rem', mb: 2 }}
                        >
                          {JSON.stringify(diagnosticsData.leaks, null, 2)}
                        </Box>
                      </>
                    )}

                    <Typography variant="subtitle2" gutterBottom>
                      Connection Sample
                    </Typography>
                    <Box component="pre" sx={{ fontSize: '0.75rem' }}>
                      {JSON.stringify(
                        diagnosticsData.connectionsSample,
                        null,
                        2,
                      )}
                    </Box>
                  </Box>
                </AccordionDetails>
              </Accordion>
            )}

            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
            >
              If the file is missing, we&apos;ll recreate it with required
              extensions (ducklake, httpfs, azure, json, parquet). Last checked:{' '}
              {new Date(metadata.lastCheckedAt).toLocaleString()}
            </Typography>
          </>
        )}
      </CardContent>

      <CardActions sx={{ justifyContent: 'space-between', px: 3, pb: 3 }}>
        <Box display="flex" gap={1}>
          <Tooltip title="Open database folder in file manager">
            <Button
              variant="outlined"
              size="small"
              onClick={handleOpenLocation}
              disabled={isOperating || !metadata?.path}
              startIcon={<FolderOpen />}
            >
              Open Location
            </Button>
          </Tooltip>

          {metadata?.status === 'missing' && (
            <Tooltip title="Create a new main.duckdb file">
              <Button
                variant="contained"
                color="warning"
                size="small"
                onClick={handleRecreate}
                disabled={isOperating}
                startIcon={<RestartAlt />}
              >
                Recreate main.duckdb
              </Button>
            </Tooltip>
          )}
        </Box>

        <Box display="flex" gap={1} alignItems="center">
          {isOperating && <CircularProgress size={20} />}

          <Tooltip title="Reload database metadata">
            <Button
              variant="outlined"
              size="small"
              onClick={handleRefresh}
              disabled={isOperating}
              startIcon={<Refresh />}
            >
              Refresh
            </Button>
          </Tooltip>

          <Tooltip title="Reinitialize database (keeps existing data)">
            <Button
              variant="outlined"
              size="small"
              onClick={handleReinitialize}
              disabled={isOperating || metadata?.status === 'missing'}
              startIcon={<RestartAlt />}
            >
              Reinitialize
            </Button>
          </Tooltip>

          <Tooltip title="Run connection pool diagnostics">
            <Button
              variant="outlined"
              size="small"
              onClick={handleDiagnose}
              disabled={isOperating}
              startIcon={<BugReport />}
            >
              Diagnose
            </Button>
          </Tooltip>
        </Box>
      </CardActions>

      {/* Reinitialize Confirmation Modal */}
      <Modal
        isOpen={reinitializeModalOpen}
        onClose={() => setReinitializeModalOpen(false)}
        title="Reinitialize DuckDB Database"
      >
        <Box>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight="medium" mb={1}>
              Are you sure you want to reinitialize the DuckDB database?
            </Typography>
            <Typography variant="body2">
              This will recreate the database file with default extensions.
              Existing data will be preserved.
            </Typography>
          </Alert>
          <DialogActions>
            <Button
              onClick={() => setReinitializeModalOpen(false)}
              variant="outlined"
              startIcon={<Close />}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReinitialize}
              variant="contained"
              color="primary"
              startIcon={<RestartAlt />}
            >
              Reinitialize
            </Button>
          </DialogActions>
        </Box>
      </Modal>

      {/* Recreate Confirmation Modal */}
      <Modal
        isOpen={recreateModalOpen}
        onClose={() => setRecreateModalOpen(false)}
        title="Recreate DuckDB Database"
      >
        <Box>
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight="medium" mb={1}>
              ⚠️ WARNING: This action cannot be undone!
            </Typography>
            <Typography variant="body2" mb={1}>
              Are you sure you want to recreate the DuckDB database?
            </Typography>
            <Typography variant="body2">
              This will <strong>DELETE</strong> the existing file and create a
              new one. <strong>All data will be lost!</strong>
            </Typography>
          </Alert>
          <DialogActions>
            <Button
              onClick={() => setRecreateModalOpen(false)}
              variant="outlined"
              startIcon={<Close />}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmRecreate}
              variant="contained"
              color="error"
              startIcon={<DeleteForever />}
            >
              Delete and Recreate
            </Button>
          </DialogActions>
        </Box>
      </Modal>
    </Card>
  );
};
