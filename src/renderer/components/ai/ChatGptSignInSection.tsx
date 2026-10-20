import React from 'react';
import { Alert, Box, Button, Chip, Typography } from '@mui/material';
import { CheckCircle, Login } from '@mui/icons-material';
import type {
  ChatGptLogin,
  ChatGptSignInStatus,
} from '../../controllers/aiProviders.controller';

interface ChatGptSignInSectionProps {
  status: ChatGptSignInStatus;
  error?: string;
  login: ChatGptLogin | null;
  /** Edit mode: the saved provider was signed out and needs a new sign-in. */
  signedOut?: boolean;
  /** Edit mode: the saved provider's account, when no new sign-in happened. */
  savedEmail?: string | null;
  disabled?: boolean;
  onSignIn: () => void;
}

const formatPlan = (planType: string | null) =>
  planType
    ? `ChatGPT ${planType.charAt(0).toUpperCase()}${planType.slice(1)}`
    : 'ChatGPT';

/**
 * Replaces the API key field for the ChatGPT (subscription) provider type
 * (Plan 71). There is nothing to paste: the browser hands the sign-in back
 * to DBT Studio.
 */
export const ChatGptSignInSection: React.FC<ChatGptSignInSectionProps> = ({
  status,
  error,
  login,
  signedOut = false,
  savedEmail,
  disabled = false,
  onSignIn,
}) => {
  const busy = status === 'started' || status === 'waiting_for_browser';

  if (login) {
    return (
      <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
        <CheckCircle color="success" fontSize="small" />
        <Typography variant="body2">
          Signed in as <strong>{login.email ?? 'your ChatGPT account'}</strong>
          {' · '}
          {formatPlan(login.planType)}
        </Typography>
        <Button size="small" onClick={onSignIn} disabled={disabled || busy}>
          Use a different account
        </Button>
      </Box>
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap={1}>
      {signedOut && (
        <Alert severity="warning">
          This provider is signed out. Sign in with ChatGPT again to use it.
        </Alert>
      )}
      {!signedOut && savedEmail && (
        <Typography variant="body2" color="text.secondary">
          Signed in as <strong>{savedEmail}</strong>
        </Typography>
      )}
      <Box display="flex" alignItems="center" gap={1}>
        <Button
          variant="contained"
          startIcon={<Login />}
          onClick={onSignIn}
          disabled={disabled || busy}
        >
          {signedOut || savedEmail ? 'Sign in again' : 'Sign in with ChatGPT'}
        </Button>
        <Chip label="Experimental" size="small" variant="outlined" />
      </Box>
      <Typography variant="caption" color="text.secondary">
        Uses your ChatGPT Plus/Pro plan instead of an API key. Opens chatgpt.com
        in your browser. Plan usage limits apply.
      </Typography>
      {(status === 'failed' || status === 'cancelled') && error && (
        <Alert severity={status === 'failed' ? 'error' : 'info'}>{error}</Alert>
      )}
    </Box>
  );
};
