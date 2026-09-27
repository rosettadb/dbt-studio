import React from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import type { ChatGptSignInStatus } from '../../controllers/aiProviders.controller';

interface ChatGptSignInGateProps {
  status: ChatGptSignInStatus;
  onCancel: () => void;
}

/**
 * Blocks the Add AI Provider dialog while the user signs in to ChatGPT in
 * the system browser (Plan 71). Modeled on BrowserAuthenticationGate from
 * the Snowflake browser OAuth work (PR #465). Results (signed in, failed,
 * cancelled) are shown in the dialog itself, so the gate only covers the
 * waiting states.
 */
export const ChatGptSignInGate: React.FC<ChatGptSignInGateProps> = ({
  status,
  onCancel,
}) => {
  const open = status === 'started' || status === 'waiting_for_browser';

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth aria-busy>
      <DialogTitle sx={{ textAlign: 'center' }}>
        Sign in with ChatGPT
      </DialogTitle>
      <DialogContent>
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          gap={2}
          py={2}
        >
          <CircularProgress size={40} />
          <Typography variant="body1">
            {status === 'started'
              ? 'Opening your browser…'
              : 'Finish signing in in your browser.'}
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center">
            DBT Studio continues automatically when you&apos;re done. Your
            password is entered on chatgpt.com, never in DBT Studio.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          color="error"
          onClick={onCancel}
          startIcon={<CloseIcon />}
        >
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};
