import React from 'react';
import { Alert, AlertTitle, Button, Box, Typography } from '@mui/material';
import type { ParsedAgentError } from '../../utils/agentErrorParser';
import { ToggleSection } from './ToggleSection';
import { ChatGptFallbackAction } from './ChatGptFallbackAction';

interface AgentErrorAlertProps {
  error: ParsedAgentError;
  onDismiss?: () => void;
  onNavigate?: (path: string) => void;
}

export const AgentErrorAlert: React.FC<AgentErrorAlertProps> = ({
  error,
  onDismiss,
  onNavigate,
}) => {
  let severity: 'error' | 'warning' | 'info' = 'error';
  let actionButton = null;

  if (error.type === 'auth') {
    actionButton = onNavigate ? (
      <Button
        color="inherit"
        size="small"
        onClick={() => onNavigate('/settings')}
      >
        Open Settings
      </Button>
    ) : undefined;
  } else if (error.type === 'rateLimit') {
    severity = 'warning';
    actionButton = onNavigate ? (
      <Button
        color="inherit"
        size="small"
        onClick={() => onNavigate('/settings')}
      >
        Change Provider
      </Button>
    ) : undefined;
  } else if (
    error.type === 'chatgptUsageLimit' ||
    error.type === 'chatgptSignedOut'
  ) {
    // Plan 71, D7: offer another provider; never retry automatically.
    severity = 'warning';
    actionButton = <ChatGptFallbackAction onSwitched={onDismiss} />;
  } else if (error.type === 'toolUnsupported') {
    severity = 'info';
    actionButton = onNavigate ? (
      <Button
        color="inherit"
        size="small"
        onClick={() => onNavigate('/settings')}
      >
        Change Model
      </Button>
    ) : undefined;
  }

  return (
    <Alert
      severity={severity}
      onClose={onDismiss}
      action={actionButton}
      sx={{ mb: 0.5, '& .MuiAlert-message': { width: '100%' } }}
    >
      <AlertTitle sx={{ fontSize: '12px', mb: 0.25 }}>{error.title}</AlertTitle>
      <Typography variant="body2" sx={{ fontSize: '12px' }}>
        {error.body}
      </Typography>

      <Box sx={{ mt: 0.25 }}>
        <ToggleSection title="Show details" defaultOpen={false}>
          <Box
            sx={{
              mt: 0.25,
              p: 0.5,
              bgcolor: 'background.paper',
              borderRadius: 0.5,
              border: '1px solid',
              borderColor: 'divider',
              overflowX: 'auto',
            }}
          >
            <Typography
              variant="caption"
              component="pre"
              sx={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                fontSize: '11px',
              }}
            >
              {error.raw}
            </Typography>
          </Box>
        </ToggleSection>
      </Box>
    </Alert>
  );
};
