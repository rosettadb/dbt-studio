import React from 'react';
import {
  Box,
  Button,
  IconButton,
  Tooltip,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import { PlayArrow, Stop, Refresh } from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  flowfileGetStatus,
  flowfileStart,
  flowfileStop,
  FlowfileStatus,
} from '../../services/flowfile.service';
import { client } from '../../config/client';
import { AppLayout } from '../../layouts';

const POLL_INTERVAL_MS = 3000;

const Flows: React.FC = () => {
  const [status, setStatus] = React.useState<FlowfileStatus | null>(null);
  const [isStarting, setIsStarting] = React.useState(false);
  const [isStopping, setIsStopping] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStartAttempted = React.useRef(false);
  const [autoStartEnabled, setAutoStartEnabled] = React.useState(false);

  const fetchStatus = async () => {
    try {
      const s = await flowfileGetStatus();
      setStatus(s);
    } catch {
      // ignore polling errors silently
    }
  };

  React.useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    (async () => {
      const { data } = await client.get<{ flowfileAutoStart?: string }>(
        'settings:load',
      );
      setAutoStartEnabled(data.flowfileAutoStart === 'true');
    })();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const result = await flowfileStart();
      if (!result.ok) {
        setError(result.error ?? 'Failed to start Flowfile');
      } else {
        toast.info('Flowfile is starting…');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Flowfile');
    } finally {
      setIsStarting(false);
      await fetchStatus();
    }
  };

  React.useEffect(() => {
    if (autoStartAttempted.current) return;
    if (!autoStartEnabled || !status || status.processRunning || isStarting) {
      return;
    }
    autoStartAttempted.current = true;
    (async () => {
      setIsStarting(true);
      setError(null);
      try {
        const result = await flowfileStart();
        if (!result.ok) {
          setError(result.error ?? 'Failed to start Flowfile');
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to start Flowfile',
        );
      } finally {
        setIsStarting(false);
        fetchStatus();
      }
    })();
  }, [autoStartEnabled, status?.processRunning]);

  const handleStop = async () => {
    setIsStopping(true);
    setError(null);
    try {
      const result = await flowfileStop();
      if (!result.ok) {
        setError(result.error ?? 'Failed to stop Flowfile');
        setIsStopping(false);
      }
      // isStopping stays true; cleared by the useEffect below once the poll
      // confirms the process is gone
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop Flowfile');
      setIsStopping(false);
    }
  };

  const processRunning = status?.processRunning ?? false;

  React.useEffect(() => {
    if (isStopping && !processRunning) {
      setIsStopping(false);
    }
  }, [processRunning, isStopping]);
  const serviceUp = processRunning && (status?.serviceUp ?? false);
  const url = status?.url ?? 'http://127.0.0.1:63578/ui';

  return (
    <AppLayout>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
        }}
      >
        {/* Toolbar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1,
            borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
            flexShrink: 0,
          }}
        >
          <Typography variant="subtitle2" sx={{ mr: 1 }}>
            Flowfile
          </Typography>

          {!processRunning ? (
            <Tooltip title="Start Service" placement="bottom">
              <span>
                <IconButton
                  size="small"
                  color="primary"
                  onClick={handleStart}
                  disabled={isStarting}
                >
                  {isStarting ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <PlayArrow fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          ) : (
            <Tooltip
              title={serviceUp ? 'Stop Service' : 'Starting up…'}
              placement="bottom"
            >
              <span>
                <IconButton
                  size="small"
                  color="error"
                  onClick={handleStop}
                  disabled={isStopping || !processRunning}
                >
                  {isStopping || !serviceUp ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <Stop fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          )}

          <Tooltip title="Refresh" placement="bottom">
            <IconButton
              size="small"
              onClick={() => {
                fetchStatus();
              }}
            >
              <Refresh fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Error banner */}
        {error && (
          <Alert
            severity="error"
            onClose={() => setError(null)}
            sx={{ borderRadius: 0, flexShrink: 0 }}
          >
            {error}
          </Alert>
        )}

        {/* Content area */}
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {serviceUp ? (
            <iframe
              src={url}
              title="Flowfile"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              }}
            />
          ) : (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 2,
              }}
            >
              {processRunning ? (
                <>
                  <CircularProgress size={32} />
                  <Typography variant="body2" color="text.secondary">
                    Waiting for service to be ready…
                  </Typography>
                </>
              ) : (
                <>
                  <Typography variant="h6" color="text.secondary">
                    Flowfile is not running
                  </Typography>
                  <Button
                    variant="contained"
                    size="large"
                    onClick={handleStart}
                    disabled={isStarting}
                    startIcon={
                      isStarting ? (
                        <CircularProgress size={18} color="inherit" />
                      ) : (
                        <PlayArrow />
                      )
                    }
                    sx={{
                      bgcolor: 'success.main',
                      '&:hover': { bgcolor: 'success.dark' },
                      px: 4,
                    }}
                  >
                    {isStarting ? 'Starting…' : 'Start'}
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    Not installed? Go to <strong>Settings &gt; Flowfile</strong>{' '}
                    to install it first.
                  </Typography>
                </>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </AppLayout>
  );
};

export default Flows;
