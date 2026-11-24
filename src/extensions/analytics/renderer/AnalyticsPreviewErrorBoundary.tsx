import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { ErrorOutline } from '@mui/icons-material';

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AnalyticsPreviewErrorBoundary extends React.Component<
  React.PropsWithChildren<{ onReset?: () => void }>,
  State
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    const { hasError, error } = this.state;
    const { children, onReset } = this.props;

    if (hasError) {
      return (
        <Box
          sx={{
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            alignItems: 'flex-start',
            height: '100%',
            bgcolor: 'background.paper',
          }}
        >
          <ErrorOutline color="error" />
          <Typography color="error" variant="subtitle2">
            Preview crashed
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
          >
            {error?.message}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              onReset?.();
            }}
          >
            Retry
          </Button>
        </Box>
      );
    }
    return children;
  }
}
