import React, { useState } from 'react';
import {
  Typography,
  Box,
  Button,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
} from '@mui/material';
import {
  Storage,
  RestartAlt,
  Warning,
  Close,
  StorageOutlined,
  HealthAndSafety,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  useGetDuckDbMetadata,
  useRefreshDuckDbMetadata,
  useReinitializeDuckDb,
  useDiagnoseDuckDb,
} from '../../controllers/settings.controller';
import {
  SettingsRefreshButton,
  SettingsRow,
  SettingsSection,
  SettingsSectionBody,
  SettingsStatus,
} from './SettingsLayout';

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
        return 'neutral';
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
    <>
      <SettingsSection
        title="Persistent Database (DuckDB)"
        icon={<StorageOutlined />}
        description="Local DuckDB instance used for caching, data preview, and persistent storage."
        action={
          <SettingsRefreshButton
            title="Refresh status"
            onClick={handleRefresh}
          />
        }
      >
        {isLoading ? (
          <SettingsSectionBody>
            <LinearProgress />
          </SettingsSectionBody>
        ) : (
          <>
            <SettingsRow label="Status">
              <SettingsStatus tone={getStatusColor(metadata?.status)}>
                {metadata?.status || 'Unknown'}
              </SettingsStatus>
            </SettingsRow>
            <SettingsRow label="File Size">
              <Typography variant="body2" color="text.secondary">
                {metadata?.sizeHumanReadable || '0 Bytes'}
              </Typography>
            </SettingsRow>
            <SettingsRow label="Active Connections">
              <Typography variant="body2" color="text.secondary">
                {metadata?.activeConnections || 0} /{' '}
                {metadata?.maxConnections || 10}
              </Typography>
              {getLockStatusIcon(metadata?.lockStatus)}
            </SettingsRow>
            <SettingsRow
              label="Path"
              description={
                <Box component="span" sx={{ wordBreak: 'break-all' }}>
                  {metadata?.path || 'Not initialized'}
                </Box>
              }
            />
          </>
        )}
        <SettingsRow
          label="Diagnostics"
          description="Connection pool, leaks and a sample of open connections."
        >
          <Button
            size="small"
            variant="outlined"
            startIcon={<HealthAndSafety />}
            onClick={() => setShowDiagnostics(true)}
          >
            Open
          </Button>
        </SettingsRow>
        <SettingsRow
          label="Reinitialize Database"
          description="Deletes main.duckdb and creates a new one. Cached data is lost."
        >
          <Button
            size="small"
            color="error"
            variant="outlined"
            startIcon={<RestartAlt />}
            onClick={() => setConfirmReinit(true)}
          >
            Reinitialize
          </Button>
        </SettingsRow>
      </SettingsSection>

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
    </>
  );
};
