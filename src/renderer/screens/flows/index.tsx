import React from 'react';
import { Box, Button, Typography, CircularProgress, Alert } from '@mui/material';
import { PlayArrow, Stop, Refresh } from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  flowfileGetStatus,
  flowfileStart,
  flowfileStop,
  FlowfileStatus,
} from '../../services/flowfile.service';

const POLL_INTERVAL_MS = 3000;

const Flows: React.FC = () => {
  const [status, setStatus] = React.useState<FlowfileStatus | null>(null);
  const [isStarting, setIsStarting] = React.useState(false);
  const [isStopping, setIsStopping] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showIframe, setShowIframe] = React.useState(false);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

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
    } finally {
      setIsStarting(false);
      await fetchStatus();
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    setError(null);
    try {
      const result = await flowfileStop();
      if (!result.ok) {
        setError(result.error ?? 'Failed to stop Flowfile');
      }
    } finally {
      setIsStopping(false);
      await fetchStatus();
    }
  };

  const serviceUp = (status?.serviceUp ?? false) || showIframe;
  const processRunning = status?.processRunning ?? false;
  const url = status?.url ?? 'http://127.0.0.1:63578/ui';

  return (
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
          <Button
            size="small"
            variant="contained"
            startIcon={
              isStarting ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <PlayArrow fontSize="small" />
              )
            }
            onClick={handleStart}
            disabled={isStarting}
          >
            {isStarting ? 'Starting…' : 'Start Service'}
          </Button>
        ) : (
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={
              isStopping ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <Stop fontSize="small" />
              )
            }
            onClick={handleStop}
            disabled={isStopping}
          >
            {isStopping ? 'Stopping…' : 'Stop Service'}
          </Button>
        )}

        <Button
          size="small"
          variant="text"
          startIcon={<Refresh fontSize="small" />}
          onClick={() => { setShowIframe(true); fetchStatus(); }}
        >
          Refresh
        </Button>

        {processRunning && (
          <Typography
            variant="caption"
            color={serviceUp ? 'success.main' : 'warning.main'}
            sx={{ ml: 1 }}
          >
            {serviceUp ? `Running at ${url}` : 'Starting up…'}
          </Typography>
        )}
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
                <Typography variant="body2" color="text.secondary">
                  Click <strong>Start Service</strong> to launch Flowfile.
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Not installed? Go to{' '}
                  <strong>Settings &gt; Flowfile</strong> to install it first.
                </Typography>
              </>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default Flows;
