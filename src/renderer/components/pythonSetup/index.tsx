import React from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material';
import { toast } from 'react-toastify';
import { SettingsType } from '../../../types/backend';
import { useInstallPython } from '../../controllers';

type Props = {
  settings: SettingsType;
  onInstallComplete: (pythonPath: string) => void;
};

export const PythonSetup: React.FC<Props> = ({
  settings,
  onInstallComplete,
}) => {
  const installPython = useInstallPython({
    onSuccess: (result) => {
      if (result.success) {
        toast.info('Python installation completed');
        onInstallComplete(result.path);
      } else {
        toast.error(`Python installation failed: ${result.error}`);
      }
    },
    onError: (error) => {
      toast.error(`Python installation failed: ${error.message}`);
    },
  });

  const isInstalled = Boolean(settings.pythonPath);
  let installButtonLabel = isInstalled ? 'Reinstall Python' : 'Install Python';
  if (installPython.isLoading) installButtonLabel = 'Installing...';

  return (
    <Box>
      <Typography variant="body1">
        Rosetta DBT Studio uses its own embedded Python interpreter to run dbt
        Core v1, separate from any Python already on your system.
      </Typography>

      {isInstalled ? (
        <Alert severity="success" sx={{ mt: 2, mb: 2 }}>
          Python (version {settings.pythonVersion}) is already installed at:{' '}
          {settings.pythonPath}
        </Alert>
      ) : (
        <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
          Python is not installed yet. Click Install to set it up now.
        </Alert>
      )}

      <Box sx={{ mt: 2 }}>
        <Button
          variant="contained"
          onClick={() => installPython.mutate()}
          disabled={installPython.isLoading}
          data-testid="setup-install-python-btn"
          startIcon={
            installPython.isLoading ? <CircularProgress size={16} /> : null
          }
        >
          {installButtonLabel}
        </Button>
      </Box>
    </Box>
  );
};
