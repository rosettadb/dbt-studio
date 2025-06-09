import React from 'react';
import { Alert, Box } from '@mui/material';
import { SettingsType } from '../../../types/backend';

type Props = {
  settings: SettingsType;
};

export const FinishSetup: React.FC<Props> = ({ settings }) => (
  <Box sx={{ mt: 3, mb: 3 }}>
    {settings.pythonPath && (
      <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
        Python environment (version {settings.pythonVersion}) is successfully
        installed at: {settings.pythonPath}
      </Alert>
    )}
    {settings.dbtPath && (
      <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
        All set! dbt path: {settings.dbtPath}
      </Alert>
    )}
  </Box>
);
