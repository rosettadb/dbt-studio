import React from 'react';
import { Box, Typography, Chip, CircularProgress } from '@mui/material';
import {
  CheckCircle,
  Error as ErrorIcon,
  Help as HelpIcon,
} from '@mui/icons-material';
import type { ProviderTestResult } from '../../controllers/aiProviders.controller';

interface ProviderStatusIndicatorProps {
  status?: ProviderTestResult;
  isLoading?: boolean;
  showDetails?: boolean;
}

export const ProviderStatusIndicator: React.FC<
  ProviderStatusIndicatorProps
> = ({ status, isLoading = false, showDetails = true }) => {
  if (isLoading) {
    return (
      <Box display="flex" alignItems="center" gap={1}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          Checking status...
        </Typography>
      </Box>
    );
  }

  if (!status) {
    return (
      <Box display="flex" alignItems="center" gap={1}>
        <Chip
          icon={<HelpIcon />}
          label="Unknown"
          size="small"
          variant="outlined"
          color="default"
        />
        {showDetails && (
          <Typography variant="caption" color="text.secondary">
            Test connection to check status
          </Typography>
        )}
      </Box>
    );
  }

  if (status.success) {
    return (
      <Box display="flex" alignItems="center" gap={1}>
        <Chip
          icon={<CheckCircle />}
          label="Healthy"
          size="small"
          color="success"
        />
        {showDetails && status.latencyMs && (
          <Typography variant="caption" color="text.secondary">
            {status.latencyMs}ms response time
            {status.modelsAvailable && ` • ${status.modelsAvailable} models`}
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Box display="flex" alignItems="center" gap={1}>
      <Chip icon={<ErrorIcon />} label="Unhealthy" size="small" color="error" />
      {showDetails && status.error && (
        <Typography variant="caption" color="error.main">
          {status.error}
        </Typography>
      )}
    </Box>
  );
};
