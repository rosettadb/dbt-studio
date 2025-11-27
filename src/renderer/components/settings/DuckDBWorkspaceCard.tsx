import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Box,
  Button,
  Chip,
  LinearProgress,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
} from '@mui/material';
import {
  Storage,
  Refresh,
  RestartAlt,
  HealthAndSafety,
  Warning,
  Close,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  useGetDuckDbMetadata,
  useRefreshDuckDbMetadata,
  useReinitializeDuckDb,
  useDiagnoseDuckDb,
} from '../../controllers/settings.controller';
import connectionIcons from '../../../../assets/connectionIcons';

const DiagnosticsDialog: React.FC<{ open: boolean; onClose: () => void }> = ({
  open,
  onClose,
}) => {
  const { data: diagnostics, isLoading } = useDiagnoseDuckDb({ enabled: open });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>DuckDB Diagnostics</DialogTitle>
      <DialogContent dividers>
        {isLoading ? (
          <LinearProgress />
        ) : (
          <Box display="flex" flexDirection="column" gap={3}>
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Connection Pool
              </Typography>
              <Box display="grid" gridTemplateColumns="1fr 1fr 1fr" gap={2}>
                <Box>
                  <Typography variant="caption">Total Connections</Typography>
                  <Typography variant="h6">
                    {diagnostics?.pool.totalConnections}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption">Active</Typography>
                  <Typography variant="h6">
                    {diagnostics?.pool.activeConnections}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption">Avg Hold Time</Typography>
                  <Typography variant="h6">
                    {Math.round(diagnostics?.pool.averageHoldTime || 0)} ms
                  </Typography>
                </Box>
              </Box>
            </Box>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Active Leaks (Held &gt; 5m)
              </Typography>
              {diagnostics?.leaks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No leaks detected.
                </Typography>
              ) : (
                diagnostics?.leaks.map((leak: any) => (
                  <Box
                    key={leak.id}
                    p={1}
                    bgcolor="error.light"
                    borderRadius={1}
                    mb={1}
                  >
                    <Typography variant="body2">
                      ID: {leak.id} | Held: {Math.round(leak.heldForMs / 1000)}s
                      | By: {leak.acquiredBy.join(', ')}
                    </Typography>
                  </Box>
                ))
              )}
            </Box>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Connection Sample
              </Typography>
              <Box maxHeight={200} overflow="auto">
                {diagnostics?.connectionsSample.map((conn: any) => (
                  <Box
                    key={conn.id}
                    display="flex"
                    justifyContent="space-between"
                    p={0.5}
                    borderBottom="1px solid #eee"
                  >
                    <Typography variant="caption">{conn.id}</Typography>
                    <Typography
                      variant="caption"
                      color={conn.inUse ? 'primary' : 'text.secondary'}
                    >
                      {conn.inUse ? 'In Use' : 'Idle'}
                    </Typography>
                    <Typography variant="caption">
                      {conn.acquiredBy.join(', ') || '-'}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" startIcon={<Close />}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export const DuckDBWorkspaceCard: React.FC = () => {
  const { data: metadata, isLoading } = useGetDuckDbMetadata();
  const { mutateAsync: refresh } = useRefreshDuckDbMetadata();
  const { mutateAsync: reinitialize } = useReinitializeDuckDb();

  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [confirmReinit, setConfirmReinit] = useState(false);

  const handleRefresh = async () => {
    try {
      await refresh();
      toast.success('DuckDB metadata refreshed');
    } catch (error) {
      toast.error('Failed to refresh metadata');
    }
  };

  const handleReinitialize = async () => {
    try {
      await reinitialize({ dropExisting: true });
      toast.success('DuckDB reinitialized successfully');
      setConfirmReinit(false);
    } catch (error) {
      toast.error('Failed to reinitialize DuckDB');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return 'success';
      case 'initializing':
        return 'warning';
      case 'fallback_memory':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  const getLockStatusIcon = (status: string) => {
    if (status === 'contended')
      return <Warning color="warning" fontSize="small" />;
    if (status === 'active')
      return <Storage color="primary" fontSize="small" />;
    return <Close color="success" fontSize="small" />;
  };

  return (
    <Card
      variant="outlined"
      sx={{ maxWidth: 800, borderRadius: 2, borderColor: 'divider', mb: 4 }}
    >
      <CardContent>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          mb={2}
        >
          <Box display="flex" alignItems="center" gap={1}>
            <img
              src={connectionIcons.images.duckdb}
              alt="DuckDB"
              style={{
                width: 24,
                height: 24,
                objectFit: 'contain',
              }}
            />
            <Typography variant="h6" sx={{ m: 0 }}>
              Persistent Database (DuckDB)
            </Typography>
          </Box>
          <Box display="flex" gap={1}>
            <Tooltip title="Refresh Status">
              <IconButton onClick={handleRefresh} size="small">
                <Refresh />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <Typography variant="body2" color="text.secondary" mb={3}>
          Manages the local DuckDB instance used for caching, data preview, and
          persistent storage.
        </Typography>

        {isLoading ? (
          <LinearProgress />
        ) : (
          <Box display="flex" flexDirection="column" gap={2}>
            <Box display="flex" gap={4} flexWrap="wrap">
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Status
                </Typography>
                <Box display="flex" alignItems="center" gap={1}>
                  <Chip
                    label={metadata?.status || 'Unknown'}
                    color={getStatusColor(metadata?.status) as any}
                    size="small"
                  />
                </Box>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  File Size
                </Typography>
                <Typography variant="body1">
                  {metadata?.sizeHumanReadable || '0 Bytes'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Active Connections
                </Typography>
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography variant="body1">
                    {metadata?.activeConnections || 0} /{' '}
                    {metadata?.maxConnections || 10}
                  </Typography>
                  {getLockStatusIcon(metadata?.lockStatus)}
                </Box>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Path
                </Typography>
                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                  {metadata?.path || 'Not initialized'}
                </Typography>
              </Box>
            </Box>
          </Box>
        )}
      </CardContent>

      <CardActions sx={{ justifyContent: 'space-between', px: 3, pb: 3 }}>
        <Button
          color="error"
          variant="outlined"
          startIcon={<RestartAlt />}
          onClick={() => setConfirmReinit(true)}
        >
          Reinitialize Database
        </Button>

        <Button
          variant="outlined"
          color="primary"
          startIcon={<HealthAndSafety />}
          onClick={() => setShowDiagnostics(true)}
        >
          Diagnostics
        </Button>
      </CardActions>

      {/* Diagnostics Dialog */}
      <DiagnosticsDialog
        open={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
      />

      {/* Reinitialize Confirmation Dialog */}
      <Dialog open={confirmReinit} onClose={() => setConfirmReinit(false)}>
        <DialogTitle>Reinitialize Database?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will delete the existing <code>main.duckdb</code> file and
            create a new one. All cached data and persistent tables will be
            lost. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmReinit(false)}
            variant="outlined"
            startIcon={<Close />}
          >
            Cancel
          </Button>
          <Button
            onClick={handleReinitialize}
            color="error"
            variant="outlined"
            startIcon={<RestartAlt />}
            autoFocus
          >
            Reinitialize
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};
