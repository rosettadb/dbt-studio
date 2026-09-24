import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Typography,
  Button,
  CircularProgress,
  Box,
  DialogActions,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

type GateStatus =
  | 'idle'
  | 'started'
  | 'waiting_for_browser'
  | 'completed'
  | 'cancelled'
  | 'failed';

interface Props {
  open: boolean;
  status: GateStatus;
  onCancel: () => void;
  error?: string;
}

const BrowserAuthenticationGate: React.FC<Props> = ({
  open,
  status,
  onCancel,
  error,
}) => {
  const isCancellable =
    status === 'started' || status === 'waiting_for_browser';
  const hasFinished =
    status === 'completed' || status === 'cancelled' || status === 'failed';

  return (
    <Dialog
      open={open}
      aria-busy={!hasFinished}
      disableEscapeKeyDown={!isCancellable && !hasFinished}
      onClose={isCancellable || hasFinished ? onCancel : undefined}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { p: 2 },
      }}
    >
      <DialogTitle sx={{ textAlign: 'center' }}>
        Snowflake Browser Authentication
      </DialogTitle>
      <DialogContent>
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          gap={3}
          py={3}
        >
          {status === 'started' && (
            <>
              <CircularProgress size={48} />
              <Typography variant="body1">
                Starting authentication flow...
              </Typography>
            </>
          )}

          {status === 'waiting_for_browser' && (
            <>
              <CircularProgress size={48} />
              <Typography variant="body1">
                Waiting for browser sign-in...
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Please complete the authentication and MFA in your web browser.
              </Typography>
            </>
          )}

          {status === 'completed' && (
            <Typography variant="h6" color="success.main">
              Authentication Successful!
            </Typography>
          )}

          {status === 'cancelled' && (
            <>
              <Typography variant="h6" color="warning.main">
                Authentication Cancelled
              </Typography>
              <Typography variant="body2" color="text.secondary">
                You cancelled the sign-in flow.
              </Typography>
            </>
          )}

          {status === 'failed' && (
            <>
              <Typography variant="h6" color="error.main">
                Authentication Failed
              </Typography>
              <Typography
                variant="body2"
                color="error.main"
                sx={{ textAlign: 'center', mt: 1 }}
              >
                {error || 'An unknown error occurred.'}
              </Typography>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          color={hasFinished ? 'primary' : 'error'}
          onClick={onCancel}
          startIcon={<CloseIcon />}
        >
          {hasFinished ? 'Close' : 'Cancel'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BrowserAuthenticationGate;
